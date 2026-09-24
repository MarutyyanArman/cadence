"use client";

import * as React from "react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type TrayTask = {
  id: string;
  title: string;
  estMinutes: number | null;
  goalTitle: string | null;
  goalColorSlot: 1 | 2 | 3 | 4 | 5 | 6;
};

/** Mirrors the dot colours in task-row and goal-panel. */
const dotColor: Record<number, string> = {
  1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-3",
  4: "bg-chart-4", 5: "bg-chart-5", 6: "bg-chart-6",
};

/** What a tray item puts on the dataTransfer. Read by week-grid on drop. */
export const DRAG_MIME = "application/x-arc-task";

export type DragPayload = { taskId: string; title: string; minutes: number };

/**
 * Drag source for tasks with no block yet.
 *
 * Native HTML5 drag rather than pointer events, because the source and the drop
 * target are separate components — the browser already carries the payload
 * across that boundary. Inside the grid, move and resize use pointer events
 * instead, where the pixel→minute maths has to be exact.
 */
export function UnscheduledTray({ tasks }: { tasks: TrayTask[] }) {
  const { t } = useT();
  const [dragging, setDragging] = React.useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <aside className="flex flex-col gap-md">
        <h2 className="t-h3 text-fg-secondary">{t.calendar.unscheduled}</h2>
        <p className="rounded-md border border-dashed border-line px-md py-lg text-center text-sm text-fg-secondary">
          {t.calendar.trayEmpty}
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-md">
      <h2 className="t-h3 text-fg-secondary">
        {t.calendar.unscheduled} <span className="text-fg-muted">({tasks.length})</span>
      </h2>
      <p className="text-xs text-fg-muted">{t.calendar.dragHint}</p>

      <ul className="flex flex-col gap-xxs">
        {tasks.map((task) => {
          const minutes = task.estMinutes ?? 30;
          return (
            <li key={task.id}>
              <div
                draggable
                onDragStart={(e) => {
                  const payload: DragPayload = {
                    taskId: task.id, title: task.title, minutes,
                  };
                  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                  // Some browsers refuse a drag with no text/plain fallback.
                  e.dataTransfer.setData("text/plain", task.title);
                  e.dataTransfer.effectAllowed = "copy";
                  setDragging(task.id);
                }}
                onDragEnd={() => setDragging(null)}
                className={cn(
                  "flex cursor-grab items-center gap-sm rounded-md border border-line bg-surface px-md py-sm",
                  "transition-colors hover:bg-hovered active:cursor-grabbing",
                  dragging === task.id && "opacity-40",
                )}
              >
                <span
                  className={cn("size-2 shrink-0 rounded-full", dotColor[task.goalColorSlot])}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
                  {task.title}
                </span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {task.estMinutes === null ? t.fmt.minutes(30) : t.fmt.minutes(task.estMinutes)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
