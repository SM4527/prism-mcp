import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { callTool, connectToFake, type FakeFolioPrism, fixtureWith, stopFakeFolioPrism } from "./helpers.js";

let client: Client;
let fake: FakeFolioPrism;

afterEach(async () => {
  await client.close();
  await stopFakeFolioPrism(fake);
});

type Holding = { ticker: string; weightPct: number | null };

describe("folioprism_summary", () => {
  it("returns holdings weights that add up to 100 and the top-10 concentration", async () => {
    ({ client, fake } = await connectToFake());
    const { structured, text } = await callTool(client, "folioprism_summary");
    const holdings = structured.holdings as Holding[];
    expect(structured).toMatchObject({ name: "My Portfolio", benchmark: "SPY", staleTickers: [] });
    expect(holdings).toHaveLength(7);
    expect(holdings.reduce((sum, h) => sum + (h.weightPct ?? 0), 0)).toBeCloseTo(100, 1);
    expect(structured.top10ConcentrationPct).toBe(38.19);
    expect(text).toContain("My Portfolio vs SPY");
    expect(text).toMatch(/VTI \(Vanguard Total Stock Market ETF\) \d+\.\d{2}%/);
    expect(fake.requests).toEqual([{ method: "GET", url: "/api/analysis?mergeShareClasses=0" }]);
  });

  it("sums the first 10 rows' portfolioPctDisplay, as FolioPrism's chat does", async () => {
    ({ client, fake } = await connectToFake());
    fake.body = fixtureWith((a) => {
      a.intersection.rows[0].portfolioPctDisplay = "50.00";
      a.intersection.rows[10].portfolioPctDisplay = "99.00";
    });
    const { structured } = await callTool(client, "folioprism_summary");
    expect(structured.top10ConcentrationPct).toBe(77.03);
  });

  it("gives an unpriced holding a null weight", async () => {
    ({ client, fake } = await connectToFake());
    fake.body = fixtureWith((a) => {
      a.holdings[0].valueCents = null;
      a.summary.unpricedTickers = [a.holdings[0].ticker];
    });
    const { structured, text } = await callTool(client, "folioprism_summary");
    expect((structured.holdings as Holding[])[0]).toMatchObject({ ticker: "VTI", weightPct: null });
    expect(text).toContain("VTI (Vanguard Total Stock Market ETF) unpriced");
    expect(text).toContain("Unpriced: VTI.");
  });

  it("passes mergeShareClasses through to the URL", async () => {
    ({ client, fake } = await connectToFake());
    const { text } = await callTool(client, "folioprism_summary", { mergeShareClasses: true });
    expect(fake.requests[0].url).toBe("/api/analysis?mergeShareClasses=1");
    expect(text.split("\n")[0]).toBe("Share classes merged (e.g. GOOG + GOOGL counted together).");
  });

  it("omits the merged line by default and tells the model to leave the flag false", async () => {
    ({ client, fake } = await connectToFake());
    const { text } = await callTool(client, "folioprism_summary");
    expect(text).not.toContain("Share classes merged");
    const { tools } = await client.listTools();
    const flag = tools.find((t) => t.name === "folioprism_summary")?.inputSchema.properties?.mergeShareClasses as { description: string };
    expect(flag.description).toMatch(/^Leave false unless the user explicitly asks/);
  });

  it("shows percentages at 2 decimals in text and full precision in structured output", async () => {
    ({ client, fake } = await connectToFake());
    fake.body = fixtureWith((a) => {
      a.intersection.rows[0].portfolioPct = "6.07891";
    });
    const { text } = await callTool(client, "folioprism_top_stocks", { limit: 1 });
    expect(text).toContain("6.08%");
    const { structured } = await callTool(client, "folioprism_top_stocks", { limit: 1 });
    expect((structured.rows as { portfolioPct: number }[])[0].portfolioPct).toBe(6.07891);
  });

  it("returns a plain error when FolioPrism fails", async () => {
    ({ client, fake } = await connectToFake("http500"));
    const result = await callTool(client, "folioprism_summary");
    expect(result).toMatchObject({ isError: true, text: "FolioPrism returned HTTP 500 for /api/analysis" });
  });
});
