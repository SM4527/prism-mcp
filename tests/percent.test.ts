import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectToFake, type FakeFolioPrism, fixtureWith, stopFakeFolioPrism } from "./helpers.js";

const CALLS: [string, Record<string, unknown>][] = [
  ["prism_status", {}],
  ["folioprism_summary", {}],
  ["folioprism_prism_view", {}],
  ["folioprism_top_stocks", { limit: 50 }],
  ["folioprism_stock_exposure", { ticker: "AAPL" }],
  ["folioprism_fund_overlap", { fundA: "VTI", fundB: "FXAIX" }],
  ["folioprism_data_quality", {}],
];

/** Tools with dollar values at detail "full". */
const DOLLAR_TOOLS = CALLS.filter(([name]) => !["prism_status", "folioprism_data_quality"].includes(name));

const DOLLARS = /\$|usd|cents/i;

/** The fixture with every real cents field plus extra dollar fields FolioPrism might add later. */
const LEAKY_FIXTURE = fixtureWith((a) => {
  a.holdings[0].secretCents = "999";
  a.intersection.rows[0].totalUsd = "999";
  a.summary.extraUsd = "999";
});

async function connect(detail: "percent" | "full") {
  const { client, fake } = await connectToFake("ok", { detail });
  fake.body = LEAKY_FIXTURE;
  return { client, fake };
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  return JSON.stringify(result);
}

describe("detail percent", () => {
  let client: Client;
  let fake: FakeFolioPrism;
  beforeAll(async () => ({ client, fake } = await connect("percent")));
  afterAll(async () => {
    await client.close();
    await stopFakeFolioPrism(fake);
  });

  it.each(CALLS)("%s returns no dollar amounts", async (name, args) => {
    expect(await call(client, name, args)).not.toMatch(DOLLARS);
  });

  it.each(CALLS)("%s ignores a detail argument from the model", async (name, args) => {
    expect(await call(client, name, { ...args, detail: "full" })).not.toMatch(DOLLARS);
  });

  it("offers no tool input that sets the detail level", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) expect(Object.keys(tool.inputSchema.properties ?? {}), tool.name).not.toContain("detail");
  });
});

describe("detail full", () => {
  let client: Client;
  let fake: FakeFolioPrism;
  beforeAll(async () => ({ client, fake } = await connect("full")));
  afterAll(async () => {
    await client.close();
    await stopFakeFolioPrism(fake);
  });

  it.each(DOLLAR_TOOLS)("%s includes dollar values", async (name, args) => {
    const result = await call(client, name, args);
    expect(result).toMatch(/Usd"/);
    if (name !== "folioprism_fund_overlap") expect(result).toContain("$");
  });

  it("adds the portfolio total and holding values to the summary", async () => {
    const result = JSON.parse(await call(client, "folioprism_summary", {}));
    expect(result.structuredContent.totalUsd).toBe(143666);
    expect(result.structuredContent.holdings[0]).toMatchObject({ ticker: "VTI", valueUsd: 40000 });
    expect(result.content[0].text).toContain("Total: $143,666.00.");
    expect(result.content[0].text).toContain("VTI (Vanguard Total Stock Market ETF) 27.84% ($40,000.00)");
  });

  it("shows the yearly fee in dollars in place of cents", async () => {
    const result = JSON.parse(await call(client, "folioprism_prism_view", { section: "fees" }));
    expect(result.structuredContent.sections.fees.portfolio).toMatchObject({ annualFeeUsd: 85.59 });
    expect(result.content[0].text).toContain("annualFeeUsd: $85.59 vs $135.76");
    expect(JSON.stringify(result)).not.toMatch(/cents/i);
  });

  it("still never passes through dollar fields the schema doesn't declare", async () => {
    expect(await call(client, "folioprism_summary", {})).not.toMatch(/secretCents|extraUsd/);
    expect(await call(client, "folioprism_top_stocks", { limit: 1 })).not.toMatch(/"totalUsd"/);
  });
});
