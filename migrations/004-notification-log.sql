-- What Cadence has already said, so it doesn't say it twice.
--
-- The unique index is the whole mechanism. A client claims a notification by
-- inserting; if the insert conflicts, another tab already claimed it and this
-- one stays quiet. That makes "show it once" correct with several tabs open,
-- rather than merely unlikely.
--
-- Safe to run against an existing database; idempotent.

create table if not exists notification_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text        not null,
  -- The day for a once-a-day nudge, the task id for a one-off result.
  dedupe_key text        not null,
  sent_at    timestamptz not null default now()
);

create unique index if not exists notification_log_once
  on notification_log (kind, dedupe_key);

create index if not exists notification_log_sent_idx
  on notification_log (sent_at desc);
