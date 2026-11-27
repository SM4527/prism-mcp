import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSignalPrismClient, withQuery } from "../src/signalprism/client.js";
import { type FakeSignalPrism, startFakeSignalPrism, stopFakeSignalPrism } from "./helpers.js";

let fake: FakeSignalPrism;
beforeEach(async () => {
  fake = await startFakeSignalPrism();
});
afterEach(() => stopFakeSignalPrism(fake));

describe("withQuery", () => {
  it("keeps only the params that are set, under SignalPrism's names", () => {
    expect(withQuery("/p", { days: 30, minScore: 5, role: undefined, heldOnly: false })).toBe("/p?days=30&minScore=5&heldOnly=false");
    expect(withQuery("/p", {})).toBe("/p");
  });
});

describe("SignalPrism client", () => {
  it("sends only GET requests to the /api/mcp routes", async () => {
    const client = createSignalPrismClient(fake.baseUrl);
    await client.status();
    await client.signals({ days: 30, minScore: 4, role: "CEO", heldOnly: true, includePlan: true });
    await client.clusters(60);
    await client.ticker("GSBD");
    expect(fake.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET /api/mcp/status",
      "GET /api/mcp/signals?days=30&minScore=4&role=CEO&heldOnly=true&includePlan=true",
      "GET /api/mcp/clusters?days=60",
      "GET /api/mcp/ticker/GSBD",
    ]);
  });

  it("caches a URL for the ttl and fetches again after it", async () => {
    let time = 0;
    const client = createSignalPrismClient(fake.baseUrl, { ttlMs: 1000, now: () => time });
    await client.clusters();
    await client.clusters();
    expect(fake.requests).toHaveLength(1);
    time = 1000;
    await client.clusters();
    expect(fake.requests).toHaveLength(2);
  });

  it("does not cache a failure", async () => {
    const client = createSignalPrismClient(fake.baseUrl);
    await expect(client.ticker("NOPE")).rejects.toThrow("SignalPrism returned HTTP 404 for /api/mcp/ticker/NOPE");
    await expect(client.ticker("NOPE")).rejects.toThrow(/HTTP 404/);
    expect(fake.requests).toHaveLength(2);
  });

  it("rejects a malformed response in plain words", async () => {
    fake.bodies.clusters = '{"clusters":42}';
    await expect(createSignalPrismClient(fake.baseUrl).clusters()).rejects.toThrow(/SignalPrism returned data in an unexpected shape/);
  });

  it("says so when SignalPrism is not running", async () => {
    await stopFakeSignalPrism(fake);
    await expect(createSignalPrismClient(fake.baseUrl).status()).rejects.toThrow(/SignalPrism isn't running on 127\.0\.0\.1:/);
    fake = await startFakeSignalPrism();
  });
});
