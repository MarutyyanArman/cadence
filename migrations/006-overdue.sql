-- Overdue tasks and missed habit days.
--
-- One-off tasks past their due date stay open until you decide: do it today,
-- move it, or drop it. Repeating tasks keep generating today's occurrence even
-- when an earlier one is unfinished; the earlier one stays open for two days,
-- then is recorded as missed — so a missed day is a record, not a disappearance.
--
-- Safe to run against an existing database; idempotent.

-- A status for "the window closed and nobody decided". Distinct from
-- cancelled, which is a choice you made.
alter type task_status add value if not exists 'missed';

-- How many times a task has been moved. A task pushed five times is telling you
-- something, and the stale-task quest wants to know.
alter table tasks add column if not exists reschedule_count integer not null default 0;

-- Every occurrence of a habit shares the id of the first one, so its history
-- can be grouped without walking the chain. Deliberately not a foreign key: it
-- is an identity, and deleting the first occurrence must not split a habit's
-- record in two.
alter table tasks add column if not exists series_id uuid;

with recursive chain as (
  select id, id as root from tasks where recurrence is not null and recurrence_of is null
  union all
  select t.id, c.root from tasks t join chain c on t.recurrence_of = c.id
)
update tasks t set series_id = c.root
from chain c
where t.id = c.id and t.id <> c.root and t.series_id is null;

create index if not exists tasks_series_idx on tasks (series_id) where series_id is not null;

-- An occurrence has at most one successor. setTaskStatus already guarded this
-- with `not exists`; now that the daily rollover also writes successors, two
-- writers could race, and this index makes the loser fail rather than fork the
-- habit into two parallel chains.
drop index if exists idx_tasks_recurrence_of;
create unique index if not exists tasks_one_successor
  on tasks (recurrence_of) where recurrence_of is not null;

-- Which day of the habit's cadence an occurrence belongs to — separate from
-- due_at, which is when you intend to do it. Rescheduling Tuesday's reading to
-- Friday moves due_at and leaves scheduled_for on Tuesday. Without the split,
-- the chain would restart from Friday and silently skip Wednesday and Thursday.
alter table tasks add column if not exists scheduled_for date;

update tasks set scheduled_for = coalesce(due_at::date, created_at::date)
where recurrence is not null and scheduled_for is null;

-- A repeating task with no due date can't know which days it missed. Anchor
-- any that exist to the day they were created; new ones get today on insert.
update tasks set due_at = created_at::date
where recurrence is not null and due_at is null;

-- Goal progress: dropped and missed work isn't work still left to do, so it
-- leaves the total. Otherwise cancelling a task would make a goal look further
-- from done.
create or replace view v_goal_progress as
with counts as (
  select
    g.id,
    count(t.id) filter (where t.status not in ('cancelled', 'missed'))  as total_tasks,
    count(t.id) filter (where t.status = 'done')                         as done_tasks,
    count(t.id) filter (
      where t.status = 'done' and t.completed_at > now() - interval '14 days'
    )                                                                    as done_last_14d
  from goals g
  left join tasks t on t.goal_id = g.id
  group by g.id
)
select
  g.id                as goal_id,
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

-- Each habit's last 30 finished days. Today is excluded: it isn't over.
create or replace view v_habit_stats as
select
  coalesce(t.series_id, t.id)                                          as series_id,
  (array_agg(t.title order by t.scheduled_for desc))[1]                as title,
  (array_agg(t.recurrence order by t.scheduled_for desc))[1]           as recurrence,
  count(*) filter (where t.status = 'done')::int                       as done,
  count(*) filter (where t.status = 'missed')::int                     as missed,
  count(*) filter (where t.status = 'cancelled')::int                  as skipped,
  count(*) filter (where t.status in ('todo', 'doing'))::int           as open
from tasks t
where t.recurrence is not null
  and coalesce(t.scheduled_for, t.due_at::date) >= current_date - 30
  and coalesce(t.scheduled_for, t.due_at::date) <  current_date
group by 1;
