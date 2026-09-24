"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import * as q from "@/lib/queries";
import {
  isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Dict,
} from "@/lib/i18n";
import { getDict } from "@/lib/i18n/server";
import { currentUserIdOrNull } from "@/lib/session";
import { setUserLocale } from "@/lib/users";
import { RECURRENCES, type Recurrence } from "@/lib/recurrence";
import {
  dueNotifications, NOTIFICATION_KINDS, type NotificationCandidate,
} from "@/lib/notifications";
import { computeStreak } from "@/lib/streak";
import { rollingCalibration } from "@/lib/calibration";

const colorSlot = z.coerce.number().int().min(1).max(6);
const priority = z.coerce.number().int().min(1).max(4);

/** Empty string from a form field means "not set", not an empty value. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const taskInput = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(500),
  goalId: z.uuid().nullable().catch(null),
  estMinutes: z.coerce.number().int().positive().max(24 * 60).nullable().catch(null),
  dueAt: optionalText,
  priority: priority.catch(3),
  // An unknown repeat rule falls back to a one-off rather than failing the
  // add: losing the repeat is recoverable, losing the task as typed is not.
  recurrence: z.enum(RECURRENCES).nullable().catch(null),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Error copy in the language the user picked.
 *
 * Errors are returned as text rather than as codes the client would look up,
 * because every one of these is produced on the server and rendered verbatim.
 * A code would only move the same lookup one hop later.
 */
type ErrorKey = keyof Dict["errors"];

async function errs(): Promise<Dict["errors"]> {
  return (await getDict()).errors;
}

/**
 * Remember the chosen language.
 *
 * A cookie rather than a route segment: every page here is already dynamic, so
 * a `/ru` prefix would buy no caching and would invalidate every existing
 * link and bookmark. `revalidatePath("/", "layout")` is what makes the rest of
 * the app re-render with the other dictionary rather than only the page the
 * switcher happens to sit on.
 */
export async function setLocale(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return { ok: false, error: "Unsupported language" };
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  // The cookie alone would mean picking Russian on your phone and getting
  // English on your laptop, which reads as the app forgetting. Best-effort:
  // a failed write must not cost them the switch they just made.
  const uid = await currentUserIdOrNull();
  if (uid) {
    try {
      await setUserLocale(uid, locale);
    } catch {
      /* the cookie still holds for this device */
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addTask(formData: FormData): Promise<ActionResult> {
  const parsed = taskInput.safeParse({
    title: formData.get("title"),
    goalId: formData.get("goalId") || null,
    estMinutes: formData.get("estMinutes") || null,
    dueAt: formData.get("dueAt"),
    priority: formData.get("priority") || 3,
    recurrence: formData.get("recurrence") || null,
  });
  if (!parsed.success) {
    const e = await errs();
    return {
      ok: false,
      error: parsed.error.issues[0]?.path[0] === "title" ? e.taskTitle : e.invalidTask,
    };
  }

  await q.createTask({
    title: parsed.data.title,
    goalId: parsed.data.goalId,
    estMinutes: parsed.data.estMinutes,
    dueAt: parsed.data.dueAt,
    priority: parsed.data.priority as 1 | 2 | 3 | 4,
    recurrence: parsed.data.recurrence as Recurrence | null,
  });
  revalidatePath("/");
  return { ok: true };
}

export async function toggleTaskDone(id: string, done: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownTask };
  await q.setTaskStatus(id, done ? "done" : "todo");
  revalidatePath("/");
  return { ok: true };
}

export async function editTask(
  id: string,
  patch: { title?: string; estMinutes?: number | null; dueAt?: string | null },
): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownTask };
  if (patch.title !== undefined && patch.title.trim() === "") {
    return { ok: false, error: (await errs()).titleEmpty };
  }
  await q.updateTask(id, patch);
  revalidatePath("/");
  return { ok: true };
}

export async function removeTask(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownTask };
  await q.deleteTask(id);
  revalidatePath("/");
  return { ok: true };
}

/** A calendar day that exists, as YYYY-MM-DD. */
const calendarDay = z.iso.date();

/**
 * Move an open task to another day. Only today or later: moving work into the
 * past just makes it overdue again with an extra tick on its reschedule count.
 */
export async function rescheduleTask(id: string, day: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownTask };
  const e = await errs();
  if (!calendarDay.safeParse(day).success) return { ok: false, error: e.pickRealDate };
  const { today } = await q.serverClock();
  if (day < today) return { ok: false, error: e.pickTodayOrLater };

  const moved = await q.rescheduleTask(id, day);
  if (!moved) return { ok: false, error: e.alreadyClosed };
  revalidatePath("/");
  revalidatePath("/analytics");
  return { ok: true };
}

/**
 * Close a task on purpose. Distinct from deleting: the task stays in the record
 * as a decision you made, and for a habit the next occurrence still comes —
 * skipping one day's reading doesn't end the habit.
 */
export async function dropTask(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownTask };
  await q.setTaskStatus(id, "cancelled");
  revalidatePath("/");
  revalidatePath("/analytics");
  return { ok: true };
}

export async function toggleTimer(taskId: string, running: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(taskId).success) {
    return { ok: false, error: (await errs()).unknownTask };
  }
  if (running) await q.stopSession();
  else await q.startSession(taskId, "focus");
  revalidatePath("/");
  return { ok: true };
}

const goalInput = z.object({
  title: z.string().trim().min(1, "Give the goal a title").max(200),
  category: optionalText,
  colorSlot: colorSlot.catch(1),
  targetDate: optionalText,
});

