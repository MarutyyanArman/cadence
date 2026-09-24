/**
 * The dictionaries, checked against each other.
 *
 * TypeScript already refuses a missing or misspelled key — `ru` is typed as
 * `Dict`. What it cannot catch is the failure that actually happens to
 * translated apps: a key that is present but still holds the English string,
 * a count that reads "5 день", or a function that quietly ignores an argument
 * and returns a constant. Those are what this file is for.
 *
 * Pure: no database, no server. Runs with plain `tsx`.
 */
import { en } from "../lib/i18n/en";
import { ru } from "../lib/i18n/ru";
import { dictionaries, LOCALES, isLocale, toLocale, DEFAULT_LOCALE } from "../lib/i18n";
import { calibrationBand, biasLabel } from "../lib/calibration";
import { rateLabel, slipLabel } from "../lib/habits";
import { recurrenceLabel } from "../lib/recurrence";
import { questCopy, QUEST_KINDS, QUEST_TARGETS } from "../lib/quests";
import { dueNotifications, type NotificationContext } from "../lib/notifications";

let failures = 0;
function t(pass: boolean, what: string) {
  console.log(`${pass ? "ok  " : "FAIL"} ${what}`);
  if (!pass) failures++;
}

/* ---------------- shape ---------------- */

/** Every path through the object, with what sits at the end of it. */
function walk(
  value: unknown,
  path: string[] = [],
  out: Array<{ path: string; kind: string; value: unknown }> = [],
) {
  if (typeof value === "function") {
    out.push({ path: path.join("."), kind: `fn/${(value as Function).length}`, value });
  } else if (Array.isArray(value)) {
    out.push({ path: path.join("."), kind: `array/${value.length}`, value });
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, [...path, k], out);
  } else {
    out.push({ path: path.join("."), kind: typeof value, value });
  }
  return out;
}

const enLeaves = walk(en);
const ruLeaves = walk(ru);
const enByPath = new Map(enLeaves.map((l) => [l.path, l]));
const ruByPath = new Map(ruLeaves.map((l) => [l.path, l]));

console.log("\n-- shape --");
t(enLeaves.length > 200, `the dictionary is the whole app (${enLeaves.length} strings)`);
t(
  enLeaves.every((l) => ruByPath.has(l.path)),
  "every English key exists in Russian",
);
t(
  ruLeaves.every((l) => enByPath.has(l.path)),
  "and Russian has no key English lacks",
);
{
  const mismatched = enLeaves.filter((l) => ruByPath.get(l.path)?.kind !== l.kind);
  t(
    mismatched.length === 0,
    `each key is the same kind in both (${mismatched.map((m) => m.path).join(", ") || "all match"})`,
  );
}

/* ---------------- nothing left in English ---------------- */

/**
 * Words that are the same in both, or not words at all. "Arc" is the product,
 * "XP" is a unit people read as a symbol, "EN"/"RU" label the switcher, and
 * "English" names a language in its own spelling — which is the point of it.
 */
const ALLOWED_LATIN = /^(Arc|XP|EN|RU|English|h|m|min)$/;

/**
 * Not copy, so not translatable: two locale codes and the product's name.
 * "Arc" being identical in both is the point, not an oversight.
 */
const CODE_PATHS = new Set(["tag", "htmlLang", "app.name"]);

const ruStrings = ruLeaves.filter((l) => l.kind === "string") as Array<{
  path: string; value: string;
}>;

console.log("\n-- translated, not copied --");
{
  // A leftover English string is identical to the English one. Values with no
  // word in them are exempt: "/ 100" and "09:00" are the same in both on
  // purpose, and there is nothing in them to translate.
  const same = ruStrings.filter((l) => {
    const original = enByPath.get(l.path)?.value;
    return (
      !CODE_PATHS.has(l.path) &&
      typeof original === "string" &&
      original === l.value &&
      /[A-Za-z]{3,}/.test(l.value)
    );
  });
  t(same.length === 0, `no Russian value is still the English one (${same.map((x) => x.path).join(", ") || "none"})`);
}
{
  // A Latin word is fine when the English string at the same key also has it:
  // that makes it a name or an identifier carried across — "Telegram",
  // "ARC_DEV_USER_ID", ".env.local" — rather than a sentence nobody
  // translated. Anything Latin that the English string does *not* contain is
  // untranslated prose, which is what this is looking for.
  const latin = ruStrings.filter((l) => {
    if (CODE_PATHS.has(l.path)) return false;
    const original = enByPath.get(l.path)?.value;
    // Case-insensitively: "Telegram id" in English is naturally "Telegram ID"
    // in Russian, and that is a rendering choice, not an untranslated word.
    const carried = (typeof original === "string" ? original : "").toLowerCase();
    const words = l.value.match(/[A-Za-z]{2,}/g) ?? [];
    return words.some((w) => !ALLOWED_LATIN.test(w) && !carried.includes(w.toLowerCase()));
  });
  t(latin.length === 0, `no untranslated Latin prose in Russian copy (${latin.map((x) => x.path).join(", ") || "none"})`);
}
{
  const cyrillic = ruStrings.filter((l) => /[Ѐ-ӿ]/.test(l.value));
  t(cyrillic.length > 100, `and most of it is actually Cyrillic (${cyrillic.length} strings)`);
}

