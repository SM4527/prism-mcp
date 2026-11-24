import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCallLog } from "../src/log.js";
import { callTool, connectToFake, stopFakeFolioPrism, tempLogDir } from "./helpers.js";

const NOW = Date.parse("2026-11-24T12:00:00Z");

function readLog(logDir: string) {
  return readFileSync(join(logDir, "calls.jsonl"), "utf8");
}

describe("call log", () => {
  it("records metadata for each call and never the result", async () => {
    const logDir = tempLogDir();
    const { client, fake } = await connectToFake("ok", { logDir, now: () => NOW });
    await callTool(client, "folioprism_stock_exposure", { ticker: "AAPL" });
    await callTool(client, "folioprism_fund_overlap", { fundA: "VTI", fundB: "ZZZZ" });
    await client.close();
    await stopFakeFolioPrism(fake);

    const text = readLog(logDir);
    const entries = text.trim().split("\n").map((line) => JSON.parse(line));
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(["args", "durationMs", "ok", "resultBytes", "time", "tool"]);
      expect(entry.time).toBe("2026-11-24T12:00:00.000Z");
      expect(entry.resultBytes).toBeGreaterThan(0);
    }
    expect(entries[0]).toMatchObject({ tool: "folioprism_stock_exposure", args: { ticker: "AAPL" }, ok: true });
    expect(entries[1]).toMatchObject({ tool: "folioprism_fund_overlap", args: { fundA: "VTI", fundB: "ZZZZ" }, ok: false });
    expect(text).not.toMatch(/Apple Inc\.|portfolioPct|viaFunds|Ticker not held|Direct Holding/);
  });

  it("logs a FolioPrism failure as ok false without its message", async () => {
    const logDir = tempLogDir();
    const { client, fake } = await connectToFake("http500", { logDir });
    await callTool(client, "folioprism_summary");
    await client.close();
    await stopFakeFolioPrism(fake);
    expect(JSON.parse(readLog(logDir))).toMatchObject({ tool: "folioprism_summary", ok: false });
    expect(readLog(logDir)).not.toContain("HTTP 500");
  });
});

describe("call log failures", () => {
  it("returns the tool result anyway and warns once on stderr", async () => {
    const blocker = join(tempLogDir(), "not-a-folder");
    writeFileSync(blocker, "");
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, fake } = await connectToFake("ok", { logDir: join(blocker, "logs") });

    const first = await callTool(client, "folioprism_data_quality");
    const second = await callTool(client, "folioprism_data_quality");
    await client.close();
    await stopFakeFolioPrism(fake);

    expect(first.isError).toBe(false);
    expect(second.isError).toBe(false);
    expect(first.text).toContain("Look-through covers");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^prism-mcp: could not write the call log in /);
    warn.mockRestore();
  });

  it("uses the given warn function", () => {
    const warnings: string[] = [];
    const blocker = join(tempLogDir(), "file");
    writeFileSync(blocker, "");
    const log = createCallLog(join(blocker, "logs"), (message) => warnings.push(message));
    const entry = { time: "t", tool: "x", args: {}, resultBytes: 1, durationMs: 1, ok: true };
    log(entry);
    log(entry);
    expect(warnings).toHaveLength(1);
  });
});
