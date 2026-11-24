import * as z from "zod";
import { PrismAppError } from "../http.js";
import { dropDollarKeys } from "../privacy.js";

/**
 * The parts of FolioPrism's /api/analysis the tools use. zod strips undeclared keys, so the
 * only dollar fields kept are the five declared here, which tools show only at detail "full".
 */

const Pct = z.string();

const Summary = z.object({
  name: z.string(),
  benchmark: z.string(),
  benchmarkHoldingsAsOf: z.string().nullable(),
  totalCents: z.string(),
  asOf: z.string().nullable(),
  staleTickers: z.array(z.string()),
  unpricedTickers: z.array(z.string()),
});

const Holding = z.object({
  ticker: z.string(),
  name: z.string(),
  priceKind: z.string(),
  stale: z.boolean(),
  valueCents: z.string().nullable(),
});

const Child = z.object({
  sourceTicker: z.string(),
  sourceName: z.string(),
  fundWeightPct: Pct,
  portfolioPct: Pct,
  valueCents: z.string(),
});

const Row = z.object({
  ticker: z.string(),
  name: z.string(),
  portfolioPct: Pct,
  portfolioPctDisplay: Pct,
  valueCents: z.string(),
  children: z.array(Child),
});

const CoverageItem = z.object({
  ticker: z.string(),
  source: z.enum(["curated", "yahoo-top10", "imported", "direct"]),
  coveredPct: Pct,
  unavailable: z.boolean(),
  holdingsAsOf: z.string().nullable(),
});

const Coverage = z.object({
  lookThroughPct: Pct,
  fundCoveredPct: Pct,
  items: z.array(CoverageItem),
});

const Fees = z.object({
  expenseRatioPct: Pct.nullable(),
  feeCents: z.string().nullable(),
  unknownTickers: z.array(z.string()),
});

const SectionValue = z.json().transform(dropDollarKeys);

function section<T extends z.ZodType>(value: T) {
  return z.object({ portfolio: value, benchmark: value.nullable() });
}

const PrismView = z.object({
  allocation: section(SectionValue),
  styleBox: section(SectionValue),
  sectors: section(SectionValue),
  regions: section(SectionValue),
  valuation: section(SectionValue),
  fees: section(Fees),
  bonds: section(SectionValue),
});

const Analysis = z.object({
  summary: Summary,
  holdings: z.array(Holding),
  intersection: z.object({ rows: z.array(Row), coverage: Coverage }),
  prismView: PrismView,
});

export type Analysis = z.infer<typeof Analysis>;
export type PrismViewSection = keyof Analysis["prismView"];
export const PRISM_VIEW_SECTIONS = PrismView.keyof().options;

/** Validate an /api/analysis document, keeping only the fields the tools use. */
export function parseAnalysis(raw: unknown): Analysis {
  const result = Analysis.safeParse(raw);
  if (result.success) return result.data;
  const path = result.error.issues[0].path.join(".") || "(root)";
  throw new PrismAppError(`FolioPrism returned data in an unexpected shape at ${path}`);
}
