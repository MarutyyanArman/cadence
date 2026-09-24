"use client";

import * as React from "react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type HeatRow = { dayOfWeek: number; hourOfDay: number; focusMinutes: number };

/**
 * Hand-rolled rather than a charting library: a 7x24 matrix of divs is smaller,
 * faster and easier to make accessible than coercing a chart library into a grid.
 * Postgres extract(dow) is Sunday=0; this grid is Monday-first, hence the shift.
 */
export function FocusHeatmap({ data }: { data: HeatRow[] }) {
  const { t } = useT();
  const DAYS = t.charts.weekdays;
  const { grid, max } = React.useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    let m = 0;
    for (const c of data) {
      const row = (c.dayOfWeek + 6) % 7; // Sun=0 → Mon-first
      g[row][c.hourOfDay] += c.focusMinutes;
      m = Math.max(m, g[row][c.hourOfDay]);
    }
    return { grid: g, max: m };
  }, [data]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="mb-xs flex pl-8">
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className="flex-1 text-center font-mono text-[9px] text-fg-muted"
            >
              {h % 6 === 0 ? h : ""}
            </span>
          ))}
        </div>

        {grid.map((row, i) => (
          <div key={i} className="flex items-center gap-xxs">
            <span className="w-8 shrink-0 text-[10px] text-fg-muted">{DAYS[i]}</span>
            {row.map((mins, h) => {
              const intensity = max === 0 ? 0 : mins / max;
              return (
                <div
                  key={h}
                  title={`${DAYS[i]} ${t.fmt.hour(h)} — ${t.fmt.minutes(mins)}`}
                  className={cn("h-4 flex-1 rounded-[2px]", mins === 0 && "bg-elevated/50")}
                  style={
                    mins > 0
                      ? {
                          backgroundColor: "var(--color-chart-1)",
                          // floor at 0.15 so a single logged minute is still visible
                          opacity: 0.15 + intensity * 0.85,
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
