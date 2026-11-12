"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Finding } from "@/lib/xer/checks";
import type { CheckedFile } from "@/lib/xer/load";
import { DropZone } from "./drop-zone";
import { FloatChart } from "./float-chart";

// Fixed locale so the server render and hydration format numbers the same way.
const nf = new Intl.NumberFormat("en-US");

const card = "rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
const muted = "text-neutral-600 dark:text-neutral-400";
const th = "border-b border-neutral-200 py-1.5 pr-3 text-left font-medium whitespace-nowrap text-neutral-600 dark:border-neutral-800 dark:text-neutral-400";
const td = "border-b border-neutral-200 py-1.5 pr-3 align-top dark:border-neutral-800";
const num = `${td} tabular-nums whitespace-nowrap`;

// `uploaded` marks a file checked in the browser from the drop zone, as
// opposed to one read from disk at build time.
type Entry = CheckedFile & { uploaded?: boolean };

export function Checker({ results }: { results: CheckedFile[] }) {
  const [files, setFiles] = useState<Entry[]>(results);
  const [selected, setSelected] = useState(0);
  const [revision, setRevision] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const r = files[selected];

  // Checking a file with the same name again replaces its tab.
  const addUpload = (result: CheckedFile) => {
    const existing = files.findIndex((f) => f.uploaded && f.file === result.file);
    const entry = { ...result, uploaded: true };
    setFiles(existing === -1 ? [...files, entry] : files.map((f, i) => (i === existing ? entry : f)));
    setSelected(existing === -1 ? files.length : existing);
    setRevision((n) => n + 1);
  };

  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent) => {
    const target = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: files.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const next = (target + files.length) % files.length;
    setSelected(next);
    tabs.current[next]?.focus();
  };

  return (
    <>
      <DropZone onResult={addUpload} />
      {!r ? (
        <p className={muted}>No .xer files found in data/.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Schedule files" onKeyDown={onKeyDown} className="mb-4 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <button
                key={f.file}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={`${id}-tab-${i}`}
                type="button"
                role="tab"
                aria-selected={i === selected}
                aria-controls={`${id}-panel`}
                tabIndex={i === selected ? 0 : -1}
                onClick={() => setSelected(i)}
                className="rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-selected:border-neutral-900 aria-selected:font-semibold aria-selected:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 dark:aria-selected:border-neutral-100 dark:aria-selected:text-neutral-100"
              >
                {f.file.split("/").pop()}
                {f.synthetic && (
                  <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-px text-xs font-normal text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    synthetic
                  </span>
                )}
                {f.uploaded && (
                  <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-px text-xs font-normal text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                    your file
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* key resets the <details> open state when the file shown changes */}
          <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} key={`${selected}:${revision}`}>
            <FileView r={r} />
          </div>
        </>
      )}
    </>
  );
}

