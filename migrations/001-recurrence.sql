-- Recurring tasks: "read a book" every day, standup every weekday.
--
-- `tasks.recurrence` already existed (typed as an RRULE string, never used).
-- This narrows it to a closed vocabulary and adds the link between one
-- occurrence and the next.
--
-- Safe to run against an existing database; idempotent.

alter table tasks
  drop constraint if exists task_recurrence_known;

alter table tasks
  add constraint task_recurrence_known
  check (recurrence is null or recurrence in ('daily', 'weekdays', 'weekly'));

-- Which occurrence spawned this one. Set null rather than cascade: deleting
-- last Tuesday's reading must not delete today's, which is real outstanding
-- work. Used to undo the spawn when a completion is reversed.
alter table tasks
  add column if not exists recurrence_of uuid references tasks(id) on delete set null;

create index if not exists idx_tasks_recurrence_of
  on tasks(recurrence_of) where recurrence_of is not null;
