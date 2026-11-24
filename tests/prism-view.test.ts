import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  callTool,
  connectToFake,
  type FakeFolioPrism,
  fixtureWith,
  stopFakeFolioPrism,
} from "./helpers.js";

let client: Client;
let fake: FakeFolioPrism;

beforeAll(async () => ({ client, fake } = await connectToFake()));
afterAll(async () => {
  await client.close();
  await stopFakeFolioPrism(fake);
});

describe("folioprism_prism_view", () => {
  it("returns every section when none is chosen", async () => {
    const { structured } = await callTool(client, "folioprism_prism_view");
    expect(Object.keys(structured.sections as object)).toEqual([
      "allocation",
      "style",
      "sectors",
      "regions",
      "valuation",
      "fees",
      "bonds",
    ]);
  });

  it("maps style to the style box and flattens keys in the text", async () => {
    const { structured, text } = await callTool(client, "folioprism_prism_view", { section: "style" });
    expect(Object.keys(structured.sections as object)).toEqual(["style"]);
    expect(text).toMatch(/cells\.large\.growth: [\d.]+ vs [\d.]+/);
  });

  it("compares allocation and shows a missing benchmark as n/a", async () => {
    expect((await callTool(client, "folioprism_prism_view", { section: "allocation" })).text).toContain(
      "usStock: 87.3 vs 97",
    );
    expect((await callTool(client, "folioprism_prism_view", { section: "bonds" })).text).toMatch(/government: [\d.]+ vs n\/a/);
  });

  it("returns numbers, leaving words and lists alone", async () => {
    const { structured } = await callTool(client, "folioprism_prism_view", { section: "style" });
    const style = (structured.sections as Record<string, { portfolio: Record<string, unknown> }>).style.portfolio;
    expect(style).toMatchObject({ notClassified: 1.1, sizeBasis: "market", fallbackTickers: [] });
    expect(style.cells).toMatchObject({ large: { growth: 35.6 } });
  });

  it("drops injected dollar fields at any depth", async () => {
    const own = await connectToFake();
    own.fake.body = fixtureWith((a) => {
      a.prismView.allocation.portfolio.fooCents = "123";
      a.prismView.styleBox.portfolio.cells.large.barUsd = "4.5";
      a.prismView.bonds.portfolio.sectors.totalusd = "6";
      a.prismView.valuation.benchmark.fooCents = "7";
    });
    expect(own.fake.body).toMatch(/fooCents.*barUsd.*totalusd/s);
    const result = await own.client.callTool({ name: "folioprism_prism_view", arguments: {} });
    expect(own.fake.requests).toHaveLength(1);
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result)).toContain("usStock");
    expect(JSON.stringify(result)).not.toMatch(/fooCents|barUsd|totalusd/);
    await own.client.close();
    await stopFakeFolioPrism(own.fake);
  });

  it("rejects an unknown section", async () => {
    expect((await callTool(client, "folioprism_prism_view", { section: "crypto" })).isError).toBe(true);
  });
});
