import * as z from "zod";
import { PrismAppError } from "../http.js";

/**
 * Response contract of SignalPrism's /api/mcp/*, mirrored from SignalPrism. Money is US dollars
 * and percentages are percent, both as decimal strings; dates are Eastern Time. Roles are plain
 * strings so a role added in SignalPrism never breaks parsing.
 */

/** Roles SignalPrism filters on; used for the `role` tool input only. */
export const ROLES = ["CEO", "CFO", "COO", "PRESIDENT", "OTHER_OFFICER", "DIRECTOR", "HOLDER_10PCT", "OTHER"] as const;

const heldVia = z.enum(["direct", "funds"]).nullable();

export const SignalItem = z.strictObject({
  ticker: z.string().nullable(),
  company: z.string().nullable(),
  insiders: z.array(z.string()),
  role: z.string(),
  title_raw: z.string().nullable(),
  shares: z.string(),
  value_usd: z.string(),
  avg_price: z.string(),
  pct_increase: z.string().nullable(),
  new_position: z.boolean(),
  txn_date: z.string(),
  filed_at: z.string(),
  form_type: z.string(),
  score: z.number().int(),
  score_parts: z.array(z.strictObject({ label: z.string(), points: z.number().int() })),
  badges: z.array(z.string()),
  rule_match: z.boolean(),
  held_via: heldVia,
  sec_url: z.string(),
});

export const SignalsResponse = z.strictObject({
  as_of: z.string(),
  filters: z.strictObject({
    days: z.number().int(),
    min_score: z.number().int(),
    role: z.string().nullable(),
    held_only: z.boolean(),
    watched_only: z.boolean(),
    include_plan: z.boolean(),
  }),
  count: z.number().int(),
  truncated: z.boolean(),
  signals: z.array(SignalItem),
});

export const ClusterItem = z.strictObject({
  ticker: z.string().nullable(),
  company: z.string().nullable(),
  window_start: z.string(),
  window_end: z.string(),
  insider_count: z.number().int(),
  total_value_usd: z.string(),
  held_via: heldVia,
  members: z.array(
    z.strictObject({ insider: z.string(), role: z.string(), value_usd: z.string(), txn_date: z.string() }),
  ),
});

export const ClustersResponse = z.strictObject({
  as_of: z.string(),
  filters: z.strictObject({ days: z.number().int() }),
  clusters: z.array(ClusterItem),
});

export const TickerResponse = z.strictObject({
  as_of: z.string(),
  ticker: z.string(),
  company: z.string().nullable(),
  held_via: heldVia,
  since: z.string(),
  plan_count: z.number().int(),
  signals: z.array(SignalItem),
  clusters: z.array(ClusterItem),
});

export const StatusResponse = z.strictObject({
  as_of: z.string(),
  stack: z.enum(["sample", "personal"]),
  companies_watched: z.number().int(),
  last_poll: z
    .strictObject({
      started_at: z.string(),
      finished_at: z.string().nullable(),
      new_filings: z.number().int(),
      new_signals: z.number().int(),
      errors: z.number().int(),
    })
    .nullable(),
  paused_until: z.string().nullable(),
  parse_errors: z.number().int(),
});

export type SignalItem = z.infer<typeof SignalItem>;
export type SignalsResponse = z.infer<typeof SignalsResponse>;
export type ClusterItem = z.infer<typeof ClusterItem>;
export type ClustersResponse = z.infer<typeof ClustersResponse>;
export type TickerResponse = z.infer<typeof TickerResponse>;
export type StatusResponse = z.infer<typeof StatusResponse>;

function parser<T>(schema: z.ZodType<T>): (raw: unknown) => T {
  return (raw) => {
    const result = schema.safeParse(raw);
    if (result.success) return result.data;
    const path = result.error.issues[0].path.join(".") || "(root)";
    throw new PrismAppError(`SignalPrism returned data in an unexpected shape at ${path}`);
  };
}

export const parseSignals = parser(SignalsResponse);
export const parseClusters = parser(ClustersResponse);
export const parseTicker = parser(TickerResponse);
export const parseStatus = parser(StatusResponse);
