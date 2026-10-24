import type { ReactNode } from "react";
import type { GameSnapshot, GameRenderers } from "../types";
import { MoveQueue, formatTime } from "../components/GameUI";
import { Button } from "../ui/Button";

export function Preview({
  game,
  renderers,
  streams,
  cameraControl,
  onReady,
}: {
  game: GameSnapshot;
  renderers: GameRenderers;
  streams: Record<string, MediaStream | undefined>;
  cameraControl: ReactNode;
  onReady: () => void;
}) {
  const Stage = renderers.Choreography;
  const Video = renderers.Video;
  const dance = game.choreography;
  const duration = dance?.previewDurationMs ?? 30000;
  const progress = Math.min(1, (duration - game.remainingMs) / duration);
  return (
    <div className="preparation">
      <div className="room-heading">
        <div>
          <span className="eyebrow">LEARN IT. FEEL IT. MAKE IT YOURS.</span>
          <h1>Catch the beat.</h1>
        </div>
        <div className="preview-timer">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="28" />
            <circle
              cx="32"
              cy="32"
              r="28"
              pathLength="1"
              strokeDasharray={`${progress} 1`}
            />
          </svg>
          <div>
            <span>PREVIEW LEFT</span>
            <strong>{formatTime(game.remainingMs)}</strong>
          </div>
        </div>
      </div>
      <div className="preparation-grid">
        <div className="coach-column">
          <Stage
            choreography={dance}
            elapsedMs={game.elapsedMs}
            playing={game.remainingMs > 0}
          />
          <MoveQueue dance={dance} elapsed={game.elapsedMs} />
        </div>
        <aside className="prep-sidebar">
          <div className="routine-details">
            <div className="record-disc">
              <i />
            </div>
            <span className="eyebrow">YOUR SHARED CHALLENGE</span>
            <h2>{dance?.title ?? "Loading routine…"}</h2>
            <p>{dance?.artist}</p>
            <div className="routine-tags">
              <span>{dance?.bpm ?? "—"} BPM</span>
              <span>{dance?.difficulty ?? "—"}</span>
              <span>{formatTime(dance?.durationMs ?? 0)} ROUND</span>
            </div>
            <div className="ready-status">
              <span>{game.players[1].name}</span>
              <strong>
                {game.players[1].ready ? "✓ Ready to dance" : "Getting ready…"}
              </strong>
            </div>
            <Button
              arrow={!game.players[0].ready}
              disabled={game.players[0].ready || !dance}
              onClick={onReady}
            >
              {game.players[0].ready ? "✓ You’re ready" : "I’m ready to dance"}
            </Button>
            <p className="microcopy" role="status">
              {game.players[0].ready
                ? game.remainingMs > 0
                  ? "Your round starts after the preview."
                  : "Waiting for your rival to get ready."
                : game.remainingMs > 0
                  ? "Watch the full preview. Then it’s your moment."
                  : "Preview complete. Start when you’re ready."}
            </p>
          </div>
          <div className="prep-players">
            {game.players.map((p, i) => (
              <Video
                key={p.id}
                player={p}
                local={i === 0}
                demo={game.demo}
                stream={streams[p.id]}
              />
            ))}
          </div>
          {cameraControl}
        </aside>
      </div>
    </div>
  );
}

// Preserve the existing import path for frontend consumers.
export { Matchmaking } from "./Matchmaking";
