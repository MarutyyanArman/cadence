/**
 * Showing up, measured across days — and the rank that comes off it.
 *
 * Both are derived from activity, never stored. A streak kept in a table drifts
 * the moment you log time against a past day; a streak derived from the record
 * simply recomputes and is right again. The rest-day ledger went the same way:
 * spending a credit is deterministic, so there is nothing to write down.
 *
 * Day maths is on `YYYY-MM-DD` strings via UTC accessors, so it gives the same
 * answer on any machine — see lib/recurrence.ts for the same reasoning.
 */

/** A day counts toward the streak at this much focused time. */
export const STREAK_MINUTES = 15;

/** One rest day banked per this many consecutive days. */
export const REST_DAY_EVERY = 7;

/** You can hold at most this many. */
export const MAX_REST_DAYS = 3;

/**
 * XP is focused minutes, capped per day.
 *
 * The cap is the point, not a limit to work around: an uncapped score pays out
 * most for a twelve-hour day, and twelve-hour days are how people burn out and
 * quit. This rewards turning up often and refuses to reward heroics.
 */
export const DAILY_XP_CAP = 240;

export type DayActivity = { day: string; focusMinutes: number };

export type StreakState = {
  /** Days running, including today if today has been earned. */
  current: number;
  /** Rest days in hand. */
  restDays: number;
  /** Has today cleared the threshold yet. */
  todayDone: boolean;
  /** A live streak that today hasn't extended — the only nudge-worthy state. */
  atRisk: boolean;
  longest: number;
};

/* ---------------- day-string arithmetic ---------------- */

const DAY_MS = 86_400_000;

function parseDay(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : ms;
}

function formatDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/* ---------------- the streak ---------------- */

/**
 * Walks the record forward, spending rest days on gaps as it goes.
 *
 * Today is deliberately handled apart from the loop. A streak that reads zero
 * every morning until you have logged something is the single most demoralising
 * thing this kind of counter can do — the day is not lost until it is over, so
 * an unearned today leaves the streak standing and only flags it `atRisk`.
 */
export function computeStreak(activity: DayActivity[], today: string): StreakState {
  const todayMs = parseDay(today);
  const empty: StreakState = {
    current: 0, restDays: 0, todayDone: false, atRisk: false, longest: 0,
  };
  if (todayMs === null) return empty;

  const minutes = new Map<string, number>();
  for (const a of activity) {
    const ms = parseDay(a.day);
    if (ms === null || ms > todayMs) continue; // future rows can't count
    minutes.set(a.day, Math.max(minutes.get(a.day) ?? 0, a.focusMinutes));
  }
  if (minutes.size === 0) return empty;

  const firstMs = Math.min(...[...minutes.keys()].map((k) => parseDay(k)!));

  let streak = 0;
  let credits = 0;
  let longest = 0;

  const earnCredit = () => {
    if (streak > 0 && streak % REST_DAY_EVERY === 0 && credits < MAX_REST_DAYS) credits++;
  };

  for (let ms = firstMs; ms < todayMs; ms += DAY_MS) {
    const active = (minutes.get(formatDay(ms)) ?? 0) >= STREAK_MINUTES;
    if (active) {
      streak++;
    } else if (credits > 0) {
      credits--; // a banked rest day covers the gap silently
      streak++;
    } else {
      streak = 0;
      credits = 0; // credits are part of the streak, and go down with it
    }
    earnCredit();
    longest = Math.max(longest, streak);
  }

  const todayDone = (minutes.get(today) ?? 0) >= STREAK_MINUTES;
  if (todayDone) {
    streak++;
    earnCredit();
    longest = Math.max(longest, streak);
  }

  return {
    current: streak,
    restDays: credits,
    todayDone,
    atRisk: streak > 0 && !todayDone,
    longest,
  };
}

/* ---------------- XP and rank ---------------- */

/** Minutes of focus needed to reach each level. Index 0 is level 1. */
export const LEVEL_THRESHOLDS = [
  0, 120, 360, 900, 1_800, 3_600, 7_200, 14_400, 28_800, 57_600,
] as const;

export type Rank = {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. null at the top. */
  span: number | null;
  /** Total XP at which the next level starts. null at the top. */
  nextAt: number | null;
};

export function rankFor(xp: number): Rank {
  const total = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (total >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  const floor = LEVEL_THRESHOLDS[level - 1];
  const nextAt = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : null;
  return {
    level,
    into: total - floor,
    span: nextAt === null ? null : nextAt - floor,
    nextAt,
  };
}

/** XP a single day is worth, after the cap. */
export function xpForDay(focusMinutes: number): number {
  if (!Number.isFinite(focusMinutes) || focusMinutes <= 0) return 0;
  return Math.min(DAILY_XP_CAP, Math.floor(focusMinutes));
}

export function totalXp(activity: DayActivity[]): number {
  return activity.reduce((sum, a) => sum + xpForDay(a.focusMinutes), 0);
}
