import { db } from "./db";
import { currentUserId } from "./session";
import type { ColorSlot } from "./queries";

/* Every function here reads a view from schema.sql. No aggregation happens in
   the browser — the dataset grows without bound and the browser doesn't. */

export type WeekPoint = {
  goalId: string;
  goalTitle: string;
  colorSlot: ColorSlot;
  week: Date;
  plannedMinutes: number;
  actualMinutes: number;
};

export async function plannedVsActual(weeks = 8): Promise<WeekPoint[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<WeekPoint[]>`
    select goal_id, goal_title, color_slot, week, planned_minutes, actual_minutes
    from v_planned_vs_actual
    where user_id = ${uid}
      and week >= date_trunc('week', now()) - make_interval(weeks => ${weeks})
    order by week, goal_title
  `;
}

export type AccuracyPoint = {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  actualMinutes: number;
  ratio: number;
};

export async function estimateAccuracy(limit = 300): Promise<AccuracyPoint[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<AccuracyPoint[]>`
    select task_id, title, estimated_minutes, actual_minutes, ratio
    from v_estimate_accuracy
    where user_id = ${uid}
    order by actual_minutes desc
    limit ${limit}
  `;
}

export type ThroughputPoint = { day: Date; created: number; completed: number };

export async function throughput(days = 30): Promise<ThroughputPoint[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<ThroughputPoint[]>`
    select day, created, completed
    from v_throughput
    where user_id = ${uid}
      and day >= current_date - make_interval(days => ${days})
    order by day
  `;
}

export type HeatCell = {
  dayOfWeek: number; // 0 = Sunday, matching extract(dow)
  hourOfDay: number;
  focusMinutes: number;
  interruptions: number;
};

export async function focusHeatmap(days = 56): Promise<HeatCell[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<HeatCell[]>`
    select day_of_week,
           hour_of_day,
           round(sum(focus_seconds) / 60.0)::int as focus_minutes,
           sum(interruptions)::int               as interruptions
    from v_focus_by_hour
    where user_id = ${uid}
      and hour_bucket >= now() - make_interval(days => ${days})
    group by day_of_week, hour_of_day
    order by day_of_week, hour_of_day
  `;
}

export type DayFocus = { day: Date; minutes: number };

export async function dailyFocus(days = 365): Promise<DayFocus[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<DayFocus[]>`
    select date_trunc('day', hour_bucket)::date  as day,
           round(sum(focus_seconds) / 60.0)::int as minutes
    from v_focus_by_hour
    where user_id = ${uid}
      and hour_bucket >= current_date - make_interval(days => ${days})
    group by 1
    order by 1
  `;
}

/** `goalTitle` is null for untagged work — the words for that are the UI's. */
export type Allocation = { goalTitle: string | null; colorSlot: ColorSlot; minutes: number };

/** Where the time actually went, by goal. Untagged work is kept, not dropped. */
export async function allocation(days = 30): Promise<Allocation[]> {
  const sql = db();
  const uid = await currentUserId();
  return sql<Allocation[]>`
    select g.title                        as goal_title,
           coalesce(g.color_slot, 6)      as color_slot,
           round(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) / 60.0)::int
             as minutes
    from time_sessions s
    left join tasks t on t.id = s.task_id
    -- Fall back to the goal recorded on the session. startSession denormalises
    -- it precisely so attribution survives the task being deleted; resolving
    -- only through the task silently moves that time to "No goal".
    left join goals g on g.id = coalesce(t.goal_id, s.goal_id)
    where s.user_id = ${uid}
      and s.kind = 'focus'
      and s.started_at >= now() - make_interval(days => ${days})
    group by 1, 2
    having round(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) / 60.0) > 0
    order by minutes desc
  `;
}

export type Summary = {
  focusMinutes: number;
  sessions: number;
  interruptions: number;
  tasksCompleted: number;
  medianRatio: number | null;
};

export async function summary(days = 30): Promise<Summary> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<Summary[]>`
    with s as (
      select
        coalesce(round(sum(extract(epoch from (coalesce(ended_at, now()) - started_at))) / 60.0), 0)::int
          as focus_minutes,
        count(*)::int                as sessions,
        coalesce(sum(interruptions), 0)::int as interruptions
      from time_sessions
      where user_id = ${uid}
        and kind = 'focus' and started_at >= now() - make_interval(days => ${days})
    ),
    c as (
      select count(*)::int as tasks_completed
      from tasks
      where user_id = ${uid}
        and completed_at >= now() - make_interval(days => ${days})
    ),
    m as (
      select percentile_cont(0.5) within group (order by ratio) as median_ratio
      from v_estimate_accuracy
      where user_id = ${uid}
    )
    select s.focus_minutes, s.sessions, s.interruptions, c.tasks_completed, m.median_ratio
    from s, c, m
  `;
  return row;
}

