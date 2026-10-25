import { MediaPipeStyleAdapter } from "@ojustdance/skeleton";
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

function pickRecorderMime(withAudio: boolean) {
  const candidates = withAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function requestCanvasFrame(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;
  track?.requestFrame?.();
}

export type AnalyzeProgress = {
  t: number;
  duration: number;
};

export type AnalyzeResult = {
  samples: ChartSample[];
  /** Composite WebM with skeleton burned in (null if bake skipped / failed). */
  previewBlob: Blob | null;
};

/**
 * Step through a video file, extract pose samples, and optionally bake a
 * skeleton-overlaid preview WebM from the same canvas draws.
 */
export async function analyzeVideoFile(opts: {
  video: HTMLVideoElement;
  landmarker: PoseLandmarker;
  canvas?: HTMLCanvasElement | null;
  sampleHz?: number;
  /** When true (default if canvas set), encode a composite preview while analyzing. */
  bakePreview?: boolean;
  onProgress?: (p: AnalyzeProgress) => void;
  signal?: AbortSignal;
}): Promise<AnalyzeResult> {
  const { video, landmarker, canvas, onProgress, signal } = opts;
  const sampleHz = opts.sampleHz ?? 15;
  const bakePreview = opts.bakePreview ?? Boolean(canvas);
  const step = 1 / sampleHz;
  const duration = video.duration;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video has no duration — try another file");
  }

  video.pause();
  const samples: ChartSample[] = [];
  const adapter = new MediaPipeStyleAdapter();
  const timelineId = crypto.randomUUID();
  let stamp = 0;

  let recorder: MediaRecorder | null = null;
  let canvasStream: MediaStream | null = null;
  const chunks: Blob[] = [];

  if (bakePreview && canvas && typeof MediaRecorder !== "undefined") {
    if (!video.videoWidth || !video.videoHeight) {
      video.currentTime = 0;
      await waitForSeek(video);
    }
    canvas.width = video.videoWidth || canvas.width || 640;
    canvas.height = video.videoHeight || canvas.height || 360;

    canvasStream = canvas.captureStream(0);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

    try {
      const capture = (
        video as HTMLVideoElement & { captureStream?: () => MediaStream }
      ).captureStream?.();
      if (capture) tracks.push(...capture.getAudioTracks());
    } catch {
      /* audio optional */
    }

    const recordStream = new MediaStream(tracks);
    const withAudio = recordStream.getAudioTracks().length > 0;
    const mimeType = pickRecorderMime(withAudio);
    recorder = new MediaRecorder(
      recordStream,
      mimeType
        ? { mimeType, videoBitsPerSecond: 2_500_000 }
        : { videoBitsPerSecond: 2_500_000 }
    );
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(200);
  }

  try {
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
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
        if (canvasStream) {
          requestCanvasFrame(canvasStream);
          // Yield so the encoder can ingest the frame.
          await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        }
      }

      if (raw?.length) {
        let canonicalFrame: ChartSample["canonicalFrame"];
        try {
          canonicalFrame = adapter.toFrame({
            schemaVersion: "mediapipe-style/1",
            timestampMs: seekTo * 1000,
            timeline: { origin: "video-start", id: timelineId },
            space: "normalized-image",
            imageSize: { width: video.videoWidth, height: video.videoHeight },
            depth: "preserve-estimate",
            mirrored: false,
            landmarks: raw,
          });
        } catch (err) {
          console.error("Could not convert imported pose frame for scoring", err);
        }
        samples.push({
          t: Number(seekTo.toFixed(4)),
          landmarks: normalizePose(raw),
          sourceTimeSec: seekTo,
          canonicalFrame,
        });
      }

      onProgress?.({ t: seekTo, duration });
    }
  } finally {
    // stop captureStream tracks we created (not the original video's media)
  }

  let previewBlob: Blob | null = null;
  if (recorder && recorder.state !== "inactive") {
    previewBlob = await new Promise<Blob>((resolve, reject) => {
      recorder!.onerror = () => reject(new Error("Preview encode failed"));
      recorder!.onstop = () => {
        resolve(
          new Blob(chunks, {
            type: recorder!.mimeType || "video/webm",
          })
        );
      };
      recorder!.stop();
    });
    if (previewBlob.size === 0) previewBlob = null;
  }

  canvasStream?.getVideoTracks().forEach((t) => t.stop());

  return { samples, previewBlob };
}
