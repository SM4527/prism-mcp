import { getJson } from "../http.js";
import {
  type ClustersResponse,
  parseClusters,
  parseSignals,
  parseStatus,
  parseTicker,
  type SignalsResponse,
  type StatusResponse,
  type TickerResponse,
} from "./schema.js";

const APP = "SignalPrism";
export const SIGNALPRISM_TIMEOUT_MS = 30_000;

export interface SignalsQuery {
  days?: number;
  minScore?: number;
  role?: string;
  heldOnly?: boolean;
  watchedOnly?: boolean;
  includePlan?: boolean;
}

export interface ClientOptions {
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export interface SignalPrismClient {
  status(): Promise<StatusResponse>;
  signals(query: SignalsQuery): Promise<SignalsResponse>;
  clusters(days?: number): Promise<ClustersResponse>;
  ticker(symbol: string): Promise<TickerResponse>;
}

/** The path with a query string of only the params that are set, named as SignalPrism names them. */
export function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.size > 0 ? `${path}?${query}` : path;
}

/** A GET-only SignalPrism client that caches each URL for `ttlMs`. */
export function createSignalPrismClient(
  baseUrl: string,
  { ttlMs = 30_000, timeoutMs = SIGNALPRISM_TIMEOUT_MS, now = Date.now }: ClientOptions = {},
): SignalPrismClient {
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  function get<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
    const hit = cache.get(path);
    if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = getJson(baseUrl, path, { app: APP, timeoutMs }).then(parse);
    value.catch(() => cache.delete(path));
    cache.set(path, { at: now(), value });
    return value;
  }

  return {
    status: () => get("/api/mcp/status", parseStatus),
    signals: (query) => get(withQuery("/api/mcp/signals", { ...query }), parseSignals),
    clusters: (days) => get(withQuery("/api/mcp/clusters", { days }), parseClusters),
    ticker: (symbol) => get(`/api/mcp/ticker/${encodeURIComponent(symbol)}`, parseTicker),
  };
}
