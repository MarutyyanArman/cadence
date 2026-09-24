/** Integration checks against a live database. Run: npx tsx scripts/verify-overdue-db.ts */
import {
  createTask, habitStats, listGoals, listTasks, listUnscheduled, rescheduleTask,
  rolloverRecurring, setTaskStatus, slippingTasks,
} from "../lib/queries";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const MARK = "overdue-test";

type Occ = { id: string; status: string; due: string; scheduled: string | null; prev: string | null; series: string | null };

async function main() {
  const sql = db();
  const clean = async () => {
    await sql`delete from time_sessions where task_id in (select id from tasks where title like ${MARK + "%"})`;
    await sql`delete from tasks where title like ${MARK + "%"}`;
    await sql`delete from goals where title like ${MARK + "%"}`;
  };
  await clean();

  const [{ today }] = await sql<{ today: string }[]>`select to_char(current_date, 'YYYY-MM-DD') as today`;

  const chain = (title: string) => sql<Occ[]>`
    select id, status::text as status, to_char(due_at, 'YYYY-MM-DD') as due,
           to_char(scheduled_for, 'YYYY-MM-DD') as scheduled,
           recurrence_of as prev, series_id as series
    from tasks where title = ${title}
    order by scheduled_for, created_at
  `;

  /** A habit whose only occurrence belongs to `daysAgo` days back. */
  const staleHabit = async (title: string, daysAgo: number, rule = "daily") => {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into tasks (user_id, title, recurrence, due_at, scheduled_for, status)
      values (${OWNER_USER_ID}, ${title}, ${rule},
              current_date - ${daysAgo}::int, current_date - ${daysAgo}::int, 'todo')
      returning id
    `;
    return id;
  };

  /* 1 — a new habit is anchored to a day */
  {
    const id = await createTask({ title: `${MARK} anchored`, recurrence: "daily" });
    const [row] = await chain(`${MARK} anchored`);
    t(row.id === id && row.due === today && row.scheduled === today,
      "a habit created without a date is due, and scheduled, today");
    await clean();
  }

  /* 2 — a three-day gap is filled, and the window closes the oldest */
  {
    const head = await staleHabit(`${MARK} gap`, 3);
    const result = await rolloverRecurring();
    t(result.created >= 3, `rollover writes the owed occurrences (created ${result.created})`);

    const occ = await chain(`${MARK} gap`);
    t(occ.length === 4, `three days owed plus the original: 4 occurrences (got ${occ.length})`);
    t(occ[occ.length - 1].due === today, "the newest is today's");
    t(occ[0].status === "missed", "three days old and untouched: recorded as missed");
    t(occ[1].status === "todo" && occ[2].status === "todo",
      "two days and one day old are still open — inside the window");
    t(occ.slice(1).every((o, i) => o.prev === occ[i].id), "each occurrence links to the one before");
    t(occ.slice(1).every((o) => o.series === head), "every occurrence shares the first one's series");
  }

  /* 3 — rollover is idempotent */
  {
    const before = (await chain(`${MARK} gap`)).length;
    await rolloverRecurring();
    await rolloverRecurring();
    const after = (await chain(`${MARK} gap`)).length;
    t(after === before, "running rollover again writes nothing new");
  }

  /* 4 — the lists see the right things */
  {
    const occ = await chain(`${MARK} gap`);
    const overdueIds = new Set((await listTasks("overdue")).map((x) => x.id));
    const todayIds = new Set((await listTasks("today")).map((x) => x.id));

    t(overdueIds.has(occ[1].id) && overdueIds.has(occ[2].id), "open past occurrences are in Overdue");
    t(!overdueIds.has(occ[0].id) && !todayIds.has(occ[0].id), "a missed occurrence is in neither list");
    t(todayIds.has(occ[3].id) && !overdueIds.has(occ[3].id), "today's occurrence is in Today, not Overdue");
  }

  /* 5 — reopening a late one leaves the days the rollover wrote alone */
  {
    const occ = await chain(`${MARK} gap`);
    await setTaskStatus(occ[1].id, "done");
    await setTaskStatus(occ[1].id, "todo");
    const after = await chain(`${MARK} gap`);
    t(after.length === occ.length, "reopening does not delete an owed occurrence (the old code did)");
  }

  /* 6 — cancelling one day hands on, never withdraws */
  {
    const occ = await chain(`${MARK} gap`);
    await setTaskStatus(occ[2].id, "cancelled");
    const after = await chain(`${MARK} gap`);
    t(after.find((o) => o.id === occ[2].id)?.status === "cancelled", "the day is recorded as cancelled");
    t(after.length === occ.length, "...and cancelling deletes nothing downstream (the old code did)");

    // Cancelling today's head, which has no successor yet, hands on to tomorrow.
    await setTaskStatus(occ[3].id, "cancelled");
    const withTomorrow = await chain(`${MARK} gap`);
    t(withTomorrow.length === occ.length + 1, "cancelling today's still brings tomorrow's");
    t(!(await listTasks("today")).some((x) => x.id === occ[3].id), "a cancelled task leaves Today");
  }

  /* 7 — rescheduling moves the due date, never the cadence */
  {
    await clean();
    await staleHabit(`${MARK} move`, 1);
    await rolloverRecurring();
    const occ = await chain(`${MARK} move`);
    const yesterdays = occ[0];

    const [{ later }] = await sql<{ later: string }[]>`select to_char(current_date + 3, 'YYYY-MM-DD') as later`;
    t(await rescheduleTask(yesterdays.id, later), "an open occurrence can be rescheduled");

    const after = (await chain(`${MARK} move`)).find((o) => o.id === yesterdays.id)!;
    t(after.due === later, "its due date moves");
    t(after.scheduled === yesterdays.scheduled, "its cadence day stays put, so the habit isn't shifted");
    t((await listTasks("upcoming")).some((x) => x.id === yesterdays.id), "it now sits in Upcoming");
    t(!(await listTasks("overdue")).some((x) => x.id === yesterdays.id), "...and has left Overdue");

    const [{ count }] = await sql<{ count: number }[]>`select reschedule_count as count from tasks where id = ${yesterdays.id}`;
    t(Number(count) === 1, "the move is counted");

    await setTaskStatus(yesterdays.id, "done");
    t(!(await rescheduleTask(yesterdays.id, later)), "a closed task can't be rescheduled");
  }

  /* 8 — one-off tasks are never auto-closed, and slipping is visible */
  {
    await clean();
    const [{ id }] = await sql<{ id: string }[]>`
      insert into tasks (user_id, title, due_at)
      values (${OWNER_USER_ID}, ${MARK + " report"}, current_date - 10) returning id
    `;
    await rolloverRecurring();
    const [row] = await sql<{ status: string }[]>`select status::text as status from tasks where id = ${id}`;
    t(row.status === "todo", "a ten-day-overdue one-off stays open — only habits close themselves");
    t((await listTasks("overdue")).some((x) => x.id === id), "...and waits in Overdue for a decision");

    const [{ d1 }] = await sql<{ d1: string }[]>`select to_char(current_date + 1, 'YYYY-MM-DD') as d1`;
    await rescheduleTask(id, d1);
    await rescheduleTask(id, d1);
    await rescheduleTask(id, d1);
    const slipping = await slippingTasks(2);
    const found = slipping.find((s) => s.id === id);
    t(found !== undefined && Number(found.rescheduleCount) === 3, "a task pushed three times shows as slipping");
  }

  /* 9 — cancelled work leaves the calendar tray and goal totals */
  {
    await clean();
    const [{ gid }] = await sql<{ gid: string }[]>`
      insert into goals (user_id, title)
      values (${OWNER_USER_ID}, ${MARK + " goal"}) returning id as gid
    `;
    const keep = await createTask({ title: `${MARK} keep`, goalId: gid });
    const drop = await createTask({ title: `${MARK} drop`, goalId: gid });
    await setTaskStatus(drop, "cancelled");

    const tray = await listUnscheduled();
    t(tray.some((x) => x.id === keep) && !tray.some((x) => x.id === drop),
      "a cancelled task is not offered for scheduling (the old filter offered it)");

    const goal = (await listGoals()).find((g) => g.id === gid)!;
    t(Number(goal.totalTasks) === 1, `cancelled work leaves the goal total (got ${goal.totalTasks})`);
  }

  /* 10 — habit stats count decided days, excluding today */
  {
    await clean();
    const head = await staleHabit(`${MARK} stats`, 5);
    await rolloverRecurring();
    const occ = await chain(`${MARK} stats`);
    // occ: [-5 missed, -4 missed, -3 missed, -2 open, -1 open, today open]
    await setTaskStatus(occ[3].id, "done");
    await setTaskStatus(occ[4].id, "cancelled");

    const stat = (await habitStats()).find((h) => h.seriesId === head);
    t(stat !== undefined, "the habit appears in stats under its series");
    t(Number(stat?.done) === 1 && Number(stat?.missed) === 3 && Number(stat?.skipped) === 1,
      `done 1, missed 3, skipped 1 (got ${stat?.done}/${stat?.missed}/${stat?.skipped})`);
    t(Number(stat?.open) === 0, "today's occurrence isn't counted — the day isn't over");
  }

  /* 11 — weekly gaps keep their weekday */
  {
    await clean();
    await staleHabit(`${MARK} weekly`, 21, "weekly");
    await rolloverRecurring();
    const occ = await chain(`${MARK} weekly`);
    t(occ.length === 4, `three weeks owed plus the original (got ${occ.length})`);
    const [{ dows }] = await sql<{ dows: number }[]>`
      select count(distinct extract(dow from scheduled_for))::int as dows from tasks where title = ${MARK + " weekly"}
    `;
    t(Number(dows) === 1, "every weekly occurrence falls on the same weekday");
  }

  /* 12 — simultaneous rollovers fill a gap exactly once */
  {
    await clean();
    await staleHabit(`${MARK} race`, 4);
    await Promise.all(Array.from({ length: 6 }, () => rolloverRecurring()));
    const occ = await chain(`${MARK} race`);
    t(occ.length === 5, `six tabs opening at once still yield one chain of 5 (got ${occ.length})`);
    const [{ forks }] = await sql<{ forks: number }[]>`
      select count(*)::int as forks from (
        select recurrence_of from tasks where title = ${MARK + " race"} and recurrence_of is not null
        group by recurrence_of having count(*) > 1
      ) f
    `;
    t(Number(forks) === 0, "no occurrence has two successors");
  }

  await clean();
  await sql.end();
  console.log(fails === 0 ? "\nall overdue database checks pass" : `\n${fails} failed`);
  process.exit(fails === 0 ? 0 : 1);
}

withUser(OWNER_USER_ID, main).catch((e) => { console.error(e); process.exit(1); });