function FileView({ r }: { r: CheckedFile }) {
  const c = r.counts;
  const k = r.checks;
  const flagged = [...r.issues.filter((i) => i.severity === "error"), ...r.issues.filter((i) => i.severity === "warning")];

  return (
    <div className="space-y-4">
      <p className={`text-sm ${muted}`}>
        P6 {r.p6Version ?? "version unknown"} · exported {r.exportDate ?? "date unknown"} · {c.tables} tables ·{" "}
        {nf.format(c.rowLines)} rows · {nf.format(c.activities)} activities ({nf.format(c.activitiesInScope)} open) ·{" "}
        {nf.format(c.relationships)} relationships
      </p>

      {r.synthetic && (
        <Note tone="amber">
          <strong>Synthetic test file.</strong> Defects were injected on purpose to show the checker catches them. This
          is not a real schedule.
        </Note>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Broken rows"
          value={c.brokenRows}
          detail={c.brokenRows ? "excluded from the checks" : "every row parsed"}
          dot={c.brokenRows ? "bg-red-600 dark:bg-red-500" : "bg-green-600 dark:bg-green-500"}
        />
        <Tile
          label="Missing links"
          value={k.missingLinks.count}
          detail={`${k.missingLinks.noPredecessor} no predecessor · ${k.missingLinks.noSuccessor} no successor`}
          dot="bg-neutral-400 dark:bg-neutral-500"
        />
        <Tile
          label="Negative float"
          value={k.negativeFloat.count}
          detail={`of ${nf.format(c.activitiesInScope)} open activities`}
          dot="bg-red-600 dark:bg-red-500"
        />
        <Tile
          label="High float"
          value={k.highFloat.count}
          detail={`> ${k.highFloat.thresholdDays} working days`}
          dot="bg-orange-500 dark:bg-orange-400"
        />
      </div>

      {c.brokenRows > 0 && (
        <Note tone="red">
          <strong>
            {c.brokenRows} broken {c.brokenRows === 1 ? "row is" : "rows are"} excluded from the checks.
          </strong>{" "}
          Any activity or link on those rows is missing from the counts above, so fix the file and re-run before
          trusting them.
        </Note>
      )}

      <section className={card}>
        <h2 className="mb-3 font-semibold">Open activities by total float</h2>
        <FloatChart buckets={r.floatBuckets} />
        {r.floatUnknown > 0 && (
          <p className={`mt-2 text-sm ${muted}`}>
            {r.floatUnknown} open {r.floatUnknown === 1 ? "activity has" : "activities have"} no usable float value and{" "}
            {r.floatUnknown === 1 ? "is" : "are"} not charted.
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Rows the parser flagged</h2>
        {flagged.length === 0 ? (
          <p className={muted}>No broken rows and no warnings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th}>Line</th>
                  <th className={th}>Table</th>
                  <th className={th}>Severity</th>
                  <th className={th}>Problem</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((i, n) => (
                  <tr key={n}>
                    <td className={num}>{i.line ?? "file"}</td>
                    <td className={num}>{i.table ?? "—"}</td>
                    <td className={td}>
                      {i.severity === "error" ? (
                        <Pill className="border-red-300 text-red-700 dark:border-red-900 dark:text-red-300">
                          Broken, skipped
                        </Pill>
                      ) : (
                        <Pill className="border-amber-300 text-amber-800 dark:border-amber-900 dark:text-amber-300">
                          Warning, kept
                        </Pill>
                      )}
                    </td>
                    <td className={td}>{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">Check findings</h2>
        <Findings
          title="Missing links"
          list={k.missingLinks.findings}
          note="Open activities with no predecessor or no successor. One open start and one open finish per project is normal."
        />
        <Findings
          title="Negative float"
          list={k.negativeFloat.findings}
          note="Open activities with total float below zero: the schedule cannot meet a constraint or the finish date."
        />
        <Findings
          title="High float"
          list={k.highFloat.findings}
          note={`Open activities with more than ${k.highFloat.thresholdDays} working days of total float, which usually points at missing or wrong logic.`}
        />
      </section>
    </div>
  );
}

function Tile({ label, value, detail, dot }: { label: string; value: number; detail: string; dot: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className={`flex items-center gap-2 text-sm ${muted}`}>
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{nf.format(value)}</div>
      <div className={`mt-0.5 text-xs ${muted}`}>{detail}</div>
    </div>
  );
}

function Findings({ title, list, note }: { title: string; list: Finding[]; note: string }) {
  return (
    // Open by default only when the list is short enough to scan.
    <details
      open={list.length > 0 && list.length <= 15}
      className="border-t border-neutral-200 py-2.5 first-of-type:border-t-0 dark:border-neutral-800"
    >
      <summary className="cursor-pointer font-semibold">
        {title} <span className={`font-normal ${muted}`}>({list.length})</span>
      </summary>
      <p className={`mt-2 text-sm ${muted}`}>{note}</p>
      {list.length === 0 ? (
        <p className={`mt-1.5 ${muted}`}>None found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Line</th>
                <th className={th}>Activity</th>
                <th className={th}>Name</th>
                <th className={th}>Status</th>
                <th className={th}>Finding</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f, n) => (
                <tr key={n}>
                  <td className={num}>{f.line}</td>
                  <td className={num}>{f.code}</td>
                  <td className={td}>{f.name}</td>
                  <td className={`${td} whitespace-nowrap`}>{f.status}</td>
                  <td className={td}>{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function Note({ tone, children }: { tone: "amber" | "red"; children: ReactNode }) {
  const tones = {
    amber: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    red: "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
  };
  return (
    <p role="note" className={`rounded-lg border px-4 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full border px-2 py-px text-xs whitespace-nowrap ${className}`}>{children}</span>;
}
