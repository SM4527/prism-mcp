import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { type Analysis, PRISM_VIEW_SECTIONS, type PrismViewSection } from "../../folioprism/schema.js";
import { dropDollarKeys } from "../../privacy.js";
import { registerTool, type ToolContext } from "../register.js";
import { toolResult } from "../result.js";
import { DATA_NOTICE, formatUsd, isFull, usd } from "./shared.js";

const SECTION_NAMES = PRISM_VIEW_SECTIONS.map((name) => (name === "styleBox" ? "style" : name)) as [string, ...string[]];

const Output = {
  sections: z.record(z.string(), z.object({ portfolio: z.json(), benchmark: z.json().nullable() })),
};

function toSection(name: string): PrismViewSection {
  return (name === "style" ? "styleBox" : name) as PrismViewSection;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Turn FolioPrism's decimal strings into numbers, at any depth, leaving other values alone. */
function toNumbers(value: unknown): unknown {
  if (typeof value === "string") return NUMERIC.test(value) ? Number(value) : value;
  if (Array.isArray(value)) return value.map(toNumbers);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toNumbers(child)]));
}

/** Flatten nested values into `dotted.key -> text` pairs. */
function flatten(value: unknown, prefix = ""): Map<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    const text = Array.isArray(value)
      ? value.join(", ") || "none"
      : prefix.endsWith("Usd") && typeof value === "number"
        ? formatUsd(value)
        : String(value);
    return new Map([[prefix, text]]);
  }
  return new Map(Object.entries(value).flatMap(([key, child]) => [...flatten(child, prefix ? `${prefix}.${key}` : key)]));
}

type Fees = Analysis["prismView"]["fees"]["portfolio"];

/** At detail "full", the yearly fee in dollars in place of FolioPrism's cents. */
function feesInUsd({ feeCents, ...rest }: Fees) {
  return { ...rest, annualFeeUsd: feeCents === null ? null : usd(feeCents) };
}

/** One section as the tool returns it: dollar fields only at detail "full". */
function sectionFor(ctx: ToolContext, prismView: Analysis["prismView"], name: string): unknown {
  const section = prismView[toSection(name)];
  if (!isFull(ctx)) return toNumbers(dropDollarKeys(section));
  if (name !== "fees") return toNumbers(section);
  const { portfolio, benchmark } = prismView.fees;
  return toNumbers({ portfolio: feesInUsd(portfolio), benchmark: benchmark && feesInUsd(benchmark) });
}

function describe(name: string, { portfolio, benchmark }: { portfolio: unknown; benchmark: unknown }): string {
  const bench = flatten(benchmark);
  const lines = [...flatten(portfolio)].map(([key, value]) => `  ${key}: ${value} vs ${bench.get(key) ?? "n/a"}`);
  return [`${name} (portfolio vs benchmark):`, ...lines].join("\n");
}

/** Register `folioprism_prism_view`. */
export function registerPrismView(server: McpServer, ctx: ToolContext): void {
  registerTool(
    server,
    ctx,
    "folioprism",
    "folioprism_prism_view",
    {
      title: "FolioPrism Prism view",
      description:
        "Portfolio vs benchmark for allocation, style box, sectors, regions, valuation, fees (expense ratio, and the yearly fee in dollars when the detail level is full) and bonds. " +
        "Values are percentages except valuation ratios, market cap in millions and bond years. " +
        DATA_NOTICE,
      inputSchema: { section: z.enum(SECTION_NAMES).optional().describe("One section; all sections when omitted.") },
      outputSchema: Output,
    },
    async ({ section }) => {
      const { prismView } = await ctx.folioprism.analysis(false);
      const names = section ? [section] : SECTION_NAMES;
      const sections = Object.fromEntries(names.map((name) => [name, sectionFor(ctx, prismView, name)]));
      const text = Object.entries(sections)
        .map(([name, value]) => describe(name, value as { portfolio: unknown; benchmark: unknown }))
        .join("\n");
      return toolResult(text, { sections });
    },
  );
}
