/**
 * The chosen language, on the server.
 *
 * `cookies()` opts the caller into dynamic rendering, which every route here
 * already is. It is deliberately *not* called from the root layout's static
 * shell beyond `<html lang>` — see app/layout.tsx.
 */
import { cookies } from "next/headers";
import {
  dictionaryFor, toLocale, LOCALE_COOKIE, type Dict, type Locale,
} from "./index";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return toLocale(store.get(LOCALE_COOKIE)?.value);
}

/**
 * Locale and dictionary together, since almost every caller wants both — the
 * dictionary to read copy from, the locale to hand to the client provider.
 */
export async function getI18n(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dictionaryFor(locale) };
}

/** When only the copy is needed. */
export async function getDict(): Promise<Dict> {
  return dictionaryFor(await getLocale());
}
