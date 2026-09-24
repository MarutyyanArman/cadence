"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { tooltipStyle } from "./chart-style";
import { useT } from "@/components/i18n-provider";

export type AllocationRow = { name: string; minutes: number; colorSlot: number };

export function AllocationDonut({ data }: { data: AllocationRow[] }) {
  const { t } = useT();
  const total = data.reduce((s, d) => s + d.minutes, 0);

  return (
    <div className="flex flex-col gap-md sm:flex-row sm:items-center">
      <ResponsiveContainer width="100%" height={200} className="sm:max-w-[200px]">
        <PieChart>
          <Pie
            data={data}
            dataKey="minutes"
            nameKey="name"
            innerRadius={54}
            outerRadius={82}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={`var(--color-chart-${d.colorSlot})`} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => t.fmt.minutes(Number(v ?? 0))}
          />
        </PieChart>
      </ResponsiveContainer>

      <ul className="flex min-w-0 flex-1 flex-col gap-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-sm text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: `var(--color-chart-${d.colorSlot})` }}
            />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="font-mono text-fg-muted tabular-nums">
              {t.fmt.minutes(d.minutes)}
              {total > 0 && ` · ${Math.round((d.minutes / total) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
