import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { checkFile } from "@/lib/xer/checks";
import { parseXer } from "@/lib/xer/parse";

const run = (path: string) => checkFile(path, parseXer(readFileSync(new URL("../" + path, import.meta.url))));
const enc = (s: string) => new TextEncoder().encode(s);

// Expected values for the two public files were counted by hand-rolled
// Python and grep before the checker existed (see verify/crosscheck.py).
test("Harbour Pointe: clean file, counts match the independent count", () => {
  const r = run("data/harbour-pointe.xer");
  expect(r.counts.brokenRows).toBe(0);
  expect(r.counts.activities).toBe(131);
  expect(r.counts.activitiesInScope).toBe(113); // 131 minus 18 completed
  expect(r.counts.relationships).toBe(212);
  expect([r.checks.missingLinks.count, r.checks.negativeFloat.count, r.checks.highFloat.count]).toEqual([3, 0, 86]);
  expect(r.floatBuckets.reduce((s, b) => s + b.count, 0) + r.floatUnknown).toBe(113);
});

test("Aspose example: clean rows, two warnings, counts match", () => {
  const r = run("data/aspose-events-example.xer");
  expect(r.counts.brokenRows).toBe(0);
  expect(r.issues.map((i) => i.code)).toEqual(["blank_key", "unknown_calendar"]);
  expect(r.counts.activities).toBe(83);
  expect(r.counts.relationships).toBe(86);
  expect([r.checks.missingLinks.count, r.checks.negativeFloat.count, r.checks.highFloat.count]).toEqual([4, 0, 5]);
});

test("damaged fixture: every injected defect is caught on the right line", () => {
  const r = run("test/fixtures/damaged.xer");
  const at = (code: string) => r.issues.filter((i) => i.code === code).map((i) => i.line);
  expect(at("short_row")).toEqual([82, 92]); // truncated row, and head of the split row
  expect(at("orphan_line")).toEqual([93]); // tail of the split row
  expect(at("bad_number")).toEqual([103]);
  expect(at("duplicate_key")).toEqual([134]);
  // 1 injected bad id + 4 links whose activity was on a broken row
  expect(at("dangling_link")).toHaveLength(5);
  expect(r.counts.brokenRows).toBe(9);
  expect(r.checks.negativeFloat.findings.map((f) => f.floatDays)).toEqual([-10, -3]);
  expect(r.checks.missingLinks.findings.map((f) => f.detail)).toContain("No predecessor and no successor");
  expect(r.floatUnknown).toBe(1);
});

test("parser survives junk without throwing", () => {
  for (const junk of ["", "not an xer file", "%R\t1\t2", "%T\tTASK\n%R\t1", "%T\n%F\ta\n%R\t1", "ERMHDR\t8.0\n%T\tTASK\n%F\ttask_id\n%R\t1\tx\ty"]) {
    const r = checkFile("junk", parseXer(enc(junk)));
    expect(r.issues.length, JSON.stringify(junk)).toBeGreaterThan(0);
  }
});

test("Windows-1252 files decode instead of failing", () => {
  const bytes = Uint8Array.from([...enc("ERMHDR\t8.0\n%T\tTASK\n%F\ttask_id\ttask_name\n%R\t1\tCaf"), 0xe9, ...enc("\n%E\n")]);
  const p = parseXer(bytes);
  expect(p.encoding).toBe("windows-1252");
  expect(p.tables.get("TASK")!.rows[0].values.task_name).toBe("Café");
});

test("float uses the activity's calendar hours, and the threshold is exclusive", () => {
  const xer = [
    "ERMHDR\t8.0",
    "%T\tCALENDAR", "%F\tclndr_id\tday_hr_cnt", "%R\tC8\t8", "%R\tC10\t10",
    "%T\tTASK", "%F\ttask_id\tclndr_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttotal_float_hr_cnt",
    "%R\t1\tC8\tTT_Task\tTK_NotStart\tA\tA\t352", // exactly 44 d on 8h: not flagged
    "%R\t2\tC8\tTT_Task\tTK_NotStart\tB\tB\t360", // 45 d: flagged
    "%R\t3\tC10\tTT_Task\tTK_NotStart\tC\tC\t360", // 36 d on 10h: not flagged
    "%R\t4\tC8\tTT_Task\tTK_Complete\tD\tD\t", // complete: out of scope
    "%R\t5\tC8\tTT_LOE\tTK_NotStart\tE\tE\t-8", // LOE: out of scope
    "%R\t6\tC8\tTT_Task\tTK_Active\tF\tF\t-4", // -0.5 d: flagged
    "%T\tTASKPRED", "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type",
    "%R\t1\t2\t1\tPR_FS", "%R\t2\t3\t2\tPR_FS", "%R\t3\t6\t3\tPR_FS", "%R\t4\t6\t6\tPR_FS",
    "%E",
  ].join("\n");
  const r = checkFile("t", parseXer(enc(xer)));
  expect(r.checks.highFloat.findings.map((f) => f.code)).toEqual(["B"]);
  expect(r.checks.negativeFloat.findings.map((f) => f.code)).toEqual(["F"]);
  expect(r.checks.missingLinks.findings.map((f) => `${f.code}:${f.detail}`)).toEqual(["A:No predecessor", "F:No successor"]);
  expect(r.issues.map((i) => i.code)).toEqual(["self_link"]);
});
