import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** One call-log line. It never holds the tool's result. */
export interface CallEntry {
  time: string;
  tool: string;
  args: Record<string, unknown>;
  resultBytes: number;
  durationMs: number;
  ok: boolean;
}

export type CallLog = (entry: CallEntry) => void;

/**
 * A call log that appends JSON Lines to `<logDir>/calls.jsonl`. A failed write never
 * fails the tool call; the first failure prints one warning to stderr.
 */
export function createCallLog(logDir: string, warn: (message: string) => void = console.error): CallLog {
  const file = join(logDir, "calls.jsonl");
  let warned = false;
  return (entry) => {
    try {
      mkdirSync(logDir, { recursive: true });
      appendFileSync(file, `${JSON.stringify(entry)}\n`);
    } catch (error) {
      if (warned) return;
      warned = true;
      warn(`prism-mcp: could not write the call log in ${logDir}: ${(error as Error).message}`);
    }
  };
}
