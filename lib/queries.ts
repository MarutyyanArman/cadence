import { db } from "./db";
import { currentUserId } from "./session";
import {
  isRecurrence, nextDueDate, occurrencesAfter, MISSED_AFTER_DAYS, type Recurrence,
} from "./recurrence";
import { CALIBRATION_WINDOW } from "./calibration";
import {
  eligibleKinds, pickQuests, ACCURATE_WITHIN, QUEST_TARGETS, STALE_AFTER_DAYS,
  type QuestFacts, type QuestKind,
} from "./quests";

export type ColorSlot = 1 | 2 | 3 | 4 | 5 | 6;
/** `missed`: a repeating occurrence whose actionable window closed undecided. */
export type TaskStatus = "todo" | "doing" | "done" | "cancelled" | "missed";

export type Goal = {
  id: string;
  title: string;
  category: string | null;
  colorSlot: ColorSlot;
  targetDate: Date | null;
  status: "active" | "paused" | "done" | "abandoned";
  totalTasks: number;
  doneTasks: number;
  progress: number;
  projectedDaysRemaining: number | null;
};

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: 1 | 2 | 3 | 4;
  estMinutes: number | null;
  actualMinutes: number;
  dueAt: Date | null;
  goalId: string | null;
  goalTitle: string | null;
  goalColorSlot: ColorSlot;
  sortOrder: number;
  isRunning: boolean;
  recurrence: Recurrence | null;
  rescheduleCount: number;
  /** YYYY-MM-DD, or null. The day you intend to do it. */
  dueDay: string | null;
  /** YYYY-MM-DD for a habit occurrence: the cadence day it belongs to. */
  scheduledFor: string | null;
};

/* ---------------- goals ---------------- */

export async function listGoals(): Promise<Goal[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<Goal[]>`
    select g.id, g.title, g.category, g.color_slot, g.target_date, g.status,
           p.total_tasks, p.done_tasks, p.progress, p.projected_days_remaining
    from goals g
    join v_goal_progress p on p.goal_id = g.id
    where g.user_id = ${uid}
      and g.archived_at is null
    order by g.status, g.target_date nulls last, g.title
  `;
}

export async function createGoal(input: {
  title: string;
  category?: string | null;
  colorSlot?: ColorSlot;
  targetDate?: string | null;
}): Promise<string> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<{ id: string }[]>`
    insert into goals (user_id, title, category, color_slot, target_date)
    values (${uid}, ${input.title}, ${input.category ?? null},
            ${input.colorSlot ?? 1}, ${input.targetDate ?? null})
    returning id
  `;
  return row.id;
}

export async function archiveGoal(id: string): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`
    update goals set archived_at = now(), status = 'abandoned'
    where id = ${id} and user_id = ${uid}
  `;
}

/* ---------------- tasks ---------------- */

export type TaskScope = "today" | "overdue" | "upcoming" | "all" | "done";

