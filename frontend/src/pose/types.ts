/** Relative landmark: [x, y, z, visibility] */
export type RelativeLandmark = [number, number, number, number];

export type PoseFrame = {
  /** Wall / session time in seconds (caller-defined clock). */
  t: number;
  landmarks: RelativeLandmark[];
  hasPose: boolean;
};

export type ModelKey = "lite" | "full" | "heavy";

export type ChartSample = {
  t: number;
  landmarks: RelativeLandmark[];
};

export type TimelineSegment = {
  id: string;
  startSec: number;
  endSec: number;
  samples: ChartSample[];
};

export type ChartDocument = {
  version: 1;
  sampleRateHz: number;
  durationSec: number;
  title: string;
  difficulty: "easy" | "normal" | "hard";
  model: ModelKey;
  recordedAt: string;
  normalization: {
    origin: "hip_midpoint";
    scale: "torso_length";
    axes: ["x", "y", "z", "visibility"];
  };
  landmarkNames: string[];
  segments: Array<{
    id: string;
    startSec: number;
    endSec: number;
    sampleCount: number;
  }>;
  samples: ChartSample[];
};
