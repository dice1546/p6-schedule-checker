import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { checkUpload, MAX_UPLOAD_BYTES, precheckUpload } from "@/lib/xer/upload";

const enc = (s: string) => new TextEncoder().encode(s);

test("precheck rejects wrong extension, empty and oversized files before reading", () => {
  expect(precheckUpload("schedule.xer", 1)).toBeNull();
  expect(precheckUpload("SCHEDULE.XER", 1)).toBeNull();
  expect(precheckUpload("schedule.xer", MAX_UPLOAD_BYTES)).toBeNull(); // exactly 20 MB is allowed
  expect(precheckUpload("schedule.xml", 10)).toMatch(/is not a \.xer file/);
  expect(precheckUpload("schedule.xer.txt", 10)).toMatch(/is not a \.xer file/);
  expect(precheckUpload("schedule.xer", 0)).toMatch(/is empty/);
  expect(precheckUpload("schedule.xer", MAX_UPLOAD_BYTES + 1)).toMatch(/limit is 20 MB/);
});

test("a file with no ERMHDR header and no TASK table is rejected", () => {
  for (const junk of ["hello world", "%T\tPROJECT\n%F\tproj_id\n%R\t1"]) {
    const out = checkUpload("x.xer", enc(junk));
    expect(out.ok, junk).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/^This doesn't look like a P6 XER export/);
  }
});

test("a header alone, or a TASK table alone, is enough to load", () => {
  expect(checkUpload("h.xer", enc("ERMHDR\t8.0\n%E\n")).ok).toBe(true);
  expect(checkUpload("t.xer", enc("%T\tTASK\n%F\ttask_id\n%R\t1\n%E\n")).ok).toBe(true);
});

test("a file with broken rows still loads and lists them", () => {
  const out = checkUpload("damaged.xer", readFileSync(new URL("fixtures/damaged.xer", import.meta.url)));
  expect(out.ok).toBe(true);
  if (out.ok) {
    expect(out.result.counts.brokenRows).toBe(9);
    expect(out.result.synthetic).toBe(false);
    expect(out.result.file).toBe("damaged.xer");
  }
});