export async function listTasks(scope: TaskScope = "today", goalId?: string): Promise<Task[]> {
  const sql = db();
  const uid = await currentUserId();

  // "Today" = open work due today or undated, plus anything actively in
  // progress — work you've started belongs on today's list even if it isn't due.
  // Work due before today has its own scope, "overdue", which asks for a
  // decision rather than quietly joining today's list.
  const scopeFilter =
    // Open means todo or doing, never "not done". Cancelled and missed tasks are
    // closed; an earlier version of this filter would have let them leak into
    // Today the moment anything set those statuses.
    scope === "today"
      ? sql`and t.status in ('todo', 'doing')
            and (t.due_at is null
                 or (t.due_at >= current_date and t.due_at < current_date + 1)
                 or t.status = 'doing')`
      : scope === "overdue"
        ? sql`and t.status = 'todo' and t.due_at < current_date`
        : scope === "upcoming"
          ? sql`and t.status = 'todo' and t.due_at >= current_date + 1`
          : scope === "done"
            ? sql`and t.status = 'done'`
            : sql``;

  const goalFilter = goalId ? sql`and t.goal_id = ${goalId}` : sql``;

  // Everything else orders by what to work on next; "done" orders by when it
  // was finished, most recent first — that's what you scan when you're
  // checking "did I just tick that off by mistake."
  const orderBy =
    scope === "done"
      ? sql`order by t.completed_at desc nulls last`
      : scope === "overdue"
        ? sql`order by t.due_at asc, t.priority, t.sort_order`
        : sql`order by
              case t.status when 'doing' then 0 when 'todo' then 1 else 2 end,
              t.priority,
              t.due_at nulls last,
              t.sort_order`;

  // "done" is a history list, not a working set — cap it so a year of use
  // doesn't mean shipping thousands of rows on every page load.
  const limitClause = scope === "done" ? sql`limit 200` : sql``;

  return sql<Task[]>`
    select
      t.id, t.title, t.notes, t.status, t.priority, t.est_minutes,
      t.due_at, t.goal_id, t.sort_order, t.recurrence, t.reschedule_count,
      to_char(t.due_at, 'YYYY-MM-DD')             as due_day,
      to_char(t.scheduled_for, 'YYYY-MM-DD')      as scheduled_for,
      round(a.actual_seconds / 60.0)::int         as actual_minutes,
      g.title                                     as goal_title,
      coalesce(g.color_slot, 1)                   as goal_color_slot,
      exists (
        select 1 from time_sessions s
        where s.task_id = t.id and s.ended_at is null
      )                                           as is_running
    from tasks t
    join v_task_actuals a on a.task_id = t.id
    left join goals g on g.id = t.goal_id
    where t.user_id = ${uid}
      and t.parent_id is null
      ${scopeFilter}
      ${goalFilter}
    ${orderBy}
    ${limitClause}
  `;
}

export async function createTask(input: {
  title: string;
  goalId?: string | null;
  estMinutes?: number | null;
  dueAt?: string | null;
  priority?: 1 | 2 | 3 | 4;
  recurrence?: Recurrence | null;
}): Promise<string> {
  const sql = db();
  const uid = await currentUserId();
  const recurring = input.recurrence ?? null;
  const due = input.dueAt ?? null;
  // A habit with no date can't know which days it missed, so it starts today.
  const dueExpr = recurring && due === null ? sql`current_date` : sql`${due}`;
  const scheduledExpr = !recurring
    ? sql`null`
    : due === null
      ? sql`current_date`
      : sql`${due}::date`;

  const [row] = await sql<{ id: string }[]>`
    insert into tasks (
      user_id, title, goal_id, est_minutes, due_at, priority, recurrence,
      scheduled_for, sort_order
    )
    values (
      ${uid}, ${input.title}, ${input.goalId ?? null}, ${input.estMinutes ?? null},
      ${dueExpr}, ${input.priority ?? 3}, ${recurring}, ${scheduledExpr},
      coalesce((select max(sort_order) from tasks where user_id = ${uid}), 0) + 1000
    )
    returning id
  `;
  return row.id;
}

export async function updateTask(
  id: string,
  patch: {
    title?: string;
    notes?: string | null;
    estMinutes?: number | null;
    dueAt?: string | null;
    priority?: 1 | 2 | 3 | 4;
    goalId?: string | null;
  },
): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  const fields = Object.keys(patch) as (keyof typeof patch)[];
  if (fields.length === 0) return;
  await sql`
    update tasks set ${sql(patch, ...fields)}
    where id = ${id} and user_id = ${uid}
  `;
}

