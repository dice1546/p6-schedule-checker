// Reads every .xer in data/, plus the damaged test fixture, and runs the
// checks on each. Uses node:fs, so call it from Server Components and Node
// scripts only; a Client Component should take the results as props and use
// `import type` for CheckedFile.
//
// Paths resolve from the project root (process.cwd()), which is where both
// `next build` and the package scripts run. The `.ts` extensions on the
// imports let plain Node run this file (scripts/report-json.ts).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkFile, type FileResult } from "./checks.ts";
import { parseXer } from "./parse.ts";

export interface CheckedFile extends FileResult {
  /** True for the test fixture with injected defects, not a real schedule. */
  synthetic: boolean;
}

// `file` is project-relative with forward slashes: it is shown in the UI and
// verify/crosscheck.py opens it from the project root.
const check = (file: string, bytes: Uint8Array, synthetic: boolean): CheckedFile => ({
  ...checkFile(file, parseXer(bytes)),
  synthetic,
});

export function loadResults(): CheckedFile[] {
  // Each read names a literal subfolder of process.cwd() so Next's file
  // tracing stays scoped to data/ and the fixture, not the whole project.
  const data = readdirSync(join(process.cwd(), "data"))
    .filter((f) => f.toLowerCase().endsWith(".xer"))
    .sort()
    .map((f) => check(`data/${f}`, readFileSync(join(process.cwd(), "data", f)), false));
  const fixture = readFileSync(join(process.cwd(), "test", "fixtures", "damaged.xer"));
  return [...data, check("test/fixtures/damaged.xer", fixture, true)];
}
