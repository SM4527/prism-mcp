// Captures test fixtures from FolioPrism's sample stack only.
import { mkdirSync, writeFileSync } from "node:fs";

const SAMPLE_BASE_URL = "http://127.0.0.1:8420";

const response = await fetch(`${SAMPLE_BASE_URL}/api/analysis?mergeShareClasses=0`);
if (!response.ok) throw new Error(`Sample stack returned HTTP ${response.status}`);

mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/analysis.json", `${JSON.stringify(await response.json(), null, 2)}\n`);
console.log("Wrote tests/fixtures/analysis.json from the sample stack.");
