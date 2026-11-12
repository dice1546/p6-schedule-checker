# p6-schedule-checker

A small web app that checks Primavera P6 schedule exports (`.xer`). It reads
each file, flags broken rows with their line numbers, runs three checks on the
open activities, and shows the results with a float chart.

The files in `data/` (plus the damaged test fixture) are checked once at build
time and the page ships as static HTML. You can also drop your own `.xer` on the
page: it is read and checked in your browser and never uploaded.

## Run it

Needs Node 22.18 or newer and pnpm. Python 3 is only needed for the cross-check.

```bash
pnpm install
pnpm dev                      # http://localhost:3000
pnpm build && pnpm start      # production build; the page is prerendered
pnpm test                     # 10 tests (6 checker + 4 upload rules)
pnpm report:json              # same results as the page -> report/results.json
python3 verify/crosscheck.py  # independent Python re-count of every headline number
node scripts/make-damaged-fixture.ts   # regenerate test/fixtures/damaged.xer
```

To check another schedule, either drop it on the page ("Check your own .xer") or
put it in `data/` and rebuild.

## Results on the two public files

| | Harbour Pointe (P6 17.12) | Aspose events example (P6 8.3) |
|---|---|---|
| Activities (open) | 131 (113) | 83 (83) |
| Relationships | 212 | 86 |
| Broken rows | 0 | 0 (2 warnings) |
| Missing links | 3 | 4 |
| Negative float | 0 | 0 |
| High float (> 44 d) | 86 | 5 |

Both public files are structurally clean and neither has negative float, so on
their own they do not show that the checker catches anything. For that there is
`test/fixtures/damaged.xer`: the Aspose file with seven defects injected by
`scripts/make-damaged-fixture.ts` (truncated row, line break inside a name,
non-numeric float, negative float, a link to a missing activity, an activity
stripped of its links, a duplicated activity). The tests assert each one is
caught on the right line. The page shows it as a third tab marked synthetic.

The Aspose file does produce two real warnings: its PROJECT row has a blank
`proj_id`, and every activity has a blank calendar id, so float is converted at
8 hours per day.

File sources are in [`data/SOURCES.md`](data/SOURCES.md).

## What counts as what

**Broken row** (skipped, reported with line number): wrong number of fields for
its table, a line with no record marker, a row outside a table, a blank or
duplicate `task_id`, a relationship that points at an activity that is not in
the file or at itself.

**Warning** (row kept): float that is not a number, a date not in P6 format, an
open activity with no float, a calendar that is not in the file, a duplicate
relationship, an unknown relationship type, no header or end marker.

**The three checks** run on open activities only: not completed, and not
level-of-effort or WBS summary.

| Check | Rule |
|---|---|
| Missing links | no predecessor, or no successor |
| Negative float | total float < 0 |
| High float | total float > 44 working days (the DCMA 14-point threshold) |

Total float is stored in hours (`total_float_hr_cnt`). It is converted to days
with the hours-per-day of the activity's own calendar.

**Float chart**: open activities by total float in five buckets (negative,
exactly 0, 0–10 d, 10–44 d, over 44 d). Red and orange bars are the ones the
checks flag. Activities whose float is not a number are not charted; the page
says how many.

**Your own file** is rejected, with a message, if it does not end in `.xer`, is
empty, is over 20 MB, or has neither an `ERMHDR` header nor a `TASK` table.
Anything else loads. Broken rows do not reject a file; they are listed and left
out of the checks, as for the files in `data/`.

## How I checked the numbers

1. Before writing the checker I counted activities, relationships and float
   values in both files with a throwaway script. Those counts are the expected
   values in the tests.
2. `verify/crosscheck.py` shares no code with the checker. It re-reads the raw
   files, recomputes eight headline numbers per file from the definitions
   above, and fails if any differ from `report/results.json`, which
   `pnpm report:json` writes with the same loader the page uses. All 24 agree
   (eight numbers for each of the two public files and the damaged fixture).
3. The damaged fixture has a known list of defects, and the tests check the
   checker reports exactly those.

## Layout

```
app/page.tsx          server component: loads the results at build time
app/checker.tsx       client component: tabs, tiles, flagged rows, findings
app/float-chart.tsx   float chart (Recharts)
app/drop-zone.tsx     "Check your own .xer", read and checked in the browser
lib/xer/parse.ts      XER text -> tables, never throws, records issues by line
lib/xer/checks.ts     row validation + the three checks
lib/xer/load.ts       reads data/*.xer + the fixture with fs (server and scripts only)
lib/xer/upload.ts     rules for a dropped file
scripts/              damaged fixture generator, report:json
test/                 tests + damaged fixture
verify/               independent Python re-count
data/                 the two public .xer files
report/results.json   output of pnpm report:json, read by the cross-check
```

## Known limits

- When a broken activity row is skipped, its relationships are reported as
  broken too and its neighbours can show up under missing links. The page
  says so; in a product an upload with broken rows should be rejected first.
- Float is read as P6 calculated it. The checker does not re-run the CPM
  calculation.
- A file with several projects is checked as one set of activities, and links
  to activities in a project that was not exported are reported as broken.
- Files in `data/` are read at build time; adding or changing one needs a
  rebuild.
- A dropped file is parsed on the browser's main thread, so a file near the
  20 MB limit can freeze the page briefly. Dropped files are not saved and are
  gone after a reload.
- Built in a short time box with Claude Code. The definitions, the test
  expectations and the cross-check are how the numbers were verified.
