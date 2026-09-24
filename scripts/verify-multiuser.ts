/**
 * Two people, one database.
 *
 * Every other suite runs as a single account and would pass just as happily if
 * the app showed everyone everyone else's tasks. This one exists to fail in
 * that case. It creates two throwaway users, gives each their own goal, task,
 * timer, block, habit, quest draw and notification claim, and then checks
 * every read path in the app returns only the caller's rows — and that every
 * write path refuses to touch the other's.
 *
 * The per-user uniqueness matters as much as the filtering: before 007 the
 * "one running session" index was global, so the first person to start a timer
 * would have blocked everyone else from starting one at all. Same for the
 * quest draw and notification claims.
 *
 * Leaves nothing behind: both users are deleted at the end and every row they
 * own goes with them, which is also a test of the cascade.
 */
import { db } from "../lib/db";
import { withUser } from "../lib/session";
import {
  calibration, claimNotification, createEvent, createGoal, createTask, dailyActivity,
  deleteTask, getRunningSession, habitStats, listEvents, listGoals, listTasks,
  listUnscheduled, questFacts, rescheduleTask, rolloverRecurring, setTaskStatus,
  slippingTasks, startSession, stopSession, todaysQuests,
} from "../lib/queries";
import { allocation, dailyFocus, estimateAccuracy, summary, throughput, weekRecap } from "../lib/analytics";

let failures = 0;
function t(pass: boolean, what: string) {
  console.log(`${pass ? "ok  " : "FAIL"} ${what}`);
  if (!pass) failures++;
}

const sql = db();
const MARK = "mu-check";

