/** Pure logic — no database needed. Run: npx tsx scripts/verify-recurrence.ts */
import { isRecurrence, nextDueDate, recurrenceLabel, RECURRENCES } from "../lib/recurrence";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

/* 1 — the vocabulary is closed */
{
  t(RECURRENCES.length === 3, "three rules, not an RRULE grammar");
  t(isRecurrence("daily") && isRecurrence("weekdays") && isRecurrence("weekly"), "all three validate");
  t(!isRecurrence("FREQ=DAILY"), "an RRULE string is not accepted");
  t(!isRecurrence("") && !isRecurrence(null) && !isRecurrence(undefined), "empty/null are not rules");
  t(RECURRENCES.every((r) => recurrenceLabel(r).length > 0), "every rule has a label");
}

/* 2 — daily */
{
  // 2026-09-15 is a Tuesday.
  t(nextDueDate("daily", "2026-09-15", "2026-09-15") === "2026-09-16", "daily: due today → tomorrow");
  t(nextDueDate("daily", "2026-09-30", "2026-09-30") === "2026-10-01", "daily rolls over a month end");
  t(nextDueDate("daily", "2026-12-31", "2026-12-31") === "2027-01-01", "daily rolls over a year end");
  t(nextDueDate("daily", "2028-02-28", "2028-02-28") === "2028-02-29", "daily hits a real leap day");
  t(nextDueDate("daily", "2026-02-28", "2026-02-28") === "2026-03-01", "daily skips a leap day that isn't");
}

/* 3 — the late-completion case, which is the whole point */
{
  // Tuesday's reading, ticked off on Wednesday morning.
  t(
    nextDueDate("daily", "2026-09-15", "2026-09-16") === "2026-09-16",
    "finishing a day late still leaves today's occurrence due today, not tomorrow",
  );
  // Three weeks away, then tick off the stale one.
  t(
    nextDueDate("daily", "2026-08-25", "2026-09-15") === "2026-09-15",
    "a long absence yields one occurrence due today, not a backlog",
  );
  t(
    nextDueDate("daily", "2020-01-01", "2026-09-15") === "2026-09-15",
    "a six-year-old task still lands on today rather than looping away",
  );
}

/* 4 — weekdays */
{
  // 2026-09-18 is a Friday, 2026-09-21 the Monday after.
  t(nextDueDate("weekdays", "2026-09-18", "2026-09-18") === "2026-09-21", "weekdays: Friday → Monday");
  t(nextDueDate("weekdays", "2026-09-15", "2026-09-15") === "2026-09-16", "weekdays: midweek → next day");
  t(nextDueDate("weekdays", "2026-09-19", "2026-09-19") === "2026-09-21", "weekdays: Saturday → Monday");
  t(nextDueDate("weekdays", "2026-09-20", "2026-09-20") === "2026-09-21", "weekdays: Sunday → Monday");
  // Rolling a weekdays task forward must never land on a weekend.
  const landed = ["2026-09-15", "2026-08-01", "2026-07-04"].map((from) =>
    nextDueDate("weekdays", from, "2026-09-19"),
  );
  t(
    landed.every((d) => {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay();
      return day !== 0 && day !== 6;
    }),
    "weekdays never lands on a Saturday or Sunday, however far it rolls",
  );
}

/* 5 — weekly keeps its weekday */
{
  const start = "2026-09-15"; // Tuesday
  let cur: string | null = start;
  const weekdays = new Set<number>();
  for (let i = 0; i < 10; i++) {
    cur = nextDueDate("weekly", cur, start);
    weekdays.add(new Date(`${cur}T00:00:00Z`).getUTCDay());
  }
  t(weekdays.size === 1 && weekdays.has(2), "weekly stays on the same weekday for ten occurrences");
  t(nextDueDate("weekly", "2026-09-15", "2026-09-15") === "2026-09-22", "weekly: +7 days");
  t(
    nextDueDate("weekly", "2026-08-04", "2026-09-15") === "2026-09-15",
    "a stale weekly lands on today when today is that weekday",
  );
}

/* 6 — no due date anchors to today */
{
  t(nextDueDate("daily", null, "2026-09-15") === "2026-09-16", "no due date: daily comes back tomorrow");
  t(nextDueDate("weekly", null, "2026-09-15") === "2026-09-22", "no due date: weekly comes back in a week");
  t(nextDueDate("weekdays", null, "2026-09-18") === "2026-09-21", "no due date: weekdays skips the weekend");
}

/* 7 — the result is always strictly forward, and never in the past */
{
  const today = "2026-09-15";
  let clean = true;
  for (const rule of RECURRENCES) {
    for (const prev of ["2026-09-15", "2026-09-14", "2025-01-01", "2026-12-25", null]) {
      const next = nextDueDate(rule, prev, today);
      if (next === null) { clean = false; break; }
      if (next < today) { clean = false; break; }
      if (prev !== null && next <= prev) { clean = false; break; }
    }
  }
  t(clean, "every rule/anchor pair moves strictly forward and never returns a past date");
}

/* 8 — malformed input is rejected rather than guessed at */
{
  t(nextDueDate("daily", "2026-02-31", "2026-09-15") === null, "an impossible date is rejected, not rolled");
  t(nextDueDate("daily", "nope", "2026-09-15") === null, "a non-date anchor is rejected");
  t(nextDueDate("daily", "2026-09-15", "nope") === null, "a non-date today is rejected");
}

console.log(fails === 0 ? "\nall recurrence checks pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
