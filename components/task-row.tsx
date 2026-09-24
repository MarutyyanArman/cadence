"use client";

import * as React from "react";
import { Check, Pause, Play, Repeat, Trash2 } from "lucide-react";
import { recurrenceLabel, type Recurrence } from "@/lib/recurrence";
import { slipLabel } from "@/lib/habits";
import { useT } from "@/components/i18n-provider";
import type { Dict } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type TaskRowData = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done" | "cancelled" | "missed";
  priority: 1 | 2 | 3 | 4;
  estMinutes: number | null;
  actualMinutes: number;
  dueAt: Date | null;
  goalTitle: string | null;
  goalColorSlot: 1 | 2 | 3 | 4 | 5 | 6;
  /** Set when a time session is open against this task. */
  running?: boolean;
  /** Non-null when finishing this task writes the next occurrence. */
  recurrence?: Recurrence | null;
  /** How many times it has been moved. */
  rescheduleCount?: number;
  /** For an overdue habit occurrence: the last day it can still be acted on. */
  closesOn?: string | null;
};

/** "Sat 19" from YYYY-MM-DD, without letting the local timezone move the day. */
function shortDay(iso: string, t: Dict): string {
  return t.fmt.weekdayDay(new Date(`${iso}T00:00:00Z`));
}

const pill =
  "rounded-sm border border-line px-sm py-0.5 text-xs text-fg-secondary transition-colors hover:bg-hovered hover:text-fg-primary";

/**
 * The three decisions an overdue task asks for — done is the checkbox, these
 * are the other two. Shown outright rather than on hover: making the call is
 * the entire point of the section.
 */
function OverdueActions({
  task, today, onReschedule, onDrop,
}: {
  task: TaskRowData;
  today: string;
  onReschedule: (id: string, day: string) => void;
  onDrop: (id: string) => void;
}) {
  const { t } = useT();
  const [picking, setPicking] = React.useState(false);
  const [confirmDrop, setConfirmDrop] = React.useState(false);
  const slip = slipLabel(task.rescheduleCount ?? 0, t);
  const isHabit = Boolean(task.recurrence);
  const copy = t.tasks.overdueActions;

  return (
    <div
      className="mt-xs flex flex-wrap items-center gap-xs"
      onMouseLeave={() => setConfirmDrop(false)}
    >
      <button type="button" className={pill} onClick={() => onReschedule(task.id, today)}>
        {copy.today}
      </button>

      {picking ? (
        <input
          type="date"
          min={today}
          autoFocus
          aria-label={copy.newDateAria(task.title)}
          onBlur={() => setPicking(false)}
          onChange={(e) => {
            if (e.target.value && e.target.value >= today) {
              setPicking(false);
              onReschedule(task.id, e.target.value);
            }
          }}
          className="rounded-sm bg-elevated px-sm py-0.5 font-mono text-xs outline-none"
        />
      ) : (
        <button type="button" className={pill} onClick={() => setPicking(true)}>
          {copy.reschedule}
        </button>
      )}

      {confirmDrop ? (
        <button
          type="button"
          onClick={() => { setConfirmDrop(false); onDrop(task.id); }}
          className="rounded-sm bg-danger/15 px-sm py-0.5 text-xs text-danger hover:bg-danger/25"
        >
          {isHabit ? copy.cancelDay : copy.cancelTask}
        </button>
      ) : (
        <button type="button" className={pill} onClick={() => setConfirmDrop(true)}>
          {copy.cancel}
        </button>
      )}

      {isHabit && task.closesOn && (
        <span className="text-[11px] text-fg-muted">
          {copy.openUntil(shortDay(task.closesOn, t))}
        </span>
      )}
      {slip && <span className="text-[11px] text-warning">{slip}</span>}
    </div>
  );
}

const goalDot: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
};

/** Due-date wording people actually use, rather than a raw date. */
function dueLabel(due: Date | null, t: Dict): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  );
  const copy = t.tasks.due;
  if (days < 0) {
    return { text: days === -1 ? copy.yesterday : copy.daysAgo(-days), overdue: true };
  }
  if (days === 0) return { text: copy.today, overdue: false };
  if (days === 1) return { text: copy.tomorrow, overdue: false };
  if (days < 7) return { text: copy.inDays(days), overdue: false };
  return { text: t.fmt.shortDate(due), overdue: false };
}

