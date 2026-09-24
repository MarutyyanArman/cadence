"use client";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, tooltipStyle } from "./chart-style";
import { useT } from "@/components/i18n-provider";

export type InterruptionRow = { hour: string; rate: number };

/**
 * Interruptions per hour of focus, by hour of day. A raw count would just
 * mirror wherever you work most; the rate shows which hours are actually
 * protected and which are not.
 */
export function InterruptionsByHour({ data }: { data: InterruptionRow[] }) {
  const { t } = useT();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="hour" {...axisProps} interval={2} />
        <YAxis {...axisProps} allowDecimals />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-bg-hover)" }} />
        <Bar
          dataKey="rate" name={t.analytics.interruptions.perFocusHour}
          fill="var(--color-chart-3)" radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
