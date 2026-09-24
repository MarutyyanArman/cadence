import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* Duration formatting used to live here. It moved into the dictionaries
   (lib/i18n/en.ts, lib/i18n/ru.ts) as `t.fmt.minutes`: "1h 25m" and
   "1 ч 25 мин" are different strings, not the same one with a word swapped.
   Leaving a second, English-only copy here would have been a standing
   invitation to print English durations into a Russian page. */
