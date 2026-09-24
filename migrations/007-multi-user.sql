-- ============================================================
-- 007 — one database, many people
--
-- Cadence was built single-user: every table was implicitly "yours" and every view
-- aggregated the whole database. This makes ownership explicit.
--
-- Three things have to change together, or the app leaks:
--
--   1. Every table that holds someone's work gets `user_id`, not null.
--   2. Every unique index that was global becomes per-user — one running timer
--      *each*, one quest draw per person per day, one notification claim per
--      person. Left global, the first user to start a timer would block
--      everyone else's.
--   3. Every view carries `user_id` through, because a view that aggregates
--      across users is a data leak that no amount of care in the query layer
--      can fix.
--
-- Idempotent, like the others: safe to re-run.
-- ============================================================

-- ---------- people ----------
create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  -- Null until an account is linked to Telegram. The owner account below
  -- starts unlinked so existing work isn't stranded.
  telegram_id  bigint unique,
  username     text,
  first_name   text,
  last_name    text,
  photo_url    text,
  -- Which dictionary to render for them, remembered across devices. Telegram
  -- tells us their app language on first sign-in; after that it's their choice.
  locale       text        not null default 'en',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint users_locale_known check (locale in ('en', 'ru'))
);

create index if not exists users_telegram_idx on users (telegram_id)
  where telegram_id is not null;

-- ---------- the owner account ----------
-- A fixed id, so this migration is idempotent and so CADENCE_OWNER_TELEGRAM_ID in the
-- environment can name it. Everything that existed before multi-user becomes
-- this account's; linking a Telegram id to it later carries that history over.
insert into users (id, first_name, locale)
values ('00000000-0000-0000-0000-000000000001', 'Owner', 'en')
on conflict (id) do nothing;

-- ---------- ownership columns ----------
do $$
declare
  owner_id constant uuid := '00000000-0000-0000-0000-000000000001';
  t text;
begin
  foreach t in array array[
    'goals', 'projects', 'tasks', 'time_sessions', 'events',
    'tags', 'notification_log', 'quests'
  ] loop
    execute format(
      'alter table %I add column if not exists user_id uuid references users(id) on delete cascade',
      t
    );
    execute format('update %I set user_id = %L where user_id is null', t, owner_id);
    execute format('alter table %I alter column user_id set not null', t);
    execute format('create index if not exists %I on %I (user_id)', t || '_user_idx', t);
  end loop;
end $$;

-- ---------- per-user uniqueness ----------

-- One running timer each. Global, this said "one running timer in the world".
drop index if exists one_running_session;
create unique index if not exists one_running_session_per_user
  on time_sessions (user_id)
  where ended_at is null;

-- One claim per person per thing-worth-saying.
drop index if exists notification_log_once;
create unique index if not exists notification_log_once
  on notification_log (user_id, kind, dedupe_key);

-- One draw per person per day.
drop index if exists quests_day_kind;
create unique index if not exists quests_day_kind
  on quests (user_id, day, kind);

-- Tag names collide across people, and should.
alter table tags drop constraint if exists tags_name_key;
create unique index if not exists tags_user_name on tags (user_id, name);

-- Hot paths, now that every read filters on the owner first.
create index if not exists tasks_user_status_due_idx on tasks (user_id, status, due_at);
create index if not exists sessions_user_started_idx on time_sessions (user_id, started_at desc);
create index if not exists events_user_range_idx     on events (user_id, starts_at, ends_at);

-- ============================================================
-- Views, rebuilt with user_id carried through.
-- Dropped in dependency order; cascade would take the dependants silently.
-- ============================================================

drop view if exists v_daily_activity;
drop view if exists v_calibration;
drop view if exists v_estimate_accuracy;
drop view if exists v_planned_vs_actual;
drop view if exists v_goal_progress;
drop view if exists v_throughput;
drop view if exists v_habit_stats;
drop view if exists v_focus_by_hour;
drop view if exists v_task_actuals;

create view v_task_actuals as
select
  t.id                       as task_id,
  t.user_id,
  t.title,
  t.goal_id,
  t.est_minutes,
  coalesce(sum(
    extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))
  ) filter (where s.kind = 'focus'), 0)::bigint as actual_seconds
from tasks t
left join time_sessions s on s.task_id = t.id
group by t.id;

create view v_estimate_accuracy as
select
  a.task_id,
  a.user_id,
  a.title,
  a.est_minutes                              as estimated_minutes,
  round(a.actual_seconds / 60.0)::int        as actual_minutes,
  round((a.actual_seconds / 60.0) / nullif(a.est_minutes, 0), 2) as ratio
from v_task_actuals a
join tasks t on t.id = a.task_id
where t.status = 'done'
  and a.est_minutes is not null
  and a.actual_seconds > 0;

create view v_focus_by_hour as
select
  s.user_id,
  date_trunc('hour', s.started_at)                       as hour_bucket,
  extract(dow  from s.started_at)::int                   as day_of_week,
  extract(hour from s.started_at)::int                   as hour_of_day,
  sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)))::bigint as focus_seconds,
  sum(s.interruptions)::int                              as interruptions
