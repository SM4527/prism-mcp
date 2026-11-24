import { getJson } from "../http.js";
import { type Analysis, parseAnalysis } from "./schema.js";

const APP = "FolioPrism";
export const ANALYSIS_TIMEOUT_MS = 30_000;

export interface ClientOptions {
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export interface FolioPrismClient {
  analysis(mergeShareClasses: boolean): Promise<Analysis>;
}

/** A GET-only FolioPrism client that caches each analysis URL for `ttlMs`. */
export function createFolioPrismClient(
  baseUrl: string,
  { ttlMs = 60_000, timeoutMs = ANALYSIS_TIMEOUT_MS, now = Date.now }: ClientOptions = {},
): FolioPrismClient {
  const cache = new Map<string, { at: number; value: Promise<Analysis> }>();

  return {
    analysis(mergeShareClasses) {
      const path = `/api/analysis?mergeShareClasses=${mergeShareClasses ? 1 : 0}`;
      const hit = cache.get(path);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const value = getJson(baseUrl, path, { app: APP, timeoutMs }).then(parseAnalysis);
      value.catch(() => cache.delete(path));
      cache.set(path, { at: now(), value });
      return value;
    },
  };
}