/**
 * Completing a task also closes any session still running against it, and —
 * if it repeats — writes the next occurrence. All in one transaction: a
 * completion that didn't produce its successor would silently end the habit.
 *
 * Reversing a completion removes that successor again, so the undo in the
 * Completed list can't leave two copies of the same thing outstanding.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql.begin(async (tx) => {
    const [before] = await tx<{ recurrence: string | null; anchor: string | null; today: string }[]>`
      select recurrence,
             to_char(coalesce(scheduled_for, due_at::date), 'YYYY-MM-DD') as anchor,
             to_char(current_date, 'YYYY-MM-DD')                          as today
      from tasks
      where id = ${id} and user_id = ${uid}
    `;
    // Not found, or not theirs — indistinguishable on purpose, and either way
    // there is nothing to do.
    if (!before) return;

    await tx`
      update tasks
      set status = ${status},
          completed_at = ${status === "done" ? sql`now()` : null}
      where id = ${id} and user_id = ${uid}
    `;

    if (status === "done" || status === "cancelled" || status === "missed") {
      await tx`update time_sessions set ended_at = now()
               where task_id = ${id} and user_id = ${uid} and ended_at is null`;
    }

    // Done or deliberately skipped, an occurrence hands on to the next one:
    // cancelling one day's reading doesn't end the habit. The next day is
    // computed from the cadence day, not the due date, so a rescheduled
    // occurrence can't shift the habit's schedule.
    if ((status === "done" || status === "cancelled") && isRecurrence(before.recurrence)) {
      const next = nextDueDate(before.recurrence, before.anchor, before.today);
      if (next !== null) {
        // `not exists` plus the unique index on recurrence_of: finishing twice, or
        // racing the daily rollover, still yields exactly one successor.
        await tx`
          insert into tasks (
            user_id, title, notes, project_id, goal_id, est_minutes, priority,
            due_at, scheduled_for, recurrence, recurrence_of, series_id, sort_order
          )
          select t.user_id, t.title, t.notes, t.project_id, t.goal_id, t.est_minutes, t.priority,
                 ${next}::date, ${next}::date, t.recurrence, t.id, coalesce(t.series_id, t.id),
                 coalesce((select max(sort_order) from tasks where user_id = ${uid}), 0) + 1000
          from tasks t
          where t.id = ${id} and t.user_id = ${uid}
            and not exists (select 1 from tasks c where c.recurrence_of = t.id)
          on conflict (recurrence_of) where recurrence_of is not null do nothing
        `;
      }
    }

    // Reopening withdraws a successor only if finishing this one created it
    // early: one still in the future and untouched. Occurrences the daily
    // rollover wrote are due today or before; those are days genuinely owed and
    // the undo leaves them alone. Cancelling never withdraws anything.
    if (status === "todo") {
      await tx`
        delete from tasks c
        where c.recurrence_of = ${id}
          and c.user_id = ${uid}
          and c.status = 'todo'
          and c.due_at >= current_date + 1
          and not exists (select 1 from time_sessions s where s.task_id = c.id)
      `;
    }
  });
}

export async function deleteTask(id: string): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`delete from tasks where id = ${id} and user_id = ${uid}`;
}

/** Fractional reindexing — a drag writes one row, not the whole list. */
export async function reorderTask(id: string, before: number, after: number): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`
    update tasks set sort_order = ${(before + after) / 2}
    where id = ${id} and user_id = ${uid}
  `;
}

/* ---------------- sessions ---------------- */

export type SessionKind = "focus" | "break" | "interrupted";

export type RunningSession = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  goalColorSlot: ColorSlot;
  kind: SessionKind;
  startedAt: Date;
  interruptions: number;
  /** The running task's estimate, so the timer can show pace against it. */
  estMinutes: number | null;
  /** Server clock at read time, so the client can correct for drift. */
  serverNow: Date;
};

export async function getRunningSession(): Promise<RunningSession | null> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<RunningSession[]>`
    select s.id, s.task_id, s.kind, s.started_at, s.interruptions,
           t.title                   as task_title,
           t.est_minutes             as est_minutes,
           coalesce(g.color_slot, 1) as goal_color_slot,
           now()                     as server_now
    from time_sessions s
    left join tasks t on t.id = s.task_id
    left join goals g on g.id = t.goal_id
    where s.user_id = ${uid} and s.ended_at is null
    limit 1
  `;
  return row ?? null;
}

/** Focus minutes logged since local midnight, counting an open session so far. */
export async function focusMinutesToday(): Promise<number> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<{ minutes: number }[]>`
    select coalesce(round(sum(
      extract(epoch from (
        least(coalesce(s.ended_at, now()), date_trunc('day', now()) + interval '1 day')
        - greatest(s.started_at, date_trunc('day', now()))
      ))
    ) / 60.0), 0)::int as minutes
    from time_sessions s
    where s.user_id = ${uid}
      and s.kind = 'focus'
      and (s.ended_at is null or s.ended_at > date_trunc('day', now()))
  `;
  return row?.minutes ?? 0;
}

