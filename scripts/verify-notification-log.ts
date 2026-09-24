/** Integration checks against a live database. Run: npx tsx scripts/verify-notification-log.ts */
import {
  bestFocusHour, claimNotification, recentlyCompletedEstimate, serverClock,
  createTask, setTaskStatus,
} from "../lib/queries";
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

const MARK = "notif-test";

async function main() {
  const sql = db();
  const clean = async () => {
    await sql`delete from notification_log where dedupe_key like ${MARK + "%"}`;
    await sql`delete from time_sessions where task_id in (select id from tasks where title like ${MARK + "%"})`;
    await sql`delete from tasks where title like ${MARK + "%"}`;
  };
  await clean();

  /* 1 — the clock the day rules run on */
  {
    const clock = await serverClock();
    t(/^\d{4}-\d{2}-\d{2}$/.test(clock.today), `serverClock returns an ISO day (${clock.today})`);
    t(Number(clock.hour) >= 0 && Number(clock.hour) <= 23, `serverClock returns an hour 0–23 (${clock.hour})`);
  }

  /* 2 — claiming is once, and the second caller is told so */
  {
    const first = await claimNotification("streak_risk", `${MARK}-day`);
    const second = await claimNotification("streak_risk", `${MARK}-day`);
    t(first === true, "the first claim wins");
    t(second === false, "the second claim loses — a duplicate can't be shown");
  }

  /* 3 — the same key under a different kind is a different thing to say */
  {
    const other = await claimNotification("best_hour", `${MARK}-day`);
    t(other === true, "a different kind with the same key is claimed independently");
  }

  /* 4 — tomorrow's nudge is a new claim */
  {
    const tomorrow = await claimNotification("streak_risk", `${MARK}-day-2`);
    t(tomorrow === true, "a new day is a new claim, so the nudge can recur");
  }

  /* 5 — simultaneous claims: exactly one wins */
  {
    const key = `${MARK}-race`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimNotification("calibration", key)),
    );
    const winners = results.filter(Boolean).length;
    t(winners === 1, `eight tabs claiming at once yields exactly one winner (got ${winners})`);
  }

  /* 6 — a just-finished estimated task is reportable, and only briefly */
  {
    const id = await createTask({ title: `${MARK} measured`, estMinutes: 30 });
    // A real session, not an instant one: v_task_actuals casts seconds to
    // bigint, so a sub-second session rounds to zero and is correctly treated
    // as having no measurable time.
    await sql`
      insert into time_sessions (user_id, task_id, kind, started_at, ended_at)
      values (${OWNER_USER_ID}, ${id}, 'focus', now() - interval '32 minutes', now())
    `;
    await setTaskStatus(id, "done");

    const found = await recentlyCompletedEstimate(5);
    t(found?.taskId === id, "a task finished just now is offered for reporting");
    t(Number(found?.estimateMinutes) === 30, "...with its estimate");

    const stale = await recentlyCompletedEstimate(0);
    t(stale?.taskId !== id, "...and drops out of the window once it isn't recent");
  }

  /* 7 — a task with no estimate has no result worth reporting */
  {
    const id = await createTask({ title: `${MARK} unmeasured` });
    await sql`
      insert into time_sessions (user_id, task_id, kind, started_at, ended_at)
      values (${OWNER_USER_ID}, ${id}, 'focus', now() - interval '20 minutes', now())
    `;
    await setTaskStatus(id, "done");
    const found = await recentlyCompletedEstimate(5);
    t(found?.taskId !== id, "a task without an estimate is never reported on");
  }

  /* 8 — the best hour is a real hour or nothing */
  {
    const best = await bestFocusHour();
    t(
      best === null || (Number(best.hour) >= 0 && Number(best.hour) <= 23),
      `bestFocusHour returns a real hour or null (${best ? best.hour : "null"})`,
    );
    if (best) {
      t(Number(best.sessions) > 0, "...with a session count behind it");
      t(Number(best.averageMinutes) >= 0, "...and a non-negative average");
    }
  }

  await clean();
  await sql.end();
  console.log(fails === 0 ? "\nall notification-log checks pass" : `\n${fails} failed`);
  process.exit(fails === 0 ? 0 : 1);
}

withUser(OWNER_USER_ID, main).catch((e) => { console.error(e); process.exit(1); });
