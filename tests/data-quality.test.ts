import { describe, expect, it } from "vitest";
import { isStale, STALE_DAYS } from "../src/tools/folioprism/data-quality.js";
import { callTool, connectToFake, fixtureWith, stopFakeFolioPrism } from "./helpers.js";

const DAY_MS = 86_400_000;

async function dataQuality(nowIso: string, body?: string) {
  const { client, fake } = await connectToFake("ok", { now: () => Date.parse(nowIso) });
  if (body) fake.body = body;
  const result = await callTool(client, "folioprism_data_quality");
  await client.close();
  await stopFakeFolioPrism(fake);
  return result;
}

describe("isStale", () => {
  const asOf = "2026-06-30";
  const base = Date.parse(asOf);

  it("is false for a null date", () => {
    expect(isStale(null, base + 1000 * DAY_MS)).toBe(false);
  });

  it("is true only past 180 days", () => {
    expect(STALE_DAYS).toBe(180);
    expect(isStale(asOf, base + 180 * DAY_MS)).toBe(false);
    expect(isStale(asOf, base + 180 * DAY_MS + 1)).toBe(true);
  });
});

describe("folioprism_data_quality", () => {
  it("reports freshness and coverage, skipping null holdings dates", async () => {
    const { structured, text } = await dataQuality("2026-11-24T00:00:00Z");
    expect(structured).toMatchObject({
      pricesAsOf: "2026-11-24T01:02:14.000Z",
      staleTickers: [],
      unpricedTickers: [],
      oldestFundHoldings: { ticker: "VTI", asOf: "2026-06-30" },
      staleFundHoldings: [],
      benchmarkHoldingsAsOf: "2026-06-30",
      lookThroughPct: 89.3059,
      fundCoveredPct: 87.9548,
      unavailableFunds: [],
    });
    expect(text).toContain("Oldest fund holdings: VTI 2026-06-30");
    expect(text).toContain("Fund holdings older than 180 days: none.");
  });

  it("lists fund holdings older than 180 days, oldest first", async () => {
    const { structured, text } = await dataQuality("2027-03-01T00:00:00Z");
    expect(structured.staleFundHoldings).toEqual([
      { ticker: "VTI", asOf: "2026-06-30" },
      { ticker: "FXAIX", asOf: "2026-08-31" },
      { ticker: "SCHD", asOf: "2026-08-31" },
    ]);
    expect(text).toContain("Fund holdings older than 180 days: VTI 2026-06-30, FXAIX 2026-08-31, SCHD 2026-08-31.");
  });

  it("skips direct stock holdings even with an old date", async () => {
    const body = fixtureWith((a) => {
      a.intersection.coverage.items.find((i: { ticker: string }) => i.ticker === "AAPL").holdingsAsOf = "2020-01-01";
    });
    const { structured } = await dataQuality("2026-11-24T00:00:00Z", body);
    expect(structured.staleFundHoldings).toEqual([]);
    expect(structured.oldestFundHoldings).toEqual({ ticker: "VTI", asOf: "2026-06-30" });
  });
});
