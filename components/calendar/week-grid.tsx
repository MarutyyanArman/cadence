"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { moveEventTo, scheduleTaskAt, unscheduleEvent } from "@/app/actions";
import { DRAG_MIME, type DragPayload } from "./unscheduled-tray";
import {
  HOUR_PX, MAX_BLOCK_MINUTES, MIN_BLOCK_MINUTES, MINUTES_PER_DAY,
  atMinutes, clampBlockMinutes, isSameDay, minutesToPx,
  packLanes, pxToMinutes, segmentsByDay, snap, weekDays,
} from "@/lib/time";

export type GridEvent = {
  id: string;
  taskId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  goalColorSlot: 1 | 2 | 3 | 4 | 5 | 6;
  done: boolean;
};

const blockColor: Record<number, string> = {
  1: "border-l-chart-1", 2: "border-l-chart-2", 3: "border-l-chart-3",
  4: "border-l-chart-4", 5: "border-l-chart-5", 6: "border-l-chart-6",
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GUTTER = "3.5rem";

type Drag =
  | { kind: "move"; id: string; grabMinutes: number; startMinutes: number; dayIndex: number; minutes: number }
  | { kind: "resize"; id: string; startMinutes: number; dayIndex: number; minutes: number };

/**
 * The week grid: drag a block to move it, drag its bottom edge to resize, drop
 * a tray task onto a column to schedule it.
 *
 * Client-only by construction. The server runs in UTC and the browser does not,
 * so SSR-ing absolute block positions would mismatch on hydration — the parent
 * renders a skeleton until this mounts.
 */
export function WeekGrid({
  weekStart,
  events,
}: {
  weekStart: Date;
  events: GridEvent[];
}) {
  const router = useRouter();
  const { t } = useT();
  const [, startTransition] = React.useTransition();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const days = React.useMemo(() => weekDays(weekStart), [weekStart]);
  const today = new Date();

  // Optimistic geometry: the drag updates this, the server action reconciles.
  const [pending, setPending] = React.useState<Record<string, { startsAt: Date; endsAt: Date }>>({});
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [dropHint, setDropHint] = React.useState<{ dayIndex: number; minutes: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const shown = React.useMemo(
    () => events.map((e) => ({ ...e, ...(pending[e.id] ?? {}) })),
    [events, pending],
  );

  // Open on the working day, not on midnight.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = minutesToPx(7 * 60, HOUR_PX);
  }, []);

  /** Pointer y to minutes from midnight, snapped. */
  const minutesFromPointer = React.useCallback((clientY: number) => {
    const body = bodyRef.current;
    if (!body) return 0;
    const rect = body.getBoundingClientRect();
    return snap(pxToMinutes(clientY - rect.top, HOUR_PX));
  }, []);

  const dayIndexFromPointer = React.useCallback((clientX: number) => {
    const body = bodyRef.current;
    if (!body) return 0;
    const rect = body.getBoundingClientRect();
    const col = rect.width / 7;
    return Math.min(6, Math.max(0, Math.floor((clientX - rect.left) / col)));
  }, []);

  /* ---------------- pointer drag: move and resize ---------------- */

  // Listeners are attached once per gesture (from the pointerdown handler
  // below), not re-subscribed on every pointermove. An earlier version kept
  // `drag` in a useEffect's dependency array, which tore down and re-added
  // window listeners on every intermediate move — under real, rapid pointer
  // input that let stale and fresh listener instances briefly coexist, so a
  // single pointerup could fire more than one of them, submitting the same
  // move several times. This version tracks the live gesture in a plain
  // closure variable instead, so there is exactly one onMove/onUp pair per
  // drag, attached and removed exactly once.
  const endDragRef = React.useRef<(() => void) | null>(null);

  const beginDrag = React.useCallback(
    (initial: Drag) => {
      endDragRef.current?.(); // safety net: clear any prior gesture first
      setDrag(initial);
      let current = initial;
      let ended = false;

      const onMove = (e: PointerEvent) => {
        const minutes = minutesFromPointer(e.clientY);
        const dayIndex = dayIndexFromPointer(e.clientX);
        current =
          current.kind === "move"
            ? {
                ...current,
                startMinutes: snap(
                  Math.max(0, Math.min(MINUTES_PER_DAY - current.minutes, minutes - current.grabMinutes)),
                ),
                dayIndex,
              }
            : { ...current, minutes: clampBlockMinutes(snap(minutes - current.startMinutes)) };
        setDrag(current);
      };

      // Detach immediately (synchronously, inside the native listener) so a
      // second pointerup/pointercancel for the same gesture can never re-run
      // this. The state update and server call are deferred past the current
      // task with setTimeout: dispatching a raw `window` event synchronously
      // interrupts whatever React was doing for the pointermove immediately
      // before it (still committing that setDrag), and finishing this
      // gesture's startTransition/router.refresh inside that same call stack
      // produced "Cannot call startTransition while rendering" and "Cannot
      // update a component (Router) while rendering a different component
      // (WeekGrid)" under real rapid pointer input. Escaping to a fresh task
      // guarantees React has settled before this runs.
      const onEnd = () => {
        if (ended) return;
        ended = true;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        endDragRef.current = null;

        const d = current;
        setTimeout(() => {
          setDrag(null);

          const day = days[d.dayIndex];
          const startsAt = atMinutes(day, d.startMinutes);
          const endsAt = atMinutes(day, d.startMinutes + d.minutes);

          setPending((p) => ({ ...p, [d.id]: { startsAt, endsAt } }));
          startTransition(async () => {
            const res = await moveEventTo(d.id, startsAt.toISOString(), endsAt.toISOString());
            if (!res.ok) {
              setError(res.error ?? t.calendar.couldNotMove);
              setPending((p) => {
                const next = { ...p };
                delete next[d.id];
                return next;
              });
            }
            router.refresh();
          });
        }, 0);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      endDragRef.current = onEnd;
    },
    [days, minutesFromPointer, dayIndexFromPointer, router],
  );

  // Belt-and-suspenders: release any listeners still attached if the grid
  // unmounts mid-drag (e.g. the user navigates away while dragging).
  React.useEffect(() => () => endDragRef.current?.(), []);

  /* ---------------- native drop: schedule from the tray ---------------- */

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;

    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }

    const dayIndex = dayIndexFromPointer(e.clientX);
    const minutes = Math.max(
      0,
      Math.min(MINUTES_PER_DAY - MIN_BLOCK_MINUTES, minutesFromPointer(e.clientY)),
    );
    const startsAt = atMinutes(days[dayIndex], minutes);

    startTransition(async () => {
      const res = await scheduleTaskAt(payload.taskId, startsAt.toISOString(), payload.minutes);
      if (!res.ok) setError(res.error ?? t.calendar.couldNotSchedule);
      router.refresh();
    });
  };

  const onRemove = (id: string) => {
    startTransition(async () => {
      const res = await unscheduleEvent(id);
      if (!res.ok) setError(res.error ?? t.calendar.couldNotRemove);
      router.refresh();
    });
  };

  /* ---------------- geometry ---------------- */

  // Lanes are computed per day, from the segments actually visible in that column.
  const perDay = React.useMemo(() => {
    const segs = shown.flatMap((ev) => segmentsByDay(ev, days).map((s) => ({ ...s, ev })));

    return Array.from({ length: 7 }, (_, i) => {
      const inDay = segs.filter((s) => s.dayIndex === i);
      const packed = packLanes(
        inDay.map((s) => ({
          startsAt: atMinutes(days[i], s.startMinutes),
          endsAt: atMinutes(days[i], s.endMinutes),
          seg: s,
        })),
      );
      return packed.map((p) => ({
        ev: p.item.seg.ev,
        startMinutes: p.item.seg.startMinutes,
        endMinutes: p.item.seg.endMinutes,
        lane: p.lane,
        lanes: p.lanes,
      }));
    });
  }, [shown, days]);

  return (
    <div className="flex min-w-0 flex-col gap-sm">
      {error && (
        <p role="alert" className="rounded-md border border-line bg-surface px-md py-sm text-sm text-status-danger">
          {error}
        </p>
      )}

      {/* Seven columns at phone width would be 45px each — too narrow to drag
          a block into. Instead the grid keeps a usable column width and
          scrolls sideways, with the day headers inside the same scroller so a
          header stays over its column. */}
      <div className="overflow-x-auto">
      <div className="min-w-[560px] sm:min-w-0">
      <div className="grid" style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }}>
        <div aria-hidden />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={d.toISOString()} className="border-b border-line px-xs pb-xs text-center">
              <p className="text-[11px] uppercase tracking-wide text-fg-muted">
                {t.fmt.weekdayShort(d)}
              </p>
              <p className={cn("text-sm", isToday ? "font-medium text-accent-text" : "text-fg-secondary")}>
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto rounded-md border border-line bg-surface">
        <div className="grid" style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }}>
          {/* hour gutter */}
          <div className="relative" style={{ height: minutesToPx(MINUTES_PER_DAY, HOUR_PX) }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-xs -translate-y-1/2 text-[11px] tabular-nums text-fg-muted"
                style={{ top: minutesToPx(h * 60, HOUR_PX) }}
              >
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* the seven day columns share one positioning context for pointer maths */}
          <div
            ref={bodyRef}
            className="relative col-span-7 grid grid-cols-7"
            style={{ height: minutesToPx(MINUTES_PER_DAY, HOUR_PX) }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDropHint({
                dayIndex: dayIndexFromPointer(e.clientX),
                minutes: minutesFromPointer(e.clientY),
              });
            }}
            onDragLeave={() => setDropHint(null)}
            onDrop={onDrop}
          >
            {/* hour lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t border-line/60"
                style={{ top: minutesToPx(h * 60, HOUR_PX) }}
              />
            ))}

            {days.map((d, i) => (
              <div
                key={d.toISOString()}
                className={cn(
                  "relative border-l border-line/60",
                  isSameDay(d, today) && "bg-hovered/30",
                )}
              >
                {/* drop preview */}
                {dropHint?.dayIndex === i && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-xxs rounded-sm border border-dashed border-accent-default bg-accent-subtle/50"
                    style={{
                      top: minutesToPx(dropHint.minutes, HOUR_PX),
                      height: minutesToPx(30, HOUR_PX),
                    }}
                  />
                )}

                {perDay[i].map(({ ev, startMinutes, endMinutes, lane, lanes }) => {
                  const isDragging = drag?.id === ev.id;
                  if (isDragging && drag.dayIndex !== i) return null;

                  const top = isDragging ? drag.startMinutes : startMinutes;
                  const length = isDragging ? drag.minutes : endMinutes - startMinutes;

                  return (
                    <div
                      key={`${ev.id}-${i}`}
                      className={cn(
                        "group absolute rounded-sm border border-line border-l-2 bg-elevated px-xs py-xxs",
                        "cursor-grab overflow-hidden text-left transition-shadow hover:shadow-lg",
                        blockColor[ev.goalColorSlot],
                        ev.done && "opacity-60",
                        isDragging && "cursor-grabbing shadow-lg ring-1 ring-border-focus",
                      )}
                      style={{
                        top: minutesToPx(top, HOUR_PX),
                        height: Math.max(minutesToPx(length, HOUR_PX), 14),
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        beginDrag({
                          kind: "move",
                          id: ev.id,
                          grabMinutes: minutesFromPointer(e.clientY) - startMinutes,
                          startMinutes,
                          dayIndex: i,
                          minutes: endMinutes - startMinutes,
                        });
                      }}
                    >
                      <p className={cn("truncate text-[11px] leading-tight text-fg-primary", ev.done && "line-through")}>
                        {ev.title}
                      </p>
                      {length >= 45 && (
                        <p className="truncate text-[10px] text-fg-muted">{t.fmt.minutes(length)}</p>
                      )}

                      {/* remove — keyboard reachable, unlike the drag handles */}
                      <button
                        type="button"
                        aria-label={t.calendar.unscheduleAria(ev.title)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onRemove(ev.id)}
                        className="absolute right-0 top-0 hidden size-4 items-center justify-center rounded-sm text-[10px] text-fg-muted hover:bg-hovered hover:text-fg-primary group-hover:flex focus-visible:flex [@media(hover:none)]:flex"
                      >
                        ×
                      </button>

                      {/* resize handle */}
                      <div
                        role="presentation"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.button !== 0) return;
                          beginDrag({
                            kind: "resize",
                            id: ev.id,
                            startMinutes,
                            dayIndex: i,
                            minutes: endMinutes - startMinutes,
                          });
                        }}
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <div className="mx-auto h-0.5 w-6 rounded-full bg-border-strong" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      </div>
      </div>

      <p className="text-xs text-fg-muted">
        {t.calendar.gridHint(
          t.fmt.minutes(MIN_BLOCK_MINUTES),
          t.fmt.minutes(MAX_BLOCK_MINUTES),
        )}
      </p>
    </div>
  );
}
