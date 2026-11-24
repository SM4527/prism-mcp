import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const NAME = "morning" + "star";

it("no third-party data vendor name appears in tracked files outside the fixtures", () => {
  const paths = ["src", "tests", "docs", "scripts", "README.md", "CLAUDE.md", ":(exclude)tests/fixtures"];
  const { stdout } = spawnSync("git", ["grep", "-n", "-i", NAME, "--", ...paths], { encoding: "utf8" });
  expect(stdout).toBe("");
});
