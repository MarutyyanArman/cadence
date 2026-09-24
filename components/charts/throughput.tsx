"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, tooltipStyle } from "./chart-style";
import { useT } from "@/components/i18n-provider";

export type ThroughputRow = { day: string; created: number; completed: number };

/** Created consistently above completed is a backlog forming. */
export function Throughput({ data }: { data: ThroughputRow[] }) {
  const { t } = useT();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis dataKey="day" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-text-secondary)" }} />
        <Line
          type="monotone" dataKey="created" name={t.analytics.throughput.created}
          stroke="var(--color-chart-4)" strokeWidth={2} dot={false}
        />
        <Line
          type="monotone" dataKey="completed" name={t.analytics.throughput.completed}
          stroke="var(--color-chart-2)" strokeWidth={2} dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
