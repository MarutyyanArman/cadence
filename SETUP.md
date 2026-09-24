# Arc — assembled build

The six download folders were **sequential phases of one project**, not six
projects. They are merged here. 31 files, every internal import resolves.

## What went where, and which duplicates won

| Phase folder | Contributed | Notes |
|---|---|---|
| `files/` | *(nothing)* | superseded — see below |
| `2files/` | `globals.css`, `layout.tsx`, `utils.ts`, `button.tsx` | design system |
| `3files/` | `schema.sql`, `db.ts`, 4 task components, `verify-queries.ts` | data layer |
| `4files/` | *(nothing)* | superseded by `5files` |
| `5files/` | `queries.ts`, `actions.ts`, `page.tsx`, timer ×2, `use-elapsed.ts`, `pomodoro.ts`, `verify-timer.ts` | timer |
| `6files/` | `analytics/page.tsx`, `analytics.ts`, 9 charts, `verify-analytics.ts`, `README.md` | analytics |

Duplicate resolution — later phase wins, and in two cases that mattered:

- **`schema.sql`: used `3files/`, not `files/`.** Not cosmetic. The `files/`
  version computed `v_planned_vs_actual` with one shared date expression across a
  triple join, which files a task's estimate under whatever week its *work* landed
  in. `3files/` splits it into two independent CTEs full-joined together — planned
  buckets by due week, actual by session week. The old one silently reports wrong
  numbers.
- **`files/tailwind.config.ts`: dropped deliberately.** It is a Tailwind **v3**
  config; this project is v4, where the `@theme` block in `globals.css` replaces
  it. Its own header says to keep one or the other, never both.
- `files/tokens.css` ≈ `2files/globals.css` (6 lines differ). Used `globals.css`
  — it names the real `@fontsource` families; `tokens.css` points at font
  variables that phase never defined.
- `4files/` vs `5files/` differ in only 2 files; `5files/page.tsx` adds the
  Analytics nav link. `queries.ts`, `actions.ts`, `timer-host.tsx` are byte-identical.
- `2files/page.tsx` was the button-matrix demo page — superseded by the real
  `app/page.tsx` from `5files/`.

## Files added to actually run this

Beyond the calendar (below), five files didn't exist in any of the six source
folders and were needed to build/run/test the project at all:

