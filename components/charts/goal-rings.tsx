"use client";

import { useT } from "@/components/i18n-provider";
import type { Dict } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type RingGoal = {
  id: string;
  title: string;
  colorSlot: number;
  progress: number;
  doneTasks: number;
  totalTasks: number;
  targetDate: Date | null;
  projectedDaysRemaining: number | null;
};

const R = 26;
const C = 2 * Math.PI * R;

function verdict(g: RingGoal, t: Dict): { text: string; tone: string } {
  const c = t.goals.pace;
  if (g.totalTasks === 0) return { text: c.noTasksShort, tone: "text-fg-muted" };
  if (g.doneTasks === g.totalTasks) return { text: c.complete, tone: "text-success" };
  if (g.doneTasks === 0) return { text: c.notStarted, tone: "text-fg-secondary" };
  if (g.projectedDaysRemaining === null) return { text: c.stalled, tone: "text-warning" };
  if (!g.targetDate) {
    return { text: c.daysLeftShort(g.projectedDaysRemaining), tone: "text-fg-secondary" };
  }
  const toTarget = Math.round((g.targetDate.getTime() - Date.now()) / 86_400_000);
  return g.projectedDaysRemaining <= toTarget
    ? { text: c.onTrack(g.projectedDaysRemaining), tone: "text-success" }
    : { text: c.behindShort(g.projectedDaysRemaining - toTarget), tone: "text-warning" };
}

export function GoalRings({ goals }: { goals: RingGoal[] }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-xl">
      {goals.map((g) => {
        const v = verdict(g, t);
        const pct = Math.round(g.progress * 100);
        return (
          <div key={g.id} className="flex min-w-40 items-center gap-md">
            <div className="relative shrink-0">
              <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="5"
                        stroke="var(--color-bg-elevated)" />
                <circle
                  cx="32" cy="32" r={R} fill="none" strokeWidth="5" strokeLinecap="round"
                  stroke={`var(--color-chart-${g.colorSlot})`}
                  strokeDasharray={`${g.progress * C} ${C}`}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center font-mono text-xs tabular-nums">
                {pct}%
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm">{g.title}</p>
              <p className={cn("text-xs", v.tone)}>{v.text}</p>
              <p className="font-mono text-[10px] text-fg-muted tabular-nums">
                {t.goals.tasksOf(g.doneTasks, g.totalTasks)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
