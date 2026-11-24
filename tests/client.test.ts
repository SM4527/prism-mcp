import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ANALYSIS_TIMEOUT_MS, createFolioPrismClient } from "../src/folioprism/client.js";
import { HEALTH_TIMEOUT_MS } from "../src/tools/status.js";
import { type FakeFolioPrism, type FakeMode, startFakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

let fake: FakeFolioPrism | undefined;

afterEach(async () => {
  if (fake) await stopFakeFolioPrism(fake);
  fake = undefined;
});

async function clientFor(mode: FakeMode = "ok", clock = { t: 0 }) {
  fake = await startFakeFolioPrism(mode);
  return createFolioPrismClient(fake.baseUrl, { ttlMs: 1000, timeoutMs: 200, now: () => clock.t });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(dir, file));
}

describe("FolioPrism client", () => {
  it("caches an analysis within the TTL and refetches after it", async () => {
    const clock = { t: 0 };
    const client = await clientFor("ok", clock);
    await client.analysis(false);
    await client.analysis(false);
    expect(fake?.requests).toHaveLength(1);
    clock.t = 1000;
    await client.analysis(false);
    expect(fake?.requests).toHaveLength(2);
  });

  it("shares an in-flight request between concurrent calls", async () => {
    const client = await clientFor();
    const [a, b] = await Promise.all([client.analysis(false), client.analysis(false)]);
    expect(a).toBe(b);
    expect(fake?.requests).toHaveLength(1);
  });

  it("waits 30 s for the analysis and 2 s for health", () => {
    expect(ANALYSIS_TIMEOUT_MS).toBe(30_000);
    expect(HEALTH_TIMEOUT_MS).toBe(2000);
  });

  it("caches per URL and sends only GETs", async () => {
    const client = await clientFor();
    await client.analysis(false);
    await client.analysis(true);
    expect(fake?.requests).toEqual([
      { method: "GET", url: "/api/analysis?mergeShareClasses=0" },
      { method: "GET", url: "/api/analysis?mergeShareClasses=1" },
    ]);
  });

  it("does not cache a failure", async () => {
    const client = await clientFor("http500");
    await expect(client.analysis(false)).rejects.toThrow("HTTP 500");
    fake!.mode = "ok";
    await expect(client.analysis(false)).resolves.toHaveProperty("summary");
  });

  it("reports a timeout and a malformed shape", async () => {
    await expect((await clientFor("slow")).analysis(false)).rejects.toThrow("didn't answer within 0.2 s");
    await stopFakeFolioPrism(fake!);
    await expect((await clientFor("malformed")).analysis(false)).rejects.toThrow(
      "FolioPrism returned data in an unexpected shape at summary.name",
    );
  });

  it("has no write method anywhere under src/", () => {
    for (const file of sourceFiles("src")) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    }
  });
});
