import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOP_50_NOTE } from "../src/tools/folioprism/shared.js";
import { callTool, connectToFake, type FakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

let client: Client;
let fake: FakeFolioPrism;

beforeAll(async () => ({ client, fake } = await connectToFake()));
afterAll(async () => {
  await client.close();
  await stopFakeFolioPrism(fake);
});

describe("folioprism_stock_exposure", () => {
  it("matches a ticker without regard to case and splits it by fund", async () => {
    const { structured, text } = await callTool(client, "folioprism_stock_exposure", { ticker: "aapl" });
    expect(structured).toMatchObject({ found: true, ticker: "AAPL", name: "Apple Inc." });
    const via = structured.viaFunds as { ticker: string; name: string }[];
    expect(via.map((f) => f.ticker)).toContain("VTI");
    expect(via).toContainEqual(expect.objectContaining({ ticker: "AAPL", name: "Direct Holding" }));
    expect(text).toMatch(/^AAPL \(Apple Inc\.\) is \d+\.\d{2}% of the portfolio/);
    expect(text).toMatch(/AAPL \(held directly\) \d+\.\d{2}%/);
    expect(text).toContain("This total is complete and includes every fund.");
    expect(text).not.toContain(TOP_50_NOTE);
  });

  it("reports a ticker outside the Top 50", async () => {
    const result = await callTool(client, "folioprism_stock_exposure", { ticker: "ZZZZ" });
    expect(result).toMatchObject({ isError: false, structured: { found: false, ticker: "ZZZZ" } });
    expect(result.text).toBe(`ZZZZ is outside the Top 50 stock intersection. ${TOP_50_NOTE}`);
  });
});
