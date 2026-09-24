"use client";

import * as React from "react";

/**
 * Seconds elapsed since `startedAt`, ticking once a second.
 *
 * The browser clock can sit minutes away from the server's. `serverNow` is the
 * database's clock at the moment the session was read, so the offset between
 * the two is measured once and applied to every tick. Without this, a skewed
 * client clock shows a wrong — occasionally negative — elapsed time.
 */
export function useElapsed(startedAt: Date | null, serverNow: Date | null): number {
  const offsetRef = React.useRef(0);

  React.useEffect(() => {
    if (serverNow) offsetRef.current = Date.now() - serverNow.getTime();
  }, [serverNow]);

  const compute = React.useCallback(() => {
    if (!startedAt) return 0;
    return Math.max(0, (Date.now() - offsetRef.current - startedAt.getTime()) / 1000);
  }, [startedAt]);

  // Seeded rather than starting at zero: the first paint would otherwise show
  // 00:00 for a session already 12 minutes old. On the server the offset is 0,
  // which is correct there; the mount effect applies the real offset immediately.
  const [seconds, setSeconds] = React.useState(compute);

  React.useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }
    setSeconds(compute());
    const id = setInterval(() => setSeconds(compute()), 1000);

    // Background tabs throttle timers; resync the moment the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") setSeconds(compute());
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [startedAt, compute]);

  return seconds;
}