/* ---------------- the counted forms ---------------- */

console.log("\n-- Russian plurals --");
{
  // The rule people get wrong: 11–14 take the "many" form despite their last
  // digit, and 21 goes back to the singular.
  const cases: Array<[number, string]> = [
    [1, "день"], [2, "дня"], [4, "дня"], [5, "дней"],
    [11, "дней"], [12, "дней"], [14, "дней"], [15, "дней"],
    [21, "день"], [22, "дня"], [25, "дней"], [101, "день"], [111, "дней"],
  ];
  for (const [n, want] of cases) {
    t(ru.stats.dayUnit(n) === want, `${n} → "${want}"`);
  }
}
t(
  ru.recap.sessionCount(1).includes("сессия") &&
    ru.recap.sessionCount(3).includes("сессии") &&
    ru.recap.sessionCount(7).includes("сессий"),
  "sessions decline too",
);
t(
  ru.timer.interruptions(1).includes("помеха") &&
    ru.timer.interruptions(2).includes("помехи") &&
    ru.timer.interruptions(9).includes("помех"),
  "and so do interruptions",
);

/* ---------------- functions that actually use their arguments ---------------- */

console.log("\n-- arguments reach the output --");

/**
 * A copy function that ignores its argument is the translation bug you don't
 * see: the page renders, reads fluently and states the wrong number.
 *
 * Rather than guess each signature, every function is called with numbers,
 * strings and dates; whatever it accepts without producing NaN or an Invalid
 * Date counts, and it passes if some probe changes the answer. Banded copy
 * ("Most days", "5 дней") needs probes on both sides of a boundary, which is
 * why the numeric set spans 0–12 and the unit interval.
 */
const NUMBER_PROBES = [0, 1, 2, 3, 5, 11, 12, 21, 0.3, 0.5, 0.75, 0.95];
const STRING_PROBES = ["alpha", "beta", "дельта"];
const DATE_PROBES: Date[][] = [
  [new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 0, 11))],
  [new Date(Date.UTC(2026, 8, 8)), new Date(Date.UTC(2026, 8, 14))],
  [new Date(Date.UTC(2026, 11, 28)), new Date(Date.UTC(2027, 0, 3))],
];

