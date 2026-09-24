"use client";

import { NOTIFICATION_KINDS, type NotificationKind } from "./notifications";

/**
 * Which notifications you want, kept in localStorage alongside the Pomodoro
 * settings — this is a per-browser preference, not something the server needs.
 *
 * Defaults: the two that carry real information are on, the evening streak
 * nudge is off. It's the one most likely to feel like nagging, so it should be
 * something you turn on deliberately rather than something you have to notice
 * and switch off.
 */
export type NotificationPrefs = Record<NotificationKind, boolean>;

export const DEFAULT_PREFS: NotificationPrefs = {
  calibration: true,
  best_hour: true,
  streak_risk: false,
};

const KEY = "cadence.notifications";

export function loadPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    const out = { ...DEFAULT_PREFS };
    for (const kind of NOTIFICATION_KINDS) {
      if (typeof parsed[kind] === "boolean") out[kind] = parsed[kind];
    }
    return out;
  } catch {
    // Private windows and blocked site data both throw here; defaults are fine.
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* nothing to do — the toggle simply won't persist */
  }
}
