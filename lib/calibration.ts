/**
 * How close your estimates land to reality, as a score out of 100.
 *
 * Every other task app scores volume — tasks closed, days logged. Volume is
 * trivially gamed: split a task in two and you scored twice. Cadence stores an
 * estimate next to every actual, so it can score something that can't be
 * farmed, only learned.
 *
 * The curve lives here rather than in SQL because it is a pure transform with
 * one property worth protecting by test — see the symmetry note below.
 */

import { en, type Dict } from "./i18n/en";

/** Scores average over this many finished tasks. */
export const CALIBRATION_WINDOW = 30;

/** Below this, the average is noise and the UI says so instead of a number. */
export const MIN_SAMPLES = 3;

/**
 * Score for a single task.
 *
 *   100 × (1 − |log₂(actual ÷ estimate)|), floored at zero
 *
 * Two deliberate properties:
 *
 * **Symmetric.** Finishing in half the time you claimed scores exactly as badly
 * as taking twice as long. Without that, padding every estimate would be a
 * winning strategy and the score would measure nothing but cowardice.
 *
 * **Logarithmic.** Being 10 minutes out on a 20-minute task is a real error;
 * 10 minutes out on a full day is noise. Ratios capture that, differences
 * don't.
 */
function rawScore(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const deviation = Math.abs(Math.log2(ratio));
  return Math.max(0, 100 * (1 - deviation));
}

export function calibrationScore(ratio: number): number {
  return Math.round(rawScore(ratio));
}

/** The headline number. Averages unrounded scores, so it doesn't drift. */
export function rollingCalibration(ratios: number[]): number | null {
  if (ratios.length === 0) return null;
  const total = ratios.reduce((sum, r) => sum + rawScore(r), 0);
  return Math.round(total / ratios.length);
}

export type BandKey = "sharp" | "solid" | "rough" | "guessing";

export type CalibrationBand = {
  /** Stable across languages — the label is a translation of this. */
  key: BandKey;
  label: string;
  /** Maps to a semantic token, not a chart colour — this is a health reading. */
  tone: "success" | "accent" | "warning" | "danger";
};

const BANDS: Array<{ min: number; key: BandKey; tone: CalibrationBand["tone"] }> = [
  { min: 85, key: "sharp", tone: "success" },
  { min: 70, key: "solid", tone: "accent" },
  { min: 50, key: "rough", tone: "warning" },
  { min: -Infinity, key: "guessing", tone: "danger" },
];

export function calibrationBand(score: number, dict: Dict = en): CalibrationBand {
  const band = BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
  return { key: band.key, label: dict.calibration.band[band.key], tone: band.tone };
}

/**
 * Which way you are wrong, which the score alone can't say — 60/100 means the
 * same whether you habitually double or habitually halve.
 *
 * Median rather than mean: one task that ran 12× over shouldn't define the
 * picture, and ratios are skewed by construction (they bottom out at 0 and
 * have no ceiling).
 */
export function calibrationBias(ratios: number[]): number | null {
  if (ratios.length === 0) return null;
  const sorted = [...ratios].filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Plain words for the bias. Percentages read faster than "1.4×". */
export function biasLabel(median: number, dict: Dict = en): string {
  if (median > 1.1) return dict.calibration.biasLonger(Math.round((median - 1) * 100));
  if (median < 0.9) return dict.calibration.biasLess(Math.round((1 - median) * 100));
  return dict.calibration.biasRight;
}
