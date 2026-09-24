/**
 * What Arc is allowed to say, and when.
 *
 * The rule every message here is written against: **it names a specific thing
 * and costs nothing to ignore.** Duolingo's owl works because it arrives at a
 * moment of genuine near-loss; it backfires when it arrives as guilt. A
 * notification that makes you feel watched gets the channel switched off within
 * a week, and then none of the useful ones can reach you either.
 *
 * So: no "you haven't done anything today", no sad faces, no counting what you
 * failed to do. Every message states a fact only Arc knows, and offers an
 * action or nothing at all.
 *
 * Deciding is pure and lives here. Delivery is the browser's, and assembling
 * the context is the server's.
 */
import { STREAK_MINUTES, type StreakState } from "./streak";
import { calibrationScore } from "./calibration";
import { en, type Dict } from "./i18n/en";

export const NOTIFICATION_KINDS = ["streak_risk", "best_hour", "calibration"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * English names for the toggles, kept as a plain constant for callers with no
 * locale — the settings UI reads the chosen dictionary instead.
 */
export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  streak_risk: en.notifications.labels.streak_risk,
  best_hour: en.notifications.labels.best_hour,
  calibration: en.notifications.labels.calibration,
};

/** Evening only. Earlier than this and the day isn't meaningfully at risk. */
export const STREAK_RISK_HOUR = 20;

/** Don't claim an "hour you work best" off one or two sessions. */
export const MIN_SESSIONS_FOR_BEST_HOUR = 3;

export type NotificationContext = {
  /** Local hour, 0–23. */
  hour: number;
  /** `YYYY-MM-DD`, used as the dedupe key for once-a-day messages. */
  today: string;
  streak: StreakState;
  focusTodayMinutes: number;
  /** A timer already running means they're working — say nothing. */
  timerRunning: boolean;
  /** The hour of day with the most logged focus, and how it typically goes. */
  bestHour: { hour: number; sessions: number; averageMinutes: number } | null;
  /** Something concrete to point at, rather than "get to work". */
  nextTaskTitle: string | null;
  /** Set briefly after a task with an estimate is finished. */
  justCompleted: {
    taskId: string;
    title: string;
    estimateMinutes: number;
    actualMinutes: number;
    calibrationNow: number | null;
  } | null;
};

export type NotificationCandidate = {
  kind: NotificationKind;
  /** Unique per thing-worth-saying, so it is said once. */
  dedupeKey: string;
  title: string;
  body: string;
};

/**
 * Everything worth saying right now. Order is priority — the caller may show
 * only the first if it would rather not stack them.
 *
 * The dictionary decides the words; this function decides only whether there
 * is anything to say. Defaults to English so the pure suite is unaffected.
 */
export function dueNotifications(
  ctx: NotificationContext,
  dict: Dict = en,
): NotificationCandidate[] {
  const out: NotificationCandidate[] = [];
  const copy = dict.notifications;

  // 1. A finished estimate, while the result is still interesting. Fires on
  //    the result, good or bad, and never editorialises about the bad ones.
  if (ctx.justCompleted) {
    const { taskId, title, estimateMinutes, actualMinutes, calibrationNow } = ctx.justCompleted;
    const score = calibrationScore(actualMinutes / estimateMinutes);
    const headline =
      score >= 85
        ? copy.calledIt(actualMinutes, estimateMinutes)
        : copy.estimateResult(actualMinutes, estimateMinutes);
    out.push({
      kind: "calibration",
      dedupeKey: taskId,
      title: headline,
      body:
        calibrationNow === null
          ? copy.taskIsDone(title)
          : copy.calibrationNow(calibrationNow),
    });
  }

  // 2. A streak with something real at stake, late enough that it matters.
  //    Names what is still standing, what it costs, and the way out.
  if (
    ctx.hour >= STREAK_RISK_HOUR &&
    ctx.streak.current > 0 &&
    !ctx.streak.todayDone &&
    !ctx.timerRunning
  ) {
    const rest = ctx.streak.restDays > 0 ? copy.restBanked(ctx.streak.restDays) : "";
    out.push({
      kind: "streak_risk",
      dedupeKey: ctx.today,
      title: copy.streakIntact(ctx.streak.current),
      body: `${copy.streakKeeps(STREAK_MINUTES)}${rest}`,
    });
  }

  // 3. The hour you actually work best, as it arrives. Earns the interruption
  //    with a fact only Arc has, then points at one task.
  if (
    ctx.bestHour &&
    ctx.bestHour.sessions >= MIN_SESSIONS_FOR_BEST_HOUR &&
    ctx.hour === ctx.bestHour.hour &&
    ctx.focusTodayMinutes < STREAK_MINUTES &&
    !ctx.timerRunning
  ) {
    const pointer = ctx.nextTaskTitle ? copy.bestHourPointer(ctx.nextTaskTitle) : "";
    out.push({
      kind: "best_hour",
      dedupeKey: ctx.today,
      title: copy.bestHourTitle,
      body:
        copy.bestHourBody(dict.fmt.hour(ctx.bestHour.hour), ctx.bestHour.averageMinutes) +
        pointer,
    });
  }

  return out;
}
