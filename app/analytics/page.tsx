import {
  allocation, dailyFocus, estimateAccuracy, focusHeatmap,
  plannedVsActual, summary, throughput,
} from "@/lib/analytics";
import { habitStats, listGoals, rolloverRecurring, slippingTasks } from "@/lib/queries";
import { HabitRates } from "@/components/charts/habit-rates";
import { ChartCard } from "@/components/charts/chart-card";
import { GoalRings } from "@/components/charts/goal-rings";
import { PlannedVsActual } from "@/components/charts/planned-vs-actual";
import { EstimateAccuracy } from "@/components/charts/estimate-accuracy";
import { FocusHeatmap } from "@/components/charts/focus-heatmap";
import { Throughput } from "@/components/charts/throughput";
import { ConsistencyCalendar } from "@/components/charts/consistency-calendar";
import { AllocationDonut } from "@/components/charts/allocation-donut";
import { InterruptionsByHour } from "@/components/charts/interruptions-by-hour";
import { AppNav } from "@/components/app-nav";
import { SignInGate } from "@/components/sign-in-gate";
import { currentUserIdOrNull } from "@/lib/session";
import { TimerHost } from "@/components/timer/timer-host";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function AnalyticsPage() {
  if ((await currentUserIdOrNull()) === null) return <SignInGate />;

  // Before reading: yesterday's unfinished habit days must exist as records, or
  // the habit rates below would be computed from a history with holes in it.
  await rolloverRecurring();

  const [t, goals, pva, acc, tp, heat, daily, alloc, sum, habits, slipping] =
    await Promise.all([
    getDict(),
    listGoals(),
    plannedVsActual(8),
    estimateAccuracy(),
    throughput(30),
    focusHeatmap(56),
    dailyFocus(365),
    allocation(30),
    summary(30),
    habitStats(),
    slippingTasks(2),
  ]);

  // Axis labels follow the chosen language, not the browser's.
  const shortDay = (d: Date) => t.fmt.shortDate(d);

  // Fold the per-goal weekly rows into one series per week.
  const weekly = new Map<string, { planned: number; actual: number }>();
  for (const r of pva) {
    const key = shortDay(r.week);
    const acc0 = weekly.get(key) ?? { planned: 0, actual: 0 };
    acc0.planned += Number(r.plannedMinutes);
    acc0.actual += Number(r.actualMinutes);
    weekly.set(key, acc0);
  }
  const pvaRows = [...weekly].map(([week, v]) => ({ week, ...v }));

  // Interruptions per hour of focus, collapsed across weekdays.
  const byHour = new Map<number, { mins: number; ints: number }>();
  for (const c of heat) {
    const a = byHour.get(c.hourOfDay) ?? { mins: 0, ints: 0 };
    a.mins += c.focusMinutes;
    a.ints += c.interruptions;
    byHour.set(c.hourOfDay, a);
  }
  const interruptionRows = Array.from({ length: 24 }, (_, h) => {
    const a = byHour.get(h);
    const hours = (a?.mins ?? 0) / 60;
    return {
      hour: String(h).padStart(2, "0"),
      rate: hours > 0 ? Math.round(((a!.ints / hours) + Number.EPSILON) * 10) / 10 : 0,
    };
  });

  const medianRatio = sum.medianRatio === null ? null : Number(sum.medianRatio);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-lg px-lg pb-28 pt-xl sm:gap-xl sm:px-xl sm:pb-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="t-h1">{t.analytics.heading}</h1>
          <p className="t-body text-fg-secondary">{t.analytics.last30}</p>
        </div>
        <AppNav current="analytics" />
      </div>

      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
        {[
          { label: t.analytics.focused, value: t.fmt.minutes(sum.focusMinutes) },
          { label: t.analytics.sessions, value: String(sum.sessions) },
          { label: t.analytics.completed, value: String(sum.tasksCompleted) },
          {
            label: t.analytics.medianEstimate,
            value: medianRatio === null ? "—" : `${Math.round(medianRatio * 100)}%`,
            hint: medianRatio === null
              ? undefined
              : medianRatio > 1
                ? t.analytics.takesLonger(Math.round((medianRatio - 1) * 100))
                : t.analytics.insideEstimate,
          },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-line bg-surface p-lg">
            <p className="text-xs text-fg-muted">{s.label}</p>
            <p className="t-numeric">{s.value}</p>
            {s.hint && <p className="mt-xs text-[11px] text-fg-secondary">{s.hint}</p>}
          </div>
        ))}
      </div>

      <ChartCard
        title={t.analytics.goalProgress.title}
        hint={t.analytics.goalProgress.hint}
        empty={goals.length === 0}
        emptyMessage={t.analytics.goalProgress.empty}
      >
        <GoalRings
          goals={goals.map((g) => ({
            id: g.id, title: g.title, colorSlot: g.colorSlot,
            progress: Number(g.progress),
            doneTasks: Number(g.doneTasks), totalTasks: Number(g.totalTasks),
            targetDate: g.targetDate,
            projectedDaysRemaining:
              g.projectedDaysRemaining === null ? null : Number(g.projectedDaysRemaining),
          }))}
        />
      </ChartCard>

      <ChartCard
        title={t.analytics.habits.title}
        hint={t.analytics.habits.hint}
        empty={habits.length === 0 && slipping.length === 0}
        emptyMessage={t.analytics.habits.empty}
      >
        <HabitRates
          habits={habits.map((h) => ({
            seriesId: h.seriesId,
            title: h.title,
            recurrence: h.recurrence,
            done: Number(h.done),
            missed: Number(h.missed),
            skipped: Number(h.skipped),
            open: Number(h.open),
          }))}
          slipping={slipping.map((s) => ({
            id: s.id,
            title: s.title,
            rescheduleCount: Number(s.rescheduleCount),
          }))}
        />
      </ChartCard>

      <div className="grid gap-lg lg:grid-cols-2">
        <ChartCard
          title={t.analytics.plannedVsActual.title}
          hint={t.analytics.plannedVsActual.hint}
          empty={pvaRows.length === 0}
          emptyMessage={t.analytics.plannedVsActual.empty}
        >
          <PlannedVsActual data={pvaRows} />
        </ChartCard>

        <ChartCard
          title={t.analytics.accuracy.title}
          hint={t.analytics.accuracy.hint}
          empty={acc.length === 0}
          emptyMessage={t.analytics.accuracy.empty}
        >
          <EstimateAccuracy
            data={acc.map((a) => ({
              title: a.title,
              estimated: Number(a.estimatedMinutes),
              actual: Number(a.actualMinutes),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t.analytics.throughput.title}
          hint={t.analytics.throughput.hint}
          empty={tp.every((p) => Number(p.created) === 0 && Number(p.completed) === 0)}
          emptyMessage={t.analytics.throughput.empty}
        >
          <Throughput
            data={tp.map((p) => ({
              day: shortDay(p.day),
              created: Number(p.created),
              completed: Number(p.completed),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t.analytics.allocation.title}
          hint={t.analytics.allocation.hint}
          empty={alloc.length === 0}
          emptyMessage={t.analytics.allocation.empty}
        >
          <AllocationDonut
            data={alloc.map((a) => ({
              name: a.goalTitle ?? t.composer.noGoal,
              minutes: Number(a.minutes),
              colorSlot: Number(a.colorSlot),
            }))}
          />
        </ChartCard>
      </div>

      <ChartCard
        title={t.analytics.heatmap.title}
        hint={t.analytics.heatmap.hint}
        empty={heat.length === 0}
        emptyMessage={t.analytics.heatmap.empty}
      >
        <FocusHeatmap data={heat.map((c) => ({
          dayOfWeek: Number(c.dayOfWeek),
          hourOfDay: Number(c.hourOfDay),
          focusMinutes: Number(c.focusMinutes),
        }))} />
      </ChartCard>

      <div className="grid gap-lg lg:grid-cols-2">
        <ChartCard
          title={t.analytics.consistency.title}
          hint={t.analytics.consistency.hint}
          empty={daily.length === 0}
          emptyMessage={t.analytics.consistency.empty}
        >
          <ConsistencyCalendar
            data={daily.map((d) => ({ day: isoDay(new Date(d.day)), minutes: Number(d.minutes) }))}
          />
        </ChartCard>

        <ChartCard
          title={t.analytics.interruptions.title}
          hint={t.analytics.interruptions.hint}
          empty={Number(sum.interruptions) === 0}
          emptyMessage={t.analytics.interruptions.empty}
        >
          <InterruptionsByHour data={interruptionRows} />
        </ChartCard>
      </div>

      <TimerHost />
    </main>
  );
}
