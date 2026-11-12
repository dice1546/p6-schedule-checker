"use client";

import { useEffect, useState } from "react";
import type { CheckedFile } from "@/lib/xer/load";
import { checkUpload, precheckUpload } from "@/lib/xer/upload";

// The file is read with file.arrayBuffer() and checked in the browser. There
// is no fetch or form submission: nothing leaves the page.
export function DropZone({ onResult }: { onResult: (r: CheckedFile) => void }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // A file dropped just outside the zone would otherwise make the browser
  // navigate away to open it.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  async function handle(files: FileList | null) {
    if (!files?.length || busy) return;
    setStatus(null);
    if (files.length > 1) return setError("Drop one .xer file at a time.");
    const file = files[0];
    const rejected = precheckUpload(file.name, file.size);
    if (rejected) return setError(rejected);

    setError(null);
    setBusy(true);
    try {
      const out = checkUpload(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!out.ok) return setError(out.error);
      onResult(out.result);
      const broken = out.result.counts.brokenRows;
      setStatus(`Checked ${file.name}: ${broken} broken ${broken === 1 ? "row" : "rows"}.`);
    } catch {
      setError(`Could not read “${file.name}”. Try choosing it again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-xl border-2 border-dashed px-5 py-5 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-600 ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40"
            : "border-neutral-300 bg-white hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500"
        }`}
      >
        <input
          type="file"
          accept=".xer"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = ""; // so choosing the same file again fires change
          }}
        />
        <span className="pointer-events-none block font-semibold">Check your own .xer</span>
        <span className="pointer-events-none mt-1 block text-sm text-neutral-600 dark:text-neutral-400">
          {busy
            ? "Checking…"
            : "Drop a P6 export here or click to choose one, up to 20 MB. It is checked in your browser and never uploaded."}
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
