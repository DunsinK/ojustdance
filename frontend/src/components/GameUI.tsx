import type { Choreography, Player } from "../types";
import { MoveIcon } from "./Performer";
import { AnimatedNumber } from "../ui/Motion";
export const formatTime = (ms: number) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
export function currentMoveIndex(dance: Choreography | null, elapsed: number) {
  return (
    dance?.moves.reduce((n, m, i) => (elapsed >= m.startMs ? i : n), 0) ?? 0
  );
}
export function MoveQueue({
  dance,
  elapsed,
  compact = false,
}: {
  dance: Choreography | null;
  elapsed: number;
  compact?: boolean;
}) {
  const index = currentMoveIndex(dance, elapsed);
  const moves = dance?.moves.slice(index, index + (compact ? 3 : 4)) ?? [];
  return (
    <div
      className={`move-queue ${compact ? "compact" : ""}`}
      aria-label="Upcoming choreography moves"
    >
      {moves.length ? (
        moves.map((move, i) => (
          <div className={`move-card ${i === 0 ? "active" : ""}`} key={move.id}>
            <div className="move-caption">
              <span>{i === 0 ? "NOW" : `NEXT ${i}`}</span>
              <span>{i === 0 ? "↗" : "→"}</span>
            </div>
            <MoveIcon index={index + i} />
            <strong>{move.name}</strong>
          </div>
        ))
      ) : (
        <p className="muted">Your move cues will appear here.</p>
      )}
    </div>
  );
}
export function Score({
  player,
  local,
  reveal = false,
  score = player.score,
}: {
  player: Player;
  local: boolean;
  reveal?: boolean;
  score?: number | null;
}) {
  return (
    <div className={`score ${local ? "local" : "rival"}`}>
      <span className="eyebrow">
        {local ? "YOUR SCORE" : `${player.name.toUpperCase()}'S SCORE`}
      </span>
      <strong>
        {score === null ? (
          <span aria-label="Score unavailable">—</span>
        ) : (
          <AnimatedNumber value={score} reveal={reveal} />
        )}
      </strong>
    </div>
  );
}
export function SongBar({
  dance,
  remaining,
  elapsed,
  sampleChart,
}: {
  dance: Choreography | null;
  remaining: number;
  elapsed: number;
  sampleChart: boolean;
}) {
  return (
    <div className="song-bar">
      <div className="record-disc" aria-hidden="true">
        <i />
      </div>
      <div className="song-name">
        <strong>{dance?.title ?? "Loading routine"}</strong>
        <span>
          {dance?.bpm ?? "—"} BPM <b>•</b> {dance?.difficulty ?? "—"} <b>•</b>{" "}
          {sampleChart ? "SAMPLE CHART · NO AUDIO" : "AUDIO NOT CONNECTED"}
        </span>
      </div>
      <div className="song-timing">
        <strong>{formatTime(remaining)}</strong>
        <span> / {formatTime(dance?.durationMs ?? 0)}</span>
      </div>
      <progress
        value={elapsed}
        max={dance?.durationMs ?? 30000}
        aria-label="Song progress"
      />
    </div>
  );
}
