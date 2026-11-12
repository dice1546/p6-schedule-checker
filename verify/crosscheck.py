#!/usr/bin/env python3
"""Independent re-count of the headline numbers.

Deliberately shares no code with the TypeScript checker: it re-reads the raw
.xer files with a few lines of Python and recomputes each count from the
definitions in the README, then compares against report/results.json.
If the two implementations disagree, this exits 1.

    python3 verify/crosscheck.py
"""
import json
import sys

HIGH = 44

def recount(path):
    text = open(path, "rb").read().decode("utf-8")
    table, fields, rows = None, {}, {}
    for line in text.splitlines():
        p = line.split("\t")
        if p[0] == "%T":
            table = p[1]
        elif p[0] == "%F":
            fields[table] = p[1:]
        elif p[0] == "%R" and len(p) - 1 == len(fields[table]):
            rows.setdefault(table, []).append(dict(zip(fields[table], p[1:])))
    hours = {c["clndr_id"]: float(c["day_hr_cnt"]) for c in rows.get("CALENDAR", [])}
    tasks = {}
    for t in rows["TASK"]:
        tasks.setdefault(t["task_id"], t)
    links = {(l["pred_task_id"], l["task_id"], l["pred_type"]) for l in rows["TASKPRED"]
             if l["pred_task_id"] in tasks and l["task_id"] in tasks and l["pred_task_id"] != l["task_id"]}
    has_pred = {s for _, s, _ in links}
    has_succ = {p for p, _, _ in links}
    open_ = [t for t in tasks.values()
             if t["status_code"] != "TK_Complete" and t["task_type"] not in ("TT_LOE", "TT_WBS")]
    def days(t):
        try:
            return float(t["total_float_hr_cnt"]) / hours.get(t["clndr_id"], 8.0)
        except ValueError:
            return None
    fl = [d for d in map(days, open_) if d is not None]
    return {
        "activities": len(tasks),
        "activitiesInScope": len(open_),
        "relationships": len(links),
        "missingLinks": sum(1 for t in open_ if t["task_id"] not in has_pred or t["task_id"] not in has_succ),
        "noPredecessor": sum(1 for t in open_ if t["task_id"] not in has_pred),
        "noSuccessor": sum(1 for t in open_ if t["task_id"] not in has_succ),
        "negativeFloat": sum(1 for d in fl if d < 0),
        "highFloat": sum(1 for d in fl if d > HIGH),
    }

ok = True
for r in json.load(open("report/results.json")):
    mine = recount(r["file"])
    theirs = {
        "activities": r["counts"]["activities"],
        "activitiesInScope": r["counts"]["activitiesInScope"],
        "relationships": r["counts"]["relationships"],
        "missingLinks": r["checks"]["missingLinks"]["count"],
        "noPredecessor": r["checks"]["missingLinks"]["noPredecessor"],
        "noSuccessor": r["checks"]["missingLinks"]["noSuccessor"],
        "negativeFloat": r["checks"]["negativeFloat"]["count"],
        "highFloat": r["checks"]["highFloat"]["count"],
    }
    print(r["file"])
    for k in mine:
        match = mine[k] == theirs[k]
        ok &= match
        print(f"  {'ok ' if match else 'DIFF'} {k:18} checker={theirs[k]:<5} recount={mine[k]}")
print("\nAll counts agree." if ok else "\nMISMATCH")
sys.exit(0 if ok else 1)
