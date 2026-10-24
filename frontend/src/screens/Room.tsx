import type { ReactNode } from "react";
import type { GameSnapshot, GameRenderers } from "../types";
import { Spark } from "../components/Brand";
import { MoveQueue, formatTime } from "../components/GameUI";
import { Button } from "../ui/Button";

export function Matchmaking({
  game,
  renderers,
  stream,
  cameraControl,
  onCancel,
}: {
  game: GameSnapshot;
  renderers: GameRenderers;
  stream?: MediaStream;
  cameraControl: ReactNode;
  onCancel: () => void;
}) {
  const found = game.phase === "found";
  const Video = renderers.Video;
  return (
    <div className="matchmaking">
      <div className="room-heading">
        <div>
          <span className="eyebrow">
            {found
              ? "CONNECTION MADE"
              : "LOOKING FOR YOUR OTHER HALF OF THE BEAT"}
          </span>
          <h1>{found ? "New rival. Same rhythm." : "Find your frequency."}</h1>
        </div>
        <span className="badge">
          {game.demo ? "SIMULATED MATCHMAKING" : game.connection.toUpperCase()}
        </span>
      </div>
      <div className="lobby-grid">
        <div className="camera-check">
          <div className="section-label">
            <span>01 / YOUR SIDE</span>
            <span>CAMERA CHECK</span>
          </div>
          <Video
            player={game.players[0]}
            local
            demo={game.demo}
            stream={stream}
          />
          {cameraControl}
        </div>
        <section className={`match-engine ${found ? "matched" : ""}`}>
          <div className="match-orbit" aria-hidden="true">
            <div className="orbit-track track-one" />
            <div className="orbit-track track-two" />
            <div className="orbit-track track-three" />
            <span className="orbit-node node-you">01</span>
            <span className="orbit-node node-them">{found ? "02" : "?"}</span>
            <div className="orbit-core">
              <Spark />
            </div>
          </div>
          <div className="match-message">
            <span className="eyebrow">
              {found
                ? "SAME FLOOR. DIFFERENT MOVES."
                : "TWO SIGNALS. ONE CONNECTION."}
            </span>
            <h2>
              {found
                ? "You’re on the same beat."
                : "Your next rival is out there."}
            </h2>
            <p role="status">
              {found
                ? "Match found. Preparing your shared routine…"
                : "Searching for a dance partner. Stay loose."}
            </p>
            <Button variant="secondary" onClick={onCancel}>
              Cancel matchmaking
            </Button>
            <span className="microcopy">
              {game.demo
                ? "Demo opponent · no live connection"
                : "You can leave the queue at any time."}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

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
