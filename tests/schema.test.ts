import { describe, expect, it } from "vitest";
import { parseAnalysis } from "../src/folioprism/schema.js";
import { dropDollarKeys } from "../src/privacy.js";
import { analysisFixture } from "./helpers.js";

function centsPaths(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => centsPaths(item, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(/cents/i.test(key) ? [`${path}.${key}`] : []),
    ...centsPaths(child, `${path}.${key}`),
  ]);
}

describe("parseAnalysis", () => {
  const analysis = parseAnalysis(JSON.parse(analysisFixture));

  it("parses the sample fixture", () => {
    expect(analysis.intersection.rows).toHaveLength(50);
    expect(analysis.prismView.bonds.benchmark).toBeNull();
  });

  it("keeps only the declared dollar fields", () => {
    const paths = centsPaths(analysis).map((path) => path.replace(/\[\d+\]/g, "[]"));
    expect([...new Set(paths)].sort()).toEqual([
      ".holdings[].valueCents",
      ".intersection.rows[].children[].valueCents",
      ".intersection.rows[].valueCents",
      ".prismView.fees.benchmark.feeCents",
      ".prismView.fees.portfolio.feeCents",
      ".summary.totalCents",
    ]);
  });

  it("drops keys ending in Cents, Usd or usd from the Prism view at any depth", () => {
    const raw = JSON.parse(analysisFixture);
    raw.prismView.allocation.portfolio.fooCents = "1";
    raw.prismView.styleBox.benchmark.cells.mid.barUsd = "2";
    raw.prismView.bonds.portfolio.credit.list = [{ totalusd: "3", keep: "4" }];
    const prismView = parseAnalysis(raw).prismView;
    expect(centsPaths(prismView)).toEqual([".fees.portfolio.feeCents", ".fees.benchmark.feeCents"]);
    expect(JSON.stringify(prismView)).not.toMatch(/barUsd|totalusd/);
    expect(prismView.bonds.portfolio).toMatchObject({ credit: { list: [{ keep: "4" }] } });
  });

  it("keeps non-dollar keys that merely contain the words", () => {
    expect(dropDollarKeys({ usdIndex: "1", centsNote: "2", nested: { feeCents: "3" } })).toEqual({
      usdIndex: "1",
      centsNote: "2",
      nested: {},
    });
  });

  it("names the path of an unexpected shape", () => {
    expect(() => parseAnalysis({ summary: { name: 42 } })).toThrow(
      "FolioPrism returned data in an unexpected shape at summary.name",
    );
  });
});
