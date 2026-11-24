import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(): [string, string][] {
  return readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => [join("src", file), readFileSync(join("src", file), "utf8")]);
}

describe("src/", () => {
  it("never writes to stdout, which carries the MCP protocol", () => {
    for (const [file, text] of sources()) {
      expect(text, file).not.toMatch(/console\.(log|info|debug|table|dir)\b|process\.stdout/);
    }
  });
});
