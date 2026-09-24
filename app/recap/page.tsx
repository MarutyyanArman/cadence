import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { weekRecap } from "@/lib/analytics";
import { rolloverRecurring } from "@/lib/queries";
import { calibrationScore } from "@/lib/calibration";
import { AppNav } from "@/components/app-nav";
import { SignInGate } from "@/components/sign-in-gate";
import { currentUserIdOrNull } from "@/lib/session";
import { TimerHost } from "@/components/timer/timer-host";
import { getDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Monday-anchored label like "8 – 14 September 2026". */
function weekLabel(startIso: string, t: Dict): string {
  const [y, m, d] = startIso.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return t.fmt.weekRange(start, end);
}

/** A change worth reporting, or nothing. Silence beats "0% vs last week". */
function delta(now: number, before: number, t: Dict): { text: string; tone: string } | null {
  if (before === 0) {
    return now > 0 ? { text: t.recap.firstWeek, tone: "text-fg-secondary" } : null;
  }
  const change = Math.round(((now - before) / before) * 100);
  if (Math.abs(change) < 5) return { text: t.recap.aboutSame, tone: "text-fg-muted" };
  return change > 0
    ? { text: t.recap.morePct(change), tone: "text-success" }
    : { text: t.recap.lessPct(Math.abs(change)), tone: "text-fg-secondary" };
}

function Figure({
  label, value, note, noteTone,
}: { label: string; value: string; note?: string; noteTone?: string }) {
  return (
    <div className="flex flex-col gap-xxs rounded-md border border-line bg-surface p-lg">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="t-numeric">{value}</span>
      {note && <span className={cn("text-[11px]", noteTone ?? "text-fg-muted")}>{note}</span>}
    </div>
  );
}

function EstimateCard({
  heading, entry, tone, t,
}: {
  heading: string;
  entry: { title: string; estimatedMinutes: number; actualMinutes: number; ratio: number } | null;
  tone: string;
  t: Dict;
}) {
  if (!entry) return null;
  const score = calibrationScore(Number(entry.ratio));
  return (
    <div className="flex flex-col gap-xs rounded-md border border-line bg-surface p-lg">
      <span className="text-xs text-fg-muted">{heading}</span>
      <span className="truncate text-sm">{entry.title}</span>
      <span className="font-mono text-xs text-fg-secondary tabular-nums">
        {t.fmt.minutes(Number(entry.actualMinutes))} {t.recap.against}{" "}
        {t.fmt.minutes(Number(entry.estimatedMinutes))}
      </span>
      <span className={cn("font-mono text-xs tabular-nums", tone)}>
        {score} {t.recap.outOf}
      </span>
    </div>
  );
}

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if ((await currentUserIdOrNull()) === null) return <SignInGate />;

  const { w } = await searchParams;
  const parsed = Number(w);
  const weeksAgo = Number.isInteger(parsed) && parsed >= 0 && parsed <= 520 ? parsed : 1;

  await rolloverRecurring(); // so a missed habit day counts as missed, not absent
  const [t, recap] = await Promise.all([getDict(), weekRecap(weeksAgo)]);
  const focus = Number(recap.focusMinutes);
  const focusDelta = delta(focus, Number(recap.previousFocusMinutes), t);
  const doneDelta = delta(Number(recap.tasksCompleted), Number(recap.previousTasksCompleted), t);
  const empty = focus === 0 && Number(recap.tasksCompleted) === 0;
  const decidedHabitDays = Number(recap.habitDone) + Number(recap.habitMissed);

  // max-w-5xl, not 4xl: this project's @theme defines --spacing-4xl (64px), and
  // Tailwind v4 falls back to the spacing scale for max-w-* when there is no
  // matching --container-* token — so `max-w-4xl` silently resolves to 64px.
  // 5xl and 6xl have no spacing token, which is why the other routes work.
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-lg px-lg pb-28 pt-xl sm:gap-xl sm:px-xl sm:pb-3xl sm:pt-3xl">
      <header className="flex flex-col gap-sm">
        <AppNav current="recap" />

        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="t-h1">
              {weeksAgo === 0 ? t.recap.thisWeek : t.recap.weekInReview}
            </h1>
            <p className="t-body text-fg-secondary">{weekLabel(recap.weekStart, t)}</p>
          </div>
          <div className="flex items-center gap-xs text-sm">
            <Link
              href={`/recap?w=${weeksAgo + 1}`}
              className="flex items-center gap-xs rounded-md border border-line px-md py-xs text-fg-secondary transition-colors hover:bg-hovered hover:text-fg-primary"
            >
              <ArrowLeft className="size-3.5" />
              {t.recap.earlier}
            </Link>
            {weeksAgo > 0 && (
              <Link
                href={`/recap?w=${weeksAgo - 1}`}
                className="flex items-center gap-xs rounded-md border border-line px-md py-xs text-fg-secondary transition-colors hover:bg-hovered hover:text-fg-primary"
              >
                {t.recap.later}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {empty ? (
        <p className="rounded-md border border-dashed border-line px-md py-3xl text-center text-sm text-fg-secondary">
          {t.recap.empty}
        </p>
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={t.recap.focused}
              value={t.fmt.minutes(focus)}
              note={focusDelta?.text}
              noteTone={focusDelta?.tone}
            />
            <Figure
              label={t.recap.finished}
              value={String(recap.tasksCompleted)}
              note={doneDelta?.text}
              noteTone={doneDelta?.tone}
            />
            <Figure
              label={t.recap.daysWorked}
              value={t.recap.daysOfSeven(Number(recap.daysActive))}
              note={
                Number(recap.daysActive) >= 5
                  ? t.recap.showedUp
                  : Number(recap.daysActive) <= 2
                    ? t.recap.quietWeek
                    : undefined
              }
            />
            <Figure
              label={t.recap.longestStretch}
              value={t.fmt.minutes(Number(recap.longestSessionMinutes))}
              note={
                t.recap.sessionCount(Number(recap.sessions)) +
                (Number(recap.interruptions) > 0
                  ? t.recap.interruptionCount(Number(recap.interruptions))
                  : "")
              }
            />
          </div>

          {/* The one line here you couldn't have guessed about yourself. */}
          {recap.bestHour !== null && (
            <p className="rounded-md border-l-2 border-accent bg-surface px-lg py-md text-sm text-fg-secondary">
              {t.recap.bestHourPre}{" "}
              <span className="text-fg-primary">{t.fmt.hour(Number(recap.bestHour))}</span>
              {t.recap.bestHourPost}
            </p>
          )}

          {(decidedHabitDays > 0 || Number(recap.slippingCount) > 0) && (
            <p className="text-sm text-fg-secondary">
              {decidedHabitDays > 0 && (
                <>
                  {t.recap.habitsPre}{" "}
                  <span className="text-fg-primary">{recap.habitDone}</span>
                  {t.recap.habitsMid(decidedHabitDays)}
                </>
              )}
              {Number(recap.slippingCount) > 0 && (
                <>
                  <span className="text-warning">{recap.slippingCount}</span>{" "}
                  {t.recap.slippingCount(Number(recap.slippingCount))}
                  {t.recap.slippingTail}
                </>
              )}
            </p>
          )}

          {(recap.sharpest || recap.worst) && (
            <section className="flex flex-col gap-md">
              <h2 className="t-h3 text-fg-secondary">{t.recap.estimatesHeading}</h2>
              <div className="grid gap-md sm:grid-cols-2">
                <EstimateCard
                  heading={t.recap.sharpest} entry={recap.sharpest}
                  tone="text-success" t={t}
                />
                <EstimateCard
                  heading={t.recap.furthestOff} entry={recap.worst}
                  tone="text-warning" t={t}
                />
              </div>
            </section>
          )}
        </>
      )}

      <TimerHost />
    </main>
  );
}
