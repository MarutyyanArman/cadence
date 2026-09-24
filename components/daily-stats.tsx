import { Flame, Zap } from "lucide-react";
import {
  computeStreak, rankFor, totalXp, xpForDay,
  DAILY_XP_CAP, MAX_REST_DAYS, STREAK_MINUTES, type DayActivity,
} from "@/lib/streak";
import { getDict } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export type DailyStatsData = {
  activity: DayActivity[];
  today: string;
  focusToday: number;
};

/**
 * Streak and rank, across the top of the day.
 *
 * Kept deliberately quiet: no popups, no confetti, no red. The at-risk state
 * says what is still standing and what it costs to keep it — a counter that
 * scolds you gets the app closed, and then it can't motivate anything.
 */
export async function DailyStats({ activity, today, focusToday }: DailyStatsData) {
  const t = await getDict();
  const streak = computeStreak(activity, today);
  const rank = rankFor(totalXp(activity));
  const xpToday = xpForDay(focusToday);
  const cappedOut = xpToday >= DAILY_XP_CAP;

  const pctIntoLevel =
    rank.span === null ? 100 : Math.round((rank.into / rank.span) * 100);

  return (
    <section
      className="flex flex-wrap items-stretch gap-md rounded-md border border-line bg-surface px-lg py-md"
      aria-label={t.stats.ariaLabel}
    >
      {/* streak */}
      <div className="flex min-w-36 flex-1 flex-col gap-xxs">
        <span className="flex items-center gap-xs text-xs text-fg-muted">
          <Flame className={cn("size-3.5", streak.current > 0 ? "text-chart-3" : "text-fg-muted")} />
          {t.stats.streak}
        </span>
        <span className="flex items-baseline gap-xs">
          <span className="t-numeric">{streak.current}</span>
          <span className="text-xs text-fg-secondary">{t.stats.dayUnit(streak.current)}</span>
        </span>
        {streak.current === 0 ? (
          <span className="text-[11px] text-fg-muted">{t.stats.startsOne(STREAK_MINUTES)}</span>
        ) : streak.atRisk ? (
          <span className="text-[11px] text-fg-secondary">
            {t.stats.stillStanding(STREAK_MINUTES)}
            {streak.restDays > 0 && t.stats.orRestDay}
          </span>
        ) : (
          <span className="text-[11px] text-fg-muted">
            {t.stats.earnedToday}
            {streak.longest > streak.current && t.stats.best(streak.longest)}
          </span>
        )}
      </div>

      {/* rest days in hand */}
      <div className="flex min-w-28 flex-col gap-xxs">
        <span className="text-xs text-fg-muted">{t.stats.restDays}</span>
        <span
          className="flex items-center gap-xs pt-1"
          aria-label={t.stats.bankedAria(streak.restDays, MAX_REST_DAYS)}
        >
          {Array.from({ length: MAX_REST_DAYS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-2.5 rounded-full",
                i < streak.restDays ? "bg-chart-2" : "border border-line-strong",
              )}
            />
          ))}
        </span>
        <span className="text-[11px] text-fg-muted">
          {streak.restDays === 0 ? t.stats.onePerRun : t.stats.coversMissed}
        </span>
      </div>

      {/* rank */}
      <div className="flex min-w-40 flex-1 flex-col gap-xxs">
        <span className="flex items-center gap-xs text-xs text-fg-muted">
          <Zap className="size-3.5" />
          {t.stats.level(rank.level)}
        </span>
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-valuenow={pctIntoLevel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t.stats.levelProgressAria(rank.level)}
        >
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${pctIntoLevel}%` }} />
        </div>
        <span className="text-[11px] text-fg-muted">
          {rank.nextAt === null
            ? t.stats.topLevel
            : t.stats.toNextLevel(rank.span! - rank.into, rank.level + 1)}
        </span>
      </div>

      {/* today */}
      <div className="flex min-w-32 flex-col gap-xxs">
        <span className="text-xs text-fg-muted">{t.stats.focusedToday}</span>
        <span className="t-numeric">{t.fmt.minutes(focusToday)}</span>
        <span className={cn("text-[11px]", cappedOut ? "text-chart-2" : "text-fg-muted")}>
          {cappedOut ? t.stats.capped(DAILY_XP_CAP) : t.stats.xp(xpToday)}
        </span>
      </div>
    </section>
  );
}
