/**
 * Fixture for `verify-queries.ts`.
 *
 * That script reads two goals that it never creates itself — "Ship Arc v1"
 * at 2/3 done with a "Calendar drag" task carrying ~100 minutes of logged
 * focus time. No such fixture exists anywhere in the six source folders this
 * project was assembled from, and nothing else in the schema or scripts
 * creates it. Written from the assertions in verify-queries.ts, not
 * recovered from any delivered file.
 *
 * Idempotent: safe to run repeatedly, including against a database that
 * already has this fixture from a previous run.
 *
 * Run: npx tsx scripts/seed.ts
 */
import { db } from "../lib/db";
import { withUser, OWNER_USER_ID } from "../lib/session";

async function main() {
  const sql = db();

  const GOALS = ["Ship Arc v1", "Personal reading"];
  const TASKS = ["Calendar drag", "Design the week grid", "Ship the timer bar"];

  // Clean slate — children before parents, since goal_id/task_id are ON DELETE SET NULL.
  await sql`
    delete from time_sessions where task_id in (
      select id from tasks where title = any(${TASKS})
    )
  `;
  await sql`delete from tasks where title = any(${TASKS})`;
  await sql`delete from goals where title = any(${GOALS})`;

  const [{ id: arcId }] = await sql<{ id: string }[]>`
    insert into goals (user_id, title, color_slot, status)
    values (${OWNER_USER_ID}, 'Ship Arc v1', 1, 'active')
    returning id
  `;
  // A second goal so listGoals() has exactly 2 rows, per verify-queries.ts.
  // No tasks under it — v_goal_progress left-joins tasks, so it still shows
  // up with total_tasks = 0 and progress = 0.
  await sql`
    insert into goals (user_id, title, color_slot, status)
    values (${OWNER_USER_ID}, 'Personal reading', 2, 'active')
  `;

  // Not done, due today — lands in the "today" scope.
  const [{ id: dragId }] = await sql<{ id: string }[]>`
    insert into tasks (user_id, title, goal_id, status, priority, est_minutes, due_at)
    values (${OWNER_USER_ID}, 'Calendar drag', ${arcId}, 'todo', 2, 90, current_date)
    returning id
  `;
  // 100 minutes of closed focus time → v_task_actuals reports actualMinutes = 100 (>= 95).
  await sql`
    insert into time_sessions (user_id, task_id, goal_id, kind, started_at, ended_at)
    values (${OWNER_USER_ID}, ${dragId}, ${arcId}, 'focus', now() - interval '100 minutes', now())
  `;

  // Two done tasks, both completed within the last 14 days, so
  // v_goal_progress's projection has a non-null done_last_14d to divide by.
  // 2 done / 3 total = 0.6666… → rounds to 0.667, the value the script asserts.
  await sql`
    insert into tasks (user_id, title, goal_id, status, priority, est_minutes, completed_at)
    values (${OWNER_USER_ID}, 'Design the week grid', ${arcId}, 'done', 2, 120, now() - interval '2 days')
  `;
  await sql`
    insert into tasks (user_id, title, goal_id, status, priority, est_minutes, completed_at)
    values (${OWNER_USER_ID}, 'Ship the timer bar', ${arcId}, 'done', 2, 60, now() - interval '6 days')
  `;

  console.log("seeded: 2 goals, 3 tasks under 'Ship Arc v1', 1 focus session");
  await sql.end();
}

withUser(OWNER_USER_ID, main).catch((e) => {
  console.error(e);
  process.exit(1);
});