export async function logInterruption(sessionId: string): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`
    update time_sessions set interruptions = interruptions + 1
    where id = ${sessionId} and user_id = ${uid} and ended_at is null
  `;
}

/**
 * Starting a timer stops whatever was running first. The database also enforces
 * one running session via a partial unique index, so a race can't slip past.
 */
export async function startSession(
  taskId: string | null,
  kind: SessionKind = "focus",
): Promise<string> {
  const sql = db();
  const uid = await currentUserId();
  return sql.begin(async (tx) => {
    await tx`
      update time_sessions set ended_at = now()
      where user_id = ${uid} and ended_at is null
    `;
    const [row] = await tx<{ id: string }[]>`
      insert into time_sessions (user_id, task_id, goal_id, kind, started_at)
      values (
        ${uid},
        ${taskId},
        ${taskId ? tx`(select goal_id from tasks where id = ${taskId} and user_id = ${uid})` : null},
        ${kind},
        now()
      )
      returning id
    `;
    if (taskId && kind === "focus") {
      await tx`
        update tasks set status = 'doing'
        where id = ${taskId} and user_id = ${uid} and status = 'todo'
      `;
    }
    return row.id;
  });
}

export async function stopSession(): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`
    update time_sessions set ended_at = now()
    where user_id = ${uid} and ended_at is null
  `;
}

/* ---------------- calendar ---------------- */

export type CalendarEvent = {
  id: string;
  taskId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  goalColorSlot: ColorSlot;
  taskStatus: TaskStatus | null;
};

/** Events overlapping the window, not merely contained by it. */
export async function listEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<CalendarEvent[]>`
    select e.id, e.task_id, e.title, e.starts_at, e.ends_at, e.all_day,
           coalesce(g.color_slot, 1) as goal_color_slot,
           t.status                  as task_status
    from events e
    left join tasks t on t.id = e.task_id
    left join goals g on g.id = t.goal_id
    where e.user_id = ${uid} and e.starts_at < ${to} and e.ends_at > ${from}
    order by e.starts_at
  `;
}

/** Unfinished tasks with no block on the calendar yet — the drag source. */
export async function listUnscheduled(): Promise<Task[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<Task[]>`
    select t.id, t.title, t.notes, t.status, t.priority, t.est_minutes,
           t.due_at, t.goal_id, t.sort_order,
           round(a.actual_seconds / 60.0)::int as actual_minutes,
           g.title                             as goal_title,
           coalesce(g.color_slot, 1)           as goal_color_slot,
           false                               as is_running
    from tasks t
    join v_task_actuals a on a.task_id = t.id
    left join goals g on g.id = t.goal_id
    where t.user_id = ${uid}
      and t.status in ('todo', 'doing')
      and t.parent_id is null
      and not exists (select 1 from events e where e.task_id = t.id)
    order by t.priority, t.due_at nulls last, t.sort_order
    limit 50
  `;
}

export async function createEvent(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  taskId?: string | null;
}): Promise<string> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<{ id: string }[]>`
    insert into events (user_id, task_id, title, starts_at, ends_at)
    values (${uid}, ${input.taskId ?? null}, ${input.title},
            ${input.startsAt}, ${input.endsAt})
    returning id
  `;
  return row.id;
}

/** Blocking a task out gives it a title from the task, not a duplicate string. */
export async function scheduleTask(
  taskId: string,
  startsAt: string,
  minutes: number,
): Promise<string> {
  const sql = db();
  const uid = await currentUserId();
  // Selecting the title from the task also scopes the insert: block out a task
  // that isn't yours and the select matches nothing, so nothing is written.
  const [row] = await sql<{ id: string }[]>`
    insert into events (user_id, task_id, title, starts_at, ends_at)
    select t.user_id, ${taskId}, t.title, ${startsAt}::timestamptz,
           ${startsAt}::timestamptz + make_interval(mins => ${minutes})
    from tasks t where t.id = ${taskId} and t.user_id = ${uid}
    returning id
  `;
  return row.id;
}

