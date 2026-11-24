// Captures test fixtures from FolioPrism's sample stack only.
import { mkdirSync, writeFileSync } from "node:fs";

const SAMPLE_BASE_URL = "http://127.0.0.1:8420";

const response = await fetch(`${SAMPLE_BASE_URL}/api/analysis?mergeShareClasses=0`);
if (!response.ok) throw new Error(`Sample stack returned HTTP ${response.status}`);

const text = `${JSON.stringify(await response.json(), null, 2)}\n`;
if (new RegExp("morning" + "star", "i").test(text)) {
  console.error("Refusing to write the fixture: the response contains a third-party data vendor name. Rename it by hand or fix the sample data.");
  process.exit(1);
}

mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/analysis.json", text);
console.log("Wrote tests/fixtures/analysis.json from the sample stack.");
