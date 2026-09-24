import { completionRate, rateLabel, isSlipping } from "@/lib/habits";
import { recurrenceLabel, type Recurrence } from "@/lib/recurrence";
import { getDict } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export type HabitRow = {
  seriesId: string;
  title: string;
  recurrence: Recurrence;
  done: number;
  missed: number;
  skipped: number;
  open: number;
};

export type SlippingRow = { id: string; title: string; rescheduleCount: number };

/**
 * How each habit actually went over the last 30 days, and which one-offs keep
 * getting pushed.
 *
 * Hand-rolled bars rather than a chart library, like the heatmap: a handful of
 * rows with a fill and a number doesn't need measurement or a client bundle.
 */
export async function HabitRates({
  habits,
  slipping,
}: {
  habits: HabitRow[];
  slipping: SlippingRow[];
}) {
  const t = await getDict();

  return (
    <div className="flex flex-col gap-lg">
      {habits.length > 0 && (
        <ul className="flex flex-col gap-md">
          {habits.map((h) => {
            const rate = completionRate(h);
            const pct = rate === null ? 0 : Math.round(rate * 100);
            return (
              <li key={h.seriesId} className="flex flex-col gap-xxs">
                <div className="flex items-baseline justify-between gap-sm">
                  <span className="truncate text-sm">{h.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-fg-secondary">
                    {rate === null ? "—" : `${pct}%`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
                  <div
                    className={cn(
                      "h-full rounded-full",
                      rate === null ? "" : rate >= 0.7 ? "bg-success" : rate >= 0.4 ? "bg-chart-3" : "bg-chart-4",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-fg-muted">
                  {recurrenceLabel(h.recurrence, t)} · {rateLabel(rate, t)} ·{" "}
                  {t.habits.done(h.done)}, {t.habits.missed(h.missed)}
                  {h.skipped > 0 && `, ${t.habits.skipped(h.skipped)}`}
                  {h.open > 0 && `, ${t.habits.stillOpen(h.open)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {slipping.length > 0 && (
        <div className="flex flex-col gap-xs">
          <span className="text-xs text-fg-muted">{t.habits.keepsPushed}</span>
          <ul className="flex flex-col gap-xxs">
            {slipping.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-sm text-sm">
                <span className="truncate">{s.title}</span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs tabular-nums",
                    isSlipping(s.rescheduleCount) ? "text-warning" : "text-fg-muted",
                  )}
                >
                  {t.habits.slip(s.rescheduleCount)}
                </span>
              </li>
            ))}
          </ul>
          <span className="text-[11px] text-fg-muted">{t.habits.movedThrice}</span>
        </div>
      )}
    </div>
  );
}
