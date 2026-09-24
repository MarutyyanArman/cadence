/** Integration checks against a live database. Run: npx tsx scripts/verify-calendar.ts */
import {
  listEvents, listUnscheduled, createEvent, scheduleTask, moveEvent, deleteEvent,
} from "../lib/queries";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const iso = (d: Date) => d.toISOString();

async function main() {
  const sql = db();

  // Clean up anything a previous run left behind.
  await sql`delete from events where title like 'cal-test%'`;
  await sql`delete from tasks where title like 'cal-test%'`;
  await sql`delete from goals where title = 'cal-test goal'`;

  const [{ id: gid }] = await sql<{ id: string }[]>`
    insert into goals (user_id, title, color_slot)
    values (${OWNER_USER_ID}, 'cal-test goal', 3) returning id`;
  const [{ id: tid }] = await sql<{ id: string }[]>`
    insert into tasks (user_id, title, goal_id, est_minutes)
    values (${OWNER_USER_ID}, 'cal-test task', ${gid}, 45) returning id`;

  const base = new Date();
  base.setHours(9, 0, 0, 0);
  const from = new Date(base); from.setDate(from.getDate() - 1);
  const to = new Date(base);   to.setDate(to.getDate() + 2);

  /* 1 — an unscheduled task appears in the tray */
  {
    const tray = await listUnscheduled();
    t(tray.some((x) => x.id === tid), "a task with no block shows in the unscheduled tray");
    const row = tray.find((x) => x.id === tid);
    t(row?.goalColorSlot === 3, "the tray row carries the goal colour slot");
  }

  /* 2 — scheduling it takes the title from the task, not a duplicate string */
  const evId = await scheduleTask(tid, iso(base), 45);
  {
    const [row] = await sql<{ title: string; mins: number }[]>`
      select title, round(extract(epoch from (ends_at - starts_at)) / 60)::int as mins
      from events where id = ${evId}`;
    t(row.title === "cal-test task", "scheduleTask copies the title from the task");
    t(row.mins === 45, "scheduleTask honours the requested duration");
  }

  /* 3 — a scheduled task leaves the tray */
  {
    const tray = await listUnscheduled();
    t(!tray.some((x) => x.id === tid), "a task with a block drops out of the tray");
  }

  /* 4 — listEvents joins the goal colour and task status through the task */
  {
    const evs = await listEvents(iso(from), iso(to));
    const mine = evs.find((e) => e.id === evId);
    t(mine !== undefined, "listEvents returns the new block");
    t(mine?.goalColorSlot === 3, "listEvents resolves the goal colour via the task");
    t(mine?.taskId === tid, "listEvents carries the task id back");
    t(mine?.taskStatus === "todo", "listEvents carries the task status");
  }

  /* 5 — the window overlaps, it does not merely contain */
  {
    // A block that starts before the window and ends inside it must still appear.
    const early = new Date(base); early.setHours(base.getHours() - 3);
    const spanId = await createEvent({
      title: "cal-test overlap", startsAt: iso(early), endsAt: iso(base),
    });
    const windowStart = new Date(base); windowStart.setMinutes(-30);
    const evs = await listEvents(iso(windowStart), iso(to));
    t(evs.some((e) => e.id === spanId), "a block straddling the window start is returned");

    const after = await listEvents(iso(to), iso(new Date(to.getTime() + 3600_000)));
    t(!after.some((e) => e.id === spanId), "a block outside the window is not returned");
    await deleteEvent(spanId);
  }

  /* 6 — a standalone event has no task and falls back to colour slot 1 */
  {
    const soloId = await createEvent({
      title: "cal-test solo", startsAt: iso(base), endsAt: iso(new Date(base.getTime() + 3600_000)),
    });
    const evs = await listEvents(iso(from), iso(to));
    const solo = evs.find((e) => e.id === soloId);
    t(solo?.taskId === null, "an event with no task reports taskId null");
    t(solo?.goalColorSlot === 1, "an event with no goal falls back to colour slot 1");
    t(solo?.taskStatus === null, "an event with no task reports taskStatus null");
    await deleteEvent(soloId);
  }

  /* 7 — moving a block rewrites both ends */
  {
    const newStart = new Date(base.getTime() + 2 * 3600_000);
    const newEnd = new Date(newStart.getTime() + 90 * 60_000);
    await moveEvent(evId, iso(newStart), iso(newEnd));
    const [row] = await sql<{ mins: number; startsAt: Date }[]>`
      select starts_at, round(extract(epoch from (ends_at - starts_at)) / 60)::int as mins
      from events where id = ${evId}`;
    t(row.mins === 90, "moveEvent resizes as well as moves");
    t(Math.abs(row.startsAt.getTime() - newStart.getTime()) < 1000, "moveEvent writes the new start");
  }

  /* 8 — the schema refuses a backwards block */
  {
    let rejected = false;
    try {
      await sql`insert into events (user_id, title, starts_at, ends_at)
                values (${OWNER_USER_ID}, 'cal-test backwards', ${iso(base)},
                        ${iso(new Date(base.getTime() - 60_000))})`;
    } catch {
      rejected = true;
    }
    t(rejected, "the event_order constraint rejects ends_at <= starts_at");
  }

  /* 9 — unscheduling frees the task without deleting it */
  {
    await deleteEvent(evId);
    const [task] = await sql<{ id: string }[]>`select id from tasks where id = ${tid}`;
    t(task !== undefined, "deleting a block does not delete the task");
    const tray = await listUnscheduled();
    t(tray.some((x) => x.id === tid), "the task returns to the tray once unscheduled");
  }

  /* 10 — a done task never appears in the tray */
  {
    await sql`update tasks set status = 'done', completed_at = now() where id = ${tid}`;
    const tray = await listUnscheduled();
    t(!tray.some((x) => x.id === tid), "a completed task is not offered for scheduling");
    await sql`update tasks set status = 'todo', completed_at = null where id = ${tid}`;
  }

  /* 11 — deleting a task cascades to its blocks */
  {
    const cascadeId = await scheduleTask(tid, iso(base), 30);
    await sql`delete from tasks where id = ${tid}`;
    const [row] = await sql<{ id: string }[]>`select id from events where id = ${cascadeId}`;
    t(row === undefined, "deleting a task cascades to its calendar blocks");
  }

  /* 12 — an empty week returns an empty array, not null */
  {
    const far = new Date(base); far.setFullYear(far.getFullYear() + 5);
    const farEnd = new Date(far); farEnd.setDate(farEnd.getDate() + 7);
    const evs = await listEvents(iso(far), iso(farEnd));
    t(Array.isArray(evs) && evs.length === 0, "a week with no blocks returns an empty array");
  }

  await sql`delete from goals where id = ${gid}`;
  await sql.end();

  console.log(fails === 0 ? "\nall calendar checks pass" : `\n${fails} failed`);
  process.exit(fails === 0 ? 0 : 1);
}

withUser(OWNER_USER_ID, main).catch((e) => { console.error(e); process.exit(1); });
