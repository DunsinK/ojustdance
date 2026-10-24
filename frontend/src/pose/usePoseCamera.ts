import { DrawingUtils, type PoseLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { createPoseLandmarker, PoseLandmarker as PL } from "./createPoseLandmarker";
import { normalizePose } from "./normalizePose";
import type { ModelKey, PoseFrame } from "./types";

type Options = {
  enabled: boolean;
  model?: ModelKey;
  mirror?: boolean;
  onFrame?: (frame: PoseFrame) => void;
};

export function usePoseCamera({
  enabled,
  model = "lite",
  mirror = true,
  onFrame,
}: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const onFrameRef = useRef(onFrame);
  const rafRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [hasPose, setHasPose] = useState(false);

  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      setHasPose(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available in this browser");
        }

        const landmarker = await createPoseLandmarker(model);
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;

        stream = await navigator.mediaDevices.getUserMedia({
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

        const video = videoRef.current;
        if (!video) throw new Error("Video element missing");
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        setReady(true);

        const frameTimes: number[] = [];

        const tick = () => {
          if (cancelled) return;
          const videoEl = videoRef.current;
          const canvas = canvasRef.current;
          const lm = landmarkerRef.current;
          if (!videoEl || !canvas || !lm) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          if (videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = videoEl.currentTime;

            if (canvas.width !== videoEl.videoWidth || canvas.height !== videoEl.videoHeight) {
              canvas.width = videoEl.videoWidth;
              canvas.height = videoEl.videoHeight;
            }

            const now = performance.now();
            const result = lm.detectForVideo(videoEl, now);
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

            const raw = result.landmarks[0];
            const pose = Boolean(raw?.length);
            setHasPose(pose);

            frameTimes.push(now);
            while (frameTimes.length && now - frameTimes[0] > 1000) {
              frameTimes.shift();
            }
            setFps(frameTimes.length);

            const relative = pose ? normalizePose(raw) : [];
            onFrameRef.current?.({
              t: now / 1000,
              landmarks: relative,
              hasPose: pose,
            });
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err instanceof Error ? err.message : "Failed to start camera");
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
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setReady(false);
    };
  }, [enabled, model]);

  return {
    videoRef,
    canvasRef,
    ready,
    error,
    fps,
    hasPose,
    mirror,
  };
}
