/**
 * Week maths, 15-minute snapping, pixel↔minute conversion and lane packing.
 *
 * Everything here is pure and local-time based. The grid is client-only (the
 * server runs in UTC and the browser does not), so these run in the browser
 * where `Date` already means local time.
 */

export const SNAP_MINUTES = 15;
export const MIN_BLOCK_MINUTES = 15;
export const MAX_BLOCK_MINUTES = 12 * 60;
export const MINUTES_PER_DAY = 24 * 60;

/** Default row height. One hour = 48px, so one snap step = 12px. */
export const HOUR_PX = 48;

/* ---------------- week maths ---------------- */

/** Monday-first start of the week containing `d`, at local midnight. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay() is 0=Sun; shift so Monday is 0.
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  return out;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** `YYYY-MM-DD` in local time — never `toISOString()`, which shifts to UTC. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parse `YYYY-MM-DD` as local midnight. `new Date(s)` would parse it as UTC. */
export function parseIsoDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, da);
  // Rejects 2025-02-31 and friends, which Date would silently roll over.
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}

/** The seven local-midnight dates of the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ---------------- minutes ---------------- */

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Round to the nearest 15 minutes. */
export function snap(minutes: number, step: number = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

export function clampBlockMinutes(minutes: number): number {
  return Math.min(MAX_BLOCK_MINUTES, Math.max(MIN_BLOCK_MINUTES, minutes));
}

/** Local midnight of `day` plus `minutes`, as a Date. */
export function atMinutes(day: Date, minutes: number): Date {
  const out = startOfDay(day);
  out.setMinutes(minutes);
  return out;
}

export function durationMinutes(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
}

/* ---------------- pixels ---------------- */

export function minutesToPx(minutes: number, hourPx: number = HOUR_PX): number {
  return (minutes / 60) * hourPx;
}

export function pxToMinutes(px: number, hourPx: number = HOUR_PX): number {
  return (px / hourPx) * 60;
}

/* ---------------- lane packing ---------------- */

export type Span = { startsAt: Date; endsAt: Date };
export type Placed<T> = { item: T; lane: number; lanes: number };

/**
 * Side-by-side placement for overlapping blocks.
 *
 * Events are grouped into clusters of transitively-overlapping spans; every
 * member of a cluster reports the same `lanes` total so they render at equal
 * width. Within a cluster each event takes the lowest lane free at its start —
 * touching blocks (one ends exactly where the next begins) do not overlap and
 * so share a lane.
 */
export function packLanes<T extends Span>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      b.endsAt.getTime() - a.endsAt.getTime(),
  );

  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const p of cluster) out.push({ ...p, lanes });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    const start = item.startsAt.getTime();
    const end = item.endsAt.getTime();

    // A gap with the whole cluster closes it — lane counts restart.
    if (start >= clusterEnd && cluster.length > 0) flush();

    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    cluster.push({ item, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();

  return out;
}

/** Split a span into per-day segments, so a block crossing midnight renders in both columns. */
export function segmentsByDay<T extends Span>(item: T, days: Date[]): Array<{
  item: T;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}> {
  const segs: Array<{ item: T; dayIndex: number; startMinutes: number; endMinutes: number }> = [];
  days.forEach((day, dayIndex) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + MINUTES_PER_DAY * 60000;
    const s = Math.max(item.startsAt.getTime(), dayStart);
    const e = Math.min(item.endsAt.getTime(), dayEnd);
    if (e <= s) return;
    segs.push({
      item,
      dayIndex,
      startMinutes: Math.round((s - dayStart) / 60000),
      endMinutes: Math.round((e - dayStart) / 60000),
    });
  });
  return segs;
}
