import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type { ModelKey } from "./types.js";

const MODEL_URLS: Record<ModelKey, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  heavy:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";

export async function createPoseLandmarker(model: ModelKey = "lite", options: {
  runningMode?: "IMAGE" | "VIDEO";
  outputSegmentationMasks?: boolean;
  delegate?: "GPU" | "CPU";
} = {}) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URLS[model],
      delegate: options.delegate ?? "GPU",
    },
    runningMode: options.runningMode ?? "VIDEO",
    outputSegmentationMasks: options.outputSegmentationMasks ?? false,
    numPoses: 1,
  });
}

export { PoseLandmarker };
