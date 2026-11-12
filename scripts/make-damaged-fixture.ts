// Builds test/fixtures/damaged.xer: a copy of the Aspose sample with seven
// known defects injected. Both public files turn out to be structurally clean
// and have no negative float, so this fixture is how we prove the checker
// actually fires. The tests assert every defect below is caught, by line.
//
//   node scripts/make-damaged-fixture.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../data/aspose-events-example.xer", import.meta.url), "latin1");
const lines = src.split("\n");

let table = "";
let fields: string[] = [];
const taskRows: number[] = [];
const predRows: number[] = [];
let taskFields: string[] = [];
let predFields: string[] = [];
lines.forEach((l, i) => {
  const p = l.split("\t");
  if (p[0] === "%T") table = p[1];
  if (p[0] === "%F") {
    fields = p.slice(1);
    if (table === "TASK") taskFields = fields;
    if (table === "TASKPRED") predFields = fields;
  }
  if (p[0] === "%R" && table === "TASK") taskRows.push(i);
  if (p[0] === "%R" && table === "TASKPRED") predRows.push(i);
});

const col = (f: string[], name: string) => f.indexOf(name) + 1; // +1 for the %R tag
const setCell = (i: number, f: string[], name: string, value: string) => {
  const p = lines[i].split("\t");
  p[col(f, name)] = value;
  lines[i] = p.join("\t");
};
const cell = (i: number, f: string[], name: string) => lines[i].split("\t")[col(f, name)];

// 1. Truncated row: drop the last 6 fields of an activity.
lines[taskRows[10]] = lines[taskRows[10]].split("\t").slice(0, -6).join("\t");

// 2. Line break inside an activity name: one row becomes two bad lines.
{
  const p = lines[taskRows[20]].split("\t");
  const c = col(taskFields, "task_name");
  p[c] = p[c].slice(0, 4) + "\n" + p[c].slice(4);
  lines[taskRows[20]] = p.join("\t");
}

// 3. Total float that is not a number.
setCell(taskRows[30], taskFields, "total_float_hr_cnt", "N/A");

// 4. Negative float on two activities (-80h and -24h on 8h calendars).
setCell(taskRows[40], taskFields, "total_float_hr_cnt", "-80");
setCell(taskRows[41], taskFields, "total_float_hr_cnt", "-24");

// 5. Relationship pointing at an activity id that does not exist.
setCell(predRows[5], predFields, "pred_task_id", "999999");

// 6. Strip every relationship of one mid-schedule activity (missing links).
const orphanId = cell(taskRows[50], taskFields, "task_id");
const strip = new Set(
  predRows.filter((i) => cell(i, predFields, "task_id") === orphanId || cell(i, predFields, "pred_task_id") === orphanId),
);

// 7. Duplicate activity row (same task_id twice).
const dup = lines[taskRows[60]];

const out: string[] = [];
lines.forEach((l, i) => {
  if (strip.has(i)) return;
  out.push(l);
  if (i === taskRows[60]) out.push(dup);
});

mkdirSync(new URL("../test/fixtures/", import.meta.url), { recursive: true });
writeFileSync(new URL("../test/fixtures/damaged.xer", import.meta.url), out.join("\n"), "latin1");
console.log(`damaged.xer written (${strip.size} relationships stripped from task_id ${orphanId})`);
