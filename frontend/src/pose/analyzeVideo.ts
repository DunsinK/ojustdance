import { MediaPipeStyleAdapter } from '@ojustdance/skeleton';
import { checkAbort, seekVideo } from '../keyframes/media.js';
import { THUMBNAIL_LIMITS } from '../keyframes/contracts.js';
import type { PoseLandmarker, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { DrawingUtils } from "@mediapipe/tasks-vision";
import { PoseLandmarker as PL } from "./createPoseLandmarker.js";
import { normalizePose } from "./normalizePose.js";
import type { ChartSample } from "./types.js";

export type AnalyzeProgress = {
  t: number;
  duration: number;
  skippedFrameCount?: number;
  missingPoseCount?: number;
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
  durationSec?: number;
  onProgress?: (p: AnalyzeProgress) => void;
  signal?: AbortSignal;
}): Promise<ChartSample[]> {
  const { video, landmarker, canvas, onProgress, signal } = opts;
  const sampleHz = opts.sampleHz ?? 15;
  const step = 1 / sampleHz;
  const duration = Number.isFinite(video.duration) ? video.duration : opts.durationSec ?? NaN;

  if (!Number.isFinite(sampleHz) || sampleHz < 1 || sampleHz > 30) throw new Error("Sampling rate must be 1–30 Hz");
  if (Math.ceil(duration * sampleHz) > THUMBNAIL_LIMITS.samples || duration > THUMBNAIL_LIMITS.sourceDurationSec) throw new Error("Video is too long for local motion preparation; use a shorter clip");
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no duration — try another file");
  }

  video.pause();
  const samples: ChartSample[] = [];
  let stamp = performance.now();
  const adapter = new MediaPipeStyleAdapter();
  const timelineId = crypto.randomUUID();
  let skippedFrameCount = 0, missingPoseCount = 0;

  for (let index = 0; index < Math.ceil(duration * sampleHz); index++) {
    checkAbort(signal);
    const seekTo = index * step;
    let result: PoseLandmarkerResult | undefined;
    try {
      await seekVideo(video, seekTo, signal);
      // MediaPipe uses a monotonic inference clock; canonical observations use video time.
      stamp = Math.max(stamp + 1, performance.now());
      result = landmarker.detectForVideo(video, stamp);
      checkAbort(signal);
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
        // Validate provider data before legacy normalization. A corrupt observation
        // is skipped at this timestamp instead of aborting the remaining recording.
        const canonicalFrame = adapter.toFrame({
          schemaVersion: "mediapipe-style/1", timestampMs: seekTo * 1000,
          timeline: { origin: "video-start", id: timelineId },
          space: "normalized-image", imageSize: { width: video.videoWidth, height: video.videoHeight },
          depth: "preserve-estimate", mirrored: false, landmarks: raw,
        });
        samples.push({
          t: Number(seekTo.toFixed(4)),
          landmarks: normalizePose(raw),
          sourceTimeSec: seekTo,
          canonicalFrame,
        });
      } else { missingPoseCount++; }
    } catch (error) {
      checkAbort(signal);
      if (error instanceof Error && error.name === 'AbortError') throw error;
      skippedFrameCount++;
    } finally { result?.close(); }

    onProgress?.({ t: seekTo, duration, skippedFrameCount, missingPoseCount });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  checkAbort(signal);
  onProgress?.({ t: duration, duration, skippedFrameCount, missingPoseCount });
  return samples;
}
