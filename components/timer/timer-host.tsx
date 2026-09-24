import { getRunningSession } from "@/lib/queries";
import { TimerBar } from "./timer-bar";

/**
 * Server wrapper. Deliberately mounted per-page rather than in the root layout:
 * the layout is also used by the statically generated 404, and a database read
 * there would break `next build` on a machine with no DATABASE_URL.
 */
export async function TimerHost() {
  const session = await getRunningSession();
  if (!session) return null;

  return (
    <TimerBar
      session={{
        id: session.id,
        taskId: session.taskId,
        taskTitle: session.taskTitle,
        goalColorSlot: session.goalColorSlot,
        kind: session.kind,
        estMinutes: session.estMinutes,
        startedAt: session.startedAt,
        interruptions: session.interruptions,
        serverNow: session.serverNow,
      }}
    />
  );
}