from time_sessions s
where s.kind = 'focus'
group by 1, 2, 3, 4;

create view v_planned_vs_actual as
with planned as (
  select t.goal_id,
         date_trunc('week', coalesce(t.due_at, t.created_at)) as week,
         sum(t.est_minutes)::int as planned_minutes
  from tasks t
  where t.est_minutes is not null and t.goal_id is not null
  group by 1, 2
),
actual as (
  select t.goal_id,
         date_trunc('week', s.started_at) as week,
         round(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))) / 60.0)::int
           as actual_minutes
  from time_sessions s
  join tasks t on t.id = s.task_id
  where s.kind = 'focus' and t.goal_id is not null
  group by 1, 2
)
select
  g.id                           as goal_id,
  g.user_id,
  g.title                        as goal_title,
  g.color_slot,
  coalesce(p.week, a.week)       as week,
  coalesce(p.planned_minutes, 0) as planned_minutes,
  coalesce(a.actual_minutes, 0)  as actual_minutes
from planned p
full join actual a on a.goal_id = p.goal_id and a.week = p.week
join goals g on g.id = coalesce(p.goal_id, a.goal_id);

create view v_goal_progress as
with counts as (
  select
    g.id,
    count(t.id) filter (where t.status not in ('cancelled', 'missed')) as total_tasks,
    count(t.id) filter (where t.status = 'done')            as done_tasks,
    count(t.id) filter (
      where t.status = 'done' and t.completed_at > now() - interval '14 days'
    )                                                       as done_last_14d
  from goals g
  left join tasks t on t.goal_id = g.id
  group by g.id
)
select
  g.id                as goal_id,
  g.user_id,
  g.title,
  g.status,
  g.target_date,
  g.color_slot,
  c.total_tasks,
  c.done_tasks,
  case when c.total_tasks = 0 then 0
       else round(c.done_tasks::numeric / c.total_tasks, 3) end as progress,
  case when c.done_last_14d = 0 or c.total_tasks = c.done_tasks then null
       else ceil((c.total_tasks - c.done_tasks) / (c.done_last_14d / 14.0))
  end                 as projected_days_remaining
from goals g
join counts c on c.id = g.id;

-- The throughput chart wants an unbroken run of days, including empty ones, so
-- the series is crossed with users rather than left joined onto tasks alone —
-- otherwise a day nobody touched has no user to belong to.
create view v_throughput as
select
  u.id     as user_id,
  d::date  as day,
  count(t.id) filter (where t.created_at::date   = d::date) as created,
  count(t.id) filter (where t.completed_at::date = d::date) as completed
from users u
cross join generate_series(now() - interval '90 days', now(), interval '1 day') d
left join tasks t
  on t.user_id = u.id
 and (t.created_at::date = d::date or t.completed_at::date = d::date)
group by 1, 2;

create view v_calibration as
select
  a.task_id,
  a.user_id,
  a.title,
  a.est_minutes                                       as estimated_minutes,
  round(a.actual_seconds / 60.0)::int                 as actual_minutes,
  ((a.actual_seconds / 60.0) / a.est_minutes)::float8  as ratio,
  t.completed_at
from v_task_actuals a
join tasks t on t.id = a.task_id
where t.status = 'done'
  and a.est_minutes is not null
  and a.est_minutes > 0
  and a.actual_seconds > 0;

create view v_daily_activity as
with focus as (
  select user_id,
         date_trunc('day', hour_bucket)::date   as day,
         round(sum(focus_seconds) / 60.0)::int  as focus_minutes
  from v_focus_by_hour
  group by 1, 2
),
completions as (
  select user_id, completed_at::date as day, count(*)::int as tasks_completed
  from tasks where completed_at is not null group by 1, 2
)
select coalesce(f.user_id, c.user_id) as user_id,
       coalesce(f.day, c.day)         as day,
       coalesce(f.focus_minutes, 0)   as focus_minutes,
       coalesce(c.tasks_completed, 0) as tasks_completed
from focus f
full join completions c on c.day = f.day and c.user_id = f.user_id;

create view v_habit_stats as
select
  t.user_id,
  coalesce(t.series_id, t.id)                                  as series_id,
  (array_agg(t.title order by t.scheduled_for desc))[1]        as title,
  (array_agg(t.recurrence order by t.scheduled_for desc))[1]   as recurrence,
  count(*) filter (where t.status = 'done')::int               as done,
  count(*) filter (where t.status = 'missed')::int             as missed,
  count(*) filter (where t.status = 'cancelled')::int          as skipped,
  count(*) filter (where t.status in ('todo', 'doing'))::int   as open
from tasks t
where t.recurrence is not null
  and coalesce(t.scheduled_for, t.due_at::date) >= current_date - 30
  and coalesce(t.scheduled_for, t.due_at::date) <  current_date
group by 1, 2;
