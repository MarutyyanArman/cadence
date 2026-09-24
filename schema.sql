-- ============================================================
-- Cadence — Postgres schema (multi-user; sign-in is Telegram's, see lib/telegram.ts)
-- Run against Supabase or local Postgres 15+.
-- All timestamps are UTC (timestamptz). Render in the user's zone client-side.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type goal_status    as enum ('active', 'paused', 'done', 'abandoned');
-- missed: a repeating occurrence whose two-day window closed undecided.
create type task_status    as enum ('todo', 'doing', 'done', 'cancelled', 'missed');
create type session_kind   as enum ('focus', 'break', 'interrupted');

-- ---------- people ----------
-- Everything below belongs to exactly one of these. An account is created on
-- first sign-in from Telegram; nothing else creates one.
create table users (
  id           uuid primary key default gen_random_uuid(),
  -- Null until linked. The owner account below starts unlinked, so a fresh
  -- install has somewhere for pre-account data to live.
  telegram_id  bigint unique,
  username     text,
  first_name   text,
  last_name    text,
  photo_url    text,
  -- Which dictionary to render, remembered across devices. Telegram supplies
  -- the first guess; the EN/RU switch overrides it from then on.
  locale       text        not null default 'en',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint users_locale_known check (locale in ('en', 'ru'))
);

create index users_telegram_idx on users (telegram_id) where telegram_id is not null;

-- A fixed id so migrations and CADENCE_OWNER_TELEGRAM_ID can both name it.
insert into users (id, first_name, locale)
values ('00000000-0000-0000-0000-000000000001', 'Owner', 'en')
on conflict (id) do nothing;

-- ---------- goals ----------
create table goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  title        text        not null,
  description  text,
  category     text,                                   -- maps to a chart colour slot
  color_slot   smallint    not null default 1 check (color_slot between 1 and 6),
  target_date  date,
  target_value numeric,                                -- optional measurable target
  target_unit  text,                                   -- 'hours', 'chapters', 'kg'...
  status       goal_status not null default 'active',
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

-- ---------- projects (optional grouping under a goal) ----------
create table projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  goal_id    uuid references goals(id) on delete set null,
  name       text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ---------- tasks ----------
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references users(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,
  goal_id       uuid references goals(id)    on delete set null,
  parent_id     uuid references tasks(id)    on delete cascade,  -- subtasks
  title         text        not null,
  notes         text,
  status        task_status not null default 'todo',
  priority      smallint    not null default 3 check (priority between 1 and 4),
  est_minutes   integer     check (est_minutes > 0),
  due_at        timestamptz,
  sort_order    double precision not null default 1000,          -- fractional reindexing for drag-and-drop
  recurrence    text,                                            -- 'daily' | 'weekdays' | 'weekly', null = one-off
  -- Which occurrence spawned this one. Set null rather than cascade: deleting
  -- last Tuesday's reading must not delete today's, which is outstanding work.
  recurrence_of uuid references tasks(id) on delete set null,
  -- The first occurrence's id, shared by every occurrence of the habit. An
  -- identity rather than a foreign key, so deleting the first doesn't split it.
  series_id     uuid,
  -- Which cadence day an occurrence belongs to. due_at can be rescheduled;
  -- this can't, so moving one day doesn't shift the whole habit.
  scheduled_for date,
  reschedule_count integer not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint task_recurrence_known
    check (recurrence is null or recurrence in ('daily', 'weekdays', 'weekly'))
);

create index tasks_user_idx           on tasks (user_id);
create index tasks_user_status_due_idx on tasks (user_id, status, due_at);
create index tasks_status_due_idx      on tasks (status, due_at);
create index tasks_goal_idx       on tasks (goal_id);
create index tasks_completed_idx  on tasks (completed_at) where completed_at is not null;
-- At most one successor per occurrence, so two writers can't fork a habit.
create unique index tasks_one_successor on tasks (recurrence_of) where recurrence_of is not null;
create index tasks_series_idx on tasks (series_id) where series_id is not null;

-- ---------- time sessions ----------
-- Server-authoritative: the client never holds the elapsed count.
-- A running session is simply one with ended_at is null.
create table time_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid         not null references users(id) on delete cascade,
  task_id     uuid references tasks(id) on delete set null,
  goal_id     uuid references goals(id) on delete set null,
  kind        session_kind not null default 'focus',
  started_at  timestamptz  not null default now(),
  ended_at    timestamptz,
  interruptions smallint   not null default 0,
  note        text,
  constraint session_order check (ended_at is null or ended_at > started_at)
);

-- At most one running session *per person*. Global, this would mean the first
-- user to start a timer stopped anyone else from starting one.
create unique index one_running_session_per_user
  on time_sessions (user_id)
  where ended_at is null;

create index sessions_user_idx    on time_sessions (user_id);
create index sessions_user_started_idx on time_sessions (user_id, started_at desc);
create index sessions_started_idx on time_sessions (started_at desc);
create index sessions_task_idx    on time_sessions (task_id);

-- ---------- calendar events ----------
-- Real appointments AND time blocks. A block links to a task; an appointment doesn't.
create table events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  task_id    uuid references tasks(id) on delete cascade,
  title      text        not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  all_day    boolean     not null default false,
  location   text,
  recurrence text,
  created_at timestamptz not null default now(),
  constraint event_order check (ends_at > starts_at)
);

create index events_user_idx       on events (user_id);
create index events_user_range_idx on events (user_id, starts_at, ends_at);
create index events_range_idx      on events (starts_at, ends_at);

-- ---------- tags ----------
create table tags (
  id    uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- Two people may both have a "reading" tag, and should.
  name  text not null,
  color_slot smallint not null default 1 check (color_slot between 1 and 6)
);

-- Two people may both tag something "reading"; the name is unique per person.
create unique index tags_user_name on tags (user_id, name);

create table task_tags (
  task_id uuid references tasks(id) on delete cascade,
  tag_id  uuid references tags(id)  on delete cascade,
  primary key (task_id, tag_id)
);

-- ============================================================
-- Views — every chart reads from here, never from client-side aggregation
-- ============================================================

-- ---------- notification log ----------
-- What Cadence has already said. The unique index is the mechanism: a client
-- claims a notification by inserting, and a conflicting insert means another
-- tab already showed it.
create table notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  kind       text        not null,
  dedupe_key text        not null,   -- the day, or the task id
  sent_at    timestamptz not null default now()
);
create unique index notification_log_once on notification_log (user_id, kind, dedupe_key);
create index notification_log_sent_idx on notification_log (sent_at desc);

-- ---------- quests ----------
-- Only the day's *selection* is stored; progress is derived from the record.
-- Selection has to be, because eligibility depends on the state of the list at
-- the moment of the draw.
create table quests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  day        date        not null,
  kind       text        not null,
  target     integer     not null check (target > 0),
  created_at timestamptz not null default now(),
  constraint quest_kind_known check (kind in (
    'focus_block', 'focus_minutes', 'finish_count', 'estimate_accuracy', 'stale_task'
  ))
);
create unique index quests_day_kind on quests (user_id, day, kind);
create index quests_day_idx on quests (day desc);

-- ============================================================
-- Views — every chart reads from here, never from client-side aggregation.
-- Each one carries user_id through: a view that aggregates across accounts
-- is a leak no amount of care in lib/queries.ts can undo.
-- ============================================================

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
