import { Check, Target } from "lucide-react";
import { evaluateQuest, questCopy, type QuestFacts, type QuestKind } from "@/lib/quests";
import { getDict } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export type QuestCardData = {
  quests: { kind: QuestKind; target: number }[];
  facts: QuestFacts;
};

/**
 * Today's three.
 *
 * No rewards attached, deliberately. A quest is small enough to start, and
 * starting is the whole battle — bolting XP onto it would just pay you to do
 * what the streak and the calibration score already pay for, and stacking
 * currencies is how these systems start feeling like an obligation.
 */
export async function QuestCard({ quests, facts }: QuestCardData) {
  if (quests.length === 0) return null;
  const t = await getDict();

  const scored = quests.map((q) => ({
    ...q,
    copy: questCopy(q.kind, q.target, t),
    progress: evaluateQuest(q.kind, q.target, facts),
  }));
  const doneCount = scored.filter((q) => q.progress.done).length;

  return (
    <section className="flex flex-col gap-md rounded-md border border-line bg-surface p-md">
      <div className="flex items-baseline justify-between gap-sm">
        <h2 className="flex items-center gap-xs t-h3">
          <Target className="size-3.5 text-fg-muted" />
          {t.quests.heading}
        </h2>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            doneCount === scored.length ? "text-success" : "text-fg-muted",
          )}
        >
          {doneCount}/{scored.length}
        </span>
      </div>

      <ul className="flex flex-col gap-sm">
        {scored.map((q) => {
          const pct = Math.min(100, Math.round((q.progress.current / q.progress.target) * 100));
          return (
            <li key={q.kind} className="flex flex-col gap-xxs">
              <div className="flex items-start gap-sm">
                <span
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                    q.progress.done
                      ? "border-success bg-success text-fg-inverse"
                      : "border-line-strong",
                  )}
                  aria-hidden
                >
                  {q.progress.done && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      q.progress.done && "text-fg-muted line-through",
                    )}
                  >
                    {q.copy.title}
                  </span>
                  <span className="block text-[11px] text-fg-muted">{q.copy.hint}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-muted tabular-nums">
                  {q.progress.current}/{q.progress.target}
                </span>
              </div>

              {!q.progress.done && (
                <div className="ml-6 h-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-chart-1 transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