export async function addGoal(formData: FormData): Promise<ActionResult> {
  const parsed = goalInput.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    colorSlot: formData.get("colorSlot") || 1,
    targetDate: formData.get("targetDate"),
  });
  if (!parsed.success) {
    const e = await errs();
    return {
      ok: false,
      error: parsed.error.issues[0]?.path[0] === "title" ? e.goalTitle : e.invalidGoal,
    };
  }

  await q.createGoal({
    title: parsed.data.title,
    category: parsed.data.category,
    colorSlot: parsed.data.colorSlot as q.ColorSlot,
    targetDate: parsed.data.targetDate,
  });
  revalidatePath("/");
  return { ok: true };
}

export async function archiveGoal(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownGoal };
  await q.archiveGoal(id);
  revalidatePath("/");
  return { ok: true };
}

/* ---------------- calendar ---------------- */

const isoDate = z.iso.datetime({ offset: true });

/** Blocks are 15-minute granular; anything shorter is a mis-drag. */
const MIN_BLOCK_MINUTES = 15;
const MAX_BLOCK_MINUTES = 12 * 60;

/** Returns which complaint applies, not the words for it — those are the
    dictionary's, and this function is not async. */
function validRange(startsAt: string, endsAt: string): ErrorKey | null {
  if (!isoDate.safeParse(startsAt).success || !isoDate.safeParse(endsAt).success) {
    return "invalidTime";
  }
  const mins = (Date.parse(endsAt) - Date.parse(startsAt)) / 60000;
  if (mins < MIN_BLOCK_MINUTES) return "blockTooShort";
  if (mins > MAX_BLOCK_MINUTES) return "blockTooLong";
  return null;
}

export async function scheduleTaskAt(
  taskId: string,
  startsAt: string,
  minutes: number,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(taskId).success) {
    return { ok: false, error: (await errs()).unknownTask };
  }
  const clamped = Math.min(
    MAX_BLOCK_MINUTES,
    Math.max(MIN_BLOCK_MINUTES, Math.round(minutes / 15) * 15),
  );
  if (!isoDate.safeParse(startsAt).success) {
    return { ok: false, error: (await errs()).invalidTime };
  }

  await q.scheduleTask(taskId, startsAt, clamped);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export async function moveEventTo(
  id: string,
  startsAt: string,
  endsAt: string,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownBlock };
  const err = validRange(startsAt, endsAt);
  if (err) return { ok: false, error: (await errs())[err] };

  await q.moveEvent(id, startsAt, endsAt);
  revalidatePath("/calendar");
  return { ok: true };
}

export async function addEvent(formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const e = await errs();
  if (title === "") return { ok: false, error: e.eventTitle };
  const err = validRange(startsAt, endsAt);
  if (err) return { ok: false, error: e[err] };

  await q.createEvent({ title, startsAt, endsAt });
  revalidatePath("/calendar");
  return { ok: true };
}

/** Removing a block unschedules the task; it does not delete the task. */
export async function unscheduleEvent(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await errs()).unknownBlock };
  await q.deleteEvent(id);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

/* ---------------- timer ---------------- */

export async function startFocus(taskId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(taskId).success) {
    return { ok: false, error: (await errs()).unknownTask };
  }
  await q.startSession(taskId, "focus");
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true };
}

/** A break is not attached to a task — it is time away from all of them. */
export async function startBreak(): Promise<ActionResult> {
  await q.startSession(null, "break");
  revalidatePath("/");
  return { ok: true };
}

export async function stopTimer(): Promise<ActionResult> {
  await q.stopSession();
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function noteInterruption(sessionId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(sessionId).success) {
    return { ok: false, error: (await errs()).noRunningSession };
  }
  await q.logInterruption(sessionId);
  revalidatePath("/");
  return { ok: true };
}

/* ---------------- notifications ---------------- */

/**
 * Everything Arc has grounds to say right now.
 *
 * Read-only — claiming is a separate step, so nothing is marked as said until
 * a client has actually shown it.
 */
export async function pendingNotifications(): Promise<NotificationCandidate[]> {
  const [clock, activity, focusToday, running, best, completed, calib] = await Promise.all([
    q.serverClock(),
    q.dailyActivity(),
    q.focusMinutesToday(),
    q.getRunningSession(),
    q.bestFocusHour(),
    q.recentlyCompletedEstimate(),
    q.calibration(),
  ]);

  const days = activity.days.map((d) => ({
    day: d.day,
    focusMinutes: Number(d.focusMinutes),
  }));
  const calibrationNow = rollingCalibration(calib.map((c) => Number(c.ratio)));
  const nextTask = (await q.listTasks("today"))[0] ?? null;
  const dict = await getDict();

  return dueNotifications({
    hour: Number(clock.hour),
    today: clock.today,
    streak: computeStreak(days, activity.today),
    focusTodayMinutes: Number(focusToday),
    timerRunning: running !== null,
    bestHour: best
      ? {
          hour: Number(best.hour),
          sessions: Number(best.sessions),
          averageMinutes: Number(best.averageMinutes),
        }
      : null,
    nextTaskTitle: nextTask?.title ?? null,
    justCompleted: completed
      ? {
          taskId: completed.taskId,
          title: completed.title,
          estimateMinutes: Number(completed.estimateMinutes),
          actualMinutes: Number(completed.actualMinutes),
          calibrationNow,
        }
      : null,
  }, dict);
}

/** Returns true if this client won the right to show it. See queries.ts. */
export async function claimNotification(kind: string, dedupeKey: string): Promise<boolean> {
  if (!NOTIFICATION_KINDS.includes(kind as (typeof NOTIFICATION_KINDS)[number])) return false;
  if (typeof dedupeKey !== "string" || dedupeKey.length === 0 || dedupeKey.length > 200) return false;
  return q.claimNotification(kind, dedupeKey);
}
