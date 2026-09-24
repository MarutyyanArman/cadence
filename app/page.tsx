import { ChevronRight } from "lucide-react";
import {
  calibration, dailyActivity, focusMinutesToday, listGoals, listTasks,
  questFacts, rolloverRecurring, todaysQuests,
} from "@/lib/queries";
import { daysBetween, lastActionableDay } from "@/lib/recurrence";
import { TaskComposer } from "@/components/task-composer";
import { TaskList } from "@/components/task-list";
import { GoalPanel } from "@/components/goal-panel";
import { CalibrationCard } from "@/components/calibration-card";
import { DailyStats } from "@/components/daily-stats";
import { NotificationSettings } from "@/components/notification-settings";
import { QuestCard } from "@/components/quest-card";
import { AppNav } from "@/components/app-nav";
import { SignInGate } from "@/components/sign-in-gate";
import { currentUserIdOrNull } from "@/lib/session";
import { ConsistencyCalendar } from "@/components/charts/consistency-calendar";
import { computeStreak } from "@/lib/streak";
import { TimerHost } from "@/components/timer/timer-host";
import type { TaskRowData } from "@/components/task-row";
import { getDict } from "@/lib/i18n/server";

// Reads live data on every request — nothing here is prerenderable.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Before anything touches the database: every query resolves its owner, and
  // with nobody signed in they would all throw rather than render a page that
  // explains itself.
  if ((await currentUserIdOrNull()) === null) return <SignInGate />;

  // Then, and on its own: every read below should see today's occurrences and
  // any windows that closed overnight. Idempotent, so repeated loads are free.
  await rolloverRecurring();

  const [t, goals, today, overdue, upcoming, done, focusToday, calib, activity, quests, qFacts] =
    await Promise.all([
    getDict(),
    listGoals(),
    listTasks("today"),
    listTasks("overdue"),
    listTasks("upcoming"),
    listTasks("done"),
    focusMinutesToday(),
    calibration(),
    dailyActivity(),
    todaysQuests(),
    questFacts(),
  ]);

  const activityDays = activity.days.map((d) => ({
    day: d.day,
    focusMinutes: Number(d.focusMinutes),
  }));
  const streak = computeStreak(activityDays, activity.today);

  // Named `row` rather than `t`: `t` is the dictionary everywhere else here.
  const toRow = (row: Awaited<ReturnType<typeof listTasks>>[number]): TaskRowData => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    estMinutes: row.estMinutes,
    actualMinutes: row.actualMinutes,
    dueAt: row.dueAt,
    goalTitle: row.goalTitle,
    goalColorSlot: row.goalColorSlot,
    running: row.isRunning,
    recurrence: row.recurrence,
    rescheduleCount: Number(row.rescheduleCount),
    closesOn: row.recurrence && row.dueDay ? lastActionableDay(row.dueDay) : null,
  });

  const oldestOverdueDays =
    overdue.length > 0 && overdue[0].dueDay
      ? daysBetween(overdue[0].dueDay, activity.today)
      : null;

  return (
    <main
      className="mx-auto grid max-w-5xl gap-xl px-lg pb-28 pt-xl sm:gap-3xl sm:px-xl sm:pb-3xl sm:pt-3xl lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <div className="flex flex-col gap-xl">
        <header className="flex items-end justify-between gap-md">
          <div>
            <h1 className="t-h1">{t.home.title}</h1>
            <p className="t-body text-fg-secondary">
              {today.length === 0 ? t.home.nothingOpen : t.home.open(today.length)}
              {overdue.length > 0 && ` · ${t.home.overdue(overdue.length)}`}
              {focusToday > 0 && ` · ${t.home.focusedToday(focusToday)}`}
            </p>
          </div>
          <AppNav current="tasks" />
        </header>

        <DailyStats
          activity={activityDays}
          today={activity.today}
          focusToday={focusToday}
        />

        <TaskComposer goals={goals.map((g) => ({ id: g.id, title: g.title }))} />

        <QuestCard quests={quests.quests} facts={qFacts} />

        {overdue.length > 0 && (
          <section className="flex flex-col gap-sm rounded-md border border-danger/25 bg-danger/5 p-sm">
            {/* Out of Today on purpose: overdue work mixed into today's list is
                easy to scroll past for weeks. Here each one asks for a call. */}
            <div className="flex items-baseline justify-between gap-sm px-sm pt-xs">
              <h2 className="t-h3">
                {t.home.overdueHeading}{" "}
                <span className="text-fg-muted">({overdue.length})</span>
              </h2>
              {oldestOverdueDays !== null && oldestOverdueDays > 1 && (
                <span className="text-[11px] text-fg-muted">
                  {t.home.oldestFrom(oldestOverdueDays)}
                </span>
              )}
            </div>
            <TaskList tasks={overdue.map(toRow)} mode="overdue" today={activity.today} />
          </section>
        )}

        <TaskList tasks={today.map(toRow)} />

        {upcoming.length > 0 && (
          <section className="flex flex-col gap-md">
            <h2 className="t-h3 text-fg-secondary">{t.home.upcoming}</h2>
            <TaskList tasks={upcoming.map(toRow)} />
          </section>
        )}

        {done.length > 0 && (
          <details className="group flex flex-col gap-md">
            {/* Completing a task removes it from every other list — this is
                the only place to find one again, whether to confirm it's
                really finished or to undo an accidental check. */}
            <summary className="flex cursor-pointer list-none items-center gap-xs t-h3 text-fg-secondary [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
              {t.home.completed} <span className="text-fg-muted">({done.length})</span>
            </summary>
            <TaskList tasks={done.map(toRow)} />
          </details>
        )}

        {activityDays.length > 0 && (
          <section className="flex flex-col gap-sm">
            <h2 className="t-h3 text-fg-secondary">{t.home.consistency}</h2>
            <ConsistencyCalendar
              data={activityDays.map((d) => ({ day: d.day, minutes: d.focusMinutes }))}
              weeks={18}
              streak={streak.current}
            />
          </section>
        )}
      </div>

      <div className="flex flex-col gap-xl">
        <CalibrationCard ratios={calib.map((c) => Number(c.ratio))} />

        <NotificationSettings />

        <GoalPanel
          goals={goals.map((g) => ({
          id: g.id,
          title: g.title,
          colorSlot: g.colorSlot,
          targetDate: g.targetDate,
          totalTasks: Number(g.totalTasks),
          doneTasks: Number(g.doneTasks),
          progress: Number(g.progress),
            projectedDaysRemaining:
              g.projectedDaysRemaining === null ? null : Number(g.projectedDaysRemaining),
          }))}
        />
      </div>

      <div className="lg:col-span-2">
        <TimerHost />
      </div>
    </main>
  );
}
