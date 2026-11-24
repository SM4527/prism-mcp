import { describe, expect, it } from "vitest";
import { callTool, connectClient, connectToFake, type FakeMode, startFakeFolioPrism, stopFakeFolioPrism } from "./helpers.js";

const STACK = /\n\s+at |\.ts:\d+|\.js:\d+|node_modules|Error:/;

async function errorText(mode: FakeMode): Promise<string> {
  const { client, fake } = await connectToFake(mode);
  const result = await callTool(client, "folioprism_summary");
  await client.close();
  await stopFakeFolioPrism(fake);
  expect(result.isError).toBe(true);
  return result.text;
}

describe("error results", () => {
  it.each([
    ["http500", "FolioPrism returned HTTP 500 for /api/analysis"],
    ["malformed", "FolioPrism returned data in an unexpected shape at summary.name"],
    ["badJson", "FolioPrism returned invalid JSON"],
  ] as const)("%s gives a single plain line with no stack trace", async (mode, message) => {
    const text = await errorText(mode);
    expect(text).toBe(message);
    expect(text).not.toMatch(STACK);
  });

  it("server down gives the configured host and no stack trace", async () => {
    const stopped = await startFakeFolioPrism();
    await stopFakeFolioPrism(stopped);
    const client = await connectClient({ apps: { folioprism: { baseUrl: stopped.baseUrl } } });
    const { text, isError } = await callTool(client, "folioprism_summary");
    await client.close();
    expect(isError).toBe(true);
    expect(text).toBe(`FolioPrism isn't running on ${new URL(stopped.baseUrl).host}`);
    expect(text).not.toMatch(STACK);
  });
});
