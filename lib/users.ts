/**
 * Accounts.
 *
 * The one module that reads and writes rows *without* going through
 * `currentUserId()` — it runs before there is a current user, which is the
 * whole point of it. Everything here takes the user it operates on as an
 * argument, and the only caller is the sign-in route.
 */
import { db } from "./db";
import { OWNER_USER_ID } from "./session";
import { localeFromTelegram, type TelegramUser } from "./telegram";

export type ArcUser = {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  locale: "en" | "ru";
};

/**
 * Sign in, creating the account if this is the first time.
 *
 * `locale` is set only on insert. Telegram's guess is a good first one, but
 * once somebody has touched the EN/RU switch, their choice outranks what their
 * phone's language says — overwriting it on every sign-in would undo the
 * switch every time they reopened the app.
 */
export async function upsertTelegramUser(tg: TelegramUser): Promise<ArcUser> {
  const sql = db();
  const telegramId = String(tg.id);

  // Claiming the pre-multi-user history. Set CADENCE_OWNER_TELEGRAM_ID to your own
  // Telegram id and your first sign-in adopts the owner account — with every
  // goal, task and logged hour that existed before accounts did — rather than
  // starting you on an empty one. It only ever fires while the owner account
  // is unclaimed, so it cannot transfer an account twice.
  const ownerClaim = process.env.CADENCE_OWNER_TELEGRAM_ID;
  if (ownerClaim && ownerClaim === telegramId) {
    await sql`
      update users
      set telegram_id = ${telegramId}::bigint
      where id = ${OWNER_USER_ID} and telegram_id is null
    `;
  }

  const [row] = await sql<ArcUser[]>`
    insert into users (telegram_id, username, first_name, last_name, photo_url, locale)
    values (
      ${telegramId}::bigint,
      ${tg.username ?? null},
      ${tg.first_name ?? null},
      ${tg.last_name ?? null},
      ${tg.photo_url ?? null},
      ${localeFromTelegram(tg.language_code)}
    )
    on conflict (telegram_id) do update set
      username     = excluded.username,
      first_name   = excluded.first_name,
      last_name    = excluded.last_name,
      photo_url    = excluded.photo_url,
      last_seen_at = now()
    returning id, telegram_id, username, first_name, last_name, photo_url, locale
  `;
  return row;
}

export async function getUser(id: string): Promise<ArcUser | null> {
  const sql = db();
  const [row] = await sql<ArcUser[]>`
    select id, telegram_id, username, first_name, last_name, photo_url, locale
    from users where id = ${id}
  `;
  return row ?? null;
}

/**
 * Remember the language across devices.
 *
 * The cookie alone would mean choosing Russian on your phone and getting
 * English on your laptop, which reads as the app forgetting.
 */
export async function setUserLocale(id: string, locale: "en" | "ru"): Promise<void> {
  const sql = db();
  await sql`update users set locale = ${locale} where id = ${id}`;
}

/** How many people use this instance. Shown nowhere; useful when operating it. */
export async function countUsers(): Promise<number> {
  const sql = db();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  return row.n;
}
