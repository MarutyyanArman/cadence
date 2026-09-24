/**
 * Sign-in from inside Telegram.
 *
 * The Mini App posts the `initData` blob Telegram gave it; this verifies the
 * signature against the bot token, finds or creates the account, and sets a
 * session cookie. After that the rest of the app never thinks about Telegram
 * again — it just asks `currentUserId()`.
 *
 * A route handler rather than a server action because the client calls it
 * before any page has rendered anything it could submit.
 */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/telegram";
import { upsertTelegramUser } from "@/lib/users";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Loud on the server, vague to the client: which piece of configuration is
    // missing is not a stranger's business.
    console.error("TELEGRAM_BOT_TOKEN is not set — Mini App sign-in cannot work.");
    return NextResponse.json({ ok: false, error: "sign-in unavailable" }, { status: 503 });
  }

  let initData: unknown;
  try {
    ({ initData } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 8192) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const result = verifyInitData(initData, token);
  if (!result.ok) {
    console.warn(`Rejected a Mini App sign-in: ${result.reason}`);
    // One message for every failure. Telling a forger *which* check they failed
    // is telling them how to pass it next time.
    return NextResponse.json({ ok: false, error: "could not verify" }, { status: 401 });
  }

  const user = await upsertTelegramUser(result.user);

  const response = NextResponse.json({ ok: true, name: user.firstName, locale: user.locale });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Their remembered language, so the first paint after sign-in is already in
  // it rather than flashing English.
  response.cookies.set(LOCALE_COOKIE, user.locale, {
    sameSite: "lax",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
  return response;
}
