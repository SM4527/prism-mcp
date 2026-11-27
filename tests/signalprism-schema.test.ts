import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PrismAppError } from "../src/http.js";
import { parseClusters, parseSignals, parseStatus, parseTicker } from "../src/signalprism/schema.js";

const fixture = (name: string): unknown => JSON.parse(readFileSync(`fixtures/signalprism/${name}.json`, "utf8"));

describe("SignalPrism schema", () => {
  it.each([
    ["status", parseStatus],
    ["signals", parseSignals],
    ["signals-with-plan", parseSignals],
    ["clusters", parseClusters],
    ["ticker-GSBD", parseTicker],
  ] as const)("parses the %s fixture", (name, parse) => {
    expect(() => parse(fixture(name))).not.toThrow();
  });

  it("accepts a role SignalPrism may add later", () => {
    const raw = fixture("signals") as { signals: { role: string }[] };
    raw.signals[0].role = "FUTURE_ROLE";
    expect(parseSignals(raw).signals[0].role).toBe("FUTURE_ROLE");
  });

  it("rejects a wrong shape with the failing path", () => {
    const raw = fixture("signals") as { signals: { score: unknown }[] };
    raw.signals[0].score = "high";
    expect(() => parseSignals(raw)).toThrow(new PrismAppError("SignalPrism returned data in an unexpected shape at signals.0.score"));
  });

  it("rejects a field the contract does not have", () => {
    expect(() => parseStatus({ ...(fixture("status") as object), extra: 1 })).toThrow(/unexpected shape/);
  });
});