export function TaskRow({
  task,
  running = false,
  onToggleDone,
  onToggleTimer,
  onDelete,
  today,
  onReschedule,
  onDrop,
}: {
  task: TaskRowData;
  running?: boolean;
  onToggleDone?: (id: string) => void;
  onToggleTimer?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Present only in the overdue list, where the row asks for a decision. */
  today?: string;
  onReschedule?: (id: string, day: string) => void;
  onDrop?: (id: string) => void;
}) {
  const { t } = useT();
  const done = task.status === "done";
  const due = dueLabel(task.dueAt, t);
  const over = task.estMinutes !== null && task.actualMinutes > task.estMinutes;
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div
      onMouseLeave={() => setConfirming(false)}
      className={cn(
        "group flex items-center gap-sm rounded-md px-sm py-sm sm:gap-md sm:px-md",
        "border border-transparent transition-colors",
        "hover:border-line hover:bg-surface",
        running && "border-accent/40 bg-accent-subtle",
      )}
    >
      <button
        type="button"
        onClick={() => onToggleDone?.(task.id)}
        aria-label={done ? t.tasks.reopenAria(task.title) : t.tasks.completeAria(task.title)}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          done
            ? "border-success bg-success text-fg-inverse"
            : "border-line-strong hover:border-accent",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>

      {task.priority === 1 && !done && (
        <span
          className="h-4 w-0.5 shrink-0 rounded-full bg-danger"
          aria-label={t.tasks.topPriority}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-xs truncate text-sm", done && "text-fg-muted line-through")}>
          {task.title}
          {task.recurrence && (
            <Repeat
              className="size-3 shrink-0 text-fg-muted"
              aria-label={recurrenceLabel(task.recurrence, t)}
            />
          )}
        </p>
        {task.goalTitle && (
          <span className="mt-0.5 flex items-center gap-xs text-xs text-fg-muted">
            <span className={cn("size-1.5 rounded-full", goalDot[task.goalColorSlot])} />
            {task.goalTitle}
          </span>
        )}
        {today && onReschedule && onDrop && !done && (
          <OverdueActions task={task} today={today} onReschedule={onReschedule} onDrop={onDrop} />
        )}
      </div>

      {/* The point of the product: what it was going to cost vs what it cost. */}
      {task.estMinutes !== null && (
        <span className="hidden shrink-0 font-mono text-xs text-fg-muted tabular-nums min-[420px]:inline">
          {t.fmt.minutes(task.actualMinutes)}
          <span className="text-fg-muted/60"> / {t.fmt.minutes(task.estMinutes)}</span>
          {over && (
            <span className="text-warning">
              {" "}
              +{Math.round((task.actualMinutes / task.estMinutes - 1) * 100)}%
            </span>
          )}
        </span>
      )}

      {due && (
        <span
          className={cn(
            "shrink-0 rounded-full px-sm py-0.5 text-xs",
            due.overdue ? "bg-danger/15 text-danger" : "bg-elevated text-fg-secondary",
          )}
        >
          {due.text}
        </span>
      )}

      <button
        type="button"
        onClick={() => onToggleTimer?.(task.id)}
        aria-label={
          running ? t.tasks.stopTimerAria(task.title) : t.tasks.startTimerAria(task.title)
        }
        disabled={done}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-sm transition-colors",
          // No hover on a phone, so these would never appear at all.
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          "[@media(hover:none)]:opacity-100",
          "hover:bg-elevated text-fg-secondary hover:text-fg",
          "disabled:pointer-events-none",
          running && "text-accent-text opacity-100",
        )}
      >
        {running ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      {/* Two clicks, not a dialog. A stray click can't delete anything, and
          the confirmation lives in the row rather than interrupting the page.
          It resets when the pointer leaves, so an abandoned confirm doesn't
          sit there armed. */}
      {onDelete &&
        (confirming ? (
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onDelete(task.id);
            }}
            aria-label={t.tasks.confirmDeleteAria(task.title)}
            className="shrink-0 rounded-sm bg-danger/15 px-sm py-0.5 text-xs text-danger hover:bg-danger/25"
          >
            {t.tasks.deleteConfirm}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={t.tasks.deleteAria(task.title)}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-sm transition-colors",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              "[@media(hover:none)]:opacity-100",
              "text-fg-muted hover:bg-elevated hover:text-danger",
            )}
          >
            <Trash2 className="size-4" />
          </button>
        ))}
    </div>
  );
}
