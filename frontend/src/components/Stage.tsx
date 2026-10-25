import { useEffect, useRef } from "react";
import type { ChoreographyStageProps, VideoPanelProps } from "../types";
import { Performer } from "./Performer";
import { Spark } from "./Brand";

export function VideoPanel({
  player,
  stream,
  local,
  children,
}: VideoPanelProps) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (element) element.srcObject = stream ?? null;
    return () => {
      if (element) element.srcObject = null;
    };
  }, [stream]);
  return (
    <section
      className={`video-panel ${local ? "local" : "rival"}`}
      aria-label={`${player.name} video`}
    >
      <header className="video-label">
        <span>
          <i />
          {local ? "YOU" : player.name.toUpperCase()}{" "}
          <small>{local ? "PLAYER 01" : "PLAYER 02"}</small>
        </span>
        <span className="video-state">
          {stream ? (local ? "LOCAL PREVIEW" : "LIVE VIDEO") : "CAMERA OFF"}
        </span>
      </header>
      <div className="video-viewport">
        {stream ? (
          <video
            ref={video}
            autoPlay
            playsInline
            muted={local}
            className={local ? "mirrored" : ""}
          />
        ) : (
          <div className="empty-video">
            <MoveIconPlaceholder />
            <strong>
              {local ? "Your side of the floor" : "Waiting for your opponent"}
            </strong>
            <p>
              {local
                ? "Enable your camera when you’re ready."
                : "Their video will appear once connected."}
            </p>
          </div>
        )}
      </div>
      <div className="video-caption">
        {children ?? (
          <>
            <span>
              {local
                ? "Camera video stays on this device"
                : "Remote video is not connected yet"}
            </span>
            <span>{player.ready ? "✓ Ready" : "Getting ready"}</span>
          </>
        )}
      </div>
    </section>
  );
}
function MoveIconPlaceholder() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="19" height="18" rx="4" />
      <path d="m22 12 7-4v16l-7-4" />
    </svg>
  );
}

export function ChoreographyStage({
  choreography,
  elapsedMs,
  playing,
  loading,
}: ChoreographyStageProps) {
  const current = choreography?.moves
    .filter((m) => elapsedMs >= m.startMs)
    .at(-1);
  return (
    <section className="choreo-stage" aria-label="Choreography target">
      <header>
        <span className="eyebrow">YOUR CHOREOGRAPHY</span>
        <span className="badge">
          {choreography?.sample ? "SAMPLE CHART" : "CHOREOGRAPHY"}
        </span>
      </header>
      {loading ? (
        <div className="stage-empty" role="status">
          Building your routine…
        </div>
      ) : !choreography ? (
        <div className="stage-empty">Waiting for a shared routine.</div>
      ) : (
        <>
          <div className="stage-art">
            <div className="stage-rings" />
            <div className="stage-axis" />
            <Performer coach />
            <Spark className="stage-spark" />
          </div>
          <div className="stage-bottom">
            <span className="eyebrow">
              {playing
                ? "FOLLOW THE COACH"
                : elapsedMs > 0
                  ? "PREVIEW COMPLETE"
                  : "GET INTO POSITION"}
            </span>
            <strong>{current?.name ?? "Find your stance"}</strong>
            <span>Demo illustration · full-body movement</span>
          </div>
        </>
      )}
    </section>
  );
}
