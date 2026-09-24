"use client";

import {
  CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { axisProps, tooltipStyle } from "./chart-style";
import { useT } from "@/components/i18n-provider";

export type AccuracyRow = { title: string; estimated: number; actual: number };

/**
 * The diagonal is a perfect estimate. Points above it are underestimates —
 * for most people that is nearly all of them.
 */
export function EstimateAccuracy({ data }: { data: AccuracyRow[] }) {
  const { t } = useT();
  const c = t.analytics.accuracy;
  const max = Math.max(60, ...data.map((d) => Math.max(d.estimated, d.actual))) * 1.1;
  const under = data.filter((d) => d.actual > d.estimated);
  const over = data.filter((d) => d.actual <= d.estimated);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--color-border-subtle)" />
        <XAxis
          type="number" dataKey="estimated" name={c.estimated}
          domain={[0, max]} unit={t.analytics.unitMinute} {...axisProps}
        />
        <YAxis
          type="number" dataKey="actual" name={c.actual}
          domain={[0, max]} unit={t.analytics.unitMinute} {...axisProps}
        />
        <ZAxis type="category" dataKey="title" name={c.task} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
        <ReferenceLine
          segment={[{ x: 0, y: 0 }, { x: max, y: max }]}
          stroke="var(--color-text-muted)"
          strokeDasharray="4 4"
        />
        <Scatter name={c.over} data={under} fill="var(--color-status-warning)" />
        <Scatter name={c.within} data={over} fill="var(--color-status-success)" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
