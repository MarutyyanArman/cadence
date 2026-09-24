/**
 * Three small objectives a day, drawn from a pool and fitted to your actual list.
 *
 * Quests answer two failures a task list has on its own: staring at it without
 * knowing where to start, and the quiet one, where something unpleasant sits
 * untouched for three weeks because nothing ever points at it. The stale-task
 * quest is the one that earns its keep — it is the app noticing what you are
 * avoiding and making a game of it rather than letting it rot at the bottom.
 *
 * Selection is deterministic per day: the same date always draws the same three
 * from the same eligible pool, so a refresh can't reroll them. Progress is
 * derived from the record, never written down, so it self-corrects.
 */

import { en, type Dict } from "./i18n/en";

export const QUEST_KINDS = [
  "focus_block",
  "focus_minutes",
  "finish_count",
  "estimate_accuracy",
  "stale_task",
] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

/** How long a task must have been open to count as something you're avoiding. */
export const STALE_AFTER_DAYS = 7;

/** How close an estimate has to land to count as "on target". */
export const ACCURATE_WITHIN = 0.2;

export const QUEST_TARGETS: Record<QuestKind, number> = {
  focus_block: 50,
  focus_minutes: 90,
  finish_count: 3,
  estimate_accuracy: 2,
  stale_task: 1,
};

export type QuestCopy = { title: string; hint: string; unit: string };

/**
 * The quest in words. Every number the copy needs is passed to the dictionary
 * rather than imported by it — that is what keeps lib/i18n a leaf of the
 * import graph instead of a cycle with this file.
 */
export function questCopy(kind: QuestKind, target: number, dict: Dict = en): QuestCopy {
  switch (kind) {
    case "focus_block":
      return dict.quests.focusBlock(target);
    case "focus_minutes":
      return dict.quests.focusMinutes(target);
    case "finish_count":
      return dict.quests.finishCount(target);
    case "estimate_accuracy":
      return dict.quests.estimateAccuracy(target, Math.round(ACCURATE_WITHIN * 100));
    case "stale_task":
      return dict.quests.staleTask(target, STALE_AFTER_DAYS);
  }
}

/* ---------------- what today looks like ---------------- */

/** Everything needed to score today's quests, all derived from the record. */
export type QuestFacts = {
  focusMinutesToday: number;
  tasksCompletedToday: number;
  /** Longest single uninterrupted focus session today, in minutes. */
  longestCleanBlockMinutes: number;
  /** Completed today, having been opened more than STALE_AFTER_DAYS ago. */
  staleTasksClearedToday: number;
  /** Completed today with an estimate that landed inside ACCURATE_WITHIN. */
  accurateEstimatesToday: number;
};

export type QuestProgress = { current: number; target: number; done: boolean };

export function evaluateQuest(
  kind: QuestKind,
  target: number,
  facts: QuestFacts,
): QuestProgress {
  const current =
    kind === "focus_block"
      ? facts.longestCleanBlockMinutes
      : kind === "focus_minutes"
        ? facts.focusMinutesToday
        : kind === "finish_count"
          ? facts.tasksCompletedToday
          : kind === "estimate_accuracy"
            ? facts.accurateEstimatesToday
            : facts.staleTasksClearedToday;

  const safe = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;
  return { current: safe, target, done: safe >= target };
}

/* ---------------- choosing the day's three ---------------- */

/** What the list can actually support today. */
export type QuestEligibility = {
  openTaskCount: number;
  openEstimatedCount: number;
  hasStaleOpenTask: boolean;
};

/**
 * Only quests the day could plausibly satisfy.
 *
 * Issuing "finish 3 tasks" to someone with one task open is the fastest way to
 * make the whole mechanic feel like noise.
 */
export function eligibleKinds(e: QuestEligibility): QuestKind[] {
  return QUEST_KINDS.filter((kind) => {
    switch (kind) {
      case "finish_count":
        return e.openTaskCount >= QUEST_TARGETS.finish_count;
      case "estimate_accuracy":
        return e.openEstimatedCount >= QUEST_TARGETS.estimate_accuracy;
      case "stale_task":
        return e.hasStaleOpenTask;
      default:
        return true; // focus quests need nothing but a timer
    }
  });
}

/** FNV-1a. Small, stable, and enough to seed a day's draw. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The day's draw. Deterministic in `seed`, so refreshing can't reroll it —
 * a quest you can reroll is a quest you'll reroll until it's trivial.
 *
 * The caller passes the day, and now also who is asking: with the day alone,
 * everyone on a shared instance would be handed the same three every morning,
 * which turns a personal nudge into a broadcast.
 */
export function pickQuests(seed: string, eligible: QuestKind[], count = 3): QuestKind[] {
  const pool = [...eligible];
  const rand = mulberry32(hashString(seed));
  // Fisher–Yates, seeded.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
