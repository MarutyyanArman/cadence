"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Coffee, Settings2, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useElapsed } from "@/lib/use-elapsed";
import {
  clock, loadSettings, saveSettings, DEFAULT_POMODORO, type PomodoroSettings,
} from "@/lib/pomodoro";
import { noteInterruption, startBreak, stopTimer } from "@/app/actions";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type RunningSessionView = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  goalColorSlot: 1 | 2 | 3 | 4 | 5 | 6;
  kind: "focus" | "break" | "interrupted";
  /** The task's estimate. null when there isn't one, or on a break. */
  estMinutes: number | null;
  startedAt: Date;
  interruptions: number;
  serverNow: Date;
};

const ring: Record<number, string> = {
  1: "text-chart-1", 2: "text-chart-2", 3: "text-chart-3",
  4: "text-chart-4", 5: "text-chart-5", 6: "text-chart-6",
};

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.62);
  } catch {
    /* audio blocked until first interaction — silence is an acceptable failure */
  }
}

export function TimerBar({ session }: { session: RunningSessionView | null }) {
  const router = useRouter();
  const { t } = useT();
  const [settings, setSettings] = React.useState<PomodoroSettings>(DEFAULT_POMODORO);
  const [showSettings, setShowSettings] = React.useState(false);
  const [interruptions, setInterruptions] = React.useState(session?.interruptions ?? 0);
  const firedRef = React.useRef<string | null>(null);

  React.useEffect(() => setSettings(loadSettings()), []);
  React.useEffect(() => setInterruptions(session?.interruptions ?? 0), [session?.id, session?.interruptions]);

  const seconds = useElapsed(session?.startedAt ?? null, session?.serverNow ?? null);

  const targetMinutes =
    session?.kind === "break" ? settings.breakMinutes : settings.focusMinutes;
  const targetSeconds = targetMinutes * 60;
  const remaining = targetSeconds - seconds;
  const overrun = remaining < 0;
  const progress = Math.min(1, seconds / targetSeconds);

  // Fire once per session when the target is first crossed.
  React.useEffect(() => {
    if (!session || remaining > 0 || firedRef.current === session.id) return;
    firedRef.current = session.id;
    if (settings.sound) beep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(
        session.kind === "break" ? t.timer.breakOver : t.timer.blockComplete,
        { body: session.taskTitle ?? t.timer.timeToSwitch },
      );
    }
    if (session.kind === "focus" && settings.autoStartBreak) {
      void startBreak().then(() => router.refresh());
    }
  }, [session, remaining, settings, router, t]);

  // Show the countdown in the tab title so a background tab is still useful.
  React.useEffect(() => {
    if (!session) {
      document.title = t.app.name;
      return;
    }
    const sign = overrun ? "+" : "";
    document.title =
      `${sign}${clock(Math.abs(remaining))} · ${session.taskTitle ?? t.timer.break}`;
    return () => {
      document.title = t.app.name;
    };
  }, [session, remaining, overrun, t]);

  if (!session) return null;

  const isBreak = session.kind === "break";

  /* The pace bar races the *task's estimate*, which is a different clock from
     the Pomodoro ring beside it — the ring counts down one focus block, this
     counts against what you said the whole task would take. Only rendered when
     there is an estimate to race. */
  const estSeconds = !isBreak && session.estMinutes ? session.estMinutes * 60 : null;
  const paceFraction = estSeconds ? seconds / estSeconds : 0;
  const pastEstimate = estSeconds !== null && paceFraction > 1;
  const paceTone = pastEstimate
    ? "bg-danger"
    : paceFraction > 0.85
      ? "bg-warning"
      : "bg-chart-2";

  return (
    <div
      className={cn(
        "sticky z-40 flex flex-wrap items-center gap-sm sm:gap-md",
        // Clear of the bottom tab bar, which is fixed and 56px plus the home
        // indicator. On wider screens there is no tab bar to clear.
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] sm:bottom-0",
        "border-t border-line bg-surface/95 px-md py-sm backdrop-blur sm:px-lg sm:py-md",
      )}
      role="status"
      aria-live="off"
    >
      {estSeconds !== null && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-elevated" aria-hidden>
          <div
            className={cn("h-full transition-[width] duration-1000 ease-linear", paceTone)}
            style={{ width: `${Math.min(100, paceFraction * 100)}%` }}
            suppressHydrationWarning
          />
        </div>
      )}

      <div className="relative size-9 shrink-0">
        <svg viewBox="0 0 36 36" className={cn("size-9 -rotate-90", isBreak ? "text-chart-2" : ring[session.goalColorSlot])}>
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
          <circle
            cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${progress * 94.25} 94.25`}
            className={cn(overrun && "text-warning")}
            /* Elapsed time moves between the server render and hydration, so
               this attribute never matches. Same reason the clock text below
               carries it. */
            suppressHydrationWarning
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {isBreak ? t.timer.break : (session.taskTitle ?? t.timer.untitled)}
        </p>
        <p className="font-mono text-xs text-fg-muted tabular-nums" suppressHydrationWarning>
          {t.timer.elapsed(clock(seconds))}
          <span className={cn(overrun && "text-warning")}>
            {" · "}
            {overrun ? t.timer.over(clock(-remaining)) : t.timer.left(clock(remaining))}
          </span>
          {interruptions > 0 && t.timer.interruptions(interruptions)}
        </p>
        {estSeconds !== null && (
          <p className="font-mono text-[11px] tabular-nums" suppressHydrationWarning>
            <span className={pastEstimate ? "text-danger" : "text-fg-muted"}>
              {pastEstimate
                ? t.timer.pastEstimate(clock(seconds - estSeconds), session.estMinutes!)
                : t.timer.pctOfEstimate(Math.round(paceFraction * 100), session.estMinutes!)}
            </span>
          </p>
        )}
      </div>

      {!isBreak && (
        <Button
          styleVariant="ghost"
          size="sm"
          onClick={async () => {
            setInterruptions((n) => n + 1); // optimistic: this button gets hit mid-thought
            await noteInterruption(session.id);
            router.refresh();
          }}
        >
          <TriangleAlert className="size-4" />
          {t.timer.interrupted}
        </Button>
      )}

      {!isBreak && (
        <Button
          styleVariant="secondary"
          size="sm"
          onClick={async () => {
            await startBreak();
            router.refresh();
          }}
        >
          <Coffee className="size-4" />
          {t.timer.startBreak}
        </Button>
      )}

      <Button
        styleVariant={overrun ? "danger" : "primary"}
        size="sm"
        onClick={async () => {
          await stopTimer();
          router.refresh();
        }}
      >
        <Square className="size-3.5" />
        {t.timer.stop}
      </Button>

      <Button
        styleVariant="ghost"
        size="sm"
        aria-label={t.timer.settingsAria}
        onClick={() => setShowSettings((v) => !v)}
      >
        <Settings2 className="size-4" />
      </Button>

      {showSettings && (
        <div className="w-full border-t border-line pt-md">
          <div className="flex flex-wrap items-center gap-lg text-xs">
            {(
              [
                ["focusMinutes", t.timer.focusLength],
                ["breakMinutes", t.timer.breakLength],
                ["longBreakMinutes", t.timer.longBreakLength],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-sm">
                {label}
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={settings[key]}
                  onChange={(e) => {
                    const next = { ...settings, [key]: Number(e.target.value) };
                    setSettings(next);
                    saveSettings(next);
                  }}
                  className="w-16 rounded-sm bg-elevated px-sm py-xs font-mono outline-none"
                />
                {t.timer.min}
              </label>
            ))}

            <label className="flex items-center gap-sm">
              <input
                type="checkbox"
                checked={settings.autoStartBreak}
                onChange={(e) => {
                  const next = { ...settings, autoStartBreak: e.target.checked };
                  setSettings(next);
                  saveSettings(next);
                }}
              />
              {t.timer.autoStartBreak}
            </label>

            <label className="flex items-center gap-sm">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={(e) => {
                  const next = { ...settings, sound: e.target.checked };
                  setSettings(next);
                  saveSettings(next);
                  if (e.target.checked && typeof Notification !== "undefined") {
                    void Notification.requestPermission();
                  }
                }}
              />
              {t.timer.soundAndNotifications}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
