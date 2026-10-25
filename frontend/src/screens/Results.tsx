import type { GameSnapshot } from "../types";
import { Spark } from "../components/Brand";
import { Score } from "../components/GameUI";
import { Button } from "../ui/Button";
import { AnimatedNumber } from "../ui/Motion";

export function Results({
  game,
  onNext,
  onRematch,
  onLeave,
}: {
  game: GameSnapshot;
  onNext: () => void;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const result = game.result;
  if (!result)
    return (
      <div className="status-screen" role="status">
        <h1>Counting the final beat…</h1>
        <p>Your results will appear here.</p>
      </div>
    );
  const won = result.winnerId === game.players[0].id;
  const tied = result.winnerId === null;
  return (
    <div className="results">
      <div className="results-title">
        <div className="victory-mark" aria-hidden="true">
          <Spark />
          <span>{tied ? "=" : won ? "01" : "GG"}</span>
        </div>
        <span className="eyebrow">
          ROUND COMPLETE / {game.choreography?.title.toUpperCase()}
        </span>
        <h1>
          {won ? (
            <>
              That beat?
              <br />
              <em>You owned it.</em>
            </>
          ) : tied ? (
            <>
              One beat.
              <br />
              <em>Two winners.</em>
            </>
          ) : (
            <>
              What a round.
              <br />
              <em>Run it back.</em>
            </>
          )}
        </h1>
        <p>
          {won
            ? "Big moves. Bigger energy. Take your victory lap."
            : "A little rivalry looks good on you. Ready for another?"}
        </p>
        <span className="badge">
          {game.demo ? "DEMO RESULTS · SIMULATED PERFORMANCE" : "FINAL RESULTS"}
        </span>
      </div>
      <div className="result-board">
        {game.players.map((player, i) => (
          <div
            key={player.id}
            className={`result-player ${i === 0 ? "local" : "rival"} ${result.winnerId === player.id ? "winner" : ""}`}
          >
            <div className="result-identity">
              <span>{i === 0 ? "YOU" : player.name.toUpperCase()}</span>
              <span className="badge">
                {result.winnerId === player.id
                  ? "WINNER ↗"
                  : tied
                    ? "TIED"
                    : "WORTHY RIVAL"}
              </span>
            </div>
            <Score
              player={player}
              local={i === 0}
              score={result.scores[player.id] ?? player.score}
              reveal
            />
            <div className="result-meter" aria-hidden="true">
              <span
                style={{
                  transform: `scaleX(${(result.scores[player.id] ?? 0) / Math.max(1, ...Object.values(result.scores))})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="performance-grid">
        <div>
          <strong>
            <AnimatedNumber value={result.accuracy} reveal />%
          </strong>
          <span>Move accuracy</span>
        </div>
        <div>
          <strong>
            <AnimatedNumber value={result.bestCombo} reveal />×
          </strong>
          <span>Best combo</span>
        </div>
        <div>
          <strong>
            <AnimatedNumber value={result.perfectMoves} reveal />
          </strong>
          <span>Perfect moves</span>
        </div>
      </div>
      <div className="results-actions">
        <Button onClick={onNext} arrow>
          Next opponent
        </Button>
        <Button onClick={onRematch} variant="secondary">
          Play again
        </Button>
        <Button onClick={onLeave} variant="quiet">
          Leave the floor
        </Button>
      </div>
      <p className="microcopy">
        Continue with a new rival, or play another round with this opponent.
      </p>
    </div>
  );
}
