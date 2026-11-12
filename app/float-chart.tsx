"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  Text,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type XAxisTickContentProps,
} from "recharts";
import type { FileResult } from "@/lib/xer/checks";

type Bucket = FileResult["floatBuckets"][number];

// SVG colours are CSS variables set per theme on the wrapper, so the chart
// follows light/dark mode. They match the tile dots in checker.tsx.
const theme = [
  "[--chart-ok:var(--color-blue-600)] dark:[--chart-ok:var(--color-blue-500)]",
  "[--chart-negative:var(--color-red-600)] dark:[--chart-negative:var(--color-red-500)]",
  "[--chart-high:var(--color-orange-500)] dark:[--chart-high:var(--color-orange-400)]",
  "[--chart-grid:var(--color-neutral-200)] dark:[--chart-grid:var(--color-neutral-800)]",
  "[--chart-ink:var(--color-neutral-900)] dark:[--chart-ink:var(--color-neutral-100)]",
  "[--chart-muted:var(--color-neutral-600)] dark:[--chart-muted:var(--color-neutral-400)]",
  "[--chart-cursor:var(--color-neutral-100)] dark:[--chart-cursor:var(--color-neutral-800)]",
].join(" ");

// Colour by the checker's flag, not the label: the "Over N d" label follows
// the high-float threshold.
const colorOf = (flag: Bucket["flag"]) =>
  flag === "negative" ? "var(--chart-negative)" : flag === "high" ? "var(--chart-high)" : "var(--chart-ok)";

const tick = { fill: "var(--chart-muted)", fontSize: 12 };

// Wraps a bucket label onto two lines when its slot is narrower than the text
// (phones). The non-breaking space keeps "44 d" together instead of leaving a
// lone "d" on the second line.
function BucketTick(props: XAxisTickContentProps) {
  const slot = Number(props.width) / props.visibleTicksCount;
  return (
    <Text {...props} {...tick} width={slot - 8} className="recharts-cartesian-axis-tick-value">
      {String(props.payload.value).replace(/ d$/, " d")}
    </Text>
  );
}

export function FloatChart({ buckets }: { buckets: Bucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const high = buckets.find((b) => b.flag === "high");
  const legend = [
    { color: colorOf("negative"), name: "Negative float (flagged)" },
    { color: colorOf("high"), name: `High float, ${high ? high.label.toLowerCase() : "over threshold"} (flagged)` },
    { color: colorOf(null), name: "Within range" },
  ];

  return (
    <div className={theme}>
      <BarChart responsive width="100%" height={310} data={buckets} margin={{ top: 24, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          interval={0}
          height={60}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tick={BucketTick}
          label={{ value: "Total float, working days", position: "insideBottom", offset: 0, ...tick }}
        />
        <YAxis allowDecimals={false} width={36} tickLine={false} axisLine={false} tick={tick} />
        <Tooltip
          cursor={{ fill: "var(--chart-cursor)" }}
          content={({ active, payload }) => {
            const b = payload?.[0]?.payload as Bucket | undefined;
            if (!active || !b) return null;
            const pct = total ? Math.round((b.count / total) * 100) : 0;
            return (
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-900">
                <div className="font-semibold">{b.label}</div>
                <div className="tabular-nums">
                  {b.count} {b.count === 1 ? "activity" : "activities"} · {pct}%
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">of {total} charted open activities</div>
              </div>
            );
          }}
        />
        <Bar
          dataKey="count"
          name="Open activities"
          maxBarSize={96}
          shape={(p: BarShapeProps) => <Rectangle {...p} radius={[4, 4, 0, 0]} fill={colorOf((p.payload as Bucket).flag)} />}
        >
          <LabelList dataKey="count" position="top" fill="var(--chart-ink)" fontSize={13} fontWeight={600} />
        </Bar>
      </BarChart>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        {legend.map((l) => (
          <li key={l.name} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: l.color }} />
            {l.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