/* ---------------- weekly recap ---------------- */

export type RecapExtreme = {
  title: string;
  estimatedMinutes: number;
  actualMinutes: number;
  ratio: number;
} | null;

export type WeekRecap = {
  /** Monday of the week being reported, as YYYY-MM-DD. */
  weekStart: string;
  focusMinutes: number;
  previousFocusMinutes: number;
  tasksCompleted: number;
  previousTasksCompleted: number;
  sessions: number;
  interruptions: number;
  /** Longest single unbroken session, in minutes. */
  longestSessionMinutes: number;
  /** Hour of day with the most focus this week, 0-23. */
  bestHour: number | null;
  daysActive: number;
  sharpest: RecapExtreme;
  worst: RecapExtreme;
  /** Habit days that belonged to this week: finished, and closed as missed. */
  habitDone: number;
  habitMissed: number;
  /** Open tasks moved three or more times, as of now. */
  slippingCount: number;
};

/**
 * One week, composed into the handful of facts worth reading.
 *
 * `weeksAgo` of 0 is the week in progress, 1 the week just finished — which is
 * the one a Sunday recap actually wants.
 */
export async function weekRecap(weeksAgo = 1): Promise<WeekRecap> {
  const sql = db();
  const uid = await currentUserId();
  const [row] = await sql<WeekRecap[]>`
    with bounds as (
      select date_trunc('week', current_date) - make_interval(weeks => ${weeksAgo}) as start
    ),
    win as (
      select start, start + interval '7 days' as finish,
             start - interval '7 days'        as prev_start
      from bounds
    ),
    focus as (
      select
        coalesce(round(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) / 60.0), 0)::int as minutes,
        count(*)::int                                                     as sessions,
        coalesce(sum(s.interruptions), 0)::int                            as interruptions,
        coalesce(max(round(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 60.0)), 0)::int as longest,
        count(distinct s.started_at::date)::int                           as days_active
      from time_sessions s, win w
      where s.user_id = ${uid}
        and s.kind = 'focus' and s.started_at >= w.start and s.started_at < w.finish
    ),
    prev_focus as (
      select coalesce(round(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) / 60.0), 0)::int as minutes
      from time_sessions s, win w
      where s.user_id = ${uid}
        and s.kind = 'focus' and s.started_at >= w.prev_start and s.started_at < w.start
    ),
    best_hour as (
      select extract(hour from s.started_at)::int as hour
      from time_sessions s, win w
      where s.user_id = ${uid}
        and s.kind = 'focus' and s.started_at >= w.start and s.started_at < w.finish
      group by 1
      order by sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) desc
      limit 1
    ),
    done as (
      select count(*)::int as n from tasks t, win w
      where t.user_id = ${uid}
        and t.completed_at >= w.start and t.completed_at < w.finish
    ),
    prev_done as (
      select count(*)::int as n from tasks t, win w
      where t.user_id = ${uid}
        and t.completed_at >= w.prev_start and t.completed_at < w.start
    ),
    -- Closest to 1 is the sharpest guess; furthest away in log space is the worst.
    ranked as (
      select c.title, c.estimated_minutes, c.actual_minutes, c.ratio,
             abs(ln(c.ratio) / ln(2)) as deviation
      from v_calibration c, win w
      where c.user_id = ${uid}
        and c.completed_at >= w.start and c.completed_at < w.finish
    )
    , habit as (
      select
        count(*) filter (where t.status = 'done')::int   as done,
        count(*) filter (where t.status = 'missed')::int as missed
      from tasks t, win w
      where t.user_id = ${uid}
        and t.recurrence is not null
        and t.scheduled_for >= w.start::date and t.scheduled_for < w.finish::date
    )
    select
      to_char((select start from win), 'YYYY-MM-DD')          as week_start,
      (select done from habit)                                as habit_done,
      (select missed from habit)                              as habit_missed,
      (select count(*)::int from tasks
        where user_id = ${uid}
          and status in ('todo', 'doing')
          and reschedule_count >= 3)                            as slipping_count,
      (select minutes from focus)                             as focus_minutes,
      (select minutes from prev_focus)                        as previous_focus_minutes,
      (select n from done)                                    as tasks_completed,
      (select n from prev_done)                               as previous_tasks_completed,
      (select sessions from focus)                            as sessions,
      (select interruptions from focus)                       as interruptions,
      (select longest from focus)                             as longest_session_minutes,
      (select hour from best_hour)                            as best_hour,
      (select days_active from focus)                         as days_active,
      (select to_jsonb(r) from (
        select title, estimated_minutes, actual_minutes, ratio
        from ranked order by deviation asc limit 1) r)        as sharpest,
      (select to_jsonb(r) from (
        select title, estimated_minutes, actual_minutes, ratio
        from ranked order by deviation desc limit 1) r)       as worst
  `;
  return row;
}
