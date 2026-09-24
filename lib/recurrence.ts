/**
 * Repeat rules for tasks that come back — "read a book", "standup", "weekly review".
 *
 * Deliberately not RRULE. The iCalendar grammar covers "every 3rd Tuesday in
 * months ending in R"; the cost is a parser, a dependency and a UI nobody can
 * read back. Three rules cover what a task list actually needs, and each one
 * is a word the user already understands.
 *
 * All maths here is on `YYYY-MM-DD` strings via UTC accessors. A date-only
 * string carries no timezone, and UTC arithmetic on it is identical on every
 * machine — which matters because the server runs in UTC and the browser does
 * not. Nothing in this file constructs a local-time Date.
 */

import { en, type Dict } from "./i18n/en";

export const RECURRENCES = ["daily", "weekdays", "weekly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function isRecurrence(value: unknown): value is Recurrence {
  return typeof value === "string" && (RECURRENCES as readonly string[]).includes(value);
}

/**
 * The rule in words. The dictionary defaults to English, so the pure suites —
 * and any caller with no locale to hand — behave exactly as before.
 */
export function recurrenceLabel(rule: Recurrence, dict: Dict = en): string {
  return dict.recurrence[rule] ?? en.recurrence[rule];
}

/* ---------------- date-only helpers ---------------- */

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → epoch ms at UTC midnight. Returns null if malformed. */
function parseDay(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // Rejects 2026-02-31, which Date.UTC would silently roll into March.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

function formatDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** 0 = Sunday, 6 = Saturday. */
function weekdayOf(ms: number): number {
  return new Date(ms).getUTCDay();
}

function isWeekend(ms: number): boolean {
  const w = weekdayOf(ms);
  return w === 0 || w === 6;
}

/** One step of the rule, strictly forward from `ms`. */
function step(rule: Recurrence, ms: number): number {
  if (rule === "weekly") return ms + 7 * DAY_MS;
  let next = ms + DAY_MS;
  if (rule === "weekdays") {
    while (isWeekend(next)) next += DAY_MS;
  }
  return next;
}

/* ---------------- the rule ---------------- */

/** A recurring task can't outrun this many steps; a guard, not a limit. */
const MAX_STEPS = 4000;

/**
 * When the next occurrence is due.
 *
 * The first date matching the rule strictly after `previousDue`, rolled
 * forward until it is not in the past. Two cases motivate that second half:
 *
 * - Tick off Tuesday's reading on Wednesday morning and the next one is due
 *   **Wednesday**, not Thursday. Anchoring to the completion date instead
 *   would quietly eat a day every time you finished late.
 * - Come back from three weeks away, tick off the stale one, and you get a
 *   single task due today — not one due three weeks ago, and not twenty.
 *
 * `previousDue` of null (a task created without a due date) anchors to today,
 * so "every day" first comes back tomorrow.
 */
export function nextDueDate(
  rule: Recurrence,
  previousDue: string | null,
  today: string,
): string | null {
  const todayMs = parseDay(today);
  if (todayMs === null) return null;

  const anchor = previousDue === null ? todayMs : parseDay(previousDue);
  if (anchor === null) return null;

  let candidate = step(rule, anchor);
  for (let i = 0; candidate < todayMs && i < MAX_STEPS; i++) {
    candidate = step(rule, candidate);
  }
  return formatDay(candidate);
}

/* ---------------- overdue occurrences ---------------- */

/**
 * How long an overdue repeating occurrence stays open.
 *
 * Due Monday, it can still be marked done, rescheduled or cancelled on Tuesday
 * and Wednesday. On Thursday, if nobody touched it, it is recorded as missed
 * and closed. Open-and-actionable is the right default for a day or two; past
 * that it only piles up — a week away would otherwise leave seven open copies
 * of the same habit, none of which can be done any more.
 */
export const MISSED_AFTER_DAYS = 2;

/** The last day an occurrence due on `due` can still be acted on. */
export function lastActionableDay(due: string): string | null {
  const ms = parseDay(due);
  return ms === null ? null : formatDay(ms + MISSED_AFTER_DAYS * DAY_MS);
}

/**
 * Every date the rule falls on strictly after `from`, up to and including
 * `through`.
 *
 * This is what fills a gap: the habit was last scheduled for `from`, it is now
 * `through`, and each of these days owes an occurrence — so a missed day exists
 * as a record rather than silently vanishing. Capped, because a habit
 * abandoned for years should not write thousands of rows on one page load.
 */
export function occurrencesAfter(
  rule: Recurrence,
  from: string,
  through: string,
  cap = 366,
): string[] {
  const start = parseDay(from);
  const end = parseDay(through);
  if (start === null || end === null || end <= start) return [];

  const out: string[] = [];
  let cursor = step(rule, start);
  while (cursor <= end && out.length < cap) {
    out.push(formatDay(cursor));
    cursor = step(rule, cursor);
  }
  return out;
}

/** Whole days between two YYYY-MM-DD strings; positive when `later` is after. */
export function daysBetween(earlier: string, later: string): number | null {
  const a = parseDay(earlier);
  const b = parseDay(later);
  return a === null || b === null ? null : Math.round((b - a) / DAY_MS);
}
