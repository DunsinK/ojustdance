import { useEffect, useRef } from "react";
import type { ChoreographyStageProps, VideoPanelProps } from "../types";
import { Dancer, Star } from "./Brand";
export function VideoPanel({
  player,
  stream,
  local,
  demo,
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
      className={`video-panel ${player.color}`}
      aria-label={`${player.name} video`}
    >
      <div className="panel-top">
        <span className="player-label">
          <i />
          {player.name}
          {local && " / P1"}
        </span>
        <span className="tiny">
          {stream ? "CAMERA ON" : demo ? "DEMO PLAYER" : "WAITING FOR VIDEO"}
        </span>
      </div>
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
          <div className="video-placeholder">
            <Dancer variant={player.color} />
            <span>
              {demo
                ? "Simulated dancer · no live video"
                : "Video will appear when connected"}
            </span>
          </div>
        )}
      </div>
      <div className="panel-bottom">
        {children ?? (
          <span>
            {player.ready
              ? "✓ Ready to move"
              : local
                ? "Your side of the floor"
                : "A new face. Same rhythm."}
          </span>
        )}
      </div>
    </section>
  );
}
export function ChoreographyStage({
  choreography,
  elapsedMs,
  playing,
  loading,
}: ChoreographyStageProps) {
  const move = choreography?.moves.filter((m) => elapsedMs >= m.startMs).at(-1);
  return (
    <section
      className={`choreo-stage ${playing ? "playing" : ""}`}
      aria-label="Choreography preview"
    >
      <div className="panel-top">
        <span className="eyebrow">THE SHARED STAGE</span>
        <span className="tag">DEMO CHOREOGRAPHY</span>
      </div>
      {loading ? (
        <div className="stage-message" role="status">
          Preparing your routine…
        </div>
      ) : !choreography ? (
        <div className="stage-message">
          No choreography yet. Your routine will appear here.
        </div>
      ) : (
        <>
          <div className="stage-orbit" />
          <Dancer pose={Math.floor(elapsedMs / 5000)} />
          <Star className="stage-star" />
          <div className="stage-caption">
            <span className="tiny">
              {playing
                ? "FOLLOW THE MOVEMENT"
                : elapsedMs > 0
                  ? "PREVIEW COMPLETE"
                  : "YOUR NEXT CHALLENGE"}
            </span>
            <strong>{move?.name ?? "Find your rhythm"}</strong>
            <span className="muted">Demo routine · watch the move cues</span>
          </div>
        </>
      )}
    </section>
  );
}
