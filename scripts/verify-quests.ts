/** Pure logic — no database needed. Run: npx tsx scripts/verify-quests.ts */
import {
  eligibleKinds, evaluateQuest, pickQuests, questCopy,
  ACCURATE_WITHIN, QUEST_KINDS, QUEST_TARGETS, STALE_AFTER_DAYS,
  type QuestEligibility, type QuestFacts,
} from "../lib/quests";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const facts = (over: Partial<QuestFacts> = {}): QuestFacts => ({
  focusMinutesToday: 0,
  tasksCompletedToday: 0,
  longestCleanBlockMinutes: 0,
  staleTasksClearedToday: 0,
  accurateEstimatesToday: 0,
  ...over,
});

const elig = (over: Partial<QuestEligibility> = {}): QuestEligibility => ({
  openTaskCount: 10,
  openEstimatedCount: 5,
  hasStaleOpenTask: true,
  ...over,
});

/* 1 — every kind is scored off the right fact */
{
  t(evaluateQuest("focus_minutes", 90, facts({ focusMinutesToday: 90 })).done, "focus minutes completes at target");
  t(!evaluateQuest("focus_minutes", 90, facts({ focusMinutesToday: 89 })).done, "...and not one minute short");
  t(evaluateQuest("focus_block", 50, facts({ longestCleanBlockMinutes: 52 })).done, "an unbroken block completes");
  t(
    !evaluateQuest("focus_block", 50, facts({ focusMinutesToday: 300, longestCleanBlockMinutes: 20 })).done,
    "five hours of broken work does not satisfy an unbroken block",
  );
  t(evaluateQuest("finish_count", 3, facts({ tasksCompletedToday: 3 })).done, "finish count completes");
  t(evaluateQuest("estimate_accuracy", 2, facts({ accurateEstimatesToday: 2 })).done, "accuracy completes");
  t(evaluateQuest("stale_task", 1, facts({ staleTasksClearedToday: 1 })).done, "clearing a stale task completes");
}

/* 2 — progress is reported, not just done/not-done */
{
  const p = evaluateQuest("focus_minutes", 90, facts({ focusMinutesToday: 34 }));
  t(p.current === 34 && p.target === 90 && !p.done, "partial progress is visible");
  const over = evaluateQuest("finish_count", 3, facts({ tasksCompletedToday: 9 }));
  t(over.current === 9 && over.done, "overshooting still reads as done");
  t(evaluateQuest("focus_minutes", 90, facts({ focusMinutesToday: -5 })).current === 0, "nonsense clamps to 0");
}

/* 3 — quests are only issued if the day could satisfy them */
{
  t(!eligibleKinds(elig({ openTaskCount: 1 })).includes("finish_count"),
    "'finish 3' is not issued to someone with one task open");
  t(eligibleKinds(elig({ openTaskCount: 3 })).includes("finish_count"), "...and is at exactly three");
  t(!eligibleKinds(elig({ openEstimatedCount: 1 })).includes("estimate_accuracy"),
    "an accuracy quest needs enough estimated tasks to be possible");
  t(!eligibleKinds(elig({ hasStaleOpenTask: false })).includes("stale_task"),
    "no stale task means no stale-task quest");
  t(eligibleKinds(elig({ hasStaleOpenTask: true })).includes("stale_task"), "...and it appears when there is one");

  const bare = eligibleKinds({ openTaskCount: 0, openEstimatedCount: 0, hasStaleOpenTask: false });
  t(bare.length === 2 && bare.every((k) => k.startsWith("focus")),
    "an empty list still leaves the two focus quests, which need nothing but a timer");
}

/* 4 — the draw is stable for a day and different across days */
{
  const pool = QUEST_KINDS.slice();
  const a = pickQuests("2026-09-15", [...pool]);
  const b = pickQuests("2026-09-15", [...pool]);
  t(JSON.stringify(a) === JSON.stringify(b), "the same day always draws the same three — a refresh can't reroll");

  const days = ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
  const draws = days.map((d) => JSON.stringify(pickQuests(d, [...pool])));
  t(new Set(draws).size > 1, "different days draw differently");
  t(a.length === 3, "three quests a day");
  t(new Set(a).size === 3, "...and never the same quest twice");
}

/* 5 — a thin pool degrades gracefully rather than repeating */
{
  const two = pickQuests("2026-09-15", ["focus_block", "focus_minutes"]);
  t(two.length === 2 && new Set(two).size === 2, "a two-quest pool yields two, not three with a duplicate");
  t(pickQuests("2026-09-15", []).length === 0, "an empty pool yields nothing rather than throwing");
}

/* 6 — every quest can be described to a person */
{
  const ok = QUEST_KINDS.every((k) => {
    const c = questCopy(k, QUEST_TARGETS[k]);
    return c.title.length > 0 && c.hint.length > 0 && c.unit.length > 0;
  });
  t(ok, "every kind has a title, a hint and a unit");
  t(
    questCopy("estimate_accuracy", 2).title.includes(`${Math.round(ACCURATE_WITHIN * 100)}%`),
    "the accuracy quest states the tolerance it means",
  );
  t(
    questCopy("stale_task", 1).hint.includes(String(STALE_AFTER_DAYS)),
    "the stale quest says how old counts as stale",
  );
  t(
    QUEST_KINDS.every((k) => !/should|must|fail/i.test(questCopy(k, QUEST_TARGETS[k]).title)),
    "no quest title scolds",
  );
}

console.log(fails === 0 ? "\nall quest checks pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