export async function moveEvent(id: string, startsAt: string, endsAt: string): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`
    update events set starts_at = ${startsAt}, ends_at = ${endsAt}
    where id = ${id} and user_id = ${uid}
  `;
}

export async function deleteEvent(id: string): Promise<void> {
  const sql = db();
  const uid = await currentUserId();
  await sql`delete from events where id = ${id} and user_id = ${uid}`;
}

/* ---------------- calibration ---------------- */

export type CalibrationPoint = {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  actualMinutes: number;
  ratio: number;
  completedAt: Date;
};

/** The most recent finished, estimated, actually-worked tasks. Newest first. */
export async function calibration(limit = CALIBRATION_WINDOW): Promise<CalibrationPoint[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<CalibrationPoint[]>`
    select task_id, title, estimated_minutes, actual_minutes, ratio, completed_at
    from v_calibration
    where user_id = ${uid}
    order by completed_at desc
    limit ${limit}
  `;
}

/* ---------------- daily activity ---------------- */

export type ActivityDay = {
  /** `YYYY-MM-DD` in the database's timezone, ready for lib/streak.ts. */
  day: string;
  focusMinutes: number;
  tasksCompleted: number;
};

/** Every day with activity, plus today's date so the streak has a "now". */
export async function dailyActivity(): Promise<{ days: ActivityDay[]; today: string }> {
  const sql = db();
  const uid = await currentUserId();
  const [days, [{ today }]] = await Promise.all([
    sql<ActivityDay[]>`
      select to_char(day, 'YYYY-MM-DD') as day, focus_minutes, tasks_completed
      from v_daily_activity
      where user_id = ${uid}
      order by day
    `,
    sql<{ today: string }[]>`select to_char(current_date, 'YYYY-MM-DD') as today`,
  ]);
  return { days, today };
}

/* ---------------- notifications ---------------- */

export type BestHour = { hour: number; sessions: number; averageMinutes: number };

/** The hour of day with the most logged focus, and how it usually goes. */
export async function bestFocusHour(): Promise<BestHour | null> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<BestHour[]>`
    select hour_of_day                            as hour,
           count(*)::int                          as sessions,
           round(avg(focus_seconds) / 60.0)::int  as average_minutes
    from v_focus_by_hour
    where user_id = ${uid}
    group by hour_of_day
    order by sum(focus_seconds) desc
    limit 1
  `;
  return row ?? null;
}

export type JustCompleted = {
  taskId: string;
  title: string;
  estimateMinutes: number;
  actualMinutes: number;
};

/** A task finished in the last few minutes, worth reporting the result of. */
export async function recentlyCompletedEstimate(
  withinMinutes = 5,
): Promise<JustCompleted | null> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<JustCompleted[]>`
    select t.id                                as task_id,
           t.title,
           t.est_minutes                       as estimate_minutes,
           round(a.actual_seconds / 60.0)::int as actual_minutes
    from tasks t
    join v_task_actuals a on a.task_id = t.id
    where t.user_id = ${uid}
      and t.status = 'done'
      and t.est_minutes is not null
      and a.actual_seconds > 0
      and t.completed_at > now() - make_interval(mins => ${withinMinutes})
    order by t.completed_at desc
    limit 1
  `;
  return row ?? null;
}

/** The server's own wall clock, which is what the day-based rules run on. */
export async function serverClock(): Promise<{ hour: number; today: string }> {
  const sql = db();
  const [row] = await sql<{ hour: number; today: string }[]>`
    select extract(hour from now())::int       as hour,
           to_char(current_date, 'YYYY-MM-DD') as today
  `;
  return row;
}

/**
 * Take the right to show one notification.
 *
 * Claim before showing, not after: a duplicate is worse than a miss. If two
 * tabs poll at once, the unique index means exactly one insert succeeds and
 * only that tab speaks.
 */
export async function claimNotification(kind: string, dedupeKey: string): Promise<boolean> {
  const sql = db();
  const uid = await currentUserId();
  const rows = await sql<{ id: string }[]>`
    insert into notification_log (user_id, kind, dedupe_key)
    values (${uid}, ${kind}, ${dedupeKey})
    on conflict (user_id, kind, dedupe_key) do nothing
    returning id
  `;
  return rows.length > 0;
}

