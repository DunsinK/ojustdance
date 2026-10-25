import {
  LEFT_HIP,
  LEFT_SHOULDER,
  RIGHT_HIP,
  RIGHT_SHOULDER,
} from "./landmarks.js";
import type { RelativeLandmark } from "./types.js";

type Point = { x: number; y: number; z: number; visibility?: number };

function midpoint(a: Point, b: Point) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Hip-centered, torso-scaled landmarks (size/position invariant). */
export function normalizePose(landmarks: Point[]): RelativeLandmark[] {
  const hip = midpoint(landmarks[LEFT_HIP], landmarks[RIGHT_HIP]);
  const shoulder = midpoint(landmarks[LEFT_SHOULDER], landmarks[RIGHT_SHOULDER]);
  let scale = dist(shoulder, hip);
  if (!Number.isFinite(scale) || scale < 1e-6) {
    scale = dist(landmarks[LEFT_HIP], landmarks[RIGHT_HIP]) || 1;
  }

  return landmarks.map((lm) => [
    Number(((lm.x - hip.x) / scale).toFixed(5)),
    Number(((lm.y - hip.y) / scale).toFixed(5)),
    Number(((lm.z - hip.z) / scale).toFixed(5)),
    Number((lm.visibility ?? 0).toFixed(4)),
  ]);
}
