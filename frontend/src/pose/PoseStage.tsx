import type { RefObject } from "react";
import "./PoseStage.css";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mirror?: boolean;
  status?: string;
  recording?: boolean;
  /** Show native controls (useful for imported files). */
  controls?: boolean;
};

export function PoseStage({
  videoRef,
  canvasRef,
  mirror = true,
  status,
  recording = false,
  controls = false,
}: Props) {
  return (
    <div className={`pose-stage${recording ? " recording" : ""}`}>
      <video
        ref={videoRef}
        className={mirror ? "mirror" : undefined}
        playsInline
        muted
        autoPlay
        controls={controls}
      />
      <canvas ref={canvasRef} className={mirror ? "mirror" : undefined} />
      {status && <div className="pose-status">{status}</div>}
      {recording && <div className="rec-dot" aria-hidden="true" />}
    </div>
  );
}
