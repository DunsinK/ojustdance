import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { DrawingUtils } from "@mediapipe/tasks-vision";
import { PoseLandmarker as PL } from "./createPoseLandmarker";
import { normalizePose } from "./normalizePose";
import type { ChartSample } from "./types";

function waitForSeek(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed seeking video"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
  });
}

export type AnalyzeProgress = {
  t: number;
  duration: number;
};

/**
 * Step through a video file and extract relative pose samples.
 * Uses monotonically increasing timestamps for MediaPipe VIDEO mode.
 */
export async function analyzeVideoFile(opts: {
  video: HTMLVideoElement;
  landmarker: PoseLandmarker;
  canvas?: HTMLCanvasElement | null;
  sampleHz?: number;
  onProgress?: (p: AnalyzeProgress) => void;
  signal?: AbortSignal;
}): Promise<ChartSample[]> {
  const { video, landmarker, canvas, onProgress, signal } = opts;
  const sampleHz = opts.sampleHz ?? 15;
  const step = 1 / sampleHz;
  const duration = video.duration;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no duration — try another file");
  }

  video.pause();
  const samples: ChartSample[] = [];
  let stamp = 0;

  for (let t = 0; t <= duration + 1e-6; t += step) {
    if (signal?.aborted) throw new Error("Analysis cancelled");

    const seekTo = Math.min(t, duration);
    if (Math.abs(video.currentTime - seekTo) > 0.001) {
      video.currentTime = seekTo;
      await waitForSeek(video);
    }

    stamp += Math.max(1, Math.round(step * 1000));
    const result = landmarker.detectForVideo(video, stamp);
    const raw = result.landmarks[0];

    if (canvas) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const drawing = new DrawingUtils(ctx);
        for (const landmarks of result.landmarks) {
          drawing.drawConnectors(landmarks, PL.POSE_CONNECTIONS, {
            color: "#c8f542",
            lineWidth: 3,
          });
          drawing.drawLandmarks(landmarks, {
            color: "#ffffff",
            fillColor: "#c8f542",
            radius: 3,
          });
        }
      }
    }

    if (raw?.length) {
      samples.push({
        t: Number(seekTo.toFixed(4)),
        landmarks: normalizePose(raw),
      });
    }

    onProgress?.({ t: seekTo, duration });
  }

  return samples;
}
