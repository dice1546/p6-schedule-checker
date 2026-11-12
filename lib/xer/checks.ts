// Row-level validation of the activity and relationship tables, then the
// three schedule checks. Everything is plain arithmetic on parsed values so
// each number in the report can be traced to rows in the file.

import type { Issue, ParsedXer, Row } from "./parse.ts";

export const DEFAULTS = {
  highFloatDays: 44, // DCMA 14-point threshold: total float over 44 working days
  fallbackHoursPerDay: 8,
};

export interface Activity {
  line: number;
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  floatHours: number | null;
  floatDays: number | null;
  hoursPerDay: number;
  predecessors: number;
  successors: number;
}

export interface Finding {
  line: number;
  code: string;
  name: string;
  status: string;
  detail: string;
  floatDays: number | null;
}

export interface FileResult {
  file: string;
  p6Version: string | null;
  exportDate: string | null;
  encoding: string;
  counts: {
    tables: number;
    rowLines: number;
    activities: number;
    activitiesInScope: number; // not complete, not LOE / WBS summary
    relationships: number;
    brokenRows: number; // severity error: left out of the checks
    warnings: number;
  };
  issues: Issue[];
  checks: {
    missingLinks: { count: number; noPredecessor: number; noSuccessor: number; findings: Finding[] };
    negativeFloat: { count: number; findings: Finding[] };
    highFloat: { count: number; thresholdDays: number; findings: Finding[] };
  };
  floatBuckets: { label: string; count: number; flag: "negative" | "high" | null }[];
  floatUnknown: number;
}

