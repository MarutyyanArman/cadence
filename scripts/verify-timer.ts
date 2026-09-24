import {
  createGoal, createTask, deleteTask, startSession, stopSession,
  getRunningSession, logInterruption, focusMinutesToday, listTasks, setTaskStatus,
} from "../lib/queries";
import { db } from "../lib/db";
import { clock } from "../lib/pomodoro";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => { if (c) console.log("ok  ", m); else { fails++; console.error("FAIL:", m); } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  await stopSession();
  await db()`delete from goals where title = 'Timer test'`;
  const gid = await createGoal({ title: "Timer test", colorSlot: 5 });
  const task = await createTask({ title: "Deep work", goalId: gid, estMinutes: 25 });

  const sid = await startSession(task, "focus");
  const run = await getRunningSession();
  t(run?.id === sid, "getRunningSession finds the open session");
  t(run?.taskTitle === "Deep work", "task title joined for the timer bar");
  t(run?.goalColorSlot === 5, "goal colour joined for the progress ring");
  t(run?.kind === "focus", "kind returned");
  t(run?.serverNow instanceof Date, "server clock returned for drift correction");

  const skew = Math.abs((run!.serverNow.getTime() - run!.startedAt.getTime()) / 1000);
  t(skew < 5, `startedAt and serverNow are close on a fresh session (${skew.toFixed(2)}s)`);

  await logInterruption(sid);
  await logInterruption(sid);
  t((await getRunningSession())?.interruptions === 2, "interruptions increment");

  // a break must not carry a task, and must displace the focus session
  const bid = await startSession(null, "break");
  const onBreak = await getRunningSession();
  t(onBreak?.id === bid && onBreak?.kind === "break", "break session replaces focus");
  t(onBreak?.taskId === null, "break is not attached to a task");

  const [row] = await db()<{ ended: boolean }[]>`
    select ended_at is not null as ended from time_sessions where id = ${sid}`;
  t(row.ended, "the previous focus session was closed, not abandoned");

  await sleep(1100);
  const mins = await focusMinutesToday();
  t(typeof mins === "number" && mins >= 0, `focusMinutesToday returns a number (${mins})`);

  // interruptions on a closed session are ignored
  await logInterruption(sid);
  const [after] = await db()<{ interruptions: number }[]>`
    select interruptions from time_sessions where id = ${sid}`;
  t(after.interruptions === 2, "a closed session cannot accrue interruptions");

  await stopSession();
  t((await getRunningSession()) === null, "stopSession clears the running session");

  await startSession(task, "focus");
  const [live] = await listTasks("all", gid);
  t(live.isRunning === true, "task list reflects the running session");
  await setTaskStatus(task, "done");
  t((await getRunningSession()) === null, "completing the task closes its session");

  t(clock(59) === "00:59" && clock(3661) === "1:01:01", `clock formatting (${clock(59)}, ${clock(3661)})`);

  // Sessions must go first and by hand: time_sessions.task_id is ON DELETE
  // SET NULL, so deleting the task leaves its sessions behind as orphaned,
  // goal-less focus time that quietly accumulates into every analytics figure.
  await db()`delete from time_sessions where task_id = ${task}`;
  await deleteTask(task);
  await db()`delete from goals where title = 'Timer test'`;
  console.log(fails === 0 ? "\nall timer checks pass" : `\n${fails} failing`);
  process.exit(fails ? 1 : 0);
}
withUser(OWNER_USER_ID, main).catch(e => { console.error(e); process.exit(1); });
