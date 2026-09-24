/** Pure logic — no database needed. Run: npx tsx scripts/verify-notifications.ts */
import {
  dueNotifications, NOTIFICATION_KINDS, NOTIFICATION_LABELS,
  MIN_SESSIONS_FOR_BEST_HOUR, STREAK_RISK_HOUR,
  type NotificationContext,
} from "../lib/notifications";
import type { StreakState } from "../lib/streak";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const streak = (over: Partial<StreakState> = {}): StreakState => ({
  current: 12, restDays: 1, todayDone: false, atRisk: true, longest: 12, ...over,
});

const ctx = (over: Partial<NotificationContext> = {}): NotificationContext => ({
  hour: 21,
  today: "2026-09-15",
  streak: streak(),
  focusTodayMinutes: 0,
  timerRunning: false,
  bestHour: { hour: 10, sessions: 6, averageMinutes: 48 },
  nextTaskTitle: "Read a chapter",
  justCompleted: null,
  ...over,
});

const kinds = (c: NotificationContext) => dueNotifications(c).map((n) => n.kind);

/* 1 — streak at risk */
{
  const n = dueNotifications(ctx()).find((x) => x.kind === "streak_risk")!;
  t(n !== undefined, "an evening with a live streak and nothing logged fires the streak notice");
  t(n.title.includes("12 days") && n.title.includes("still intact"), "it leads with what is still standing");
  t(n.body.includes("15m"), "it names exactly what it costs to keep");
  t(n.body.includes("rest day"), "it offers the banked rest day as a way out");
  t(n.dedupeKey === "2026-09-15", "it is keyed to the day, so it can only be said once");
}

/* 2 — the cases where it must stay quiet */
{
  t(!kinds(ctx({ hour: 14 })).includes("streak_risk"), "mid-afternoon is too early to call a day at risk");
  t(!kinds(ctx({ streak: streak({ todayDone: true, atRisk: false }) })).includes("streak_risk"),
    "a day already earned is not at risk");
  t(!kinds(ctx({ streak: streak({ current: 0, atRisk: false }) })).includes("streak_risk"),
    "no streak means nothing at stake — a new user is not nagged");
  t(!kinds(ctx({ timerRunning: true })).includes("streak_risk"),
    "a timer already running means they are working; say nothing");
  t(kinds(ctx({ hour: STREAK_RISK_HOUR })).includes("streak_risk"), "it starts exactly at the documented hour");
}

/* 3 — no rest days changes the wording, not the message */
{
  const n = dueNotifications(ctx({ streak: streak({ restDays: 0 }) })).find((x) => x.kind === "streak_risk")!;
  t(!n.body.includes("rest day"), "with nothing banked it doesn't mention rest days");
  t(n.body.includes("15m"), "...but still says what keeps the streak");
}

/* 4 — best hour */
{
  const c = ctx({ hour: 10, streak: streak({ current: 0, atRisk: false }) });
  const n = dueNotifications(c).find((x) => x.kind === "best_hour")!;
  t(n !== undefined, "arriving at your best hour with nothing logged fires the nudge");
  t(n.body.includes("10:00") && n.body.includes("48m"), "it earns the interruption with a real figure");
  t(n.body.includes("Read a chapter"), "it points at one specific open task");
  t(!n.body.toLowerCase().includes("should"), "it does not tell anyone what they should do");
}

/* 5 — best hour stays quiet when it would be noise */
{
  const base = { hour: 10, streak: streak({ current: 0, atRisk: false }) };
  t(!kinds(ctx({ ...base, hour: 15 })).includes("best_hour"), "it only fires in that hour");
  t(!kinds(ctx({ ...base, focusTodayMinutes: 40 })).includes("best_hour"),
    "already worked today means the nudge has no purpose");
  t(!kinds(ctx({ ...base, timerRunning: true })).includes("best_hour"), "a running timer silences it");
  t(!kinds(ctx({ ...base, bestHour: null })).includes("best_hour"), "no history, no claim about your best hour");
  t(
    !kinds(ctx({ ...base, bestHour: { hour: 10, sessions: 2, averageMinutes: 48 } })).includes("best_hour"),
    `two sessions is not evidence of a pattern (needs ${MIN_SESSIONS_FOR_BEST_HOUR})`,
  );
  const noTask = dueNotifications(ctx({ ...base, nextTaskTitle: null })).find((x) => x.kind === "best_hour")!;
  t(noTask !== undefined && !noTask.body.includes("“"), "with nothing open it simply omits the pointer");
}

/* 6 — calibration, on the result */
{
  const good = dueNotifications(ctx({
    justCompleted: { taskId: "t1", title: "Read a chapter", estimateMinutes: 45, actualMinutes: 47, calibrationNow: 81 },
  })).find((x) => x.kind === "calibration")!;
  t(good.title.startsWith("Called it"), "a close estimate is celebrated");
  t(good.title.includes("47m") && good.title.includes("45m"), "both numbers are in the headline");
  t(good.body.includes("81"), "the new score is the body");
  t(good.dedupeKey === "t1", "keyed to the task, so a task is only reported once");

  const bad = dueNotifications(ctx({
    justCompleted: { taskId: "t2", title: "Fix the bug", estimateMinutes: 60, actualMinutes: 150, calibrationNow: 44 },
  })).find((x) => x.kind === "calibration")!;
  t(!bad.title.startsWith("Called it"), "a badly missed estimate is not congratulated");
  t(bad.title.includes("2h 30m") && bad.title.includes("1h 0m"), "it reports the miss plainly");
  t(
    !/only|should|again|failed|missed/i.test(bad.title + bad.body),
    "and does not scold: no 'only', 'should', 'failed' or 'again'",
  );
}

/* 7 — nothing at all is a perfectly good answer */
{
  const quiet = ctx({
    hour: 14,
    streak: streak({ todayDone: true, atRisk: false }),
    focusTodayMinutes: 90,
  });
  t(dueNotifications(quiet).length === 0, "a normal working afternoon produces no notifications");
}

/* 8 — several can be due at once, in priority order */
{
  const both = ctx({
    justCompleted: { taskId: "t3", title: "Thing", estimateMinutes: 30, actualMinutes: 31, calibrationNow: 90 },
  });
  const k = kinds(both);
  t(k.length === 2 && k[0] === "calibration", "the result of what you just did comes first");
}

/* 9 — every kind is labelled for the settings UI */
{
  t(NOTIFICATION_KINDS.length === 3, "three kinds, as proposed");
  t(NOTIFICATION_KINDS.every((k) => (NOTIFICATION_LABELS[k] ?? "").length > 0), "every kind has a human label");
}

console.log(fails === 0 ? "\nall notification checks pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
