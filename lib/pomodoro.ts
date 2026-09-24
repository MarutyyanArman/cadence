export type PomodoroSettings = {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartBreak: boolean;
  sound: boolean;
};

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreak: false,
  sound: true,
};

const KEY = "cadence.pomodoro";

export function loadSettings(): PomodoroSettings {
  if (typeof window === "undefined") return DEFAULT_POMODORO;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_POMODORO;
    const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
    return {
      ...DEFAULT_POMODORO,
      ...parsed,
      // never let a corrupted value produce a zero-length or absurd timer
      focusMinutes: clampMin(parsed.focusMinutes, DEFAULT_POMODORO.focusMinutes),
      breakMinutes: clampMin(parsed.breakMinutes, DEFAULT_POMODORO.breakMinutes),
      longBreakMinutes: clampMin(parsed.longBreakMinutes, DEFAULT_POMODORO.longBreakMinutes),
    };
  } catch {
    return DEFAULT_POMODORO;
  }
}

function clampMin(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 240) return fallback;
  return Math.round(n);
}

export function saveSettings(s: PomodoroSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — timer still works, settings just don't persist */
  }
}

/** mm:ss, or h:mm:ss once a session passes an hour. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
