import { DanceSkeleton, MediaPipeStyleAdapter } from '@ojustdance/skeleton';
import { DrawingUtils, type PoseLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { createPoseLandmarker, PoseLandmarker as PL } from "./createPoseLandmarker";
import { normalizePose } from "./normalizePose";
import type { ModelKey, PoseFrame } from "./types";

export type PoseSourceMode = "camera" | "file";
const canonicalAdapter = new MediaPipeStyleAdapter();
const canonicalSkeleton = new DanceSkeleton();

type Options = {
  mode: PoseSourceMode;
  /** Camera: turn on/off. File: ignored (driven by fileUrl). */
  enabled: boolean;
  /** Object URL for imported video when mode === "file". */
  fileUrl?: string | null;
  model?: ModelKey;
  mirror?: boolean;
  /** When false, keep the landmarker but skip the live rAF detect loop. */
  liveDetect?: boolean;
  /** Battle presentation consumes the shared skeleton; other callers keep their existing path. */
  includeCanonical?: boolean;
  onFrame?: (frame: PoseFrame) => void;
};

export function usePoseSource({
  mode,
  enabled,
  fileUrl = null,
  model = "lite",
  mirror,
  liveDetect = true,
  includeCanonical = false,
  onFrame,
}: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onFrameRef = useRef(onFrame);
  const liveDetectRef = useRef(liveDetect);
  const rafRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [hasPose, setHasPose] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);

  const shouldMirror = mirror ?? mode === "camera";
  onFrameRef.current = onFrame;
  liveDetectRef.current = liveDetect;

  const active = mode === "camera" ? enabled : Boolean(fileUrl);

  useEffect(() => {
    if (!active) {
      setReady(false);
      setHasPose(false);
      setVideoDuration(0);
      return;
    }

    let cancelled = false;

    async function start() {
      setError(null);
      setReady(false);
      try {
        const landmarker = await createPoseLandmarker(model);
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;

        const video = videoRef.current;
        if (!video) throw new Error("Video element missing");

        if (mode === "camera") {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera API not available in this browser");
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          video.srcObject = stream;
          video.removeAttribute("src");
          await video.play();
          setVideoDuration(0);
        } else {
          if (!fileUrl) return;
          video.srcObject = null;
          video.src = fileUrl;
          video.loop = true;
          video.muted = true;
          await new Promise<void>((resolve, reject) => {
            const onMeta = () => {
              cleanup();
              resolve();
            };
            const onErr = () => {
              cleanup();
              reject(new Error("Could not load video file"));
            };
            const cleanup = () => {
              video.removeEventListener("loadedmetadata", onMeta);
              video.removeEventListener("error", onErr);
            };
            video.addEventListener("loadedmetadata", onMeta);
            video.addEventListener("error", onErr);
          });
          if (cancelled) return;
          setVideoDuration(video.duration || 0);
          await video.play().catch(() => {
            /* autoplay may require user gesture; still ready for analyze */
          });
        }

        if (cancelled) return;
        setReady(true);

        const frameTimes: number[] = [];

        const tick = () => {
          if (cancelled) return;
          const videoEl = videoRef.current;
          const canvas = canvasRef.current;
          const lm = landmarkerRef.current;
          if (!videoEl || !canvas || !lm || !liveDetectRef.current) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          if (
            videoEl.readyState >= 2 &&
            !videoEl.paused &&
            videoEl.currentTime !== lastVideoTimeRef.current
          ) {
            lastVideoTimeRef.current = videoEl.currentTime;

            if (
              canvas.width !== videoEl.videoWidth ||
              canvas.height !== videoEl.videoHeight
            ) {
              canvas.width = videoEl.videoWidth;
              canvas.height = videoEl.videoHeight;
            }

            const now = performance.now();
            const result = lm.detectForVideo(videoEl, now);
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              const drawing = new DrawingUtils(ctx);
              for (const landmarks of includeCanonical ? [] : result.landmarks) {
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

            const raw = result.landmarks[0];
            const pose = Boolean(raw?.length);
            setHasPose(pose);

            frameTimes.push(now);
            while (frameTimes.length && now - frameTimes[0] > 1000) {
              frameTimes.shift();
            }
            setFps(frameTimes.length);

            let canonicalFrame;
            if (includeCanonical && raw?.length) {
              try { canonicalFrame = canonicalAdapter.toFrame({ schemaVersion: 'mediapipe-style/1', timestampMs: now,
                timeline: { origin: 'session-start', id: 'live-presentation' }, space: 'normalized-image',
                imageSize: { width: videoEl.videoWidth, height: videoEl.videoHeight }, depth: 'preserve-estimate', mirrored: false, landmarks: raw }); }
              catch { /* Invalid provider frames remain unavailable; the next camera frame can recover. */ }
            }
            if (includeCanonical && canonicalFrame && ctx) {
              const pose = canonicalSkeleton.constructPose(canonicalFrame);
              ctx.strokeStyle = '#d7ff52'; ctx.lineWidth = 3; ctx.lineCap = 'round';
              for (const bone of canonicalSkeleton.validEdges(pose)) {
                const a = pose.joints[bone.parent].position!, b = pose.joints[bone.child].position!;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              }
              for (const joint of Object.values(pose.joints)) {
                const point = joint.position ?? canonicalFrame.observations[joint.name]?.position;
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
                ctx.fillStyle = joint.valid ? '#f4ffe3' : '#9a9da044';
                ctx.beginPath(); ctx.arc(point.x, point.y, joint.valid ? 3 : 2, 0, Math.PI * 2); ctx.fill();
              }
            }
            onFrameRef.current?.({
              canonicalFrame,
              t: mode === "file" ? videoEl.currentTime : now / 1000,
              landmarks: pose ? normalizePose(raw) : [],
              hasPose: pose,
            });
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err instanceof Error ? err.message : "Failed to start pose source");
          setReady(false);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
      }
      setReady(false);
    };
  }, [active, mode, fileUrl, model, includeCanonical]);

  return {
    videoRef,
    canvasRef,
    landmarkerRef,
    streamRef,
    ready,
    error,
    fps,
    hasPose,
    mirror: shouldMirror,
    videoDuration,
  };
}
