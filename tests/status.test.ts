import { afterEach, describe, expect, it } from "vitest";
import { APP_TOOLS } from "../src/apps.js";
import { callTool, connectClient, type FakeFolioPrism, startFakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

const SAMPLE_URL = "http://127.0.0.1:8420";
let fake: FakeFolioPrism | undefined;

afterEach(async () => {
  if (fake) await stopFakeFolioPrism(fake);
  fake = undefined;
});

async function status(folioprism: Record<string, unknown>, detail?: "percent" | "full") {
  const client = await connectClient({ ...(detail && { detail }), apps: { folioprism } });
  const result = await callTool(client, "prism_status");
  await client.close();
  return result;
}

describe("prism_status", () => {
  it("reports a running FolioPrism as reachable", async () => {
    fake = await startFakeFolioPrism();
    const result = await status({ baseUrl: fake.baseUrl });
    expect(result.structured).toMatchObject({
      detail: "percent",
      apps: [{ app: "folioprism", enabled: true, reachable: true, stack: "personal" }],
    });
    expect(result.text).toContain("folioprism: reachable");
  });

  it("reports a closed port as not reachable", async () => {
    const stopped = await startFakeFolioPrism();
    await stopFakeFolioPrism(stopped);
    const result = await status({ baseUrl: stopped.baseUrl });
    expect(result.structured).toMatchObject({ apps: [{ reachable: false }] });
    expect(result.text).toContain("not reachable");
  });

  it("labels port 8420 as the sample stack", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false });
    expect(result.structured).toMatchObject({ apps: [{ stack: "sample", enabled: false, reachable: false, tools: [] }] });
    expect(result.text).toContain("folioprism tools: none");
  });

  it("lists the enabled tools", async () => {
    const result = await status({ baseUrl: SAMPLE_URL, enabled: false, tools: {} });
    expect(result.structured).toMatchObject({ apps: [{ tools: [] }] });
    const on = await status({ baseUrl: SAMPLE_URL, tools: { folioprism_top_stocks: false } });
    const expected = APP_TOOLS.folioprism.filter((name) => name !== "folioprism_top_stocks");
    expect(on.structured).toMatchObject({ apps: [{ tools: expected }] });
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
