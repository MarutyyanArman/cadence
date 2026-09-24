import { listEvents, listUnscheduled } from "@/lib/queries";
import { TimerHost } from "@/components/timer/timer-host";
import { WeekNav } from "@/components/calendar/week-nav";
import { UnscheduledTray } from "@/components/calendar/unscheduled-tray";
import { CalendarBody } from "@/components/calendar/calendar-body";
import { addDays, isoDay, parseIsoDay, startOfWeek } from "@/lib/time";
import { SignInGate } from "@/components/sign-in-gate";
import { currentUserIdOrNull } from "@/lib/session";

// Reads live data on every request — nothing here is prerenderable.
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if ((await currentUserIdOrNull()) === null) return <SignInGate />;

  const { week } = await searchParams;

  // An unparseable ?week= falls back to this week rather than 404ing.
  const anchor = (week ? parseIsoDay(week) : null) ?? new Date();
  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 7);

  const [events, unscheduled] = await Promise.all([
    listEvents(weekStart.toISOString(), weekEnd.toISOString()),
    listUnscheduled(),
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-xl px-lg pb-28 pt-xl sm:gap-3xl sm:px-xl sm:pb-3xl sm:pt-3xl lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-xl">
        <WeekNav weekStart={weekStart} />

        <CalendarBody
          weekKey={isoDay(weekStart)}
          events={events.map((e) => ({
            id: e.id,
            taskId: e.taskId,
            title: e.title,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            goalColorSlot: e.goalColorSlot,
            done: e.taskStatus === "done",
          }))}
        />
      </div>

      <div className="flex flex-col gap-xl">
        <UnscheduledTray
          tasks={unscheduled.map((t) => ({
            id: t.id,
            title: t.title,
            estMinutes: t.estMinutes,
            goalTitle: t.goalTitle,
            goalColorSlot: t.goalColorSlot,
          }))}
        />
      </div>

      <TimerHost />
    </main>
  );
}
