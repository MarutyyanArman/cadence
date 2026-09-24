import Link from "next/link";
import { addDays, isoDay, startOfWeek, weekDays } from "@/lib/time";
import { AppNav } from "@/components/app-nav";
import { getDict } from "@/lib/i18n/server";

/**
 * Previous / today / next. Plain links, not buttons: the week lives in the URL
 * (`?week=YYYY-MM-DD`) so a week is shareable and the back button works.
 */
export async function WeekNav({ weekStart }: { weekStart: Date }) {
  const t = await getDict();
  const prev = isoDay(addDays(weekStart, -7));
  const next = isoDay(addDays(weekStart, 7));
  const thisWeek = isoDay(startOfWeek(new Date()));
  const isCurrent = isoDay(weekStart) === thisWeek;

  const days = weekDays(weekStart);
  // The month name is the dictionary's job: "September 2026" and
  // "сентябрь 2026 г." are not the same string with a different word in it.
  const label = t.fmt.monthSpan(days[0], days[6]);

  const btn =
    "rounded-md border border-line px-md py-xs text-sm text-fg-secondary transition-colors hover:bg-hovered hover:text-fg-primary";

  return (
    <div className="flex flex-col gap-sm">
      <AppNav current="calendar" />

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-baseline gap-md">
          <h1 className="t-h1">{t.calendar.heading}</h1>
          <p className="t-body text-fg-secondary">{label}</p>
        </div>

        <div className="flex items-center gap-xs">
          <Link
            href={`/calendar?week=${prev}`}
            className={btn}
            aria-label={t.calendar.prevWeekAria}
          >
            ←
          </Link>
          <Link
            href="/calendar"
            aria-current={isCurrent ? "date" : undefined}
            className={
              isCurrent
                ? "rounded-md border border-line bg-hovered px-md py-xs text-sm text-fg-primary"
                : btn
            }
          >
            {t.calendar.today}
          </Link>
          <Link
            href={`/calendar?week=${next}`}
            className={btn}
            aria-label={t.calendar.nextWeekAria}
          >
            →
          </Link>
        </div>
      </div>
    </div>
  );
}
