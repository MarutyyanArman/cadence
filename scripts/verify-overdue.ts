/** Pure logic — no database needed. Run: npx tsx scripts/verify-overdue.ts */
import {
  daysBetween, lastActionableDay, occurrencesAfter, MISSED_AFTER_DAYS,
} from "../lib/recurrence";
import {
  completionRate, isSlipping, rateLabel, slipLabel, SLIPPING_AFTER,
} from "../lib/habits";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/* 1 — filling a gap, daily */
{
  // Last scheduled Monday 14th, today Thursday 17th.
  const gap = occurrencesAfter("daily", "2026-09-14", "2026-09-17");
  t(JSON.stringify(gap) === JSON.stringify(["2026-09-15", "2026-09-16", "2026-09-17"]),
    `a three-day gap owes exactly three occurrences, ending today (got ${gap.join(", ")})`);
  t(occurrencesAfter("daily", "2026-09-17", "2026-09-17").length === 0,
    "nothing is owed when the last one is already today");
  t(occurrencesAfter("daily", "2026-09-18", "2026-09-17").length === 0,
    "a chain already ahead of today owes nothing");
}

/* 2 — filling a gap, weekdays and weekly */
{
  // Friday 18th to Tuesday 22nd.
  const wd = occurrencesAfter("weekdays", "2026-09-18", "2026-09-22");
  t(JSON.stringify(wd) === JSON.stringify(["2026-09-21", "2026-09-22"]),
    `weekdays skips the weekend inside a gap (got ${wd.join(", ")})`);
  t(wd.every((d) => dow(d) !== 0 && dow(d) !== 6), "...and never lands on one");

  const wk = occurrencesAfter("weekly", "2026-08-27", "2026-09-17");
  t(wk.length === 3 && wk.every((d) => dow(d) === dow("2026-08-27")),
    `a three-week gap owes three weekly occurrences on the same weekday (got ${wk.join(", ")})`);
}

/* 3 — the cap holds */
{
  const years = occurrencesAfter("daily", "2020-01-01", "2026-09-17");
  t(years.length === 366, `an abandoned-for-years habit is capped at 366 rows (got ${years.length})`);
  t(occurrencesAfter("daily", "2020-01-01", "2026-09-17", 10).length === 10, "a custom cap is respected");
}

/* 4 — malformed input yields nothing, never a guess */
{
  t(occurrencesAfter("daily", "nope", "2026-09-17").length === 0, "a bad start date yields nothing");
  t(occurrencesAfter("daily", "2026-09-14", "2026-02-31").length === 0, "an impossible end date yields nothing");
}

/* 5 — the actionable window */
{
  t(MISSED_AFTER_DAYS === 2, "the window is the agreed 2 days");
  t(lastActionableDay("2026-09-14") === "2026-09-16", "due Monday stays actionable through Wednesday");
  t(lastActionableDay("2026-09-30") === "2026-10-02", "the window crosses a month end");
  t(lastActionableDay("bad") === null, "a bad date has no window");
}

/* 6 — days between */
{
  t(daysBetween("2026-09-14", "2026-09-17") === 3, "Monday to Thursday is 3 days");
  t(daysBetween("2026-09-17", "2026-09-14") === -3, "reversed is negative");
  t(daysBetween("2026-12-31", "2027-01-01") === 1, "a year boundary is one day");
}

/* 7 — completion rate */
{
  t(completionRate({ done: 0, missed: 0, skipped: 0, open: 0 }) === null, "no decided days is no rate, not zero");
  t(completionRate({ done: 23, missed: 7, skipped: 0, open: 0 }) === 23 / 30, "23 done of 30 decided is 77%");
  t(
    completionRate({ done: 20, missed: 5, skipped: 5, open: 0 }) === 20 / 25,
    "a cancelled day is a decision, not a miss — it stays out of the denominator",
  );
  t(
    completionRate({ done: 20, missed: 5, skipped: 0, open: 2 }) === 20 / 25,
    "open days haven't happened yet and don't count either way",
  );
  t(completionRate({ done: 0, missed: 0, skipped: 9, open: 0 }) === null,
    "a habit only ever skipped has no rate rather than a misleading 0%");
}

/* 8 — the words */
{
  t(rateLabel(null) === "Nothing decided yet", "no rate reads as nothing decided");
  t(rateLabel(1) === "Near every time" && rateLabel(0.75) === "Most days", "high rates read as such");
  t(
    ![0, 0.1, 0.3, 0.5, 0.8, 1].some((r) => /fail|should|bad|poor|lazy/i.test(rateLabel(r))),
    "no rate label scolds, however low",
  );
}

/* 9 — slipping */
{
  t(!isSlipping(2) && isSlipping(SLIPPING_AFTER), `slipping starts at ${SLIPPING_AFTER} reschedules`);
  t(slipLabel(0) === null && slipLabel(1) === null, "one reschedule isn't worth mentioning");
  t(slipLabel(2) === "pushed 2×" && slipLabel(5) === "pushed 5×", "from two on it is shown plainly");
  t(!isSlipping(NaN), "nonsense counts are not slipping");
}

console.log(fails === 0 ? "\nall overdue checks pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
