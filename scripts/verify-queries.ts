import {
  listGoals, listTasks, createGoal, createTask, updateTask,
  setTaskStatus, startSession, stopSession, getRunningSession, deleteTask,
} from "../lib/queries";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok  ", msg);
}

async function main() {
  // make the run idempotent
  await db()`delete from goals where title = 'Test goal'`;

  const goals = await listGoals();
  // >= not ==: this runs against whatever database you have, which by now
  // holds real goals of your own. What matters is that the fixture is found
  // and its derived figures are right, not that nothing else exists.
  assert(goals.length >= 2, `listGoals returns the seeded goals (got ${goals.length})`);
  const arc = goals.find(g => g.title === "Ship Arc v1")!;
  assert(Number(arc.progress) === 0.667, `progress computed (${arc.progress})`);
  assert(arc.projectedDaysRemaining !== null, "projection present");

  const today = await listTasks("today");
  assert(today.every(t => t.status !== "done"), "today scope excludes done");
  const est = today.find(t => t.title === "Calendar drag")!;
  assert(est.actualMinutes >= 95, `actualMinutes from view (${est.actualMinutes})`);
  assert(est.goalTitle === "Ship Arc v1", "goal joined");

  const gid = await createGoal({ title: "Test goal", colorSlot: 4 });
  const tid = await createTask({ title: "Test task", goalId: gid, estMinutes: 25, priority: 1 });
  const all = await listTasks("all", gid);
  assert(all.length === 1 && all[0].estMinutes === 25, "createTask + goal filter");

  await updateTask(tid, { title: "Renamed", estMinutes: 40 });
  const [renamed] = await listTasks("all", gid);
  assert(renamed.title === "Renamed" && renamed.estMinutes === 40, "updateTask patch");

  await startSession(tid);
  const run = await getRunningSession();
  assert(run?.taskId === tid, "startSession creates running session");
  const [running] = await listTasks("all", gid);
  assert(running.isRunning === true, "isRunning surfaces in list");
  assert(running.status === "doing", "starting a timer moves todo -> doing");

  const t2 = await createTask({ title: "Second", goalId: gid });
  await startSession(t2);
  const run2 = await getRunningSession();
  assert(run2?.taskId === t2, "starting a second timer stops the first");

  await setTaskStatus(t2, "done");
  assert((await getRunningSession()) === null, "completing a task closes its session");

  await stopSession();
  // Sessions first, by hand: time_sessions.task_id is ON DELETE SET NULL, so
  // deleting these tasks would leave their sessions behind as orphaned,
  // goal-less focus time that quietly accumulates into every analytics figure.
  await db()`delete from time_sessions where task_id in (${tid}, ${t2})`;
  await deleteTask(tid); await deleteTask(t2);
  await db()`delete from goals where title = 'Test goal'`;

  // Put the database back as it was found. The fixture is seeded by
  // `npm run seed` immediately before this runs; leaving it behind would mean
  // every verify run added two more goals to a real workspace.
  await db()`delete from time_sessions where task_id in (
    select id from tasks where title in ('Calendar drag','Design the week grid','Ship the timer bar'))`;
  await db()`delete from tasks where title in ('Calendar drag','Design the week grid','Ship the timer bar')`;
  await db()`delete from goals where title in ('Ship Arc v1','Personal reading')`;
  console.log("\nall query checks complete");
  process.exit(process.exitCode ?? 0);
}
withUser(OWNER_USER_ID, main).catch(e => { console.error(e); process.exit(1); });
