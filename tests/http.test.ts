import { afterEach, describe, expect, it } from "vitest";
import { getJson } from "../src/http.js";
import { type FakeFolioPrism, type FakeMode, startFakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

const OPTIONS = { app: "FolioPrism", timeoutMs: 200 };
let fake: FakeFolioPrism | undefined;

afterEach(async () => {
  if (fake) await stopFakeFolioPrism(fake);
  fake = undefined;
});

async function analysisWith(mode: FakeMode): Promise<unknown> {
  fake = await startFakeFolioPrism(mode);
  return getJson(fake.baseUrl, "/api/analysis", OPTIONS);
}

describe("getJson", () => {
  it("returns parsed JSON with a GET", async () => {
    await expect(analysisWith("ok")).resolves.toHaveProperty("summary");
    expect(fake?.requests).toEqual([{ method: "GET", url: "/api/analysis" }]);
  });

  it("says the app isn't running when the port is closed", async () => {
    const stopped = await startFakeFolioPrism();
    await stopFakeFolioPrism(stopped);
    const host = new URL(stopped.baseUrl).host;
    await expect(getJson(stopped.baseUrl, "/api/health", OPTIONS)).rejects.toThrow(
      `FolioPrism isn't running on ${host}`,
    );
  });

  it("reports a timeout", async () => {
    await expect(analysisWith("slow")).rejects.toThrow(/didn't answer within 0.2 s/);
  });

  it("reports an HTTP error status", async () => {
    await expect(analysisWith("http500")).rejects.toThrow("FolioPrism returned HTTP 500 for /api/analysis");
  });

  it("reports invalid JSON", async () => {
    await expect(analysisWith("badJson")).rejects.toThrow("FolioPrism returned invalid JSON");
  });
});
