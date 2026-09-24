-- One row per day you did anything: focused minutes and tasks finished.
--
-- Streaks, rest days and XP are all derived from this in TypeScript rather than
-- stored. A streak kept in a table drifts the moment you log time against a
-- past day; derived, it simply recomputes and is right again.
--
-- Deliberately not shipping a v_xp_daily alongside it: the daily XP cap would
-- then exist in SQL *and* in lib/streak.ts, and two copies of one rule drift.
-- The cap lives in TypeScript, where it is unit-tested.
--
-- Safe to run against an existing database; idempotent.

create or replace view v_daily_activity as
with focus as (
  select date_trunc('day', hour_bucket)::date   as day,
         round(sum(focus_seconds) / 60.0)::int  as focus_minutes
  from v_focus_by_hour
  group by 1
),
completions as (
  select completed_at::date as day,
         count(*)::int      as tasks_completed
  from tasks
  where completed_at is not null
  group by 1
)
select
  coalesce(f.day, c.day)             as day,
  coalesce(f.focus_minutes, 0)       as focus_minutes,
  coalesce(c.tasks_completed, 0)     as tasks_completed
from focus f
full join completions c on c.day = f.day;
