import {
  biasLabel, calibrationBand, calibrationBias, calibrationScore, rollingCalibration,
  MIN_SAMPLES,
} from "@/lib/calibration";
import { getDict } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export type CalibrationCardData = {
  /** Newest first. One entry per finished, estimated, actually-worked task. */
  ratios: number[];
};

const toneText: Record<string, string> = {
  success: "text-success",
  accent: "text-accent-text",
  warning: "text-warning",
  danger: "text-danger",
};

const toneBar: Record<string, string> = {
  success: "bg-success",
  accent: "bg-chart-1",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * The one score in Arc that can't be farmed.
 *
 * Deliberately placed above Goals: goals measure how much is left, calibration
 * measures whether you understand the work at all — which is the more useful
 * thing to see before you plan a day.
 */
export async function CalibrationCard({ ratios }: CalibrationCardData) {
  const t = await getDict();
  const enough = ratios.length >= MIN_SAMPLES;
  const score = enough ? rollingCalibration(ratios) : null;

  if (score === null) {
    const remaining = MIN_SAMPLES - ratios.length;
    return (
      <section className="flex flex-col gap-sm rounded-md border border-line bg-surface p-md">
        <h2 className="t-h3">{t.calibration.heading}</h2>
        <p className="text-xs text-fg-secondary">{t.calibration.blurb}</p>
        <p className="mt-xs text-xs text-fg-muted">
          {t.calibration.hintLead}{" "}
          {ratios.length === 0
            ? t.calibration.hintFirst
            : t.calibration.hintMore(remaining)}
        </p>
      </section>
    );
  }

  const band = calibrationBand(score, t);
  const median = calibrationBias(ratios);
  // Oldest on the left so the strip reads left-to-right like time.
  const recent = ratios.slice(0, 12).reverse();

  return (
    <section className="flex flex-col gap-sm rounded-md border border-line bg-surface p-md">
      <div className="flex items-baseline justify-between gap-sm">
        <h2 className="t-h3">{t.calibration.heading}</h2>
        <span className={cn("text-xs font-medium", toneText[band.tone])}>{band.label}</span>
      </div>

      <p className="flex items-baseline gap-xs">
        <span className={cn("t-numeric", toneText[band.tone])}>{score}</span>
        <span className="font-mono text-xs text-fg-muted">{t.calibration.outOf}</span>
      </p>

      {/* One bar per recent task, height by how well that estimate landed.
          Shows the trend the single number hides. */}
      <div className="flex h-8 items-end gap-0.5" aria-hidden>
        {recent.map((ratio, i) => {
          const s = calibrationScore(ratio);
          return (
            <span
              key={i}
              className={cn("flex-1 rounded-t-sm", toneBar[calibrationBand(s, t).tone])}
              style={{ height: `${Math.max(8, s)}%`, opacity: 0.45 + (i / recent.length) * 0.55 }}
            />
          );
        })}
      </div>

      {median !== null && (
        <p className="text-xs text-fg-secondary">{biasLabel(median, t)}</p>
      )}

      <p className="text-[11px] text-fg-muted">{t.calibration.lastN(ratios.length)}</p>
    </section>
  );
}
