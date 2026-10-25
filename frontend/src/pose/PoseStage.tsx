import { useState, type RefObject } from "react";
import "./PoseStage.css";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mirror?: boolean;
  status?: string;
  recording?: boolean;
  /** Show native controls (useful for imported files). */
  controls?: boolean;
  /** Let imported video dimensions determine the stage ratio instead of cropping. */
  fitVideo?: boolean;
  /** Use another video’s aspect ratio to keep paired stages aligned. */
  aspectRatio?: string | null;
};

export function PoseStage({
  videoRef,
  canvasRef,
  mirror = true,
  status,
  recording = false,
  controls = false,
  fitVideo = false,
  aspectRatio,
}: Props) {
  const [videoAspectRatio, setVideoAspectRatio] = useState<string | null>(null);
  const stageAspectRatio = aspectRatio ?? videoAspectRatio;

  return (
    <div
      className={`pose-stage${recording ? " recording" : ""}${fitVideo ? " fit-video" : ""}${stageAspectRatio ? " fit-video-ready" : ""}`}
      style={stageAspectRatio ? { aspectRatio: stageAspectRatio } : undefined}
    >
      <video
        ref={videoRef}
        className={mirror ? "mirror" : undefined}
        playsInline
        muted
        autoPlay
        controls={controls}
        onLoadStart={() => {
          if (fitVideo) setVideoAspectRatio(null);
        }}
        onLoadedMetadata={(event) => {
          if (!fitVideo) return;
          const { videoWidth, videoHeight } = event.currentTarget;
          if (videoWidth > 0 && videoHeight > 0) {
            setVideoAspectRatio(`${videoWidth} / ${videoHeight}`);
          }
        }}
      />
      <canvas ref={canvasRef} className={mirror ? "mirror" : undefined} />
      {status && <div className="pose-status">{status}</div>}
      {recording && <div className="rec-dot" aria-hidden="true" />}
    </div>
  );
}
