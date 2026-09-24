"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addTask } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { RECURRENCES, recurrenceLabel } from "@/lib/recurrence";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

type GoalOption = { id: string; title: string };

/**
 * Quick-add. Title is the only required field; estimate and due date sit inline
 * so adding a task never costs more than typing and pressing Enter.
 */
export function TaskComposer({ goals }: { goals: GoalOption[] }) {
  const router = useRouter();
  const { t } = useT();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addTask(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      titleRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-sm">
      <div
        className={cn(
          "flex flex-wrap items-center gap-sm rounded-md border border-line",
          "bg-surface px-md py-sm focus-within:border-line-focus",
        )}
      >
        <input
          ref={titleRef}
          name="title"
          placeholder={t.composer.titlePlaceholder}
          autoComplete="off"
          className="min-w-0 flex-1 basis-full bg-transparent text-sm outline-none placeholder:text-fg-muted sm:basis-0 sm:min-w-40"
        />

        <input
          name="estMinutes"
          type="number"
          min={1}
          placeholder={t.composer.estPlaceholder}
          className={cn(
            "w-20 rounded-sm bg-elevated px-sm py-xs font-mono text-xs sm:w-24",
            "outline-none placeholder:text-fg-muted",
          )}
        />

        <input
          name="dueAt"
          type="date"
          className="rounded-sm bg-elevated px-sm py-xs font-mono text-xs outline-none"
        />

        <select
          name="goalId"
          defaultValue=""
          className="rounded-sm bg-elevated px-sm py-xs text-xs outline-none"
        >
          <option value="">{t.composer.noGoal}</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>

        <select
          name="priority"
          defaultValue="3"
          className="rounded-sm bg-elevated px-sm py-xs text-xs outline-none"
        >
          {([1, 2, 3, 4] as const).map((n) => (
            <option key={n} value={n}>
              {t.composer.priority[n]}
            </option>
          ))}
        </select>

        {/* A repeating task rewrites itself on completion — see setTaskStatus. */}
        <select
          name="recurrence"
          defaultValue=""
          aria-label={t.composer.repeatAria}
          className="rounded-sm bg-elevated px-sm py-xs text-xs outline-none"
        >
          <option value="">{t.composer.once}</option>
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {recurrenceLabel(r, t)}
            </option>
          ))}
        </select>

        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="size-4" />
          {pending ? t.composer.adding : t.composer.add}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
