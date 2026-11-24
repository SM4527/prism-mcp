import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOP_50_NOTE } from "../src/tools/folioprism/shared.js";
import { callTool, connectToFake, type FakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

type Weights = { portfolioSharePctViaFund: number; weightInFundPct: number };

let client: Client;
let fake: FakeFolioPrism;

beforeAll(async () => ({ client, fake } = await connectToFake()));
afterAll(async () => {
  await client.close();
  await stopFakeFolioPrism(fake);
});

describe("folioprism_fund_overlap", () => {
  it("returns the stocks two funds share with each fund's weights", async () => {
    const { structured, text } = await callTool(client, "folioprism_fund_overlap", { fundA: "vti", fundB: "QQQ" });
    const shared = structured.shared as { fundA: Weights; fundB: Weights }[];
    expect(structured).toMatchObject({ fundA: "VTI", fundB: "QQQ" });
    expect(shared).toHaveLength(10);
    expect(structured.sharedCount).toBeGreaterThanOrEqual(10);
    expect(shared[0].fundA.weightInFundPct).toBeGreaterThan(0);
    expect(shared[0].fundB.portfolioSharePctViaFund).toBeGreaterThan(0);
    expect(text).toContain(`VTI and QQQ share ${structured.sharedCount} of the Top 50 stocks (showing 10)`);
    expect(text).toMatch(/share of your portfolio via VTI \d+\.\d{2}%, weight inside VTI \d+\.\d{2}%/);
    expect(text).toContain(TOP_50_NOTE);
  });

  it("limits the listed rows but still reports the total shared", async () => {
    const all = await callTool(client, "folioprism_fund_overlap", { fundA: "VTI", fundB: "QQQ", limit: 50 });
    const total = all.structured.sharedCount as number;
    const { structured, text } = await callTool(client, "folioprism_fund_overlap", { fundA: "VTI", fundB: "QQQ", limit: 1 });
    expect(structured.shared).toHaveLength(1);
    expect(structured.sharedCount).toBe(total);
    expect(text).toContain(`share ${total} of the Top 50 stocks (showing 1)`);
  });

  it("says so when a ticker is a directly held stock, not a fund", async () => {
    const result = await callTool(client, "folioprism_fund_overlap", { fundA: "VTI", fundB: "aapl" });
    expect(result).toMatchObject({
      isError: true,
      text: "AAPL is a stock, not a fund; fund overlap compares two funds.",
    });
  });

  it("finds nothing shared with a bond fund", async () => {
    const { structured } = await callTool(client, "folioprism_fund_overlap", { fundA: "VTI", fundB: "BND" });
    expect(structured.sharedCount).toBe(0);
  });

  it("refuses a fund that isn't held", async () => {
    const result = await callTool(client, "folioprism_fund_overlap", { fundA: "VTI", fundB: "ZZZZ" });
    expect(result).toMatchObject({ isError: true, text: "Ticker not held: ZZZZ" });
  });
});