/* ---------------- quests ---------------- */

export type QuestRow = { kind: QuestKind; target: number };

/**
 * Today's three, drawing them if today hasn't been drawn yet.
 *
 * A read that may write, deliberately: there is no scheduler in this app, so
 * the draw happens the first time you look. The unique index on (day, kind)
 * makes it idempotent — two tabs loading at once both insert and the loser's
 * rows are simply discarded.
 */
export async function todaysQuests(): Promise<{ day: string; quests: QuestRow[] }> {
  const sql = db();
  const uid = await currentUserId();
  const [{ today }] = await sql<{ today: string }[]>`
    select to_char(current_date, 'YYYY-MM-DD') as today
  `;

  const existing = await sql<QuestRow[]>`
    select kind, target from quests
    where user_id = ${uid} and day = current_date
    order by kind
  `;
  if (existing.length > 0) return { day: today, quests: existing };

  const [counts] = await sql<{
    openTasks: number; openEstimated: number; staleOpen: number;
  }[]>`
    select
      count(*) filter (where status in ('todo', 'doing'))::int                        as open_tasks,
      count(*) filter (where status in ('todo', 'doing') and est_minutes is not null)::int as open_estimated,
      count(*) filter (
        where status in ('todo', 'doing') and created_at < now() - make_interval(days => ${STALE_AFTER_DAYS})
      )::int                                                               as stale_open
    from tasks
    where user_id = ${uid} and parent_id is null
  `;

  // Seeded with the user id as well as the day, so two people don't get an
  // identical three every morning — the draw stays unrerollable per person
  // without becoming a shared daily broadcast.
  const kinds = pickQuests(
    `${uid}:${today}`,
    eligibleKinds({
      openTaskCount: Number(counts.openTasks),
      openEstimatedCount: Number(counts.openEstimated),
      hasStaleOpenTask: Number(counts.staleOpen) > 0,
    }),
  );
  if (kinds.length === 0) return { day: today, quests: [] };

  await sql`
    insert into quests ${sql(
      kinds.map((kind) => ({ userId: uid, day: today, kind, target: QUEST_TARGETS[kind] })),
      "userId", "day", "kind", "target",
    )}
    on conflict (user_id, day, kind) do nothing
  `;

  const drawn = await sql<QuestRow[]>`
    select kind, target from quests
    where user_id = ${uid} and day = current_date
    order by kind
  `;
  return { day: today, quests: drawn };
}

/** Everything needed to score today's quests. All of it derived. */
export async function questFacts(): Promise<QuestFacts> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<QuestFacts[]>`
    select
      coalesce((
        select round(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) / 60.0)
        from time_sessions s
        where s.user_id = ${uid} and s.kind = 'focus' and s.started_at >= current_date
      ), 0)::int as focus_minutes_today,

      coalesce((
        select count(*) from tasks
        where user_id = ${uid} and status = 'done' and completed_at >= current_date
      ), 0)::int as tasks_completed_today,

      -- The longest single session today that nobody interrupted.
      coalesce((
        select max(round(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60.0))
        from time_sessions s
        where s.user_id = ${uid} and s.kind = 'focus'
          and s.started_at >= current_date and s.interruptions = 0
      ), 0)::int as longest_clean_block_minutes,

      coalesce((
        select count(*) from tasks
        where user_id = ${uid} and status = 'done' and completed_at >= current_date
          and created_at < completed_at - make_interval(days => ${STALE_AFTER_DAYS})
      ), 0)::int as stale_tasks_cleared_today,

      coalesce((
        select count(*) from v_calibration
        where user_id = ${uid} and completed_at >= current_date
          and ratio between ${1 - ACCURATE_WITHIN} and ${1 + ACCURATE_WITHIN}
      ), 0)::int as accurate_estimates_today
  `;
  return row;
}

/* ---------------- overdue and habits ---------------- */

/**
 * Bring every repeating task up to today.
 *
 * For each habit whose latest occurrence belongs to a day before today, write
 * one occurrence per scheduled day since, so a missed day exists as a record
 * rather than vanishing. Then close anything left untouched past the actionable
 * window as missed.
 *
 * Like the quest draw, this runs on first look rather than from a scheduler.
 * The advisory lock serialises it: two tabs opening at the start of a day would
 * otherwise both try to extend the same chain.
 */
