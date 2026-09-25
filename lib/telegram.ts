/**
 * Proving who opened the Mini App.
 *
 * Telegram hands the page a blob called `initData`: the user's profile plus an
 * HMAC over it, keyed by the bot token. Because only the bot's owner has that
 * token, a valid signature is proof the data came from Telegram and wasn't
 * edited on the way. Without this check, `initData` is just a query string the
 * client can type — anyone could claim to be anyone.
 *
 * The scheme, from Telegram's spec:
 *
 *   secret        = HMAC-SHA256(key: "WebAppData", message: bot_token)
 *   check_string  = every field except `hash`, as "k=v", sorted by k, "\n"-joined
 *   valid         = hash == HMAC-SHA256(key: secret, message: check_string)
 *
 * The key/message order is inverted on the first line relative to what you'd
 * expect, which is the usual place to get this wrong.
 *
 * Pure and dependency-free, so it is testable without a bot, a network or a
 * database — see scripts/verify-telegram.ts, which signs its own fixtures.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_bot?: boolean;
};

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: string };

/**
 * How old a sign-in may be. A day is generous, and the cookie we mint from it
 * lasts a month — this bounds replay of a *captured* initData string, not how
 * long someone stays signed in.
 */
export const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24;

/** The literal from the spec. Named so nobody "tidies" it into the token. */
const SECRET_SALT = "WebAppData";

function hmacHex(key: string | Buffer, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * The string Telegram signed.
 *
 * Built from the *decoded* values, sorted by key. `URLSearchParams` decodes for
 * us; re-encoding here would produce a different string and fail every check.
 *
 * Only `hash` is left out: it is the thing being compared. Real initData also
 * carries a `signature` field (Telegram's newer Ed25519 scheme for third
 * parties), and for *this* bot-token HMAC method it is an ordinary field like
 * any other — the HMAC covers it. The "except hash and signature" rule in
 * Telegram's docs belongs to the Ed25519 method, which builds a different
 * string. This function once dropped `signature` too, having conflated the
 * two; every real sign-in was rejected while synthetic test data, which had no
 * such field, kept passing. See verify-telegram.ts for the test that would
 * have caught it.
 */
export function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** Sign a check string the way Telegram does. Exported for the test's fixtures. */
export function signInitData(params: URLSearchParams, botToken: string): string {
  const secret = createHmac("sha256", SECRET_SALT).update(botToken).digest();
  return hmacHex(secret, dataCheckString(params));
}

export function verifyInitData(
  initData: string,
  botToken: string,
  now: number = Date.now(),
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS,
): InitDataResult {
  if (!botToken) return { ok: false, reason: "no bot token configured" };
  if (!initData) return { ok: false, reason: "empty initData" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed initData" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no hash" };

  if (!equalHex(hash, signInitData(params, botToken))) {
    return { ok: false, reason: "signature does not match" };
  }

  // Signature first, freshness second: an unsigned blob's auth_date means
  // nothing, so there is no point reading it before the hash checks out.
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, reason: "no auth_date" };
  }
  const ageSeconds = Math.floor(now / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds) return { ok: false, reason: "initData is too old" };
  // A little clock skew is normal; a sign-in from the future is not.
  if (ageSeconds < -300) return { ok: false, reason: "auth_date is in the future" };

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no user" };

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    return { ok: false, reason: "user is not valid JSON" };
  }
  if (typeof user.id !== "number" || !Number.isFinite(user.id)) {
    return { ok: false, reason: "user has no id" };
  }
  if (user.is_bot) return { ok: false, reason: "bots do not get accounts" };

  return { ok: true, user, authDate };
}

/**
 * Telegram's `language_code` is a full BCP-47 tag ("ru-RU", "en-GB"), and it
 * reports the user's *Telegram* language, which is the best first guess we
 * have. Anything we don't speak falls back to English, and the switcher in the
 * nav overrides it from then on.
 */
export function localeFromTelegram(languageCode: string | undefined): "en" | "ru" {
  return (languageCode ?? "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** "Иван П." — enough to show whose account this is without storing more. */
export function displayName(user: TelegramUser): string {
  const first = (user.first_name ?? "").trim();
  const last = (user.last_name ?? "").trim();
  if (first && last) return `${first} ${last.charAt(0)}.`;
  if (first) return first;
  if (user.username) return `@${user.username}`;
  return `#${user.id}`;
}
