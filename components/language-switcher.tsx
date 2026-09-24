"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Two letters in the nav, not a settings page.
 *
 * Optimistic on purpose: the label flips on click, then the server action
 * writes the cookie and `refresh()` re-renders every server component with the
 * other dictionary. If the write fails the next render puts the old one back —
 * the worst case is a label that flickers, which beats a spinner on a control
 * anyone touches roughly twice.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useT();
  const [shown, setShown] = React.useState(locale);
  const [, startTransition] = React.useTransition();

  // The server is the source of truth; follow it whenever it disagrees.
  React.useEffect(() => setShown(locale), [locale]);

  return (
    <div className="flex items-center gap-0" role="group" aria-label={t.language.label}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-label={t.language.switchAria(LOCALE_NAMES[code])}
          aria-current={shown === code ? "true" : undefined}
          onClick={() => {
            if (shown === code) return;
            setShown(code);
            startTransition(async () => {
              await setLocale(code);
              router.refresh();
            });
          }}
          className={cn(
            "px-xs py-0.5 text-xs transition-colors first:rounded-l-sm last:rounded-r-sm",
            "border border-line",
            shown === code
              ? "bg-elevated text-fg-primary"
              : "text-fg-muted hover:bg-hovered hover:text-fg-secondary",
          )}
        >
          {LOCALE_SHORT[code]}
        </button>
      ))}
    </div>
  );
}
