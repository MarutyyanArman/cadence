/**
 * Which languages exist, and how to get from a locale to its dictionary.
 *
 * Safe on both sides of the server/client boundary: no `next/headers`, no
 * `"use client"`. Server components go through `lib/i18n/server.ts`, client
 * components through `components/i18n-provider.tsx`, and both land here.
 *
 * The choice is carried in a cookie rather than a URL segment (`/ru/...`).
 * Every route in Arc is already `force-dynamic` — it reads live data on each
 * request — so a path prefix would buy no caching, and it would break every
 * link, bookmark and `revalidatePath` in the app for a preference that belongs
 * to the person, not the page.
 */
import { en, type Dict } from "./en";
import { ru } from "./ru";

export type { Dict };

export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Read and written by both the server action and the switcher. */
export const LOCALE_COOKIE = "arc_locale";

/** A year: long enough that the choice is made once. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const dictionaries: Record<Locale, Dict> = { en, ru };

/** What the switcher shows — each language named in itself. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};

/** Two letters for the compact switcher. */
export const LOCALE_SHORT: Record<Locale, string> = { en: "EN", ru: "RU" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Anything unrecognised falls back rather than throwing. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dictionaryFor(locale: Locale): Dict {
  return dictionaries[locale] ?? en;
}
