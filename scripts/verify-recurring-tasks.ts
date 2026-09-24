/** Integration checks against a live database. Run: npx tsx scripts/verify-recurring-tasks.ts */
import { createTask, setTaskStatus, listTasks, startSession, stopSession } from "../lib/queries";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const MARK = "rec-test";

type Row = { id: string; title: string; status: string; dueDate: string | null; recurrence: string | null; recurrenceOf: string | null };

async function rows(sql: ReturnType<typeof db>) {
  return sql<Row[]>`
    select id, title, status, recurrence, recurrence_of,
           to_char(due_at, 'YYYY-MM-DD') as due_date
    from tasks where title like ${MARK + "%"} order by created_at
  `;
}

async function main() {
  const sql = db();
  const clean = async () => {
    await sql`delete from time_sessions where task_id in (select id from tasks where title like ${MARK + "%"})`;
    await sql`update tasks set recurrence_of = null where title like ${MARK + "%"}`;
    await sql`delete from tasks where title like ${MARK + "%"}`;
  };
  await clean();

  const [{ today }] = await sql<{ today: string }[]>`select to_char(current_date, 'YYYY-MM-DD') as today`;

  /* 1 — a one-off still behaves exactly as before */
  {
    const id = await createTask({ title: `${MARK} one-off` });
    await setTaskStatus(id, "done");
    const all = await rows(sql);
    t(all.length === 1, "completing a non-repeating task creates nothing");
    t(all[0].status === "done", "the one-off is marked done");
    await clean();
  }

  /* 2 — completing a daily task writes exactly one successor */
  {
    const id = await createTask({ title: `${MARK} read`, recurrence: "daily", estMinutes: 30, dueAt: today });
    await setTaskStatus(id, "done");
    const all = await rows(sql);
    t(all.length === 2, `a completed daily task yields one successor (got ${all.length})`);
    const next = all.find((r) => r.id !== id)!;
    t(next.status === "todo", "the successor starts as todo");
    t(next.recurrence === "daily", "the successor carries the repeat rule forward");
    t(next.recurrenceOf === id, "the successor is linked to the occurrence that spawned it");
    t(next.dueDate !== null && next.dueDate > today, "the successor is due after today");
    t(next.title === `${MARK} read`, "the successor keeps the title");
  }

  /* 3 — completing twice does not spawn twice */
  {
    const [first] = await rows(sql);
    await setTaskStatus(first.id, "done");
    const all = await rows(sql);
    t(all.length === 2, "re-completing an already-completed task spawns no second successor");
    await clean();
  }

  /* 4 — the estimate carries over, because that is the point of the app */
  {
    const id = await createTask({ title: `${MARK} est`, recurrence: "daily", estMinutes: 45 });
    await setTaskStatus(id, "done");
    const [{ est }] = await sql<{ est: number | null }[]>`
      select est_minutes as est from tasks where recurrence_of = ${id}
    `;
    t(est === 45, "the successor inherits the estimate, so accuracy stays measurable");
    await clean();
  }

  /* 5 — undo withdraws the successor */
  {
    const id = await createTask({ title: `${MARK} undo`, recurrence: "daily", dueAt: today });
    await setTaskStatus(id, "done");
    t((await rows(sql)).length === 2, "setup: successor exists");

    await setTaskStatus(id, "todo");
    const all = await rows(sql);
    t(all.length === 1, "reopening a completed repeat withdraws its untouched successor");
    t(all[0].id === id && all[0].status === "todo", "the reopened task is back to todo");

    // ...and completing again spawns a fresh one rather than nothing.
    await setTaskStatus(id, "done");
    t((await rows(sql)).length === 2, "completing again after an undo spawns a successor again");
    await clean();
  }

  /* 6 — a successor that has been worked on survives the undo */
  {
    const id = await createTask({ title: `${MARK} worked`, recurrence: "daily", dueAt: today });
    await setTaskStatus(id, "done");
    const successor = (await rows(sql)).find((r) => r.id !== id)!;

    await startSession(successor.id, "focus");
    await stopSession();

    await setTaskStatus(id, "todo");
    const all = await rows(sql);
    t(all.length === 2, "a successor with logged time is not withdrawn by an undo");
    t(all.some((r) => r.id === successor.id), "the worked-on successor is still there");
    await clean();
  }

  /* 7 — the successor is visible in the task list, the completed one is not */
  {
    const id = await createTask({ title: `${MARK} visible`, recurrence: "daily", dueAt: today });
    await setTaskStatus(id, "done");

    const todayList = await listTasks("today");
    const doneList = await listTasks("done");
    t(
      todayList.some((x) => x.title === `${MARK} visible` && x.status !== "done") ||
        (await listTasks("upcoming")).some((x) => x.title === `${MARK} visible`),
      "the successor shows up in an open list",
    );
    t(doneList.some((x) => x.id === id), "the completed occurrence shows in the Completed list");
    t(
      todayList.find((x) => x.id === id) === undefined,
      "the completed occurrence is gone from Today",
    );
    await clean();
  }

  /* 8 — the schema refuses an unknown rule */
  {
    let rejected = false;
    try {
      await sql`insert into tasks (user_id, title, recurrence)
                values (${OWNER_USER_ID}, ${MARK + " bad"}, 'FREQ=DAILY')`;
    } catch {
      rejected = true;
    }
    t(rejected, "the check constraint rejects an RRULE string");
    await clean();
  }

  /* 9 — weekdays never lands the next occurrence on a weekend */
  {
    const id = await createTask({ title: `${MARK} wd`, recurrence: "weekdays", dueAt: today });
    await setTaskStatus(id, "done");
    const [{ dow }] = await sql<{ dow: number }[]>`
      select extract(dow from due_at)::int as dow from tasks where recurrence_of = ${id}
    `;
    t(dow !== 0 && dow !== 6, `a weekdays successor lands on a weekday (got dow ${dow})`);
    await clean();
  }

  await sql.end();
  console.log(fails === 0 ? "\nall recurring-task checks pass" : `\n${fails} failed`);
  process.exit(fails === 0 ? 0 : 1);
}

withUser(OWNER_USER_ID, main).catch((e) => { console.error(e); process.exit(1); });
