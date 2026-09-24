"use client";

import * as React from "react";
import { WeekGrid, type GridEvent } from "./week-grid";
import { HOUR_PX, MINUTES_PER_DAY, minutesToPx, parseIsoDay, startOfWeek } from "@/lib/time";
import { useT } from "@/components/i18n-provider";

/**
 * Mount gate for the grid.
 *
 * The server runs in UTC and the browser does not, so a block's absolute top
 * offset is only correct once a local clock is available — SSR-ing it would
 * mismatch on hydration. A skeleton of the right height renders until mount,
 * so the page reserves the space and does not jump.
 *
 * `weekKey` is a `YYYY-MM-DD` string rather than a Date for the same reason:
 * parsed here, it means local midnight in the *viewer's* zone.
 */
export function CalendarBody({
  weekKey,
  events,
}: {
  weekKey: string;
  events: GridEvent[];
}) {
  const { t } = useT();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const weekStart = React.useMemo(
    () => startOfWeek(parseIsoDay(weekKey) ?? new Date()),
    [weekKey],
  );

  if (!mounted) {
    return (
      <div
        aria-hidden
        className="rounded-md border border-line bg-surface"
        style={{ height: Math.min(minutesToPx(MINUTES_PER_DAY, HOUR_PX), 560) }}
      >
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-fg-muted">{t.calendar.loadingWeek}</p>
        </div>
      </div>
    );
  }

  // Dates cross the server boundary as strings; revive them once, here.
  const revived = events.map((e) => ({
    ...e,
    startsAt: new Date(e.startsAt),
    endsAt: new Date(e.endsAt),
  }));

  return <WeekGrid weekStart={weekStart} events={revived} />;
}
