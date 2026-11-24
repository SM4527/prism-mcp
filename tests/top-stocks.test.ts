import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callTool, connectToFake, type FakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

let client: Client;
let fake: FakeFolioPrism;

beforeAll(async () => ({ client, fake } = await connectToFake()));
afterAll(async () => {
  await client.close();
  await stopFakeFolioPrism(fake);
});

type Row = { ticker: string; portfolioPct: number; funds: { ticker: string; portfolioPct: number }[] };

describe("folioprism_top_stocks", () => {
  it("returns 10 rows by default, largest first, with fund contributions", async () => {
    const rows = (await callTool(client, "folioprism_top_stocks")).structured.rows as Row[];
    expect(rows).toHaveLength(10);
    expect(rows[0].ticker).toBe("AAPL");
    expect(rows[0].portfolioPct).toBeGreaterThanOrEqual(rows[9].portfolioPct);
    const fundSum = rows[0].funds.reduce((sum, f) => sum + f.portfolioPct, 0);
    expect(fundSum).toBeCloseTo(rows[0].portfolioPct, 2);
  });

  it("respects limit", async () => {
    const { structured, text } = await callTool(client, "folioprism_top_stocks", { limit: 3 });
    expect(structured.rows).toHaveLength(3);
    expect(text.split("\n")).toHaveLength(3);
  });

  it("rejects a limit outside 1-50", async () => {
    expect((await callTool(client, "folioprism_top_stocks", { limit: 51 })).isError).toBe(true);
    expect((await callTool(client, "folioprism_top_stocks", { limit: 0 })).isError).toBe(true);
  });
});
