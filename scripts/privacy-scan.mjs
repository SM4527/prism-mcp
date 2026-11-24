// Blocks the personal stack port and local-only files from anything git could commit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PERSONAL_PORT = "84" + "30";
const ALLOWED_PORT_MENTIONS = { "README.md": 1, "CLAUDE.md": Infinity };
const THIRD_PARTY_NAME = new RegExp("morning" + "star", "i");
const FORBIDDEN_FILES = [/(^|\/)config\.local\.json$/, /(^|\/)\.env(?!\.example$)[^/]*$/, /(^|\/)logs\//, /\.log$/];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const problems = [];
for (const file of files) {
  if (FORBIDDEN_FILES.some((pattern) => pattern.test(file))) problems.push(`${file}: local-only file must not be committed`);
  const content = readFileSync(file, "utf8");
  if (!file.startsWith("tests/fixtures/") && THIRD_PARTY_NAME.test(content)) problems.push(`${file}: contains a third-party data vendor name`);
  const mentions = content.split(PERSONAL_PORT).length - 1;
  if (mentions > (ALLOWED_PORT_MENTIONS[file] ?? 0)) problems.push(`${file}: mentions the personal port ${mentions} time(s)`);
}

if (problems.length > 0) {
  console.error(`Privacy scan failed:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Privacy scan clean (${files.length} files).`);
