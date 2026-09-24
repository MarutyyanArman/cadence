-- Calibration: how close estimates land to reality.
--
-- v_estimate_accuracy already emits a ratio, but rounds it to 2dp and has no
-- completed_at — so it can't answer "the last 30". This view is the same idea
-- with the ordering key, full precision, and one deliberate cast.
--
-- Safe to run against an existing database; idempotent.

-- `(seconds / 60.0) / est` is numeric, and postgres.js hands numeric back as a
-- *string* to avoid precision loss. Math.log2("1.5") would work by coercion and
-- Math.abs would too, so this bug hides until an average comes out wrong.
-- float8 returns a real number. The same trap already cost this project one
-- empty-state check, per the README.
create or replace view v_calibration as
select
  a.task_id,
  a.title,
  a.est_minutes                                              as estimated_minutes,
  round(a.actual_seconds / 60.0)::int                        as actual_minutes,
  ((a.actual_seconds / 60.0) / a.est_minutes)::float8         as ratio,
  t.completed_at
from v_task_actuals a
join tasks t on t.id = a.task_id
where t.status = 'done'
  and a.est_minutes is not null
  and a.est_minutes > 0
  and a.actual_seconds > 0;
