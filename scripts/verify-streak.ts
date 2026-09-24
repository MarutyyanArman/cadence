/** Pure logic — no database needed. Run: npx tsx scripts/verify-streak.ts */
import {
  computeStreak, rankFor, totalXp, xpForDay,
  DAILY_XP_CAP, LEVEL_THRESHOLDS, MAX_REST_DAYS, REST_DAY_EVERY, STREAK_MINUTES,
  type DayActivity,
} from "../lib/streak";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

/** Days counting back from `today`, newest last. `m` is minutes per day. */
const run = (today: string, m: number[]): DayActivity[] => {
  const base = Date.UTC(
    Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)),
  );
  const p = (n: number) => String(n).padStart(2, "0");
  return m.map((focusMinutes, i) => {
    const d = new Date(base - (m.length - 1 - i) * 86_400_000);
    return {
      day: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
      focusMinutes,
    };
  });
};

const TODAY = "2026-09-15";

/* 1 — the threshold */
{
  t(computeStreak(run(TODAY, [30, 30, 30]), TODAY).current === 3, "three worked days is a 3-day streak");
  t(computeStreak(run(TODAY, [14, 14, 14]), TODAY).current === 0, "under the threshold doesn't count");
  t(computeStreak(run(TODAY, [15]), TODAY).current === 1, "exactly the threshold counts");
  t(STREAK_MINUTES === 15, "the threshold is the documented 15 minutes");
}

/* 2 — today is not lost until it is over */
{
  // Six days worked, nothing logged yet today. The streak must stand.
  const s = computeStreak(run(TODAY, [30, 30, 30, 30, 30, 30, 0]), TODAY);
  t(s.current === 6, `an unearned today leaves the streak standing (got ${s.current})`);
  t(s.todayDone === false, "todayDone is false before the threshold is met");
  t(s.atRisk === true, "...and it is flagged at risk");

  const done = computeStreak(run(TODAY, [30, 30, 30, 30, 30, 30, 30]), TODAY);
  t(done.current === 7 && done.atRisk === false, "working today extends it and clears the flag");
}

/* 3 — an empty record is not a broken streak */
{
  const s = computeStreak([], TODAY);
  t(s.current === 0 && s.atRisk === false, "no history at all is 0 days and not 'at risk'");
  t(computeStreak(run(TODAY, [0, 0, 0]), TODAY).current === 0, "logged-but-empty days are still 0");
}

/* 4 — rest days are banked, then spent */
{
  // Seven straight days banks one credit.
  const week = computeStreak(run(TODAY, [30, 30, 30, 30, 30, 30, 30]), TODAY);
  t(week.restDays === 1, `seven days banks one rest day (got ${week.restDays})`);
  t(REST_DAY_EVERY === 7, "banked every 7 days, as documented");

  // Eight days, then a miss, then today worked: the credit covers the gap.
  const covered = computeStreak(run(TODAY, [30, 30, 30, 30, 30, 30, 30, 30, 0, 30]), TODAY);
  t(covered.current === 10, `a banked rest day covers a missed day (got ${covered.current})`);
  t(covered.restDays === 0, "...and is spent doing it");
}

/* 5 — without a credit, a miss breaks it */
{
  // Three days, a miss, then two: too early to have banked anything.
  const s = computeStreak(run(TODAY, [30, 30, 30, 0, 30, 30]), TODAY);
  t(s.current === 2, `a miss with no credit banked breaks the streak (got ${s.current})`);
  t(s.longest === 3, "the longest run is still remembered");
}

/* 6 — credits are capped, and a long absence still ends it */
{
  // Forty straight days would bank 5 without a cap.
  const long = computeStreak(run(TODAY, Array(40).fill(30)), TODAY);
  t(long.restDays === MAX_REST_DAYS, `credits cap at ${MAX_REST_DAYS} (got ${long.restDays})`);

  // Twenty-eight days (3 credits), then a five-day holiday, then today.
  const holiday = computeStreak(
    run(TODAY, [...Array(28).fill(30), 0, 0, 0, 0, 0, 30]),
    TODAY,
  );
  t(holiday.current === 1, `credits soften a gap but don't survive five days (got ${holiday.current})`);
  t(holiday.longest >= 28, "the record of the long run survives the break");
}

/* 7 — the streak can't be padded from the future */
{
  const withFuture = [
    ...run(TODAY, [30, 30, 30]),
    { day: "2026-09-16", focusMinutes: 300 },
    { day: "2027-01-01", focusMinutes: 300 },
  ];
  t(computeStreak(withFuture, TODAY).current === 3, "days after today are ignored");
}

/* 8 — XP: minutes, capped */
{
  t(xpForDay(45) === 45, "an hour's work is worth its minutes");
  t(xpForDay(600) === DAILY_XP_CAP, `a ten-hour day is capped at ${DAILY_XP_CAP}`);
  t(xpForDay(0) === 0 && xpForDay(-5) === 0 && xpForDay(NaN) === 0, "nothing, negative and NaN are worth 0");
  t(
    totalXp(run(TODAY, [600, 600, 600])) === DAILY_XP_CAP * 3,
    "three marathon days earn exactly three capped days — heroics don't compound",
  );
  t(
    totalXp(run(TODAY, [240, 240, 240])) === totalXp(run(TODAY, [600, 600, 600])),
    "a sustainable four hours scores the same as an unsustainable ten",
  );
}

/* 9 — ranks */
{
  t(rankFor(0).level === 1, "everyone starts at level 1");
  t(rankFor(119).level === 1 && rankFor(120).level === 2, "level 2 lands exactly on its threshold");
  t(rankFor(LEVEL_THRESHOLDS[4]).level === 5, "thresholds and levels line up");
  const r = rankFor(200);
  t(r.level === 2 && r.into === 80 && r.span === 240 && r.nextAt === 360, "progress within a level is reported");

  // Levels must get harder, never easier.
  let widening = true;
  for (let i = 2; i < LEVEL_THRESHOLDS.length; i++) {
    const prev = LEVEL_THRESHOLDS[i - 1] - LEVEL_THRESHOLDS[i - 2];
    const cur = LEVEL_THRESHOLDS[i] - LEVEL_THRESHOLDS[i - 1];
    if (cur <= prev) widening = false;
  }
  t(widening, "each level costs more than the last — early ones come fast, later ones mean something");

  const top = rankFor(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + 10_000);
  t(top.level === LEVEL_THRESHOLDS.length && top.nextAt === null, "the top level has no next");
  t(rankFor(-50).level === 1 && rankFor(NaN).level === 1, "nonsense XP still reports level 1");
}

console.log(fails === 0 ? "\nall streak checks pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
