import {
  plannedVsActual, estimateAccuracy, throughput, focusHeatmap,
  dailyFocus, allocation, summary,
} from "../lib/analytics";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => { if (c) console.log("ok  ", m); else { fails++; console.error("FAIL:", m); } };

async function main() {
  const sql = db();
  await sql`delete from time_sessions where note = 'an'`;
  await sql`delete from goals where title = 'Analytics test'`;

  const [{ id: gid }] = await sql<{id:string}[]>`
    insert into goals (user_id, title, color_slot)
    values (${OWNER_USER_ID}, 'Analytics test', 4) returning id`;
  const [{ id: tid }] = await sql<{id:string}[]>`
    insert into tasks (user_id, title, goal_id, est_minutes, status, completed_at, due_at)
    values (${OWNER_USER_ID}, 'Measured task', ${gid}, 60, 'done', now(), now()) returning id`;

  // 90 minutes of focus against a 60 minute estimate → ratio 1.5
  await sql`insert into time_sessions (user_id, task_id, goal_id, kind, started_at, ended_at, interruptions, note)
            values (${OWNER_USER_ID}, ${tid}, ${gid}, 'focus', now() - interval '3 hours',
                    now() - interval '90 minutes', 3, 'an')`;

  const acc = await estimateAccuracy();
  const mine = acc.find(a => a.taskId === tid);
  t(mine?.actualMinutes === 90, `estimateAccuracy actual (${mine?.actualMinutes})`);
  t(Number(mine?.ratio) === 1.5, `estimateAccuracy ratio (${mine?.ratio})`);

  const pva = await plannedVsActual(8);
  const row = pva.find(p => p.goalTitle === 'Analytics test');
  t(row?.plannedMinutes === 60, `plannedVsActual planned (${row?.plannedMinutes})`);
  t(row?.actualMinutes === 90, `plannedVsActual actual (${row?.actualMinutes})`);

  const tp = await throughput(30);
  t(tp.length > 0 && tp.every(p => p.day instanceof Date), "throughput returns dated points");
  t(tp.some(p => p.completed > 0), "throughput records a completion");

  const heat = await focusHeatmap(56);
  t(heat.length > 0, `focusHeatmap returns cells (${heat.length})`);
  t(heat.every(c => c.hourOfDay >= 0 && c.hourOfDay <= 23), "hours in range 0-23");
  t(heat.every(c => c.dayOfWeek >= 0 && c.dayOfWeek <= 6), "days in range 0-6");
  t(heat.reduce((s, c) => s + c.interruptions, 0) >= 3, "interruptions surface in the heatmap");

  const daily = await dailyFocus(365);
  t(daily.some(d => d.minutes >= 90), `dailyFocus captures the 90m session (${daily.map(d=>d.minutes).join(",")})`);

  const alloc = await allocation(30);
  const a = alloc.find(x => x.goalTitle === 'Analytics test');
  t(a?.minutes === 90, `allocation by goal (${a?.minutes})`);
  t(a?.colorSlot === 4, "allocation carries the goal colour");

  const sum = await summary(30);
  t(sum.focusMinutes >= 90, `summary focus minutes (${sum.focusMinutes})`);
  t(sum.interruptions >= 3, `summary interruptions (${sum.interruptions})`);
  t(sum.tasksCompleted >= 1, `summary completions (${sum.tasksCompleted})`);
  t(sum.medianRatio !== null, `summary median ratio (${sum.medianRatio})`);

  // An untagged session must still be counted. It comes back with a null
  // title rather than the words "No goal": the query has no language, and the
  // UI names it from whichever dictionary is in force.
  await sql`insert into time_sessions (user_id, kind, started_at, ended_at, note)
            values (${OWNER_USER_ID}, 'focus', now() - interval '30 minutes', now() - interval '10 minutes', 'an')`;
  const alloc2 = await allocation(30);
  // >= not ==: this is a global aggregate over the whole database, so any
  // untagged focus time the user has logged counts too. Matches how
  // focusMinutes, interruptions and tasksCompleted are asserted above.
  t(alloc2.some(x => x.goalTitle === null && x.minutes >= 20),
    `untagged time is kept, under a null goal (${alloc2.map(x=>x.goalTitle+":"+x.minutes).join(", ")})`);
  t(!alloc2.some(x => x.goalTitle === 'No goal'),
    "the query returns no English label of its own");

  await sql`delete from time_sessions where note = 'an'`;
  await sql`delete from tasks where id = ${tid}`;
  await sql`delete from goals where id = ${gid}`;
  console.log(fails === 0 ? "\nall analytics checks pass" : `\n${fails} failing`);
  process.exit(fails ? 1 : 0);
}
withUser(OWNER_USER_ID, main).catch(e => { console.error(e); process.exit(1); });
