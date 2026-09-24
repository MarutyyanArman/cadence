/**
 * Who is asking.
 *
 * Every query in this app resolves its owner through `currentUserId()` rather
 * than taking a `userId` parameter. That is a deliberate trade: a parameter on
 * forty functions is forty call sites that can forget it, and forgetting it in
 * one place means one person seeing another's tasks. Here there is a single
 * place to get it right, and a query that runs with no user throws rather than
 * quietly returning everybody's rows.
 *
 * Two ways in, in priority order:
 *
 *   1. An explicit `withUser(id, …)` scope. Used by the verify suites and by
 *      anything running outside a request, where there are no cookies.
 *   2. The session cookie, signed with `ARC_SESSION_SECRET`.
 *
 * And in development only, a fallback so `npm run dev` on localhost behaves
 * exactly as it did before anyone had to sign in.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "arc_session";

/** A month. Telegram reopens the app constantly; re-signing daily is noise. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * The account that adopted everything from before Arc was multi-user. Matches
 * the fixed id in migrations/007-multi-user.sql.
 */
export const OWNER_USER_ID = "00000000-0000-0000-0000-000000000001";

export class NotSignedIn extends Error {
  constructor() {
    super("No Arc session. Open this from Telegram, or set ARC_DEV_USER_ID for local use.");
    this.name = "NotSignedIn";
  }
}

const scope = new AsyncLocalStorage<string>();

/**
 * Run `fn` as a given user, whatever the request says.
 *
 * Only for code with no request to read — scripts and tests. Deliberately not
 * exported to anything that handles a request: it is an impersonation
 * primitive, and the only safe caller is one with no user input in scope.
 */
export function withUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return scope.run(userId, fn);
}

function secret(): string {
  const s = process.env.ARC_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ARC_SESSION_SECRET is missing or too short. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** `userId.expiresAt.signature` — small enough for a cookie, and self-contained. */
export function createSessionToken(userId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_MAX_AGE;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * The user id inside a token, or null.
 *
 * The comparison is timing-safe. It matters less here than on a password, but
 * a forged session is a forged session and the cost of doing it properly is
 * one function call.
 */
export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, signature] = parts;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires * 1000 < now) return null;

  let expected: string;
  try {
    expected = sign(`${userId}.${expiresRaw}`);
  } catch {
    return null; // no secret configured; treat every session as invalid
  }
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return userId;
}

/**
 * The dev-only escape hatch.
 *
 * Guarded on NODE_ENV as well as the variable being set, so a `.env` copied to
 * a server by accident still can't hand out someone's account.
 */
function devFallback(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.ARC_DEV_USER_ID || null;
}

/**
 * `next/headers` is imported lazily and defensively: this module is also
 * loaded by the verify suites, which run under plain `tsx` with no request
 * around them and must not blow up merely importing it.
 */
async function fromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return readSessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** The signed-in user id, or null. For code that wants to show a sign-in screen. */
export async function currentUserIdOrNull(): Promise<string | null> {
  return scope.getStore() ?? (await fromCookie()) ?? devFallback();
}

/** The signed-in user id, or a throw. Every query goes through this. */
export async function currentUserId(): Promise<string> {
  const id = await currentUserIdOrNull();
  if (!id) throw new NotSignedIn();
  return id;
}
