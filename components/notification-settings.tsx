"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { NOTIFICATION_KINDS } from "@/lib/notifications";
import { loadPrefs, savePrefs, type NotificationPrefs } from "@/lib/notification-prefs";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

type Permission = "default" | "granted" | "denied" | "unsupported";

/** Per-type toggles, collapsed by default — settings shouldn't shout. */
export function NotificationSettings() {
  const { t } = useT();
  const [prefs, setPrefs] = React.useState<NotificationPrefs | null>(null);
  const [permission, setPermission] = React.useState<Permission>("default");

  // Read on mount only: localStorage and Notification.permission are both
  // client-only, and reading them during render would mismatch on hydration.
  React.useEffect(() => {
    setPrefs(loadPrefs());
    setPermission(
      typeof Notification === "undefined" ? "unsupported" : (Notification.permission as Permission),
    );
  }, []);

  if (prefs === null) return null;

  const enabledCount = NOTIFICATION_KINDS.filter((k) => prefs[k]).length;
  const live = permission === "granted" && enabledCount > 0;

  const summary =
    permission === "unsupported"
      ? t.notifications.unsupported
      : permission === "denied"
        ? t.notifications.blocked
        : permission === "default"
          ? t.notifications.notAsked
          : enabledCount === 0
            ? t.notifications.allOff
            : t.notifications.someOn(enabledCount, NOTIFICATION_KINDS.length);

  const toggle = (kind: (typeof NOTIFICATION_KINDS)[number]) => {
    const next = { ...prefs, [kind]: !prefs[kind] };
    setPrefs(next);
    savePrefs(next);
  };

  return (
    <details className="group rounded-md border border-line bg-surface p-md">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-sm [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-xs">
          {live ? (
            <Bell className="size-3.5 text-chart-2" />
          ) : (
            <BellOff className="size-3.5 text-fg-muted" />
          )}
          <span className="t-h3">{t.notifications.heading}</span>
        </span>
        <span className="text-[11px] text-fg-muted">{summary}</span>
      </summary>

      <div className="mt-md flex flex-col gap-sm">
        {permission === "default" && (
          <button
            type="button"
            onClick={async () => {
              const result = await Notification.requestPermission();
              setPermission(result as Permission);
            }}
            className="rounded-sm bg-accent px-md py-xs text-xs text-fg-inverse hover:bg-accent-hover"
          >
            {t.notifications.allow}
          </button>
        )}

        {permission === "denied" && (
          <p className="text-[11px] text-fg-secondary">{t.notifications.blockedHelp}</p>
        )}

        {NOTIFICATION_KINDS.map((kind) => (
          <label
            key={kind}
            className={cn(
              "flex cursor-pointer items-start gap-sm text-xs",
              permission !== "granted" && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={prefs[kind]}
              onChange={() => toggle(kind)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-fg-primary">{t.notifications.labels[kind]}</span>
              <span className="text-[11px] text-fg-muted">
                {t.notifications.descriptions[kind]}
              </span>
            </span>
          </label>
        ))}

        <p className="mt-xs text-[11px] text-fg-muted">{t.notifications.onlyWhileOpen}</p>
      </div>
    </details>
  );
}