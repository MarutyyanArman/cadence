"use client";

import * as React from "react";
import { useT } from "@/components/i18n-provider";

export type DayRow = { day: string; minutes: number };

/**
 * GitHub-style year grid. Columns are weeks, rows are weekdays (Mon first).
 *
 * Pass `streak` to show the real one from lib/streak.ts. The fallback below
 * counts any non-zero day backwards from today, which means it reads zero
 * every morning until you have logged something — fine as a chart caption,
 * wrong as a number anyone is trying to protect.
 */
export function ConsistencyCalendar({
  data, weeks = 26, streak: streakProp,
}: { data: DayRow[]; weeks?: number; streak?: number }) {
  const { t } = useT();
  const { cells, max, streak } = React.useMemo(() => {
    const byDay = new Map(data.map((d) => [d.day, d.minutes]));
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // rewind to the Monday that starts the earliest visible week
    const start = new Date(end);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    const out: { key: string; minutes: number; date: Date }[] = [];
    let m = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const minutes = byDay.get(key) ?? 0;
      m = Math.max(m, minutes);
      out.push({ key, minutes, date: new Date(d) });
    }

    // current streak, counted backwards from today
    let s = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].minutes > 0) s++;
      else break;
    }
    return { cells: out, max: m, streak: streakProp ?? s };
  }, [data, weeks, streakProp]);

  const columns: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));

  return (
    <div className="flex flex-col gap-sm">
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]">
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((c) => (
                <div
                  key={c.key}
                  title={`${c.key} — ${t.fmt.minutes(c.minutes)}`}
                  className="size-[10px] rounded-[2px] bg-elevated"
                  style={
                    c.minutes > 0
                      ? {
                          backgroundColor: "var(--color-chart-2)",
                          opacity: 0.2 + (max === 0 ? 0 : c.minutes / max) * 0.8,
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-fg-secondary">
        {streak > 0
          ? t.analytics.consistency.daysInRow(streak)
          : t.analytics.consistency.noStreak}
      </p>
    </div>
  );
}
