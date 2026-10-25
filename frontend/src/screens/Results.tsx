import type { GameSnapshot, Player } from "../types";
import { Spark } from "../components/Brand";
import { Score } from "../components/GameUI";
import { Button } from "../ui/Button";
import { AnimatedNumber } from "../ui/Motion";

export function Results({
  game,
  onNext,
  onLeave,
}: {
  game: GameSnapshot;
  onNext: () => void;
  onLeave: () => void;
}) {
  const result = game.result;
  if (!result)
    return (
      <div className="status-screen" role="status">
        <h1>Waiting for the round result.</h1>
        <p>The server will show the result when the round is complete.</p>
      </div>
    );

  const players = game.players.filter((player): player is Player => !!player);
  const scoresAvailable =
    players.length === 2 &&
    players.every((player) => result.scores[player.id] !== null);
  const won = scoresAvailable && result.winnerId === players[0].id;
  const tied = scoresAvailable && result.winnerId === null;
  const highestScore = Math.max(
    1,
    ...players.map((player) => result.scores[player.id] ?? 0),
  );

  return (
    <div className="results">
      <div className="results-title">
        <div className="victory-mark" aria-hidden="true">
          <Spark />
          <span>{scoresAvailable ? (tied ? "=" : won ? "01" : "GG") : "—"}</span>
        </div>
        <span className="eyebrow">
          ROUND COMPLETE / {game.choreography?.title.toUpperCase()}
        </span>
        <h1>
          {scoresAvailable ? (
            won ? (
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
            )
          ) : (
            <>
              The round is over.
              <br />
              <em>Scoring comes next.</em>
            </>
          )}
        </h1>
        <p>
          {scoresAvailable
            ? won
              ? "Big moves. Bigger energy. Find another player for a new round."
              : "Both players finished the routine. Ready for another?"
            : "Matchmaking and the shared timer are live. Pose scoring is not connected yet, so no winner is reported."}
        </p>
        <span className="badge">
          {game.choreography?.sample
            ? "SAMPLE CHART · NO AUDIO"
            : scoresAvailable
              ? "FINAL RESULTS"
              : "SCORE UNAVAILABLE"}
        </span>
      </div>
      <div className="result-board">
        {players.map((player, i) => {
          const score = result.scores[player.id];
          return (
            <div
              key={player.id}
              className={`result-player ${i === 0 ? "local" : "rival"} ${result.winnerId === player.id ? "winner" : ""}`}
            >
              <div className="result-identity">
                <span>{i === 0 ? "YOU" : player.name.toUpperCase()}</span>
                <span className="badge">
                  {scoresAvailable
                    ? result.winnerId === player.id
                      ? "WINNER ↗"
                      : tied
                        ? "TIED"
                        : "WORTHY RIVAL"
                    : "NO SCORE"}
                </span>
              </div>
              <Score player={player} local={i === 0} score={score} reveal />
              <div className="result-meter" aria-hidden="true">
                <span
                  style={{
                    transform: `scaleX(${(score ?? 0) / highestScore})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {scoresAvailable && (
        <div className="performance-grid">
          <div>
            <strong>
              {result.accuracy === null ? (
                "—"
              ) : (
                <>
                  <AnimatedNumber value={result.accuracy} reveal />%
                </>
              )}
            </strong>
            <span>Move accuracy</span>
          </div>
          <div>
            <strong>
              {result.bestCombo === null ? (
                "—"
              ) : (
                <>
                  <AnimatedNumber value={result.bestCombo} reveal />×
                </>
              )}
            </strong>
            <span>Best combo</span>
          </div>
          <div>
            <strong>
              {result.perfectMoves === null ? (
                "—"
              ) : (
                <AnimatedNumber value={result.perfectMoves} reveal />
              )}
            </strong>
            <span>Perfect moves</span>
          </div>
        </div>
      )}
      <div className="results-actions">
        <Button onClick={onNext} arrow>
          Find another player
        </Button>
        <Button onClick={onLeave} variant="quiet">
          Leave the floor
        </Button>
      </div>
    </div>
  );
}
