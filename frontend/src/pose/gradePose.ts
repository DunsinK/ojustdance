import type { ChartSample, RelativeLandmark } from "./types";

/** Joints that matter most for dance matching (MediaPipe indices). */
const WEIGHTED_JOINTS: Array<{ index: number; weight: number }> = [
  { index: 11, weight: 1.2 }, // left shoulder
  { index: 12, weight: 1.2 }, // right shoulder
  { index: 13, weight: 1.4 }, // left elbow
  { index: 14, weight: 1.4 }, // right elbow
  { index: 15, weight: 1.6 }, // left wrist
  { index: 16, weight: 1.6 }, // right wrist
  { index: 23, weight: 1.0 }, // left hip
  { index: 24, weight: 1.0 }, // right hip
  { index: 25, weight: 1.3 }, // left knee
  { index: 26, weight: 1.3 }, // right knee
  { index: 27, weight: 1.5 }, // left ankle
  { index: 28, weight: 1.5 }, // right ankle
];

export type GradeResult = {
  /** 0 = no match, 1 = perfect */
  accuracy: number;
  meanError: number;
  comparedJoints: number;
};

/** Nearest chart sample at time t (seconds). */
export function sampleAtTime(
  samples: ChartSample[],
  t: number
): ChartSample | null {
  if (!samples.length) return null;
  let best = samples[0];
  let bestDist = Math.abs(best.t - t);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i].t - t);
    if (d < bestDist) {
      best = samples[i];
      bestDist = d;
    } else if (samples[i].t > t && d > bestDist) {
      break; // samples are sorted ascending
    }
  }
  return best;
}

/**
 * Compare live relative landmarks to a target sample.
 * Uses XY primarily (Z is noisier on webcam).
 */
export function gradePose(
  live: RelativeLandmark[],
  target: RelativeLandmark[]
): GradeResult {
  if (!live.length || !target.length) {
    return { accuracy: 0, meanError: 1, comparedJoints: 0 };
  }

  let weightedError = 0;
  let weightSum = 0;
  let compared = 0;

  for (const { index, weight } of WEIGHTED_JOINTS) {
    const a = live[index];
    const b = target[index];
    if (!a || !b) continue;
    const vis = Math.min(a[3] ?? 0, b[3] ?? 0);
    if (vis < 0.35) continue;

    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = (a[2] - b[2]) * 0.35;
    const err = Math.hypot(dx, dy, dz);
    const w = weight * (0.5 + 0.5 * vis);
    weightedError += err * w;
    weightSum += w;
    compared += 1;
  }

  if (!compared || weightSum <= 0) {
    return { accuracy: 0, meanError: 1, comparedJoints: 0 };
  }

  const meanError = weightedError / weightSum;
  // Soft falloff: ~0.35 mean error → ~0.5 accuracy; tight poses score higher
  const accuracy = Math.max(0, Math.min(1, 1 - meanError / 0.7));
  return { accuracy, meanError, comparedJoints: compared };
}

export type ScoreTick = {
  score: number;
  combo: number;
  maxCombo: number;
  label: "PERFECT" | "GOOD" | "OK" | "MISS" | "…";
};

/**
 * Update running score from one graded frame.
 * Good motion adds points; poor motion drains (floored at 0).
 */
export function applyScoreTick(
  prev: ScoreTick,
  accuracy: number,
  dtSec: number
): ScoreTick {
  const dt = Math.min(0.1, Math.max(0.008, dtSec));
  let label: ScoreTick["label"] = "…";
  let combo = prev.combo;

  if (accuracy >= 0.82) {
    label = "PERFECT";
    combo += 1;
  } else if (accuracy >= 0.65) {
    label = "GOOD";
    combo += 1;
  } else if (accuracy >= 0.45) {
    label = "OK";
    combo = Math.max(0, combo - 1);
  } else {
    label = "MISS";
    combo = 0;
  }

  const mult = 1 + Math.min(combo, 40) * 0.04;
  // Centered around 0.55: above → gain, below → loss
  const rate = (accuracy - 0.55) * 90 * mult;
  const nextScore = Math.max(0, prev.score + rate * dt);

  return {
    score: nextScore,
    combo,
    maxCombo: Math.max(prev.maxCombo, combo),
    label,
  };
}
