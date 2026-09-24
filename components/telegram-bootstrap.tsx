"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * What runs the moment Telegram opens the app.
 *
 * Three jobs, in order:
 *
 *   1. Tell Telegram we're ready and ask for the full viewport, so the page
 *      isn't stuck in the half-height sheet it opens in.
 *   2. Hand `initData` to the server once, which verifies the signature and
 *      sets a session cookie. Only when there isn't one already — this is a
 *      network round trip on a phone, and repeating it on every navigation
 *      would be felt.
 *   3. Match Telegram's chrome to the page, so the header above the Mini App
 *      isn't a different colour from the app under it.
 *
 * Renders nothing. Outside Telegram it does nothing at all, which is what
 * keeps `npm run dev` in a normal browser working.
 */

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  colorScheme?: "light" | "dark";
  platform?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Cadence is dark-only; this is `--color-bg-canvas` resolved. */
const CANVAS = "#0b0d10";

export function TelegramBootstrap({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  // The sign-in POST must fire once per mount at most. In StrictMode the effect
  // runs twice in development, and without this the second run races the first.
  const attempted = React.useRef(false);

  React.useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();
    // A Mini App that closes when you scroll up in a long task list is
    // infuriating; Telegram lets us opt out of that gesture.
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.(CANVAS);
    tg.setBackgroundColor?.(CANVAS);

    if (signedIn || attempted.current) return;
    if (!tg.initData) return; // opened outside Telegram, or Telegram gave us nothing
    attempted.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/telegram", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: tg.initData }),
        });
        if (cancelled || !res.ok) return;
        // The cookie is set; re-render the server components with a user.
        router.refresh();
      } catch {
        /* offline or blocked — the gate stays up and the user can retry */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);

  return null;
}
