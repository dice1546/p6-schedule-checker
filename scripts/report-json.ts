// Writes the results the page shows to report/results.json, so the
// independent Python re-count can compare against them.
//
//   pnpm report:json && python3 verify/crosscheck.py

import { mkdirSync, writeFileSync } from "node:fs";
import { loadResults } from "../lib/xer/load.ts";

const results = loadResults();
mkdirSync("report", { recursive: true });
writeFileSync("report/results.json", JSON.stringify(results, null, 2) + "\n");
console.log(`Wrote report/results.json (${results.map((r) => r.file).join(", ")})`);
