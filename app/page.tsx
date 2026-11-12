import { loadResults } from "@/lib/xer/load";
import { Checker } from "./checker";

// Server Component. loadResults() reads the files with synchronous node:fs
// calls, which Next.js completes during prerender, so the checks run once at
// build time and the route ships as static HTML.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 font-sans sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">XER schedule checker</h1>
      <p className="mt-1 mb-6 text-neutral-600 dark:text-neutral-400">
        Reads Primavera P6 .xer files, flags broken rows, and runs three checks on open activities: missing
        links, negative float, high float.
      </p>
      <Checker results={loadResults()} />
    </main>
  );
}
