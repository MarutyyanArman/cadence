-- The three quests drawn for a given day.
--
-- Only the *selection* is stored. Progress is derived from the record, like
-- streaks and calibration, so it can't drift out of step with what you did.
--
-- Selection does have to be stored, though, and that is the difference: which
-- quests are eligible depends on the state of the list at the moment of the
-- draw. Left purely derived, finishing your last stale task at noon would make
-- that morning's quest vanish rather than complete.
--
-- Safe to run against an existing database; idempotent.

create table if not exists quests (
  id         uuid primary key default gen_random_uuid(),
  day        date        not null,
  kind       text        not null,
  target     integer     not null check (target > 0),
  created_at timestamptz not null default now(),
  constraint quest_kind_known check (kind in (
    'focus_block', 'focus_minutes', 'finish_count', 'estimate_accuracy', 'stale_task'
  ))
);

-- One of each kind per day, which is also what makes the generator idempotent:
-- two tabs loading at once both insert, and the loser's rows are discarded.
create unique index if not exists quests_day_kind on quests (day, kind);
create index if not exists quests_day_idx on quests (day desc);