async function makeUser(name: string, telegramId: number): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into users (telegram_id, first_name, locale)
    values (${telegramId}::bigint, ${name}, 'en')
    on conflict (telegram_id) do update set first_name = excluded.first_name
    returning id
  `;
  return row.id;
}

async function main() {
  // Ids well outside anything Telegram would issue for a real account.
  const alice = await makeUser(`${MARK} alice`, -900001);
  const bob = await makeUser(`${MARK} bob`, -900002);
  t(alice !== bob, "two accounts, two ids");

  /* ---------------- each builds their own world ---------------- */

  const world = async (label: string, estimate: number) => {
    const goalId = await createGoal({ title: `${MARK} ${label} goal`, colorSlot: 2 });
    const taskId = await createTask({
      title: `${MARK} ${label} task`, goalId, estMinutes: estimate, dueAt: null,
    });
    const habitId = await createTask({
      title: `${MARK} ${label} habit`, recurrence: "daily",
    });
    const pushed = await createTask({ title: `${MARK} ${label} pushed` });
    return { goalId, taskId, habitId, pushed };
  };

  const a = await withUser(alice, () => world("alice", 60));
  const b = await withUser(bob, () => world("bob", 30));

  /* ---------------- reads see only your own ---------------- */

  console.log("\n-- reads --");
  await withUser(alice, async () => {
    const goals = await listGoals();
    t(goals.length === 1, `alice sees her one goal (got ${goals.length})`);
    t(goals[0].title.includes("alice"), "and it is hers");

    const tasks = await listTasks("all");
    t(tasks.length === 3, `alice sees her three tasks (got ${tasks.length})`);
    t(tasks.every((x) => x.title.includes("alice")), "none of bob's tasks leak into the list");

    const unscheduled = await listUnscheduled();
    t(
      unscheduled.length > 0 && unscheduled.every((x) => x.title.includes("alice")),
      "the calendar tray is hers alone",
    );
  });

  await withUser(bob, async () => {
    const tasks = await listTasks("all");
    t(tasks.length === 3, `bob sees his three, not six (got ${tasks.length})`);
    t(tasks.every((x) => x.title.includes("bob")), "and none of alice's");
  });

  /* ---------------- writes can't reach across ---------------- */

  console.log("\n-- writes --");
  await withUser(bob, async () => {
    await setTaskStatus(a.taskId, "done");
    await deleteTask(a.taskId);
    const moved = await rescheduleTask(a.taskId, "2030-01-01");
    t(!moved, "bob cannot reschedule alice's task");
  });

  await withUser(alice, async () => {
    const tasks = await listTasks("all");
    const mine = tasks.find((x) => x.id === a.taskId);
    t(mine !== undefined, "alice's task still exists after bob tried to delete it");
    t(mine?.status === "todo", "and bob's completion did not land on it");
    t(Number(mine?.rescheduleCount) === 0, "nor his reschedule");
  });

  /* ---------------- a timer each, at the same time ---------------- */

  console.log("\n-- concurrent timers --");
  await withUser(alice, () => startSession(a.taskId, "focus"));
  await withUser(bob, () => startSession(b.taskId, "focus"));

  const aliceRunning = await withUser(alice, getRunningSession);
  const bobRunning = await withUser(bob, getRunningSession);
  t(aliceRunning !== null && bobRunning !== null, "both can have a timer running at once");
  t(
    aliceRunning?.id !== bobRunning?.id,
    "and each sees their own session, not whichever started last",
  );
  t(aliceRunning?.taskTitle?.includes("alice") === true, "alice's bar shows alice's task");
  t(bobRunning?.taskTitle?.includes("bob") === true, "bob's shows bob's");

  // Stopping is scoped too: alice leaving must not stop bob working.
  await withUser(alice, stopSession);
  t((await withUser(bob, getRunningSession)) !== null, "alice stopping hers leaves bob's running");
  await withUser(bob, stopSession);

  /* ---------------- per-user uniqueness ---------------- */

  console.log("\n-- claims and draws are per person --");
  const aliceClaim = await withUser(alice, () => claimNotification("streak_risk", "2026-09-24"));
  const bobClaim = await withUser(bob, () => claimNotification("streak_risk", "2026-09-24"));
  t(aliceClaim && bobClaim, "the same notification can be claimed once by each of them");
  const aliceAgain = await withUser(alice, () => claimNotification("streak_risk", "2026-09-24"));
  t(!aliceAgain, "but only once each");

  const aliceQuests = await withUser(alice, todaysQuests);
  const bobQuests = await withUser(bob, todaysQuests);
  t(aliceQuests.quests.length > 0 && bobQuests.quests.length > 0, "both get a draw for today");
  const aliceStored = await sql<{ n: number }[]>`
    select count(*)::int as n from quests where user_id = ${alice} and day = current_date`;
  t(
    aliceStored[0].n === aliceQuests.quests.length,
    "and each draw is stored against its own account",
  );

  /* ---------------- derived figures ---------------- */

  console.log("\n-- analytics --");
  await withUser(alice, async () => {
    const [act, cal, acc, alloc, sum, focus, tp] = await Promise.all([
      dailyActivity(), calibration(), estimateAccuracy(), allocation(30),
      summary(30), dailyFocus(30), throughput(30),
    ]);
    t(
      acc.every((x) => x.title.includes("alice")) &&
        alloc.every((x) => (x.goalTitle ?? "").includes("alice") || x.goalTitle === null),
      "alice's charts are built from alice's rows",
    );
    t(Number(sum.sessions) <= 1, `her summary counts only her session (got ${sum.sessions})`);
    t(Array.isArray(act.days) && Array.isArray(cal) && Array.isArray(focus), "reads return");
    t(
      tp.length > 0 && tp.every((p) => Number(p.created) <= 3),
      "and throughput never counts bob's creations",
    );
  });

  await withUser(bob, async () => {
    const facts = await questFacts();
    t(
      Number(facts.tasksCompletedToday) === 0,
      `bob's quest facts ignore alice's completions (got ${facts.tasksCompletedToday})`,
    );
    const recap = await weekRecap(0);
    t(Number(recap.sessions) <= 1, `and so does his recap (got ${recap.sessions})`);
  });

  /* ---------------- habits and the calendar ---------------- */

  console.log("\n-- habits, blocks and slipping --");
  await withUser(alice, () => rescheduleTask(a.pushed, "2030-01-01"));
  await withUser(alice, () => rescheduleTask(a.pushed, "2030-01-02"));
  const aliceSlipping = await withUser(alice, () => slippingTasks(2));
  const bobSlipping = await withUser(bob, () => slippingTasks(2));
  t(aliceSlipping.length === 1, `alice has one slipping task (got ${aliceSlipping.length})`);
  t(bobSlipping.length === 0, "bob has none, despite sharing the table");

  // The rollover is the one read that writes. It must extend only the caller's
  // habits — a shared advisory lock and an unscoped update would quietly
  // rewrite everyone's.
  await sql`
    update tasks set due_at = current_date - 3, scheduled_for = current_date - 3
    where id in (${a.habitId}, ${b.habitId})
  `;
  const rolled = await withUser(alice, rolloverRecurring);
  t(rolled.created > 0, `alice's rollover filled her gap (${rolled.created} days)`);
  const bobChain = await sql<{ n: number }[]>`
    select count(*)::int as n from tasks
    where user_id = ${bob} and title = ${`${MARK} bob habit`}`;
  t(bobChain[0].n === 1, "and left bob's habit exactly where it was");

  await withUser(alice, () =>
    createEvent({
      title: `${MARK} alice block`,
      startsAt: new Date(Date.UTC(2026, 8, 24, 9, 0)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 8, 24, 10, 0)).toISOString(),
    }),
  );
  const from = new Date(Date.UTC(2026, 8, 20)).toISOString();
  const to = new Date(Date.UTC(2026, 8, 28)).toISOString();
  t((await withUser(alice, () => listEvents(from, to))).length === 1, "alice sees her block");
  t((await withUser(bob, () => listEvents(from, to))).length === 0, "bob's week is empty");

  const aliceHabits = await withUser(alice, habitStats);
  t(
    aliceHabits.every((h) => h.title.includes("alice")),
    "habit stats are grouped per person",
  );

  /* ---------------- deleting an account takes its rows ---------------- */

  console.log("\n-- cascade --");
  await sql`delete from users where id = ${alice}`;
  const leftovers = await sql<{ n: number }[]>`
    select
      (select count(*) from tasks         where user_id = ${alice})
    + (select count(*) from goals         where user_id = ${alice})
    + (select count(*) from time_sessions where user_id = ${alice})
    + (select count(*) from events        where user_id = ${alice})
    + (select count(*) from quests        where user_id = ${alice}) as n
  `;
  t(Number(leftovers[0].n) === 0, "deleting an account removes everything it owned");

  const bobSurvives = await withUser(bob, () => listTasks("all"));
  t(bobSurvives.length === 3, "and leaves the other account untouched");

  await sql`delete from users where id = ${bob}`;

  console.log(
    failures === 0
      ? "\nall multi-user checks pass"
      : `\n${failures} multi-user check${failures === 1 ? "" : "s"} failed`,
  );
  await sql.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
