"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { useT } from "@/components/i18n-provider";
import {
  dropTask, removeTask, rescheduleTask, toggleTaskDone, toggleTimer,
} from "@/app/actions";

/**
 * Optimistic wrapper around TaskRow. Checking a box or starting a timer feels
 * instant; the server action reconciles on the next render.
 */
export function TaskList({
  tasks,
  mode = "normal",
  today,
}: {
  tasks: TaskRowData[];
  /** "overdue" rows ask for a decision: today, reschedule or cancel. */
  mode?: "normal" | "overdue";
  today?: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [optimistic, setOptimistic] = React.useOptimistic(
    tasks,
    (state, patch: { id: string; done?: boolean; running?: boolean; deleted?: boolean }) => {
      // A delete leaves the list rather than changing in place, so it is a
      // filter, not a map — the row must be gone before the round-trip.
      if (patch.deleted) return state.filter((t) => t.id !== patch.id);
      return state.map((t) => {
        if (t.id !== patch.id && patch.running !== true) return t;
        // only one timer can run, so starting one clears every other
        if (patch.running === true) {
          return t.id === patch.id
            ? { ...t, running: true, status: t.status === "todo" ? ("doing" as const) : t.status }
            : { ...t, running: false };
        }
        if (patch.done !== undefined) {
          return { ...t, status: patch.done ? ("done" as const) : ("todo" as const), running: false };
        }
        return { ...t, running: false };
      });
    },
  );

  if (optimistic.length === 0) {
    // An emptied overdue list simply goes away; its section disappears on refresh.
    if (mode === "overdue") return null;
    return (
      <p className="rounded-md border border-dashed border-line px-md py-xl text-center text-sm text-fg-secondary">
        {t.tasks.empty}
      </p>
    );
  }

  const overdue = mode === "overdue" && today !== undefined;

  return (
    <div className="flex flex-col gap-xxs">
      {error && (
        <p role="alert" className="px-md text-xs text-danger">{error}</p>
      )}
      {optimistic.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          running={task.running}
          onToggleDone={(id) =>
            startTransition(async () => {
              const done = task.status !== "done";
              setOptimistic({ id, done });
              await toggleTaskDone(id, done);
              router.refresh();
            })
          }
          onToggleTimer={(id) =>
            startTransition(async () => {
              const wasRunning = !!task.running;
              setOptimistic({ id, running: !wasRunning });
              await toggleTimer(id, wasRunning);
              router.refresh();
            })
          }
          onDelete={(id) =>
            startTransition(async () => {
              setOptimistic({ id, deleted: true });
              await removeTask(id);
              router.refresh();
            })
          }
          today={overdue ? today : undefined}
          onReschedule={
            overdue
              ? (id, day) =>
                  startTransition(async () => {
                    setError(null);
                    // It leaves the overdue list either way: to today's, or a later day's.
                    setOptimistic({ id, deleted: true });
                    const res = await rescheduleTask(id, day);
                    if (!res.ok) setError(res.error);
                    router.refresh();
                  })
              : undefined
          }
          onDrop={
            overdue
              ? (id) =>
                  startTransition(async () => {
                    setError(null);
                    setOptimistic({ id, deleted: true });
                    const res = await dropTask(id);
                    if (!res.ok) setError(res.error);
                    router.refresh();
                  })
              : undefined
          }
        />
      ))}
    </div>
  );
}
