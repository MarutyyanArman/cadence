/** Pure logic — no database needed. Run: npx tsx scripts/verify-calibration.ts */
import {
  biasLabel, calibrationBand, calibrationBias, calibrationScore,
  rollingCalibration, CALIBRATION_WINDOW, MIN_SAMPLES,
} from "../lib/calibration";

let fails = 0;
const t = (c: unknown, m: string) => {
  if (c) console.log("ok  ", m);
  else { fails++; console.error("FAIL:", m); }
};

/* 1 — the anchors */
{
  t(calibrationScore(1) === 100, "a perfect estimate scores 100");
  t(calibrationScore(2) === 0, "taking twice as long scores 0");
  t(calibrationScore(0.5) === 0, "finishing in half the time also scores 0");
  t(calibrationScore(1.5) === 42, `1.5× scores 42 (got ${calibrationScore(1.5)})`);
  t(Math.abs(calibrationScore(Math.SQRT2) - 50) <= 1, "1.41× sits at the halfway mark");
  t(Math.abs(calibrationScore(1 / Math.SQRT2) - 50) <= 1, "0.71× sits at the same halfway mark");
}

/* 2 — symmetry, the property the whole design rests on */
{
  const pairs = [1.1, 1.25, 1.5, 1.75, 1.9, 1.99, 3, 5, 10];
  const symmetric = pairs.every((r) => calibrationScore(r) === calibrationScore(1 / r));
  t(symmetric, "score(r) equals score(1/r) for every ratio tested — over and under cost the same");
}

/* 3 — you cannot win by padding */
{
  // Someone who doubles every estimate to be safe finishes everything in half
  // the time they claimed. They must score exactly as badly as someone who
  // consistently blows through.
  const padder = [0.5, 0.5, 0.5, 0.5, 0.5];
  const overrunner = [2, 2, 2, 2, 2];
  t(
    rollingCalibration(padder) === rollingCalibration(overrunner),
    "habitual padding scores identically to habitual overrun — there is no safe side",
  );
  const honest = [1, 1.05, 0.95, 1.1, 0.9];
  t(
    (rollingCalibration(honest) ?? 0) > (rollingCalibration(padder) ?? 0),
    "guessing right beats playing safe",
  );
}

/* 4 — monotonic: further from the truth is never a better score */
{
  const ladder = [1, 1.1, 1.25, 1.5, 1.75, 2, 4];
  let monotonic = true;
  for (let i = 1; i < ladder.length; i++) {
    if (calibrationScore(ladder[i]) > calibrationScore(ladder[i - 1])) monotonic = false;
  }
  t(monotonic, "the score never rises as the estimate gets worse");
}

/* 5 — the floor holds */
{
  t(calibrationScore(4) === 0 && calibrationScore(100) === 0, "wildly wrong floors at 0, never negative");
  t(calibrationScore(0.01) === 0, "wildly early floors at 0 too");
  t(calibrationScore(0) === 0, "a zero ratio scores 0 rather than throwing");
  t(calibrationScore(-1) === 0, "a negative ratio scores 0");
  t(calibrationScore(NaN) === 0 && calibrationScore(Infinity) === 0, "NaN and Infinity score 0");
}

/* 6 — the rolling average */
{
  t(rollingCalibration([]) === null, "no finished tasks means no score, not a zero");
  t(rollingCalibration([1]) === 100, "a single perfect task averages to 100");
  t(rollingCalibration([1, 2]) === 50, "one perfect and one doubled averages to 50");
  const many = Array.from({ length: 200 }, () => 1);
  t(rollingCalibration(many) === 100, "averaging stays stable over a long run");
  t(CALIBRATION_WINDOW === 30 && MIN_SAMPLES === 3, "window and minimum are the documented values");
}

/* 7 — bias: which way you are wrong */
{
  t(calibrationBias([]) === null, "no tasks means no bias reading");
  t(calibrationBias([1, 1, 1]) === 1, "consistently right reads as no bias");
  t(calibrationBias([1.4, 1.5, 1.6]) === 1.5, "the median is the middle value");
  t(calibrationBias([1, 2, 3, 4]) === 2.5, "an even count averages the middle pair");
  // One catastrophic task must not define the picture.
  t(
    calibrationBias([1.1, 1.2, 1.3, 1.2, 40]) === 1.2,
    "a single 40× disaster does not drag the median",
  );
}

/* 8 — the words people actually read */
{
  t(biasLabel(1) === "Your estimates land about right", "no bias reads as no bias");
  t(biasLabel(1.05) === "Your estimates land about right", "a small bias is not worth reporting");
  t(biasLabel(1.4).includes("40%") && biasLabel(1.4).includes("longer"), "underestimating is named as taking longer");
  t(biasLabel(0.6).includes("40%") && biasLabel(0.6).includes("less"), "overestimating is named as taking less time");
}

/* 9 — bands */
{
  t(calibrationBand(100).label === "Sharp" && calibrationBand(85).label === "Sharp", "85 and up is Sharp");
  t(calibrationBand(84).label === "Solid" && calibrationBand(70).label === "Solid", "70–84 is Solid");
  t(calibrationBand(69).label === "Rough" && calibrationBand(50).label === "Rough", "50–69 is Rough");
  t(calibrationBand(49).label === "Guessing" && calibrationBand(0).label === "Guessing", "below 50 is Guessing");
  const tones = [0, 50, 70, 85, 100].map((s) => calibrationBand(s).tone);
  t(new Set(tones).size === 4, "the four bands use four distinct tones");
}

console.log(fails === 0 ? "\nall calibration checks pass" : `\n${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
