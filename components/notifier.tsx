"use client";

import * as React from "react";
import { claimNotification, pendingNotifications } from "@/app/actions";
import { loadPrefs } from "@/lib/notification-prefs";

/** How often to ask the server whether it has anything to say. */
const POLL_MS = 60_000;

/**
 * Delivery. Renders nothing.
 *
 * Mounted in the root layout so the evening streak notice reaches you on any
 * route — but note the honest limit: this only runs while a Cadence tab is open.
 * Real push with the browser closed needs a service worker and a push service,
 * which is a lot of infrastructure for an app that lives on localhost. That is
 * a deliberate stopping point, not an oversight.
 *
 * Preferences are re-read every tick rather than held in state, so changing a
 * toggle takes effect without any wiring between the two components.
 */
export function Notifier() {
  React.useEffect(() => {
    if (typeof Notification === "undefined") return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || Notification.permission !== "granted") return;
      if (document.visibilityState === "hidden") return;

      const prefs = loadPrefs();
      let candidates;
      try {
        candidates = await pendingNotifications();
      } catch {
        return; // a dropped poll is not worth surfacing
      }
      if (cancelled) return;

      for (const c of candidates) {
        if (!prefs[c.kind]) continue;
        // Claim first: a duplicate notification is worse than a missed one.
        const won = await claimNotification(c.kind, c.dedupeKey);
        if (cancelled || !won) continue;
        try {
          new Notification(c.title, { body: c.body, tag: `cadence-${c.kind}` });
        } catch {
          /* the browser refused it; the claim stands so it won't retry forever */
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return null;
}
