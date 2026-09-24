/**
 * How repeating tasks and rescheduled one-offs actually went.
 *
 * Framed as information, not a tally of failures: a completion rate says what
 * happened, and the words attached to it never scold. Same rule as the
 * notifications — a number that makes you feel watched gets ignored.
 */

import { en, type Dict } from "./i18n/en";

/** A task pushed this many times is telling you something. */
export const SLIPPING_AFTER = 3;

export type HabitTally = {
  done: number;
  /** Closed automatically after the actionable window. */
  missed: number;
  /** Cancelled on purpose — a deliberate choice, not a failure. */
  skipped: number;
  /** Still inside the window, undecided. */
  open: number;
};

/**
 * Share of decided days that got done.
 *
 * Skipped days are left out of the denominator deliberately. Cancelling
 * Saturday's reading because you're travelling is a decision, and counting it
 * the same as forgetting would punish exactly the behaviour worth encouraging:
 * making a call instead of letting things lapse. Open days are left out
 * because they haven't happened yet.
 */
export function completionRate(t: HabitTally): number | null {
  const decided = t.done + t.missed;
  return decided === 0 ? null : t.done / decided;
}

export function rateLabel(rate: number | null, dict: Dict = en): string {
  return dict.habits.rate(rate);
}

export function isSlipping(rescheduleCount: number): boolean {
  return Number.isFinite(rescheduleCount) && rescheduleCount >= SLIPPING_AFTER;
}

/** "pushed 3×", or nothing below the threshold that makes it worth saying. */
export function slipLabel(rescheduleCount: number, dict: Dict = en): string | null {
  return rescheduleCount >= 2 ? dict.habits.slip(rescheduleCount) : null;
}
