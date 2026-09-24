"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, ListTodo, Sparkles } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type NavKey = "tasks" | "calendar" | "analytics" | "recap";

const ROUTES: Array<{ key: NavKey; href: string; Icon: typeof ListTodo }> = [
  { key: "tasks", href: "/", Icon: ListTodo },
  { key: "calendar", href: "/calendar", Icon: CalendarDays },
  { key: "analytics", href: "/analytics", Icon: BarChart3 },
  { key: "recap", href: "/recap", Icon: Sparkles },
];

/**
 * One nav, two shapes.
 *
 * On a wide screen it is the row of text links this app has always had. On a
 * phone it becomes a fixed bar at the bottom, because a row of small links
 * under the page title is the one thing that is genuinely unreachable
 * one-handed — and inside Telegram, where the app fills the screen, the thumb
 * is all you have.
 *
 * Both render from the same list, so a route can't appear in one and not the
 * other.
 */
export function AppNav({ current }: { current: NavKey }) {
  const { t } = useT();
  const pathname = usePathname();

  const label: Record<NavKey, string> = {
    tasks: t.nav.tasks,
    calendar: t.nav.calendar,
    analytics: t.nav.analytics,
    recap: t.nav.recap,
  };
  const short: Record<NavKey, string> = {
    tasks: t.nav.shortTasks,
    calendar: t.nav.shortCalendar,
    analytics: t.nav.shortAnalytics,
    recap: t.nav.shortRecap,
  };

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Wide screens keep the text links. On a phone the links move to the
          bar below, but the language switch has nowhere else to go — a tab
          would be a whole fifth destination for a two-state toggle — so it
          stays up here on both. */}
      <div className="flex items-center gap-lg text-sm text-fg-secondary">
        <nav className="hidden items-center gap-lg sm:flex">
          {ROUTES.filter((r) => r.key !== current).map((r) => (
            <Link key={r.key} href={r.href} className="underline-offset-4 hover:underline">
              {label[r.key]}
            </Link>
          ))}
        </nav>
        <LanguageSwitcher />
      </div>

      {/* phones: a thumb-height bar pinned to the bottom */}
      <nav
        aria-label={t.nav.menu}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex sm:hidden",
          "border-t border-line bg-surface/95 backdrop-blur",
          // Clear of the home indicator on iPhones and of Telegram's own chrome.
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {ROUTES.map(({ key, href, Icon }) => {
          const on = active(href);
          return (
            <Link
              key={key}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                // 56px tall: a comfortable tap target, not a decorative strip.
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-sm text-[10px]",
                "transition-colors",
                on ? "text-accent-text" : "text-fg-muted hover:text-fg-secondary",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {short[key]}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