function probeResults(fn: (...a: unknown[]) => unknown): string[] {
  const out: string[] = [];
  const attempts: unknown[][] = [
    ...NUMBER_PROBES.map((n, i) => [n, NUMBER_PROBES[(i + 3) % NUMBER_PROBES.length]]),
    ...STRING_PROBES.map((sv, i) => [sv, STRING_PROBES[(i + 1) % STRING_PROBES.length]]),
    ...DATE_PROBES,
    [null],
  ];
  for (const args of attempts) {
    let value: unknown;
    try {
      value = fn(...args);
    } catch {
      continue; // wrong argument family for this one
    }
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (typeof text !== "string" || text.length === 0) continue;
    if (/NaN|Invalid Date|undefined|\[object/.test(text)) continue;
    out.push(text);
  }
  return out;
}

for (const [name, dict] of Object.entries(dictionaries)) {
  const leaves = walk(dict).filter((l) => l.kind.startsWith("fn/"));
  const constant: string[] = [];
  for (const leaf of leaves) {
    const results = probeResults(leaf.value as (...a: unknown[]) => unknown);
    if (results.length === 0) constant.push(`${leaf.path} (no usable output)`);
    else if (new Set(results).size < 2) constant.push(leaf.path);
  }
  t(
    leaves.length > 60,
    `${name}: most of the dictionary is parameterised (${leaves.length} functions)`,
  );
  t(
    constant.length === 0,
    `${name}: every function's argument reaches its output (${constant.join(", ") || "all do"})`,
  );
}

/* ---------------- the modules that take a dictionary ---------------- */

console.log("\n-- pure modules follow the dictionary --");
t(
  recurrenceLabel("daily") === en.recurrence.daily &&
    recurrenceLabel("daily", ru) === ru.recurrence.daily &&
    recurrenceLabel("daily", ru) !== recurrenceLabel("daily"),
  "recurrenceLabel defaults to English and switches with the dictionary",
);
t(
  calibrationBand(90).label === "Sharp" && calibrationBand(90, ru).label === ru.calibration.band.sharp,
  "calibration bands translate, and the band itself is unchanged",
);
t(
  calibrationBand(90).key === "sharp" && calibrationBand(40).key === "guessing",
  "the band key is language-independent",
);
t(
  biasLabel(1.4, ru).includes("40%") && /[Ѐ-ӿ]/.test(biasLabel(1.4, ru)),
  "bias reads in Russian and keeps its number",
);
t(
  rateLabel(1, ru) === ru.habits.rate(1) && slipLabel(3, ru) === ru.habits.slip(3),
  "habit wording follows the dictionary",
);
t(slipLabel(1, ru) === null, "and one reschedule is still not worth mentioning");
t(
  QUEST_KINDS.every((k) => {
    const rus = questCopy(k, QUEST_TARGETS[k], ru);
    return rus.title.length > 0 && /[Ѐ-ӿ]/.test(rus.title);
  }),
  "every quest has Russian copy",
);
t(
  questCopy("estimate_accuracy", 2, ru).title.includes("20%"),
  "and the quest's own numbers survive translation",
);

console.log("\n-- notifications --");
{
  const ctx: NotificationContext = {
    hour: 21,
    today: "2026-09-24",
    streak: { current: 9, restDays: 2, todayDone: false, atRisk: true, longest: 9 },
    focusTodayMinutes: 0,
    timerRunning: false,
    bestHour: null,
    nextTaskTitle: null,
    justCompleted: null,
  };
  const enNote = dueNotifications(ctx)[0];
  const ruNote = dueNotifications(ctx, ru)[0];
  t(enNote.kind === "streak_risk" && ruNote.kind === "streak_risk", "the same message fires either way");
  t(ruNote.title !== enNote.title && /[Ѐ-ӿ]/.test(ruNote.title), "its title is translated");
  t(ruNote.title.includes("9"), "and still names the streak it is about");
  t(ruNote.dedupeKey === enNote.dedupeKey, "the dedupe key does not depend on language");
  t(
    !/лень|стыд|провал|должн/i.test(`${ruNote.title} ${ruNote.body}`),
    "and does not scold in Russian either",
  );
}

/* ---------------- dates ---------------- */

console.log("\n-- dates --");
{
  const start = new Date(Date.UTC(2026, 8, 8));
  const end = new Date(Date.UTC(2026, 8, 14));
  const r = ru.fmt.weekRange(start, end);
  t(r.includes("сентября"), `the month is genitive inside a date (${r})`);
  t(r.includes("8") && r.includes("14") && r.includes("2026"), "and the range is intact");

  const across = ru.fmt.weekRange(new Date(Date.UTC(2026, 11, 28)), new Date(Date.UTC(2027, 0, 3)));
  t(across.includes("декабря") && across.includes("января"), `a week across a year names both months (${across})`);
  t(across.includes("2027"), "and lands on the later year");
}
t(en.fmt.minutes(85) === "1h 25m" && ru.fmt.minutes(85) === "1 ч 25 мин", "durations are translated, not just formatted");
t(en.fmt.minutes(0) === "0m" && ru.fmt.minutes(0) === "0 мин", "including zero");
t(en.fmt.hour(9) === "09:00" && ru.fmt.hour(9) === "09:00", "clock time is the same in both");
t(
  ru.charts.weekdays.length === 7 && ru.charts.weekdays[0] === "Пн" && ru.charts.weekdays[6] === "Вс",
  "the heatmap's week starts on Monday in Russian too",
);

/* ---------------- the locale itself ---------------- */

console.log("\n-- locale handling --");
t(LOCALES.length === 2 && LOCALES.includes("ru"), "two languages are on offer");
t(isLocale("ru") && !isLocale("de") && !isLocale(null), "only a known code counts as one");
t(toLocale("nonsense") === DEFAULT_LOCALE, "anything else falls back rather than throwing");
t(toLocale("ru") === "ru", "and a real one is kept");
t(en.htmlLang === "en" && ru.htmlLang === "ru", "each carries its own lang attribute");

console.log(
  failures === 0
    ? "\nall i18n checks pass"
    : `\n${failures} i18n check${failures === 1 ? "" : "s"} failed`,
);
process.exit(failures === 0 ? 0 : 1);
