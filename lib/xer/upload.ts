// Rules for a .xer file a user drops into the page. Pure functions with no DOM
// or fs access, so the browser runs exactly what the tests cover.

import { checkFile } from "./checks.ts";
import type { CheckedFile } from "./load.ts";
import { parseXer } from "./parse.ts";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadOutcome = { ok: true; result: CheckedFile } | { ok: false; error: string };

/** Rejects on name and size alone, so a bad file is never read. */
export function precheckUpload(name: string, size: number): string | null {
  if (!name.toLowerCase().endsWith(".xer")) {
    return `“${name}” is not a .xer file. Export the schedule from P6 as XER and try again.`;
  }
  if (size === 0) return `“${name}” is empty (0 bytes).`;
  if (size > MAX_UPLOAD_BYTES) {
    return `“${name}” is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`;
  }
  return null;
}

/**
 * Parses and checks the bytes. Only a file with neither an ERMHDR header nor
 * a TASK table is rejected; broken rows do not reject a file, they are listed
 * in the result like any other.
 */
export function checkUpload(name: string, bytes: Uint8Array): UploadOutcome {
  const parsed = parseXer(bytes);
  if (!parsed.header.raw.length && !parsed.tables.has("TASK")) {
    return {
      ok: false,
      error: `This doesn't look like a P6 XER export: “${name}” has no ERMHDR header and no TASK table.`,
    };
  }
  return { ok: true, result: { ...checkFile(name, parsed), synthetic: false } };
}
