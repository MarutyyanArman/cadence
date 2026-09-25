import * as React from "react";
import { getDict } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * Shared shell. Every chart is empty for the first week or two of real use, so
 * the empty state is a first-class prop rather than an afterthought — a blank
 * axis reads as a broken app.
 */
export async function ChartCard({
  title,
  hint,
  empty,
  emptyMessage,
  children,
  className,
}: {
  title: string;
  hint?: string;
  empty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = await getDict();
  return (
    <section className={cn("flex flex-col rounded-md border border-line bg-surface p-lg", className)}>
      <header className="mb-md">
        <h2 className="t-h3">{title}</h2>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </header>
      {empty ? (
        <div className="flex flex-1 items-center justify-center rounded-sm border border-dashed border-line px-md py-xl">
          <p className="max-w-[20rem] text-center text-xs text-fg-secondary">
            {emptyMessage ?? t.charts.notEnough}
          </p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
