"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, tooltipStyle } from "./chart-style";
import { useT } from "@/components/i18n-provider";

export type PvaRow = { week: string; planned: number; actual: number };

/**
 * Hours, not minutes: nobody reasons about a week in minutes.
 *
 * The series keys stay `planned`/`actual` and only their `name` is translated —
 * a dataKey that changes with the language would be a different chart.
 */
export function PlannedVsActual({ data }: { data: PvaRow[] }) {
  const { t } = useT();
  const rows = data.map((d) => ({
    week: d.week,
    planned: Math.round((d.planned / 60) * 10) / 10,
    actual: Math.round((d.actual / 60) * 10) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="week" {...axisProps} />
        <YAxis {...axisProps} unit={t.analytics.unitHour} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-bg-hover)" }} />
        <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-text-secondary)" }} />
        <Bar
          dataKey="planned" name={t.analytics.plannedVsActual.planned}
          fill="var(--color-text-muted)" radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="actual" name={t.analytics.plannedVsActual.actual}
          fill="var(--color-chart-1)" radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