export async function rolloverRecurring(): Promise<{ created: number; missed: number }> {
  const sql = db();
  const uid = await currentUserId();
  return sql.begin(async (tx) => {
    // Per user, not global: one person opening the app must not make everyone
    // else's page load wait behind them.
    await tx`select pg_advisory_xact_lock(hashtext(${`arc:rollover:${uid}`}))`;
    const [{ today }] = await tx<{ today: string }[]>`
      select to_char(current_date, 'YYYY-MM-DD') as today
    `;

    const heads = await tx<{ id: string; recurrence: string; anchor: string | null }[]>`
      select t.id, t.recurrence,
             to_char(coalesce(t.scheduled_for, t.due_at::date), 'YYYY-MM-DD') as anchor
      from tasks t
      where t.user_id = ${uid}
        and t.recurrence is not null
        and t.parent_id is null
        and coalesce(t.scheduled_for, t.due_at::date) < current_date
        and not exists (select 1 from tasks c where c.recurrence_of = t.id)
    `;

    let created = 0;
    for (const head of heads) {
      if (!isRecurrence(head.recurrence) || head.anchor === null) continue;
      let prev = head.id;
      for (const day of occurrencesAfter(head.recurrence, head.anchor, today)) {
        const [row] = await tx<{ id: string }[]>`
          insert into tasks (
            user_id, title, notes, project_id, goal_id, est_minutes, priority,
            due_at, scheduled_for, recurrence, recurrence_of, series_id, sort_order
          )
          select t.user_id, t.title, t.notes, t.project_id, t.goal_id, t.est_minutes, t.priority,
                 ${day}::date, ${day}::date, t.recurrence, t.id, coalesce(t.series_id, t.id),
                 coalesce((select max(sort_order) from tasks where user_id = ${uid}), 0) + 1000
          from tasks t
          where t.id = ${prev} and t.user_id = ${uid}
          on conflict (recurrence_of) where recurrence_of is not null do nothing
          returning id
        `;
        if (!row) break; // already extended; stop rather than fork the chain
        prev = row.id;
        created++;
      }
    }

    const closed = await tx<{ id: string }[]>`
      update tasks
      set status = 'missed'
      where user_id = ${uid}
        and recurrence is not null
        and status = 'todo'
        and due_at < current_date - ${MISSED_AFTER_DAYS}::int
      returning id
    `;
    return { created, missed: closed.length };
  });
}

/**
 * Move an open task to another day. The count is the point: a task pushed five
 * times is telling you something. For a habit occurrence only the due date
 * moves; its cadence day stays put, so the habit's schedule isn't shifted.
 */
export async function rescheduleTask(id: string, day: string): Promise<boolean> {
  const sql = db();
  const uid = await currentUserId();
  const rows = await sql<{ id: string }[]>`
    update tasks
    set due_at = ${day}::date,
        reschedule_count = reschedule_count + 1
    where id = ${id}
      and user_id = ${uid}
      and status in ('todo', 'doing')
    returning id
  `;
  return rows.length > 0;
}

export type HabitStat = {
  seriesId: string;
  title: string;
  recurrence: Recurrence;
  done: number;
  missed: number;
  skipped: number;
  open: number;
};

export async function habitStats(): Promise<HabitStat[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<HabitStat[]>`
    select series_id, title, recurrence, done, missed, skipped, open
    from v_habit_stats
    where user_id = ${uid}
    order by title
  `;
}

export type SlippingTask = {
  id: string;
  title: string;
  rescheduleCount: number;
  dueDay: string | null;
};

/** Open tasks that keep getting pushed. */
export async function slippingTasks(minimum = 2): Promise<SlippingTask[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<SlippingTask[]>`
    select id, title, reschedule_count, to_char(due_at, 'YYYY-MM-DD') as due_day
    from tasks
    where user_id = ${uid}
      and status in ('todo', 'doing')
      and reschedule_count >= ${minimum}
    order by reschedule_count desc, due_at nulls last
    limit 5
  `;
}
