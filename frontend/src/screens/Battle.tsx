import { motion } from "motion/react";
import type { GameSnapshot, GameRenderers } from "../types";
import {
  currentMoveIndex,
  MoveQueue,
  Score,
  SongBar,
} from "../components/GameUI";
import { useQuietMotion } from "../ui/Motion";

export function Battle({
  game,
  renderers,
  streams,
}: {
  game: GameSnapshot;
  renderers: GameRenderers;
  streams: Record<string, MediaStream | undefined>;
}) {
  const Video = renderers.Video;
  const Stage = renderers.Choreography;
  const countdown = game.phase === "countdown";
  const quiet = useQuietMotion();
  const index = currentMoveIndex(game.choreography, game.elapsedMs);
  const count = Math.max(1, Math.ceil(game.remainingMs / 1000));
  return (
    <div className="battle">
      <h1 className="sr-only">
        {countdown ? "Battle starts soon" : "Live dance battle"}
      </h1>
      <SongBar
        dance={game.choreography}
        remaining={
          countdown ? (game.choreography?.durationMs ?? 0) : game.remainingMs
        }
        elapsed={countdown ? 0 : game.elapsedMs}
        demo={game.demo}
      />
      <div className="battle-context">
        <span>
          <i className="status-dot" />
          {game.demo
            ? "DEMO ROOM · SIMULATED SCORES"
            : game.connection.toUpperCase()}
        </span>
        <span>FULL BODY IN FRAME. ALL ENERGY ON THE FLOOR.</span>
      </div>
      {countdown && (
        <div className="countdown-banner" role="status">
          <span>GET INTO POSITION</span>
          <motion.strong
            key={count}
            initial={quiet ? false : { scale: 1.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {count}
          </motion.strong>
          <span>YOUR MOMENT STARTS NOW</span>
        </div>
      )}
      <div className="arena">
        {game.players.map((player, i) => (
          <div
            className={`arena-player ${i === 0 ? "local" : "rival"}`}
            key={player.id}
          >
            <Video
              player={player}
              local={i === 0}
              demo={game.demo}
              stream={streams[player.id]}
            >
              <span
                className={`pose-feedback ${player.feedback?.rating.toLowerCase() ?? ""}`}
                role={i === 0 ? "status" : undefined}
              >
                {countdown
                  ? "GET READY"
                  : (player.feedback?.rating ?? "FIND YOUR RHYTHM")}
              </span>
              <span className="combo">
                {!countdown && player.feedback
                  ? `${player.feedback.combo}× COMBO`
                  : "FULL BODY / FULL ENERGY"}
              </span>
            </Video>
            <Score player={player} local={i === 0} />
          </div>
        ))}
        <span className="arena-vs" aria-hidden="true">
          VS
        </span>
      </div>
      <div className="guidance-deck">
        <div className="battle-coach">
          <Stage
            choreography={game.choreography}
            elapsedMs={countdown ? 0 : game.elapsedMs}
            playing={!countdown}
          />
          <span className="eyebrow">THE COACH</span>
        </div>
        <div className="cue-heading">
          <span className="eyebrow">
            {countdown ? "FIRST MOVE" : "FOLLOW THE RHYTHM"}
          </span>
          <h2>
            {game.choreography?.moves[index]?.name ?? "Waiting for moves"}
          </h2>
          <span>
            Same moves.
            <br />
            Your own style.
          </span>
        </div>
        <MoveQueue
          dance={game.choreography}
          elapsed={countdown ? 0 : game.elapsedMs}
        />
      </div>
    </div>
  );
}
