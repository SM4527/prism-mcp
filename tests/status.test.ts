import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { APP_TOOLS } from "../src/apps.js";
import {
  callTool,
  connectClient,
  type FakeFolioPrism,
  type FakeSignalPrism,
  startFakeFolioPrism,
  startFakeSignalPrism,
  stopFakeFolioPrism,
  stopFakeSignalPrism,
} from "./helpers.js";

const SAMPLE_URL = "http://127.0.0.1:8420";
const SIGNALPRISM_SAMPLE_URL = "http://127.0.0.1:8500";
let fake: FakeFolioPrism | undefined;
let fakeSignal: FakeSignalPrism | undefined;

afterEach(async () => {
  if (fake) await stopFakeFolioPrism(fake);
  if (fakeSignal) await stopFakeSignalPrism(fakeSignal);
  fake = undefined;
  fakeSignal = undefined;
});

async function statusOf(apps: Record<string, unknown>, detail?: "percent" | "full") {
  const client = await connectClient({ ...(detail && { detail }), apps });
  const result = await callTool(client, "prism_status");
  await client.close();
  return result;
}

async function status(folioprism: Record<string, unknown>, detail?: "percent" | "full") {
  return statusOf({ folioprism }, detail);
}

/** One app's row from the structured status. */
function row(result: { structured: Record<string, unknown> }, app: string) {
  return (result.structured.apps as { app: string }[]).find((a) => a.app === app);
}

describe("prism_status", () => {
  it("reports a running FolioPrism as reachable", async () => {
    fake = await startFakeFolioPrism();
    const result = await status({ baseUrl: fake.baseUrl });
    expect(result.structured).toMatchObject({ detail: "percent" });
    expect(row(result, "folioprism")).toMatchObject({ enabled: true, reachable: true, stack: "personal" });
    expect(result.text).toContain("folioprism: reachable");
  });

  it("reports a closed port as not reachable", async () => {
    const stopped = await startFakeFolioPrism();
    await stopFakeFolioPrism(stopped);
    const result = await status({ baseUrl: stopped.baseUrl });
    expect(row(result, "folioprism")).toMatchObject({ reachable: false });
    expect(result.text).toContain("not reachable");
  });

  it("labels port 8420 as the sample stack", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false });
    expect(row(result, "folioprism")).toMatchObject({ stack: "sample", enabled: false, reachable: false, tools: [] });
    expect(result.text).toContain("folioprism tools: none");
  });

  it("lists the enabled tools", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false, tools: {} });
    expect(row(result, "folioprism")).toMatchObject({ tools: [] });
    const on = await status({ baseUrl: SAMPLE_URL, tools: { folioprism_top_stocks: false } });
    const expected = APP_TOOLS.folioprism.filter((name) => name !== "folioprism_top_stocks");
    expect(row(on, "folioprism")).toMatchObject({ tools: expected });
    expect(on.text).toContain(`folioprism tools: ${expected.join(", ")}`);
  });

  it("states the percent detail level and where results go", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false });
    expect(result.text).toContain("Detail: percent. No dollar amounts or portfolio total are included.");
    expect(result.text).toContain(
      "Tool results go to whichever AI app is connected. With a cloud app they leave this machine.",
    );
  });

  it("warns that full detail includes dollar amounts", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false }, "full");
    expect(result.structured).toMatchObject({ detail: "full" });
    expect(result.text).toContain("Detail: full. Dollar amounts are included; use only with a local AI app.");
  });
});

describe("prism_status for SignalPrism", () => {
  it("shows SignalPrism as disabled unless the config turns it on", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false });
    expect(row(result, "signalprism")).toMatchObject({
      enabled: false,
      baseUrl: SIGNALPRISM_SAMPLE_URL,
      stack: "sample",
      reachable: false,
      tools: [],
    });
    expect(result.text).toContain("signalprism: disabled");
  });

  it("reports a running SignalPrism with its last poll and no pause", async () => {
    fakeSignal = await startFakeSignalPrism();
    fakeSignal.bodies.status = JSON.stringify({
      as_of: "2026-11-27 11:50 ET",
      stack: "sample",
      companies_watched: 27,
      last_poll: { started_at: "2026-11-27 11:00 ET", finished_at: "2026-11-27 11:02 ET", new_filings: 3, new_signals: 1, errors: 0 },
      paused_until: null,
      parse_errors: 0,
    });
    const result = await statusOf({
      folioprism: { baseUrl: SAMPLE_URL, enabled: false },
      signalprism: { enabled: true, baseUrl: fakeSignal.baseUrl },
    });
    expect(row(result, "signalprism")).toMatchObject({
      reachable: true,
      stack: "personal",
      lastPoll: "2026-11-27 11:02 ET",
      pausedUntil: null,
    });
    expect(result.text).toContain("signalprism: reachable");
    expect(result.text).toContain("signalprism last poll: 2026-11-27 11:02 ET, not paused");
  });

  it("reports no poll yet from the status fixture and shows a pause", async () => {
    fakeSignal = await startFakeSignalPrism();
    const fixture = JSON.parse(readFileSync("fixtures/signalprism/status.json", "utf8"));
    fakeSignal.bodies.status = JSON.stringify({ ...fixture, paused_until: "2026-11-27 12:00 ET" });
    const result = await statusOf({ signalprism: { enabled: true, baseUrl: fakeSignal.baseUrl } });
    expect(row(result, "signalprism")).toMatchObject({ lastPoll: null, pausedUntil: "2026-11-27 12:00 ET" });
    expect(result.text).toContain("signalprism last poll: none yet, polling paused until 2026-11-27 12:00 ET");
  });

  it("reports a closed port as not reachable", async () => {
    const stopped = await startFakeSignalPrism();
    await stopFakeSignalPrism(stopped);
    const result = await statusOf({ signalprism: { enabled: true, baseUrl: stopped.baseUrl } });
    expect(row(result, "signalprism")).toMatchObject({ reachable: false });
    expect(result.text).toContain("signalprism: not reachable");
  });
});