const REL_TYPES = new Set(["PR_FS", "PR_SS", "PR_FF", "PR_SF"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function checkFile(file: string, parsed: ParsedXer, opts = DEFAULTS): FileResult {
  const issues: Issue[] = [...parsed.issues];
  const add = (severity: Issue["severity"], code: string, row: Row | null, table: string, message: string) =>
    issues.push({ severity, code, line: row?.line ?? null, table, message });

  // --- reference tables -----------------------------------------------------
  const hoursPerDay = new Map<string, number>();
  for (const r of parsed.tables.get("CALENDAR")?.rows ?? []) {
    const h = Number(r.values.day_hr_cnt);
    if (r.values.clndr_id && h > 0) hoursPerDay.set(r.values.clndr_id, h);
  }
  for (const r of parsed.tables.get("PROJECT")?.rows ?? []) {
    if (!r.values.proj_id?.trim()) add("warning", "blank_key", r, "PROJECT", "PROJECT row has a blank proj_id");
  }

  // --- activities -----------------------------------------------------------
  const taskTable = parsed.tables.get("TASK");
  const activities = new Map<string, Activity>();
  const unknownCalendars = new Map<string, { first: Row; count: number }>();
  if (!taskTable) {
    add("error", "no_task_table", null, "TASK", "File has no TASK table, so there are no activities to check");
  } else {
    for (const need of ["task_id", "task_code", "status_code", "task_type", "total_float_hr_cnt"]) {
      if (!taskTable.fields.includes(need)) add("error", "missing_column", null, "TASK", `TASK table has no ${need} column`);
    }
    for (const r of taskTable.rows) {
      const v = r.values;
      const id = (v.task_id ?? "").trim();
      const label = v.task_code || id || "(no id)";
      if (!id) {
        add("error", "blank_key", r, "TASK", "Activity row has a blank task_id");
        continue;
      }
      if (activities.has(id)) {
        add("error", "duplicate_key", r, "TASK", `task_id ${id} (${label}) already defined on line ${activities.get(id)!.line}`);
        continue;
      }
      for (const [field, value] of Object.entries(v)) {
        if (field.endsWith("_date") && value && !DATE_RE.test(value)) {
          add("warning", "bad_date", r, "TASK", `${label}: ${field} is "${value}", not a yyyy-mm-dd date`);
        }
      }
      const complete = v.status_code === "TK_Complete";
      let floatHours: number | null = null;
      const tf = (v.total_float_hr_cnt ?? "").trim();
      if (tf === "") {
        // P6 leaves float blank on completed activities; that is normal.
        if (!complete) add("warning", "missing_float", r, "TASK", `${label}: open activity has no total float, cannot be float-checked`);
      } else if (!NUM_RE.test(tf)) {
        add("warning", "bad_number", r, "TASK", `${label}: total_float_hr_cnt is "${tf}", not a number; float treated as unknown`);
      } else {
        floatHours = Number(tf);
      }
      let hpd = hoursPerDay.get(v.clndr_id);
      if (!hpd) {
        // Reported once per calendar after the loop, not once per activity.
        const key = v.clndr_id || "(blank)";
        const hit = unknownCalendars.get(key) ?? { first: r, count: 0 };
        hit.count++;
        unknownCalendars.set(key, hit);
        hpd = opts.fallbackHoursPerDay;
      }
      activities.set(id, {
        line: r.line,
        id,
        code: v.task_code ?? "",
        name: v.task_name ?? "",
        type: v.task_type ?? "",
        status: v.status_code ?? "",
        floatHours,
        floatDays: floatHours === null ? null : floatHours / hpd,
        hoursPerDay: hpd,
        predecessors: 0,
        successors: 0,
      });
    }
  }

  for (const [cal, hit] of unknownCalendars) {
    add("warning", "unknown_calendar", hit.first, "TASK", `${hit.count} activities use calendar ${cal}, which is not in the file; float converted at ${opts.fallbackHoursPerDay}h per day (first on this line)`);
  }

  // --- relationships --------------------------------------------------------
  let relationships = 0;
  const seen = new Set<string>();
  for (const r of parsed.tables.get("TASKPRED")?.rows ?? []) {
    const v = r.values;
    const succ = activities.get((v.task_id ?? "").trim());
    const pred = activities.get((v.pred_task_id ?? "").trim());
    if (!succ || !pred) {
      const missing = [!succ && `successor task_id ${v.task_id || "(blank)"}`, !pred && `predecessor task_id ${v.pred_task_id || "(blank)"}`]
        .filter(Boolean)
        .join(" and ");
      add("error", "dangling_link", r, "TASKPRED", `Relationship points at ${missing}, which is not a valid activity in this file`);
      continue;
    }
    if (succ === pred) {
      add("error", "self_link", r, "TASKPRED", `${succ.code} is linked to itself`);
      continue;
    }
    if (!REL_TYPES.has(v.pred_type)) add("warning", "bad_link_type", r, "TASKPRED", `${pred.code} -> ${succ.code}: unknown relationship type "${v.pred_type}"`);
    const key = `${pred.id}>${succ.id}>${v.pred_type}`;
    if (seen.has(key)) {
      add("warning", "duplicate_link", r, "TASKPRED", `${pred.code} -> ${succ.code} (${v.pred_type}) is listed twice`);
      continue;
    }
    seen.add(key);
    relationships++;
    succ.predecessors++;
    pred.successors++;
  }

  // --- the three checks -----------------------------------------------------
  // Scope: activities that still have work to do. Completed activities are
  // history, and level-of-effort / WBS summary activities take their dates
  // from other activities, so neither is assessed (same scope DCMA uses).
  const inScope = [...activities.values()].filter(
    (a) => a.status !== "TK_Complete" && a.type !== "TT_LOE" && a.type !== "TT_WBS",
  );
  const finding = (a: Activity, detail: string): Finding => ({
    line: a.line,
    code: a.code,
    name: a.name,
    status: a.status.replace("TK_", ""),
    detail,
    floatDays: a.floatDays === null ? null : round1(a.floatDays),
  });

  const missing = inScope.filter((a) => a.predecessors === 0 || a.successors === 0);
  const negative = inScope.filter((a) => a.floatDays !== null && a.floatDays < 0);
  const high = inScope.filter((a) => a.floatDays !== null && a.floatDays > opts.highFloatDays);

  const edges = [
    { label: "Negative", test: (d: number) => d < 0, flag: "negative" as const },
    { label: "0 (critical)", test: (d: number) => d === 0, flag: null },
    { label: "0–10 d", test: (d: number) => d > 0 && d <= 10, flag: null },
    { label: `10–${opts.highFloatDays} d`, test: (d: number) => d > 10 && d <= opts.highFloatDays, flag: null },
    { label: `Over ${opts.highFloatDays} d`, test: (d: number) => d > opts.highFloatDays, flag: "high" as const },
  ];
  const known = inScope.filter((a) => a.floatDays !== null);

  const byFloat = (a: Finding, b: Finding) => (a.floatDays ?? 0) - (b.floatDays ?? 0);
  return {
    file,
    p6Version: parsed.header.version,
    exportDate: parsed.header.exportDate,
    encoding: parsed.encoding,
    counts: {
      tables: parsed.tables.size,
      rowLines: parsed.rowLinesSeen,
      activities: activities.size,
      activitiesInScope: inScope.length,
      relationships,
      brokenRows: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    },
    issues: issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)),
    checks: {
      missingLinks: {
        count: missing.length,
        noPredecessor: missing.filter((a) => a.predecessors === 0).length,
        noSuccessor: missing.filter((a) => a.successors === 0).length,
        findings: missing.map((a) =>
          finding(a, a.predecessors === 0 && a.successors === 0 ? "No predecessor and no successor" : a.predecessors === 0 ? "No predecessor" : "No successor"),
        ),
      },
      negativeFloat: { count: negative.length, findings: negative.map((a) => finding(a, `${round1(a.floatDays!)} d total float`)).sort(byFloat) },
      highFloat: {
        count: high.length,
        thresholdDays: opts.highFloatDays,
        findings: high.map((a) => finding(a, `${round1(a.floatDays!)} d total float`)).sort((a, b) => byFloat(b, a)),
      },
    },
    floatBuckets: edges.map((e) => ({ label: e.label, count: known.filter((a) => e.test(a.floatDays!)).length, flag: e.flag })),
    floatUnknown: inScope.length - known.length,
  };
}
