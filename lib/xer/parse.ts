// XER structural parser.
//
// An XER file is tab-delimited text. The first field of every line says what
// the line is:
//   ERMHDR  file header (P6 version, export date, ...)
//   %T      start of a table, followed by its name
//   %F      field names for the current table
//   %R      one data row for the current table
//   %E      end of file
//
// The parser never throws on bad content. Anything that breaks the rules is
// recorded as an Issue with its line number, the row is left out, and parsing
// carries on, so one damaged row never hides the rest of the file.

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity; // error = row dropped from the checks, warning = row kept
  code: string;
  line: number | null; // 1-based line in the file, null for file-level issues
  table: string | null;
  message: string;
}

export interface Row {
  line: number;
  values: Record<string, string>;
}

export interface Table {
  name: string;
  fields: string[];
  rows: Row[];
  line: number;
}

export interface ParsedXer {
  header: { version: string | null; exportDate: string | null; raw: string[] };
  encoding: string;
  lineCount: number;
  rowLinesSeen: number; // every %R line, good or bad
  tables: Map<string, Table>;
  issues: Issue[];
}

export function decode(bytes: Uint8Array): { text: string; encoding: string } {
  // Modern P6 exports are UTF-8, older ones are Windows-1252. Try strict UTF-8
  // first and fall back, instead of guessing and corrupting names.
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

export function parseXer(bytes: Uint8Array): ParsedXer {
  const { text, encoding } = decode(bytes);
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const out: ParsedXer = {
    header: { version: null, exportDate: null, raw: [] },
    encoding,
    lineCount: lines.length,
    rowLinesSeen: 0,
    tables: new Map(),
    issues: [],
  };
  const issue = (severity: Severity, code: string, line: number | null, table: string | null, message: string) =>
    out.issues.push({ severity, code, line, table, message });

  let current: Table | null = null;
  let sawEnd = false;

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (raw === "") return;
    const parts = raw.split("\t");
    const tag = parts[0];

    if (tag === "ERMHDR") {
      if (line !== 1) issue("warning", "header_not_first", line, null, "ERMHDR header is not on line 1");
      out.header = { version: parts[1] ?? null, exportDate: parts[2] ?? null, raw: parts.slice(1) };
      return;
    }
    if (tag === "%T") {
      const name = (parts[1] ?? "").trim();
      if (!name) {
        issue("error", "table_no_name", line, null, "%T line has no table name; rows until the next %T are skipped");
        current = null;
        return;
      }
      if (out.tables.has(name)) issue("warning", "table_repeated", line, name, `Table ${name} appears more than once; rows are merged`);
      current = out.tables.get(name) ?? { name, fields: [], rows: [], line };
      out.tables.set(name, current);
      return;
    }
    if (tag === "%F") {
      if (!current) return issue("error", "fields_outside_table", line, null, "%F line before any %T table line");
      current.fields = parts.slice(1);
      return;
    }
    if (tag === "%R") {
      out.rowLinesSeen++;
      if (!current) return issue("error", "row_outside_table", line, null, "%R row before any %T table line");
      if (!current.fields.length) return issue("error", "row_before_fields", line, current.name, "%R row before the table's %F field list");
      const cells = parts.slice(1);
      if (cells.length !== current.fields.length) {
        const kind = cells.length < current.fields.length ? "short_row" : "long_row";
        return issue(
          "error",
          kind,
          line,
          current.name,
          `Row has ${cells.length} fields, table defines ${current.fields.length}` +
            (kind === "short_row" ? " (truncated, or a line break inside a text field)" : " (stray tab inside a text field)"),
        );
      }
      const values: Record<string, string> = {};
      current.fields.forEach((f, k) => (values[f] = cells[k]));
      current.rows.push({ line, values });
      return;
    }
    if (tag === "%E") {
      sawEnd = true;
      return;
    }
    issue(
      "error",
      "orphan_line",
      line,
      current?.name ?? null,
      `Line does not start with a record marker (starts "${raw.slice(0, 30)}"); usually the tail of a row split by a line break`,
    );
  });

  if (!out.header.raw.length) issue("warning", "no_header", null, null, "No ERMHDR header line; file may not be a P6 export");
  if (!sawEnd) issue("warning", "no_end_marker", null, null, "No %E end marker; file may be truncated");
  return out;
}