| File | Why |
|---|---|
| `package.json` | Never existed; dependency list is the union of every external import found in the code, not copied from a README |
| `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | Minimal configs matching what `create-next-app` would generate for this stack (TS strict, `@/*` alias, Tailwind v4 via `@tailwindcss/postcss`) |
| `scripts/seed.ts` | `verify-queries.ts` assumes a fixture that doesn't exist anywhere in the source — see "How far I verified it" below |

## Setup

```bash
npx create-next-app@latest arc --ts --tailwind --app --no-src-dir --eslint --import-alias "@/*" --turbopack
```

Copy this folder over the generated one (`app/globals.css` replaces the default), then:

```bash
npm i geist @fontsource-variable/inter @fontsource-variable/jetbrains-mono lucide-react clsx tailwind-merge class-variance-authority @radix-ui/react-slot postgres zod recharts && npm i -D tsx
```

That list is the union of every external import across all phases, verified
against the code — not copied from a README.

```bash
echo 'DATABASE_URL=postgres://user:pass@host:5432/arc' > .env.local
```

```bash
psql "$DATABASE_URL" -f schema.sql
```

**Set the database timezone to yours.** The app decides "is this due today"
in SQL, so a database running in UTC while you are not puts the two on
different calendar days for part of every evening — a daily task finished at
10pm comes back the same night. One statement fixes the whole class of bug
(due labels, `focusMinutesToday`, every analytics day-bucket):

```bash
psql "$DATABASE_URL" -c "alter database arc set timezone = 'Asia/Yerevan';"
```

Substitute your own zone. This is a deliberate single-user trade: it is one
line instead of threading a user timezone through every day-boundary query,
and it is wrong only if you move.

```bash
npm run verify:time && npm run verify:recurrence
```

Those two need no database — run them first. Then seed the fixture
`verify-queries.ts` expects, and run the integration scripts:

```bash
npm run seed
```

```bash
npm run verify
```

`npm run verify` runs all eighteen suites — pure logic first, then the database
ones, seeding and removing its own fixture so a real workspace is left as it
was. Every suite should end with an "all … pass" line. Then:

**Upgrading an existing database** rather than starting fresh: `schema.sql` is
for new installs only. Apply the files in `migrations/` in order — each is
idempotent, so re-running one is harmless.

(The `npm run verify:*` scripts pass `--env-file=.env.local` — `tsx` does not
read it the way `next` does, so running the raw `npx tsx scripts/...` form
fails with "DATABASE_URL is not set".)

```bash
npm run dev
```

Routes: `/` (tasks), `/calendar` (week view), `/analytics` (charts). Postgres 15+, Supabase string fine.

## The calendar — built, not recovered

No seventh folder existed, so I wrote the calendar UI against the backend that
was already present (`app/actions.ts` had the block actions, `lib/queries.ts`
had the reads). Seven new files:

| File | What it is |
|---|---|
| `lib/time.ts` | Week maths, 15-min snapping, pixel↔minute, lane packing, midnight splitting |
| `app/calendar/page.tsx` | The `?week=YYYY-MM-DD` route |
| `components/calendar/week-nav.tsx` | Prev / today / next, as links so the week is shareable |
| `components/calendar/calendar-body.tsx` | The mount gate — skeleton until the client has a local clock |
| `components/calendar/week-grid.tsx` | The grid: pointer-drag to move, drag the bottom edge to resize |
| `components/calendar/unscheduled-tray.tsx` | HTML5 drag source for tasks with no block |
| `scripts/verify-calendar.ts` | 22 integration checks |
| `scripts/verify-time.ts` | 37 pure-logic checks |

It follows the invariants the README already committed to: the body is
client-mounted only (the server runs in UTC, the browser does not, so SSR-ing
absolute block positions would mismatch on hydration); native HTML5 drag carries
a task from the tray into the grid because source and target are separate
components, while pointer events handle move and resize inside the grid where
the pixel→minute maths has to be exact; and blocks snap to 15 minutes with the
server clamping 15–720.

### How far I verified it

Everything below was actually executed — Node 22 in a Docker container, a real
Postgres 16 container, `next build`, `next dev`, and a real Chromium browser
driving real pointer/drag events. Nothing here is inferred or approximated.

**Pure logic** — `npx tsx scripts/verify-time.ts`: **37/37 pass**, including
Monday-first weeks, local-date `isoDay`, 7 distinct days across three DST-shift
weeks, snapping, clamping, px↔minute round-trip, and overnight splitting.

**Database integration**, against a live Postgres 16 with the real schema —
**69/69 pass** across all four scripts:

| Script | Result |
|---|---|
| `verify-queries.ts` | 13/13 |
| `verify-calendar.ts` | 22/22 |
| `verify-timer.ts` | 16/16 |
| `verify-analytics.ts` | 18/18 |

`verify-queries.ts` initially failed 1/13 — it assumes a seed fixture ("Ship Arc
v1", 2/3 done, a task with ~100 logged minutes) that doesn't exist in any of the
six source folders or in `schema.sql`. I wrote `scripts/seed.ts` from the
assertions themselves; run it once before `verify-queries.ts`. `verify-calendar.ts`
also had one bug — my own script read `row.starts_at` where `lib/db.ts`'s
`postgres.camel` transform means the column comes back as `row.startsAt`; fixed.

**Build** — `next build --turbopack`: **0 TypeScript errors**, compiles clean.
One real dependency bug surfaced here: `app/actions.ts` uses `z.uuid()` and
`z.iso.datetime()`, which are **Zod v4** top-level APIs — I had pinned `zod: ^3`
in `package.json` from the READMEs' unversioned `npm i zod`. Fixed to `^4.0.0`.

**Browser** — `next dev`, driven by a real Chromium instance: `/`, `/calendar`,
and `/analytics` all render correctly with live seeded data (Ship Arc v1 at
67%, 2/3 tasks; "Calendar drag" task at 1h 40m/1h 30m). On `/calendar`,
scheduling a task by native HTML5 drag from the tray, moving a block by pointer
drag, resizing by the bottom-edge handle, and unscheduling via the × button
were each exercised end-to-end with dispatched `DragEvent`/`PointerEvent`
sequences and checked against the database — **all four work correctly**, each
producing exactly one server call with the right computed time, and zero
console errors on a clean server process.

**A real, confirmed bug was found and fixed** in `week-grid.tsx`: the original
pointer-drag handler nested the server-action call (`moveEventTo` +
`router.refresh()`) inside a `setDrag(prev => ...)` functional state update.
React runs updater functions as part of processing a state change, where
`startTransition` may not be called — this threw `Cannot call startTransition
while rendering` on every real move gesture, crashing the page. Fixed by moving
every side effect out of the updater and into a plain event-listener callback,
and while at it, rewrote the listener lifecycle to attach exactly one
pointermove/pointerup pair per gesture (imperatively, at `pointerdown`) instead
of re-subscribing on every intermediate move. Verified clean on a fresh `next
dev` process afterward — zero errors, exactly-once submissions for move,
resize, and unschedule.

(One debugging detour worth naming honestly: mid-investigation, a *second*
Turbopack dev server — not yet restarted — kept showing the same crash after
the fix, purely because Fast Refresh had accumulated stale HMR patches from
many rapid edits in one session. A full container restart made it disappear.
That confusion is now resolved and had no bearing on the actual fix above,
which was verified independently against a fresh process.)

Not verified: the eight Recharts charts on `/analytics` (rendered, not
interacted with), touch input, the audio beep, the Notification permission
prompt, and whether the per-second timer tick survives a backgrounded tab.

## Repeating tasks

"Read a book" every day, standup every weekday. Three rules — `daily`,
`weekdays`, `weekly` — chosen in the composer's **Once** dropdown, shown on the
row as a ↻.

**Completing an occurrence writes the next one, in the same transaction.** One
row per occurrence, not one row whose due date slides forward. That matters
here specifically: this app's premise is measuring estimate against actual over
time, and a single sliding row has one `completed_at` and one actual-minutes
total — you would lose "30 min Monday, 45 min Tuesday", and throughput,
estimate accuracy and the consistency grid would all go blank for your most
frequent work. Row-per-occurrence makes every existing chart work unchanged.

Generating on completion rather than from a scheduled job also means no
backlog: come back from a week away and there is exactly one outstanding
"read a book", not seven.

**When the next one is due**: the first date matching the rule strictly after
the previous due date, rolled forward so it is never in the past. Tick off
Tuesday's reading on Wednesday morning and the next is due Wednesday, not
Thursday — anchoring to the completion date instead would quietly eat a day
every time you finished late.

**Undo is handled.** Completing spawns a successor; reopening from the
Completed list withdraws it again, so an accidental tick can't leave two copies
outstanding. A successor you have already logged time against is left alone —
that is real work, not a duplicate.

| File | What it is |
|---|---|
| `lib/recurrence.ts` | The three rules and the next-due-date maths, pure, on `YYYY-MM-DD` strings |
| `migrations/001-recurrence.sql` | Narrows `tasks.recurrence` to the three rules, adds `recurrence_of` |
| `scripts/verify-recurrence.ts` | 28 pure-logic checks |
| `scripts/verify-recurring-tasks.ts` | 21 integration checks |

Deliberately not RRULE: the iCalendar grammar covers "every 3rd Tuesday in
months ending in R", at the cost of a parser, a dependency, and a UI nobody can
read back. Monthly is also omitted — it needs end-of-month clamping rules
(31 Jan → 28 Feb) that are worth adding only if you actually want them.

### Known limits

- **Repeat can only be set when a task is created.** There is no task-edit UI
  in this app at all (`editTask` exists in `app/actions.ts` and nothing calls
  it), so making an existing task repeat means deleting and re-adding it.
- **A repeating task attached to a goal inflates that goal's counts.** After a
  month, a daily task is 30 of the goal's tasks. `v_goal_progress` counts rows;
  it does not know one of them is a habit. Leave habits unattached, or accept
  a progress bar that mostly reads "done".

## Motivation mechanics (phases 1 and 2)

Built from the proposal in "The Calibration Game". Two phases shipped.

### Phase 1 — the score you can't farm

| File | What it is |
|---|---|
| `lib/calibration.ts` | The scoring curve, pure |
| `migrations/002-calibration.sql` | `v_calibration` — ratios with full precision and an ordering key |
| `components/calibration-card.tsx` | The score, band, bias line and per-task strip |
| `scripts/verify-calibration.ts` | 34 pure-logic checks |

**Calibration score**: `100 × (1 − |log₂(actual ÷ estimate)|)`, floored at zero,
averaged over the last 30 finished tasks. Symmetric on purpose — finishing in
half the time scores exactly as badly as taking double, so padding every
estimate isn't a winning strategy. Logarithmic on purpose — 10 minutes out on a
20-minute task is an error, 10 minutes out on a day is noise.

**Pace bar**: while a timer runs, a strip races the task's estimate. Teal, amber
past 85%, coral past 100% with the overrun counting up. Deliberately a
different clock from the Pomodoro ring beside it: the ring counts down one
focus block, the strip counts against the whole task.

### Phase 2 — carrying across days

| File | What it is |
|---|---|
| `lib/streak.ts` | Streak, rest days, XP cap and ranks, all pure |
| `migrations/003-daily-activity.sql` | `v_daily_activity` — focus minutes and completions per day |
| `components/daily-stats.tsx` | The strip under the header |
| `scripts/verify-streak.ts` | 32 pure-logic checks |

**Streak**: a day counts at 15 focused minutes. One rest day is banked per
7-day run, up to 3, and a gap silently spends one. Two deliberate choices:

- **Today is never counted against you until it's over.** An unearned today
  leaves the streak standing and only flags it `atRisk`. A counter that reads
  zero every morning is the most demoralising thing this mechanic can do.
- **Nothing is stored.** Streak, credits and XP all derive from
  `v_daily_activity`. A stored streak drifts the moment you log time against a
  past day; a derived one recomputes and is right again. This replaces the
  `streak_credits` table the proposal called for — the rule is deterministic,
  so there was nothing worth writing down.

**XP and ranks**: one XP per focused minute, capped at 240 a day. The cap is the
feature: an uncapped score pays out most for a twelve-hour day, and twelve-hour
days are how people quit. Levels widen, so early ones come fast.

The proposal also called for a `v_xp_daily` view. Skipped deliberately — the cap
would then exist in SQL *and* in `lib/streak.ts`, and two copies of one rule
drift. It lives in TypeScript, where it's unit-tested.

### Phase 3 — a voice

| File | What it is |
|---|---|
| `lib/notifications.ts` | What Arc may say and when, pure |
| `lib/notification-prefs.ts` | Per-type toggles, in localStorage |
| `migrations/004-notification-log.sql` | `notification_log` — the claim table |
| `components/notifier.tsx` | Delivery. Renders nothing, mounted in the root layout |
| `components/notification-settings.tsx` | The toggles, in the rail |
| `scripts/verify-notifications.ts` | 33 pure-logic checks |
| `scripts/verify-notification-log.ts` | 14 integration checks |

Three messages, each written against one rule: **it names a specific thing and
costs nothing to ignore.**

- **How an estimate landed** — fires on completion. `Called it — 47m on a 45m
  estimate` when close, the same numbers without the praise when not. A missed
  estimate is reported, never scolded; there is a test asserting the copy
  contains no "only", "should", "failed" or "again".
- **Your best working hour** — fires once, in the hour `v_focus_by_hour` says
  you actually focus best, and only if you haven't started yet. Earns the
  interruption with a figure only Arc has, then names one open task.
- **Streak about to lapse** — after 8pm, only with a live streak not yet earned.
  Says what is still standing, what it costs, and offers a banked rest day.
  **Off by default**: it is the one most likely to feel like nagging, so it
  should be switched on deliberately rather than switched off in irritation.

All three stay silent while a timer is running — you're already working.

**Claim, then show.** A duplicate notification is worse than a missed one, so a
client inserts into `notification_log` *before* displaying; the unique index on
`(kind, dedupe_key)` means that with several tabs open exactly one wins. Tested
with eight simultaneous claims.

**The honest limit**: this only runs while an Arc tab is open. Real push with the
browser closed needs a service worker and a push service — genuine
infrastructure for an app on localhost. That is a deliberate stopping point,
and the settings card says so.

`Notifier` is mounted in the root layout so the evening notice reaches you on
any route. It is a client component that reads nothing at render time, so the
statically generated 404 still builds without a `DATABASE_URL`.

### Also fixed

- **`npm run verify` now runs standalone.** It seeds the fixture
  `verify-queries.ts` needs and removes it afterwards, so the suite leaves a
  real workspace exactly as it found it. Previously it failed on any database
  that hadn't been manually seeded, and polluted one that had.

### Phase 4 — variety, and a weekly close

| File | What it is |
|---|---|
| `lib/quests.ts` | The pool, the scoring and the seeded daily draw, pure |
| `migrations/005-quests.sql` | `quests` — the day's selection only |
| `components/quest-card.tsx` | Today's three, with live progress |
| `app/recap/page.tsx` | The `/recap` route, `?w=` weeks back |
| `scripts/verify-quests.ts` | 24 pure-logic checks |
| `scripts/verify-quests-db.ts` | 24 integration checks |

**Daily quests.** Five kinds — one unbroken block, total focus minutes, finish
three, land two estimates within 20%, and clear something carried over a week.
Three are drawn each day.

- **Only what the day could satisfy.** Issuing "finish 3 tasks" to someone with
  one task open is the fastest way to make the mechanic feel like noise, so the
  pool is filtered against the real list first. With a thin list you get two
  quests, not three padded ones.
- **The draw can't be rerolled.** Selection is seeded off the date, so a refresh
  returns the same three. A quest you can reroll is one you'll reroll until it's
  trivial.
- **Selection is stored, progress is not.** This is the one place a table was
  genuinely needed. Eligibility depends on the state of the list at the moment
  of the draw — left purely derived, finishing your last stale task at noon
  would make that morning's quest vanish rather than complete.
- **No reward attached.** Bolting XP onto a quest would pay you twice for what
  the streak and calibration already pay for, and stacking currencies is how
  these systems start feeling like an obligation.

**The recap** at `/recap` composes one week into the handful of facts worth
reading: hours focused against the week before, days worked, longest unbroken
stretch, the hour you actually did your best work, and your sharpest and
furthest-off estimate with the task named. `?w=2` steps further back. Every
figure comes from views that already existed — this is composition and copy,
not new data.

### Also fixed

- **`max-w-4xl` silently resolves to 64px in this project.** The `@theme` block
  defines `--spacing-4xl: 64px`, and Tailwind v4 falls back to the spacing scale
  for `max-w-*` when no matching `--container-*` token exists. `5xl` and `6xl`
  have no spacing token, which is why every other route is fine. Worth knowing
  before adding a page: **use `max-w-5xl` or larger, or an arbitrary value.**

### Sample data

`scripts/sample-data.sql` fills both features in before you've done three
estimated tasks of your own — 7 finished tasks with estimates and one timer
running at 70% of its estimate. Everything it makes is titled `Sample: …`.

```bash
psql "$DATABASE_URL" -f scripts/sample-data.sql                 # add
psql "$DATABASE_URL" -f scripts/sample-data.sql --set=remove=1  # remove
```

### Fixed along the way

- **`allocation()` was discarding goal attribution.** `startSession`
  denormalises `goal_id` onto the session precisely so it survives the task
  being deleted, but the query resolved the goal only through the task — so
  deleting a task silently moved its time to "No goal". Now falls back to the
  session's own `goal_id`.
- **`verify-timer.ts` leaked orphaned sessions.** `time_sessions.task_id` is
  ON DELETE SET NULL, so deleting its test tasks left their sessions behind as
  untagged focus time, accumulating every run until it tipped an analytics
  assertion.
- **A hydration error in the Pomodoro ring.** Its `strokeDasharray` derives from
  live elapsed time, which never matches between server render and hydration.
  Latent until a session was running at page load.
- **Two tests asserted exact global aggregates** (`listGoals returns 2`,
  `No goal === 20`) and so only passed on a database holding nothing but their
  own fixture. Both now assert `>=`, matching how their neighbours already did.
- **The consistency grid computed its own naive streak** — any non-zero day, no
  threshold, no rest days, counted backwards from today, so it read zero every
  morning. It now takes the real streak as a prop.

## Overdue tasks and missed habit days

Before this, a one-off task past its due date sat inside Today with a red badge,
and a repeating task that wasn't done created nothing — so a missed day simply
vanished, with no record and nothing in analytics.

| File | What it is |
|---|---|
| `lib/recurrence.ts` | `occurrencesAfter` (filling a gap) and the 2-day window |
| `lib/habits.ts` | Completion rate and slipping, pure |
| `migrations/006-overdue.sql` | `missed` status, `reschedule_count`, `series_id`, `scheduled_for`, one-successor index, views |
| `components/task-row.tsx` | Today / Reschedule / Cancel on overdue rows |
| `components/charts/habit-rates.tsx` | The habits card on `/analytics` |
| `scripts/verify-overdue.ts` | 33 pure-logic checks |
| `scripts/verify-overdue-db.ts` | 36 integration checks |

**How it behaves**

- **Overdue section.** Open work due before today leaves Today and waits in its
  own section with three actions — done (the checkbox), **Today**,
  **Reschedule**, **Cancel** (two clicks). Everything moved is counted.
- **Habits keep coming.** At the first page load of a day, every repeating task
  gets an occurrence for each scheduled day it is owed, up to today. Today's is
  in Today; earlier unfinished ones are in Overdue.
- **Two days to decide.** An overdue habit occurrence stays actionable for two
  days after its due day, then closes as **missed**. One-off tasks never close
  themselves — they stay until you decide.
- **Cancel is a decision, not a failure.** A cancelled habit day hands on to the
  next occurrence and is left out of the completion rate. A missed day counts.
- **Analytics.** `/analytics` shows each habit's rate over the last 30 finished
  days and the open tasks that keep getting pushed. `/recap` adds a line for
  both. Missed and cancelled work also leaves goal totals, so dropping a task
  doesn't make a goal look further from done.

**Design decisions worth knowing**

- **Which day an occurrence belongs to is stored apart from when it's due.**
  `scheduled_for` is its place in the habit's cadence; `due_at` is when you plan
  to do it. Rescheduling Tuesday's reading to Friday moves only `due_at`. With
  a single date, the habit would restart from Friday and silently skip
  Wednesday and Thursday.
- **`series_id` groups a habit's history** without walking the chain, and is
  deliberately not a foreign key: deleting the first occurrence must not split
  the habit's record in two.
- **The rollover runs on first look**, like the quest draw — no scheduler. An
  advisory lock plus a unique index on `recurrence_of` mean six tabs opening at
  once still produce exactly one chain (tested).

**Two latent bugs this fixed**

- **"Open" was written as `status <> 'done'`** in Today, Upcoming, the calendar
  tray, quest eligibility and goal progress. Harmless while nothing set
  `cancelled` — the moment Cancel existed, cancelled tasks would have kept
  appearing in Today. Every open-work filter now reads `status in ('todo',
  'doing')`.
- **`setTaskStatus` withdrew the successor on any non-done status.** Cancelling
  a habit day would have deleted tomorrow's occurrence, and reopening a late one
  would have deleted a day the rollover legitimately wrote. It now withdraws
  only on reopen, and only a successor still in the future and untouched.

## Russian, and the language switch

Every word the app says now exists in two languages, picked with the `EN` /
`RU` control in the nav on every page. Nothing is half-translated: the
dictionaries are typed against each other, so a missing or misspelled key
fails `next build` rather than showing English in the middle of a Russian page.

| File | What it is |
|---|---|
| `lib/i18n/en.ts` | Every string in the app, and the `Dict` type the other one must match |
| `lib/i18n/ru.ts` | The Russian version, typed as `Dict` |
| `lib/i18n/index.ts` | Which languages exist; safe on both sides of the client boundary |
| `lib/i18n/server.ts` | `getDict()` / `getI18n()` — reads the cookie |
| `components/i18n-provider.tsx` | `useT()` for client components |
| `components/language-switcher.tsx` | The two buttons |
| `scripts/verify-i18n.ts` | What the type system can't catch |

**How the choice travels.** A cookie (`arc_locale`), not a `/ru` URL prefix.
Every route here is already `force-dynamic` — each one reads live data — so a
path prefix would buy no caching, and it would invalidate every link, bookmark
and `revalidatePath` in the app for a preference that belongs to the person
rather than the page. The server action writes the cookie and calls
`revalidatePath("/", "layout")`, which is what re-renders the whole tree in the
other language instead of only the page the switcher sits on.

Server components call `getDict()`. Client components call `useT()`. Only the
locale *string* crosses the boundary: both dictionaries are plain modules each
side imports, because almost every entry is a function and functions do not
serialise. The cost is a few kilobytes of strings in the client bundle, and it
buys an instant switch with no second round trip.

**Why the dictionary is functions rather than strings.**

- **Counts.** Russian inflects a noun three ways by its number — 1 день,
  2 дня, 5 дней, and 11 дней despite ending in 1. A call site that builds
  `${n} ${word}` cannot be translated, so every count is a function the
  dictionary owns, and `ru.ts` has one `pl()` helper behind all of them.
- **Dates.** `toLocaleDateString(undefined, …)` follows the *browser's*
  language, not the one chosen here — so every date goes through the
  dictionary's own locale tag. Russian also needs the genitive month inside a
  date ("14 сентября", not "сентябрь"), which `Intl` will not give you, so
  `ru.ts` carries the twelve forms.
- **Durations.** "1h 25m" and "1 ч 25 мин" are different strings, not one
  string with a word swapped. `formatMinutes` left `lib/utils.ts` and became
  `t.fmt.minutes`; leaving an English-only copy behind would have been a
  standing invitation to print English into a Russian page.

**The pure modules take a dictionary and default to English.** `calibrationBand`,
`biasLabel`, `rateLabel`, `slipLabel`, `recurrenceLabel`, `questCopy` and
`dueNotifications` all gained an optional last argument. Their behaviour with
no dictionary is byte-for-byte what it was, which is why the existing suites
needed no changes. `calibrationBand` also returns a `key` now, so the band is
identified by something that doesn't change with the language.

**Two things that had to move.**

- `tooltipStyle` and `axisProps` left `chart-card.tsx` for
  `chart-style.ts`. ChartCard reads the dictionary, which reaches
  `next/headers`; client charts import those constants, and leaving them
  together would have pulled a server-only module into the client bundle.
- `allocation()` used to `coalesce(g.title, 'No goal')`. A query has no
  language. It returns null now and the page names it.

**What `verify:i18n` checks** that TypeScript cannot: that no Russian value is
still the English one, that no stray Latin words survive, that the plural
forms are right at 1, 2, 5, 11–14, 21 and 111, and — the useful one — that
every function in both dictionaries actually *uses* its argument. A copy
function that ignores its number is the bug you don't see: the page renders,
reads fluently, and states the wrong figure.

**Adding a third language** is one file: copy `ru.ts`, type it as `Dict`, and
add it to `LOCALES`, `dictionaries`, `LOCALE_NAMES` and `LOCALE_SHORT` in
`lib/i18n/index.ts`. The compiler lists everything still missing.

## Accounts, Telegram and the phone

Arc was built single-user: every row was implicitly yours and every view
aggregated the whole database. It now runs as a Telegram Mini App that anyone
can open, so ownership had to become real.

| File | What it is |
|---|---|
| `migrations/007-multi-user.sql` | `users`, `user_id` on eight tables, per-user indexes, every view rebuilt |
| `lib/session.ts` | Who is asking: an explicit scope, a signed cookie, and a dev fallback |
| `lib/telegram.ts` | The `initData` signature check, pure and dependency-free |
| `lib/users.ts` | The only module that reads rows without a current user |
| `app/api/telegram/route.ts` | Verify, upsert, set cookie |
| `components/telegram-bootstrap.tsx` | What runs when Telegram opens the app |
| `components/app-nav.tsx` | Text links on a desktop, a thumb-height tab bar on a phone |
| `scripts/verify-multiuser.ts` | Two accounts, every path, proving isolation |
| `scripts/verify-telegram.ts` | The signature, written as forgery attempts |

**Ownership is resolved once, not passed around.** Every query calls
`currentUserId()` rather than taking a `userId` parameter. A parameter on forty
functions is forty call sites that can forget it, and forgetting it once means
one person seeing another's tasks. There is one place to get this right, and a
query that runs with no user throws instead of returning everybody's rows. The
verify suites, which have no request and so no cookie, use `withUser(id, …)` —
an impersonation primitive deliberately never called from request-handling
code.

**Three indexes had to stop being global.** The partial unique index enforcing
one running timer was on `(ended_at is null)` — across the whole table. With
two users that means the first person to start a timer stops everyone else
from starting one. The same was true of the quest draw and of notification
claims. All three are now keyed by `user_id` first. This is the class of bug
that a single-account test suite passes cheerfully, which is why
`verify-multiuser.ts` exists: it starts two timers at once and fails if only
one survives.

**Views carry `user_id` through.** A view that aggregates across accounts is a
leak that no amount of care in `lib/queries.ts` can undo, because the filtering
has already happened by the time the query sees a row. `v_throughput` needed
restructuring rather than a column: it generates a continuous run of days, and
a day nobody touched has no user to belong to, so the series is crossed with
`users` instead of left-joined onto tasks alone.

**Sign-in is a signature, not a password.** Telegram hands the page an
`initData` blob: the user's profile plus an HMAC keyed by the bot token.
Because only the bot's owner has that token, a valid signature proves the data
came from Telegram unedited. Without the check, `initData` is a query string
anyone can type. The scheme inverts the key and message on its first line —
`secret = HMAC(key: "WebAppData", msg: bot_token)` — which is the usual place
to get it wrong, so there is a test asserting exactly that shape.
`verify-telegram.ts` is written as a series of attacks: change the user id and
keep the old hash, truncate the hash, send non-hex, reuse a day-old blob, sign
with another bot's token.

**The existing data was kept.** Migration 007 creates an owner account with a
fixed id and assigns every pre-existing row to it. Setting
`ARC_OWNER_TELEGRAM_ID` to your own id makes your first sign-in adopt that
account, history intact. It only fires while the account is unclaimed, so it
cannot transfer an account twice.

**Development still works without Telegram.** `ARC_DEV_USER_ID` makes
unauthenticated requests act as that account. It is guarded on `NODE_ENV` as
well as on the variable being set, so a `.env` copied to a server by accident
still can't hand out somebody's account — and there is deliberately no
"continue as owner" button on the sign-in screen, because that is exactly the
sort of control that survives into production.

**On a phone.** The nav becomes a fixed bar at the bottom: a row of small text
links under the page title is the one thing genuinely unreachable one-handed,
and inside Telegram the thumb is all you have. Four things needed fixing that
are invisible on a desktop:

- **Hover-only controls.** The timer and delete buttons were
  `opacity-0 group-hover:opacity-100`, so on a touch screen they never
  appeared at all. The fix keys on `(hover: none)` rather than a width
  breakpoint — a narrow window on a laptop still has a pointer.
- **iOS zooms on focus** when an input's text is under 16px, and leaves you
  zoomed. The usual fix, `maximum-scale=1`, also takes pinch-zoom away from
  people who need it; setting the font size instead costs nothing.
- **The week grid at 375px** would be seven 45px columns — too narrow to drag
  a block into. It scrolls sideways at a usable width, headers inside the same
  scroller so a header stays over its column.
- **`min-width: auto`.** That scroller's 560px minimum propagated up through
  its flex and grid ancestors and pushed the week buttons off the screen
  entirely. `min-w-0` on the column and `minmax(0, 1fr)` on the grid track
  confine the overflow to the one element that should have it.

**One hydration warning, suppressed deliberately.** Telegram's SDK writes
`--tg-viewport-height` onto `<html>` before React hydrates, so the server
markup and the client tree genuinely differ on that element.
`suppressHydrationWarning` is scoped to it alone.

## Known-weak areas

- **Two rough edges in the calendar**, both inherent to local time rather than
  bugs: a DST day still renders as 24 rows, and dropping a block into a
  spring-forward gap (02:00–03:00 on the shift day) rolls forward an hour,
  because `Date` has no such local time.
- **Dragging is mouse/pointer only.** There is no keyboard path to move or
  resize a block; the × button is the one keyboard-reachable control. The README
  already listed keyboard scheduling as not done, and it still is.
- **`count(*)` returns bigint → a string** from postgres.js. Comparisons against
  numbers must cast; this already broke an empty-state check once.
- No theme toggle — the light layer exists in CSS, nothing switches it.
- The eight Recharts charts render (confirmed via `/analytics` screenshot) but
  weren't interacted with — tooltips, legend toggling, and responsive resize
  are unverified.
