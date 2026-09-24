"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus } from "lucide-react";
import { addGoal, archiveGoal } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import type { Dict } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type GoalCardData = {
  id: string;
  title: string;
  colorSlot: 1 | 2 | 3 | 4 | 5 | 6;
  targetDate: Date | null;
  totalTasks: number;
  doneTasks: number;
  progress: number;
  projectedDaysRemaining: number | null;
};

const barColor: Record<number, string> = {
  1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-3",
  4: "bg-chart-4", 5: "bg-chart-5", 6: "bg-chart-6",
};

/** On track if the projected finish lands before the target date. */
function pace(goal: GoalCardData, t: Dict): { label: string; tone: string } {
  const c = t.goals.pace;
  if (goal.totalTasks === 0) return { label: c.noTasks, tone: "text-fg-muted" };
  if (goal.doneTasks === goal.totalTasks) return { label: c.complete, tone: "text-success" };
  // No completions yet is a starting line, not a warning sign.
  if (goal.doneTasks === 0) return { label: c.notStarted, tone: "text-fg-secondary" };
  if (goal.projectedDaysRemaining === null) return { label: c.stalled, tone: "text-warning" };
  if (!goal.targetDate) {
    return { label: c.daysLeft(goal.projectedDaysRemaining), tone: "text-fg-secondary" };
  }
  const daysToTarget = Math.round(
    (goal.targetDate.getTime() - Date.now()) / 86_400_000,
  );
  return goal.projectedDaysRemaining <= daysToTarget
    ? { label: c.onTrack(goal.projectedDaysRemaining), tone: "text-success" }
    : {
        label: c.behind(goal.projectedDaysRemaining - daysToTarget),
        tone: "text-warning",
      };
}

function GoalCard({ goal, onArchive }: { goal: GoalCardData; onArchive: (id: string) => void }) {
  const { t } = useT();
  const p = pace(goal, t);
  const pct = Math.round(goal.progress * 100);
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div
      onMouseLeave={() => setConfirming(false)}
      className="group rounded-md border border-line bg-surface p-md"
    >
      <div className="mb-sm flex items-baseline justify-between gap-sm">
        <span className="truncate text-sm">{goal.title}</span>
        <span className="flex shrink-0 items-center gap-xs">
          <span className="font-mono text-xs text-fg-muted tabular-nums">{pct}%</span>
          {/* Archive, not delete: the goal's tasks and their logged time stay
              exactly where they are, so past analytics don't change shape.
              listGoals filters on archived_at, so it simply stops appearing. */}
          {confirming ? (
            <button
              type="button"
              onClick={() => { setConfirming(false); onArchive(goal.id); }}
              aria-label={t.goals.confirmArchiveAria(goal.title)}
              className="rounded-sm bg-danger/15 px-sm py-0.5 text-[11px] text-danger hover:bg-danger/25"
            >
              {t.goals.archiveConfirm}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t.goals.archiveAria(goal.title)}
              className="grid size-5 place-items-center rounded-sm text-fg-muted opacity-0 transition-colors hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <Archive className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.goals.progressAria(goal.title)}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", barColor[goal.colorSlot])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn("mt-sm text-xs", p.tone)}>
        {p.label}
        <span className="text-fg-muted">
          {" · "}
          {t.goals.tasksOf(goal.doneTasks, goal.totalTasks)}
        </span>
      </p>
    </div>
  );
}

export function GoalPanel({ goals }: { goals: GoalCardData[] }) {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addGoal(formData);
      if (!res.ok) { setError(res.error); return; }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <aside className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="t-h3">{t.goals.heading}</h2>
        <Button styleVariant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" />
          {t.goals.new}
        </Button>
      </div>

      {open && (
        <form
          ref={formRef}
          action={submit}
          className="flex flex-col gap-sm rounded-md border border-line bg-surface p-md"
        >
          <input
            name="title"
            placeholder={t.goals.titlePlaceholder}
            autoComplete="off"
            className="bg-transparent text-sm outline-none placeholder:text-fg-muted"
          />
          <div className="flex gap-sm">
            <input
              name="targetDate"
              type="date"
              className="flex-1 rounded-sm bg-elevated px-sm py-xs font-mono text-xs outline-none"
            />
            <select
              name="colorSlot"
              defaultValue="1"
              className="rounded-sm bg-elevated px-sm py-xs text-xs outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{t.goals.colour(n)}</option>
              ))}
            </select>
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t.goals.creating : t.goals.create}
          </Button>
        </form>
      )}

      {goals.length === 0 && !open && (
        <p className="rounded-md border border-dashed border-line px-md py-lg text-center text-xs text-fg-secondary">
          {t.goals.empty}
        </p>
      )}

      {goals.map((g) => (
        <GoalCard
          key={g.id}
          goal={g}
          onArchive={(id) =>
            startTransition(async () => {
              const res = await archiveGoal(id);
              if (!res.ok) { setError(res.error); return; }
              router.refresh();
            })
          }
        />
      ))}
    </aside>
  );
}
