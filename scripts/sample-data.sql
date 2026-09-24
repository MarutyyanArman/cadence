-- Sample data, so the calibration score and the pace bar have something to show
-- before you've done three estimated tasks of your own.
--
-- Everything it creates is titled 'Sample: …'. To remove it all:
--
--   psql "$DATABASE_URL" -f scripts/sample-data.sql --set=remove=1
--
-- Running it twice is safe — it clears its own rows first either way.

-- Sessions must go before tasks: time_sessions.task_id is ON DELETE SET NULL,
-- so deleting a task leaves its sessions behind as orphaned focus time.
delete from time_sessions where task_id in (select id from tasks where title like 'Sample: %');
delete from tasks where title like 'Sample: %';

\if :{?remove}
  \echo 'Sample data removed.'
\else

do $$
declare
  -- title, estimate, what it actually took, days ago, attach to the reading goal
  rows constant text[][] := array[
    array['Read chapter 3',        '45',  '52',  '1', 'y'],
    array['Write weekly review',   '30',  '28',  '2', 'n'],
    array['Fix the login bug',     '60', '105',  '3', 'n'],
    array['Clear email backlog',   '20',  '22',  '4', 'n'],
    array['Plan the week',         '15',  '15',  '5', 'n'],
    array['Research notes',        '90', '120',  '6', 'n'],
    array['Read chapter 4',        '45',  '58',  '7', 'y']
  ];
  r text[];
  tid uuid;
  reading_goal uuid;
  finished timestamptz;
begin
  select id into reading_goal from goals
   where title ilike '%sapiens%' and archived_at is null limit 1;

  foreach r slice 1 in array rows loop
    finished := now() - make_interval(days => r[4]::int);

    insert into tasks (title, est_minutes, status, completed_at, created_at, goal_id)
    values ('Sample: ' || r[1], r[2]::int, 'done', finished,
            finished - interval '1 day',
            case when r[5] = 'y' then reading_goal else null end)
    returning id into tid;

    -- One focus session of exactly the actual duration, ending when it was ticked off.
    insert into time_sessions (task_id, goal_id, kind, started_at, ended_at)
    values (tid, case when r[5] = 'y' then reading_goal else null end, 'focus',
            finished - make_interval(mins => r[3]::int), finished);
  end loop;

  -- ...and one still running, 70% of the way through its estimate, so the pace
  -- bar has something to race. Watch it cross into amber at 85%.
  delete from time_sessions where ended_at is null;

  insert into tasks (title, est_minutes, status, goal_id)
  values ('Sample: Read chapter 5', 25, 'doing', reading_goal)
  returning id into tid;

  insert into time_sessions (task_id, goal_id, kind, started_at)
  values (tid, reading_goal, 'focus', now() - interval '17 minutes');
end $$;

\echo 'Sample data added: 7 finished tasks with estimates, 1 timer running.'
\endif
