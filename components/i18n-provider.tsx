"use client";

import * as React from "react";
import {
  dictionaryFor, DEFAULT_LOCALE, type Dict, type Locale,
} from "@/lib/i18n";

/**
 * The chosen language, for client components.
 *
 * Only the locale *string* crosses the server/client boundary — the
 * dictionaries are plain modules both sides import, so the functions in them
 * survive. Serialising the dictionary itself would not work: a server
 * component can only pass plain data to a client one, and every count and date
 * in this app is a function.
 *
 * The cost is both dictionaries in the client bundle. They are a few kilobytes
 * of strings, and it buys an instant switch with no second request.
 */
const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext);
}

/** `const { t, locale } = useT();` — the shape server components get too. */
export function useT(): { locale: Locale; t: Dict } {
  const locale = useLocale();
  return React.useMemo(() => ({ locale, t: dictionaryFor(locale) }), [locale]);
}
