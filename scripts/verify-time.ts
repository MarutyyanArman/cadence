/** Pure logic — no database needed. Run: npx tsx scripts/verify-time.ts */
import {
  startOfWeek, isoDay, parseIsoDay, weekDays, isSameDay,
  minutesSinceMidnight, snap, clampBlockMinutes, atMinutes, durationMinutes,
  minutesToPx, pxToMinutes, packLanes, segmentsByDay,
} from "../lib/time";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const d = (s: string) => {
  const [date, time = "00:00"] = s.split(" ");
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, mo - 1, da, h, mi);
};

/* 1 — Monday-first week start, including from a Sunday */
{
  const wed = d("2026-09-09");            // Wednesday
  const sun = d("2026-09-13");            // Sunday
  t(isoDay(startOfWeek(wed)) === "2026-09-07", "startOfWeek(Wed) → that Monday");
  t(isoDay(startOfWeek(sun)) === "2026-09-07", "startOfWeek(Sun) → the Monday before, not after");
  t(isoDay(startOfWeek(d("2026-09-07"))) === "2026-09-07", "startOfWeek(Mon) is idempotent");
}

/* 2 — isoDay is local, not UTC */
{
  const lateNight = new Date(2026, 8, 13, 23, 30);
  t(isoDay(lateNight) === "2026-09-13", "isoDay uses local date at 23:30 (toISOString would roll over)");
}

/* 3 — parseIsoDay round-trips and rejects nonsense */
{
  t(isoDay(parseIsoDay("2026-09-13")!) === "2026-09-13", "parseIsoDay round-trips");
  t(parseIsoDay("2026-02-31") === null, "parseIsoDay rejects 2026-02-31 instead of rolling over");
  t(parseIsoDay("nope") === null, "parseIsoDay rejects non-dates");
  t(parseIsoDay("2026-09-13")!.getHours() === 0, "parseIsoDay returns local midnight");
}

/* 4 — weekDays spans exactly 7 days, Mon→Sun */
{
  const days = weekDays(startOfWeek(d("2026-09-09")));
  t(days.length === 7, "weekDays returns 7 days");
  t(isoDay(days[0]) === "2026-09-07" && isoDay(days[6]) === "2026-09-13", "weekDays runs Mon→Sun");
  t(days.every((x) => x.getHours() === 0), "every weekDay is local midnight");
}

/* 5 — a week crossing a DST boundary still has 7 columns */
{
  // Most of Europe falls back on 2026-10-25; the US on 2026-11-01.
  for (const anchor of ["2026-10-25", "2026-11-01", "2026-03-29"]) {
    const days = weekDays(startOfWeek(parseIsoDay(anchor)!));
    const distinct = new Set(days.map(isoDay));
    t(distinct.size === 7, `week containing ${anchor} has 7 distinct days across a DST shift`);
  }
}

/* 6 — snapping and clamping */
{
  t(snap(7) === 0 && snap(8) === 15, "snap rounds to the nearest 15");
  t(snap(22) === 15 && snap(23) === 30, "snap rounds up past the midpoint");
  t(snap(-7) === -0 || snap(-7) === 0, "snap handles negatives without drifting a step");
  t(clampBlockMinutes(1) === 15, "a one-minute mis-drag clamps up to 15");
  t(clampBlockMinutes(99999) === 720, "a three-day drag clamps down to 12h");
  t(clampBlockMinutes(90) === 90, "a valid duration is left alone");
}

/* 7 — pixel↔minute is exactly invertible at the snap step */
{
  t(minutesToPx(60, 48) === 48, "one hour is one row height");
  t(minutesToPx(15, 48) === 12, "one snap step is 12px at 48px/hour");
  t(pxToMinutes(minutesToPx(255, 48), 48) === 255, "px↔minutes round-trips");
  t(snap(pxToMinutes(37, 48)) === 45, "a loose pixel offset snaps to a real time");
}

/* 8 — atMinutes / durationMinutes / minutesSinceMidnight agree */
{
  const day = d("2026-09-09");
  const start = atMinutes(day, 9 * 60 + 30);
  t(minutesSinceMidnight(start) === 570, "atMinutes and minutesSinceMidnight are inverses");
  t(durationMinutes(start, atMinutes(day, 11 * 60)) === 90, "durationMinutes counts 09:30→11:00 as 90");
}

/* 9 — lane packing */
{
  const ev = (s: string, e: string) => ({ startsAt: d(s), endsAt: d(e) });

  const none = packLanes([ev("2026-09-09 09:00", "2026-09-09 10:00"), ev("2026-09-09 11:00", "2026-09-09 12:00")]);
  t(none.every((p) => p.lanes === 1 && p.lane === 0), "non-overlapping blocks each take the full width");

  const two = packLanes([ev("2026-09-09 09:00", "2026-09-09 10:30"), ev("2026-09-09 10:00", "2026-09-09 11:00")]);
  t(two.every((p) => p.lanes === 2), "two overlapping blocks both report 2 lanes");
  t(new Set(two.map((p) => p.lane)).size === 2, "two overlapping blocks take different lanes");

  const touching = packLanes([ev("2026-09-09 09:00", "2026-09-09 10:00"), ev("2026-09-09 10:00", "2026-09-09 11:00")]);
  t(touching.every((p) => p.lanes === 1), "touching blocks do not count as overlapping");

  const three = packLanes([
    ev("2026-09-09 09:00", "2026-09-09 12:00"),
    ev("2026-09-09 09:30", "2026-09-09 10:30"),
    ev("2026-09-09 10:00", "2026-09-09 11:00"),
  ]);
  t(three.every((p) => p.lanes === 3), "a 3-way overlap reports 3 lanes for all members");

  // Two separate clusters must not inherit each other's lane count.
  const split = packLanes([
    ev("2026-09-09 09:00", "2026-09-09 10:00"),
    ev("2026-09-09 09:30", "2026-09-09 10:00"),
    ev("2026-09-09 14:00", "2026-09-09 15:00"),
  ]);
  const lone = split.find((p) => minutesSinceMidnight(p.item.startsAt) === 840)!;
  t(lone.lanes === 1, "a later, separate block is full width — clusters don't leak lane counts");

  t(packLanes([]).length === 0, "packLanes tolerates an empty week");
}

/* 10 — a block crossing midnight renders in both day columns */
{
  const days = weekDays(startOfWeek(d("2026-09-09")));
  const overnight = { startsAt: d("2026-09-09 23:00"), endsAt: d("2026-09-10 01:00") };
  const segs = segmentsByDay(overnight, days);
  t(segs.length === 2, "an overnight block splits into two day segments");
  t(segs[0].startMinutes === 1380 && segs[0].endMinutes === 1440, "first segment runs 23:00→midnight");
  t(segs[1].startMinutes === 0 && segs[1].endMinutes === 60, "second segment runs midnight→01:00");

  const outside = segmentsByDay({ startsAt: d("2026-09-20 09:00"), endsAt: d("2026-09-20 10:00") }, days);
  t(outside.length === 0, "a block outside the week produces no segments");
}

/* 11 — isSameDay */
{
  t(isSameDay(d("2026-09-09 00:00"), d("2026-09-09 23:59")), "isSameDay ignores the time");
  t(!isSameDay(d("2026-09-09 23:59"), d("2026-09-10 00:00")), "isSameDay separates adjacent days");
}

console.log(fails === 0 ? "\nall time helpers pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
