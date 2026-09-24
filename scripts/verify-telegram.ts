/**
 * The signature check that stands between a stranger and your account.
 *
 * `initData` is a query string the browser hands us; the only reason to
 * believe anything in it is the HMAC. Every test here is a forgery attempt:
 * change a byte, drop a field, reuse yesterday's blob, sign with the wrong
 * token. Each must be rejected.
 *
 * Pure — it signs its own fixtures with a fake token, so there is no bot, no
 * network and no database involved.
 */
import { createHmac } from "node:crypto";
import {
  verifyInitData, signInitData, dataCheckString, localeFromTelegram, displayName,
  MAX_AUTH_AGE_SECONDS,
} from "../lib/telegram";

let failures = 0;
function t(pass: boolean, what: string) {
  console.log(`${pass ? "ok  " : "FAIL"} ${what}`);
  if (!pass) failures++;
}

const TOKEN = "123456:FAKE-TOKEN-FOR-TESTS-ONLY";
const OTHER_TOKEN = "654321:A-DIFFERENT-BOT";
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

const USER = {
  id: 4242,
  first_name: "Арман",
  last_name: "М",
  username: "arman",
  language_code: "ru-RU",
};

/** Build a blob exactly as Telegram would, so a pass means the real thing passes. */
function makeInitData(
  overrides: Record<string, string> = {},
  token = TOKEN,
  authDate = Math.floor(NOW / 1000),
): string {
  const params = new URLSearchParams({
    query_id: "AAF_test",
    user: JSON.stringify(USER),
    auth_date: String(authDate),
    ...overrides,
  });
  params.set("hash", signInitData(params, token));
  return params.toString();
}

console.log("-- a genuine sign-in --");
{
  const r = verifyInitData(makeInitData(), TOKEN, NOW);
  t(r.ok, "a correctly signed blob is accepted");
  if (r.ok) {
    t(r.user.id === 4242, "the user id survives");
    t(r.user.first_name === "Арман", "and so does a non-Latin name");
  }
}

console.log("\n-- forgeries --");
{
  const good = makeInitData();

  // The attack this whole file exists to stop: take a valid blob, put your own
  // id in it, keep the old signature.
  const swapped = new URLSearchParams(good);
  swapped.set("user", JSON.stringify({ ...USER, id: 9999 }));
  const r1 = verifyInitData(swapped.toString(), TOKEN, NOW);
  t(!r1.ok, "editing the user without re-signing is rejected");

  const noHash = new URLSearchParams(good);
  noHash.delete("hash");
  t(!verifyInitData(noHash.toString(), TOKEN, NOW).ok, "a blob with no hash is rejected");

  const zeroed = new URLSearchParams(good);
  zeroed.set("hash", "0".repeat(64));
  t(!verifyInitData(zeroed.toString(), TOKEN, NOW).ok, "a made-up hash is rejected");

  const shortHash = new URLSearchParams(good);
  shortHash.set("hash", "ab");
  t(!verifyInitData(shortHash.toString(), TOKEN, NOW).ok, "a truncated hash is rejected");

  const nonHex = new URLSearchParams(good);
  nonHex.set("hash", "zz".repeat(32));
  t(!verifyInitData(nonHex.toString(), TOKEN, NOW).ok, "a non-hex hash is rejected, not thrown on");

  t(
    !verifyInitData(makeInitData({}, OTHER_TOKEN), TOKEN, NOW).ok,
    "a blob signed by another bot is rejected",
  );
  t(
    !verifyInitData(good, OTHER_TOKEN, NOW).ok,
    "and our own blob fails against the wrong token",
  );
  t(!verifyInitData(good, "", NOW).ok, "no configured token means nobody gets in");
  t(!verifyInitData("", TOKEN, NOW).ok, "an empty blob is rejected");
  t(!verifyInitData("not=a&valid=blob", TOKEN, NOW).ok, "an unsigned query string is rejected");
}

console.log("\n-- freshness --");
{
  const dayOld = Math.floor(NOW / 1000) - MAX_AUTH_AGE_SECONDS - 60;
  t(
    !verifyInitData(makeInitData({}, TOKEN, dayOld), TOKEN, NOW).ok,
    "a captured blob stops working once it is stale",
  );
  const justInside = Math.floor(NOW / 1000) - MAX_AUTH_AGE_SECONDS + 60;
  t(
    verifyInitData(makeInitData({}, TOKEN, justInside), TOKEN, NOW).ok,
    "but one inside the window still works",
  );
  const future = Math.floor(NOW / 1000) + 3600;
  t(
    !verifyInitData(makeInitData({}, TOKEN, future), TOKEN, NOW).ok,
    "an auth_date from the future is rejected",
  );
  const skew = Math.floor(NOW / 1000) + 60;
  t(
    verifyInitData(makeInitData({}, TOKEN, skew), TOKEN, NOW).ok,
    "a minute of clock skew is tolerated",
  );
  t(
    !verifyInitData(makeInitData({ auth_date: "" }), TOKEN, NOW).ok,
    "a missing auth_date is rejected",
  );
}

console.log("\n-- malformed users --");
{
  t(
    !verifyInitData(makeInitData({ user: "{not json" }), TOKEN, NOW).ok,
    "a user field that isn't JSON is rejected, not thrown on",
  );
  t(
    !verifyInitData(makeInitData({ user: JSON.stringify({ first_name: "x" }) }), TOKEN, NOW).ok,
    "a user with no id is rejected",
  );
  t(
    !verifyInitData(
      makeInitData({ user: JSON.stringify({ id: 1, is_bot: true }) }), TOKEN, NOW,
    ).ok,
    "a bot does not get an account",
  );
}

console.log("\n-- the check string --");
{
  // Sorted by key, "hash" excluded, newline-joined — get any of these wrong
  // and nothing ever validates.
  const params = new URLSearchParams({ c: "3", a: "1", b: "2", hash: "x" });
  t(dataCheckString(params) === "a=1\nb=2\nc=3", "fields are sorted and hash is left out");

  // Telegram's own worked example of the key order, which is the easy thing to
  // invert: the salt is the key and the token is the message, not vice versa.
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString(params)).digest("hex");
  t(signInitData(params, TOKEN) === expected, "the secret is HMAC(key: 'WebAppData', msg: token)");

  // Telegram sends `signature` alongside `hash` for its newer Ed25519 scheme;
  // it is not part of what the HMAC covers, so it must be excluded too.
  const withSig = new URLSearchParams(makeInitData());
  withSig.set("signature", "something-telegram-added");
  t(
    verifyInitData(withSig.toString(), TOKEN, NOW).ok,
    "an added `signature` field doesn't break the HMAC check",
  );
}

console.log("\n-- what we do with the profile --");
{
  t(localeFromTelegram("ru") === "ru" && localeFromTelegram("ru-RU") === "ru",
    "a Russian phone starts in Russian");
  t(localeFromTelegram("en-GB") === "en" && localeFromTelegram(undefined) === "en",
    "anything we don't speak starts in English");
  t(localeFromTelegram("de-DE") === "en", "including languages Arc has no dictionary for");
  t(displayName({ id: 1, first_name: "Арман", last_name: "Марутян" }) === "Арман М.",
    "a name shortens to first plus initial");
  t(displayName({ id: 1, username: "arman" }) === "@arman", "a username stands in");
  t(displayName({ id: 7 }) === "#7", "and an id is the last resort");
}

console.log(
  failures === 0
    ? "\nall telegram checks pass"
    : `\n${failures} telegram check${failures === 1 ? "" : "s"} failed`,
);
process.exit(failures === 0 ? 0 : 1);
