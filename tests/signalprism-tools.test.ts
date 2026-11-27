import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_TOOLS } from "../src/apps.js";
import { readFileSync } from "node:fs";
import {
  callTool,
  connectToFakeSignalPrism,
  type FakeSignalPrism,
  startFakeSignalPrism,
  stopFakeSignalPrism,
} from "./helpers.js";

let client: Client;
let fake: FakeSignalPrism;
beforeEach(async () => ({ client, fake } = await connectToFakeSignalPrism()));
afterEach(async () => {
  await client.close();
  await stopFakeSignalPrism(fake);
});

describe("signalprism_recent", () => {
  it("starts with the as-of time and lists signals", async () => {
    const { text, structured, isError } = await callTool(client, "signalprism_recent");
    expect(isError).toBe(false);
    expect(text.split("\n")[0]).toBe("as of 2026-11-27 11:50 ET");
    expect(text).toContain("IRBR");
    expect(structured).toHaveProperty("signals");
  });

  it("sends no parameter the model left out", async () => {
    await callTool(client, "signalprism_recent");
    expect(fake.requests.map((r) => r.url)).toEqual(["/api/mcp/signals"]);
  });

  it("maps every input to SignalPrism's parameter name", async () => {
    const args = { days: 30, minScore: 4, role: "CEO", heldOnly: true, watchedOnly: false, includePlan: true };
    const { isError, text } = await callTool(client, "signalprism_recent", args);
    expect(isError, text).toBe(false);
    expect(fake.requests[0].url).toBe("/api/mcp/signals?days=30&minScore=4&role=CEO&heldOnly=true&watchedOnly=false&includePlan=true");
  });

  it("includes plan buys only when asked", async () => {
    const without = await callTool(client, "signalprism_recent");
    const withPlan = await callTool(client, "signalprism_recent", { includePlan: true });
    expect((without.structured.filters as { include_plan: boolean }).include_plan).toBe(false);
    expect((withPlan.structured.filters as { include_plan: boolean }).include_plan).toBe(true);
    expect(withPlan.structured.count as number).toBeGreaterThan(without.structured.count as number);
  });

  it("watched only: sends true when asked and shows no removed-company note", async () => {
    const { text, structured } = await callTool(client, "signalprism_recent", { watchedOnly: true });
    expect(fake.requests[0].url).toBe("/api/mcp/signals?watchedOnly=true");
    expect((structured.filters as { watched_only: boolean }).watched_only).toBe(true);
    expect(text).not.toContain("removed companies");
  });

  it("watched only off: sends false and says removed companies are included", async () => {
    const fixture = JSON.parse(readFileSync("fixtures/signalprism/signals.json", "utf8"));
    fake.bodies.signals = JSON.stringify({ ...fixture, filters: { ...fixture.filters, watched_only: false } });
    const { text, structured } = await callTool(client, "signalprism_recent", { watchedOnly: false });
    expect(fake.requests[0].url).toBe("/api/mcp/signals?watchedOnly=false");
    expect((structured.filters as { watched_only: boolean }).watched_only).toBe(false);
    expect(text).toContain("including removed companies");
  });

  it("rejects a role outside the enum", async () => {
    const { isError } = await callTool(client, "signalprism_recent", { role: "JANITOR" });
    expect(isError).toBe(true);
    expect(fake.requests).toHaveLength(0);
  });

  it("notes when the row cap was reached", async () => {
    const fixture = JSON.parse(readFileSync("fixtures/signalprism/signals.json", "utf8"));
    fake.bodies.signals = JSON.stringify({ ...fixture, truncated: true });
    expect((await callTool(client, "signalprism_recent")).text).toContain("200-row cap");
  });
});

describe("signalprism_clusters", () => {
  it("lists clusters with their members", async () => {
    const { text, structured } = await callTool(client, "signalprism_clusters", { days: 400 });
    expect(text.split("\n")[0]).toBe("as of 2026-11-27 11:50 ET");
    expect(text).toContain("ACMR");
    expect(text).toContain("3 insiders");
    expect(structured).toHaveProperty("clusters");
    expect(fake.requests[0].url).toBe("/api/mcp/clusters?days=400");
  });
});

describe("signalprism_ticker", () => {
  it("returns one ticker, any case", async () => {
    const { text, structured } = await callTool(client, "signalprism_ticker", { ticker: "gsbd" });
    expect(text.split("\n")[0]).toBe("as of 2026-11-27 11:50 ET");
    expect(text).toContain("GSBD (Goldman Sachs BDC, Inc.), not held");
    expect(structured).toMatchObject({ ticker: "GSBD", plan_count: 0 });
    expect(fake.requests[0].url).toBe("/api/mcp/ticker/GSBD");
  });

  it("answers an unknown ticker in plain words", async () => {
    const { isError, text } = await callTool(client, "signalprism_ticker", { ticker: "ZZZZ" });
    expect(isError).toBe(true);
    expect(text).toContain("SignalPrism returned HTTP 404");
  });
});

describe("SignalPrism privacy", () => {
  it("keeps public purchase values at detail percent", async () => {
    const { text, structured } = await callTool(client, "signalprism_recent");
    expect(JSON.stringify(structured)).toContain('"value_usd"');
    expect(text).toContain("$");
  });

  it("never returns the user's own dollar holdings, only held_via", async () => {
    const results = [
      await callTool(client, "signalprism_recent", { includePlan: true }),
      await callTool(client, "signalprism_clusters", { days: 400 }),
      await callTool(client, "signalprism_ticker", { ticker: "GSBD" }),
    ];
    const publicDollarKeys = ["value_usd", "avg_price", "total_value_usd"];
    const keys = new Set<string>();
    const heldVia = new Set<unknown>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v === null || typeof v !== "object") return;
      for (const [k, child] of Object.entries(v)) {
        keys.add(k);
        if (k === "held_via") heldVia.add(child);
        walk(child);
      }
    };
    for (const r of results) walk(r.structured);
    for (const key of keys) {
      if (/usd|cents|value|amount|weight|pct/i.test(key)) {
        expect([...publicDollarKeys, "pct_increase"], key).toContain(key);
      }
    }
    for (const value of heldVia) expect([null, "direct", "funds"]).toContain(value);
  });

  it("offers no tool input that sets the detail level", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) expect(Object.keys(tool.inputSchema.properties ?? {}), tool.name).not.toContain("detail");
  });
});

describe("SignalPrism allowlist", () => {
  it("hides a tool set to false and the whole app when disabled", async () => {
    await client.close();
    await stopFakeSignalPrism(fake);
    ({ client, fake } = await connectToFakeSignalPrism({ tools: { signalprism_clusters: false } }));
    const names = (await client.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith("signalprism_"));
    expect(names).toEqual(APP_TOOLS.signalprism.filter((n) => n !== "signalprism_clusters"));
  });

  it("says so when SignalPrism is down", async () => {
    await stopFakeSignalPrism(fake);
    const { isError, text } = await callTool(client, "signalprism_clusters");
    expect(isError).toBe(true);
    expect(text).toContain("SignalPrism isn't running");
    fake = await startFakeSignalPrism();
  });
});
