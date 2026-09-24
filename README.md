# Arc

Goals, tasks and time — with the gap between planned and actual measured.

Most task apps score volume: tasks closed, days logged. Volume is trivially
gamed — split a task in two and you scored twice. Arc stores an estimate next
to every actual, so the number it puts in front of you is one you can only move
by getting better at judging your own work.

Runs as a **Telegram Mini App**, in English and Russian, on a phone or a
desktop. Everyone who opens it gets their own account and their own data.

---

## What's in it

| | |
|---|---|
| **Today** | One list, plus an Overdue section that asks for a decision instead of letting things rot |
| **Calendar** | Drag a task onto a week grid to block out time; drag the block to move or resize it |
| **Timer** | Server-authoritative Pomodoro, with a pace bar racing the task's own estimate |
| **Analytics** | Estimate accuracy, planned vs actual, throughput, a focus heatmap, habit completion rates |
| **Recap** | The handful of facts about a week that are worth reading |
| **Calibration** | A score out of 100 for how close your estimates land. Symmetric and logarithmic, so padding estimates doesn't help |
| **Streaks, XP, quests** | Deliberately quiet. A daily XP cap, rest days, three small objectives drawn per person per day, and notifications that never scold |

Two languages, switched from the nav and remembered per account. Russian gets
its own plural rules and genitive month names, not a word-for-word substitution.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Postgres 16 via
[postgres.js] · zod v4 · tsx for scripts. No ORM, no state library, no auth
library — sign-in is Telegram's HMAC plus forty lines of cookie signing.

[postgres.js]: https://github.com/porsager/postgres

## Running it locally

```bash
npm install
cp .env.example .env.local
```

Fill in `ARC_SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Postgres, if you don't have one:

```bash
docker run -d --name arc-postgres --restart unless-stopped -e POSTGRES_PASSWORD=arc -e POSTGRES_DB=arc -p 5433:5432 -v arc-pgdata:/var/lib/postgresql/data postgres:16
```

Load the schema and start:

```bash
psql "postgres://postgres:arc@localhost:5433/arc" -f schema.sql
npm run dev
```

`ARC_DEV_USER_ID` in `.env.example` points at the owner account, so localhost
works without going through Telegram. It is ignored when `NODE_ENV=production`.

**Upgrading an existing database** rather than starting fresh: `schema.sql` is
for new installs only. Apply the files in `migrations/` in order — each one is
idempotent, so re-running it is harmless.

## Deploying, and connecting the bot

A Mini App has to load over HTTPS, so localhost won't do — and GitHub alone
can't host it either, since this is a server app with a live database behind
it. Any Node host works; these are the steps for Vercel plus hosted Postgres.

1. **Database.** Create one on [Neon](https://neon.tech) or similar and run
   `schema.sql` against it. Managed Postgres usually needs `?sslmode=require`
   on the connection string.
2. **Deploy.** Import this repo on [Vercel](https://vercel.com) and set the
   environment variables from `.env.example`: `DATABASE_URL`,
   `ARC_SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`,
   `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Every push to `main` redeploys.
3. **Bot.** In [@BotFather](https://t.me/BotFather): `/newbot` for a token,
   then `/newapp` to attach a Mini App pointing at the deployed URL.
4. **Claim your history**, if you had data before accounts existed: set
   `ARC_OWNER_TELEGRAM_ID` to your Telegram numeric id (ask
   [@userinfobot](https://t.me/userinfobot)) and sign in once.

## How it's built

Three ideas carry most of the design.

**Derived, not stored.** Streaks, XP, calibration, goal progress and quest
progress are all computed from the record. A streak kept in a column drifts the
moment you log time against a past day; a streak derived from the record
recomputes and is right again. Only two things get written down: which quests
were drawn, and which notifications have already been shown.

**Lazy writes on first look.** There is no scheduler. The daily quest draw and
the habit rollover happen the first time someone opens the app that day, made
idempotent by unique indexes and a per-user advisory lock — six tabs opening at
once still produce exactly one chain of occurrences.

**Ownership lives in the schema, not the query layer.** Every table carries
`user_id`, every view carries it through, and every query resolves its caller
through one function rather than taking a parameter that forty call sites could
forget. A view that aggregates across accounts is a leak no amount of care in
`lib/queries.ts` can undo.

`SETUP.md` is the long version: what each feature does, why it works that way,
and the bugs found along the way.

## Invariants worth knowing

- **One timer per person, enforced in Postgres.** A partial unique index on
  `(user_id) where ended_at is null`. Global — as it was before multi-user —
  the first person to start a timer would have stopped anyone else starting one.
- **Elapsed time is never held client-side.** It is derived from `started_at`,
  counting open sessions against `now()`. Closing a tab can't lose time, and
  nothing is written per second, so a crash or a dead battery loses nothing.
- **Elapsed time corrects for clock drift.** Every session read returns the
  database's `now()`; the offset against the browser clock is measured once and
  applied to every tick.
- **Completing a task closes its running session** and, if it repeats, writes
  the next occurrence — all in one transaction.
- **A habit's cadence day is stored apart from its due date.** Rescheduling
  Tuesday's reading to Friday moves only that one day; Wednesday and Thursday
  still get their own.
- **Blocks are clamped to 15–720 minutes server-side**, so a mis-drag can't
  create a one-second or three-day block.
- **The calendar body is client-mounted only.** The server runs in UTC and the
  browser does not; server-rendering absolute block positions would mismatch on
  hydration. A skeleton reserves the space until mount.
- **`count(*)` is bigint, which postgres.js returns as a string.** Any
  comparison against a number has to cast.
- **The timer is mounted per page, not in the root layout**, because the layout
  also renders the statically generated 404 and a database read there would
  break `next build` on a machine with no `DATABASE_URL`.

## Tests

```bash
npm run verify
```

Eighteen suites. Eight are pure and need nothing; the rest run against a live
database and clean up after themselves. The ones worth knowing about:

- `verify:multiuser` — two accounts, every read and write path, proving neither
  can see or touch the other's rows, and that deleting one leaves the other
  intact
- `verify:telegram` — the sign-in signature, written as a series of forgery
  attempts: edit the user, reuse a stale blob, sign with another bot's token
- `verify:i18n` — that no Russian string is still English, that the plural
  forms are right at 1, 2, 5, 11–14 and 21, and that every copy function
  actually uses its argument
- `verify:overdue` — the two-day window, and what happens to a habit day nobody
  decided about

## Licence

MIT.
