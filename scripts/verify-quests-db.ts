/** Integration checks against a live database. Run: npx tsx scripts/verify-quests-db.ts */
import { todaysQuests, questFacts, createTask, setTaskStatus } from "../lib/queries";
import { weekRecap } from "../lib/analytics";
import { evaluateQuest, QUEST_TARGETS } from "../lib/quests";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const MARK = "quest-test";

async function main() {
  const sql = db();
  const clean = async () => {
    await sql`delete from time_sessions where task_id in (select id from tasks where title like ${MARK + "%"})`;
    await sql`delete from tasks where title like ${MARK + "%"}`;
  };
  await clean();
  await sql`delete from quests where day = current_date`;

  /* 1 — the draw happens on first look, and is stable after */
  {
    const first = await todaysQuests();
    t(first.quests.length > 0, `today draws at least one quest (got ${first.quests.length})`);
    t(first.quests.length <= 3, "never more than three");

    const second = await todaysQuests();
    t(
      JSON.stringify(first.quests) === JSON.stringify(second.quests),
      "looking again returns the same three — a refresh can't reroll",
    );
  }

  /* 2 — concurrent loads don't multiply the draw */
  {
    await sql`delete from quests where day = current_date`;
    await Promise.all(Array.from({ length: 6 }, () => todaysQuests()));
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from quests where day = current_date
    `;
    t(Number(n) <= 3, `six simultaneous loads still draw at most three (got ${n})`);
  }

  /* 3 — the schema refuses an unknown quest */
  {
    let rejected = false;
    try {
      await sql`insert into quests (user_id, day, kind, target)
                values (${OWNER_USER_ID}, current_date - 1, 'do_a_backflip', 1)`;
    } catch {
      rejected = true;
    }
    t(rejected, "the check constraint rejects a kind the app doesn't know");
    await sql`delete from quests where day = current_date - 1`;
  }

  /* 4 — facts are read from the record, and move when the record moves */
  {
    const before = await questFacts();

    const id = await createTask({ title: `${MARK} measured`, estMinutes: 40 });
    await sql`
      insert into time_sessions (user_id, task_id, kind, started_at, ended_at, interruptions)
      values (${OWNER_USER_ID}, ${id}, 'focus', now() - interval '42 minutes', now(), 0)
    `;
    await setTaskStatus(id, "done");

    const after = await questFacts();
    t(
      Number(after.tasksCompletedToday) === Number(before.tasksCompletedToday) + 1,
      "finishing a task moves the completion count",
    );
    t(
      Number(after.focusMinutesToday) >= Number(before.focusMinutesToday) + 40,
      "the logged session moves today's focus minutes",
    );
    t(
      Number(after.longestCleanBlockMinutes) >= 42,
      `an uninterrupted 42-minute session counts as a clean block (got ${after.longestCleanBlockMinutes})`,
    );
    t(
      Number(after.accurateEstimatesToday) === Number(before.accurateEstimatesToday) + 1,
      "42 minutes against a 40-minute estimate counts as on target",
    );
  }

  /* 5 — an interrupted session is not a clean block */
  {
    await clean();
    const id = await createTask({ title: `${MARK} broken` });
    await sql`
      insert into time_sessions (user_id, task_id, kind, started_at, ended_at, interruptions)
      values (${OWNER_USER_ID}, ${id}, 'focus', now() - interval '90 minutes', now(), 3)
    `;
    const facts = await questFacts();
    const clean90 = evaluateQuest("focus_block", 90, facts);
    t(!clean90.done, "ninety interrupted minutes do not satisfy an unbroken block");
    t(Number(facts.focusMinutesToday) >= 90, "...though the minutes still count toward total focus");
  }

  /* 6 — a task carried over a week counts as stale when cleared */
  {
    await clean();
    const [{ id }] = await sql<{ id: string }[]>`
      insert into tasks (user_id, title, created_at)
      values (${OWNER_USER_ID}, ${MARK + " old"}, now() - interval '20 days')
      returning id
    `;
    const before = Number((await questFacts()).staleTasksClearedToday);
    await setTaskStatus(id, "done");
    const after = Number((await questFacts()).staleTasksClearedToday);
    t(after === before + 1, "clearing a three-week-old task counts toward the stale quest");

    const fresh = await createTask({ title: `${MARK} fresh` });
    await setTaskStatus(fresh, "done");
    const afterFresh = Number((await questFacts()).staleTasksClearedToday);
    t(afterFresh === after, "clearing something opened today does not");
  }

  /* 7 — the recap composes without falling over on any window */
  {
    for (const w of [0, 1, 2, 52]) {
      const r = await weekRecap(w);
      t(/^\d{4}-\d{2}-\d{2}$/.test(r.weekStart), `weekRecap(${w}) returns a Monday (${r.weekStart})`);
      t(Number(r.focusMinutes) >= 0 && Number(r.tasksCompleted) >= 0, `weekRecap(${w}) figures are non-negative`);
    }
    const far = await weekRecap(52);
    t(Number(far.focusMinutes) === 0, "a year-old week with nothing in it reports zero rather than null");
    t(far.sharpest === null && far.worst === null, "...and has no estimates to name");
  }

  /* 8 — targets are the documented ones */
  {
    const { quests } = await todaysQuests();
    t(
      quests.every((q) => Number(q.target) === QUEST_TARGETS[q.kind]),
      "each drawn quest carries its documented target",
    );
  }

  await clean();
  await sql`delete from quests where day = current_date`;
  await sql.end();
  console.log(fails === 0 ? "\nall quest database checks pass" : `\n${fails} failed`);
  process.exit(fails === 0 ? 0 : 1);
}

withUser(OWNER_USER_ID, main).catch((e) => { console.error(e); process.exit(1); });
