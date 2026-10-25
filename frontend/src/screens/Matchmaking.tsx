import type { ReactNode } from "react";
import type { GameSnapshot, GameRenderers } from "../types";
import {
  BeatSignal,
  MatchButton,
  type SignalState,
} from "../components/entry/EntryMotion";
import { Button } from "../ui/Button";

export function matchmakingState(
  game: GameSnapshot,
): SignalState {
  if (game.connection === "error" || game.connection === "disconnected")
    return "failed";
  if (game.connection === "connecting") return "connecting";
  return game.phase === "found" ? "found" : "searching";
}
export function Matchmaking({
  game,
  renderers,
  stream,
  cameraControl,
  onCancel,
  onRetry = onCancel,
  onLeave = onCancel,
}: {
  game: GameSnapshot;
  renderers: GameRenderers;
  stream?: MediaStream;
  cameraControl: ReactNode;
  onCancel: () => void;
  onRetry?: () => void;
  onLeave?: () => void;
}) {
  const state = matchmakingState(game);
  const confirmed = game.phase === "found";
  const copy = {
    searching: [
      "01 / SEARCHING",
      "Find your frequency.",
      "Looking for a dance partner. The next beat could be anyone’s.",
    ],
    found: [
      "02 / MATCH FOUND",
      "There’s your other beat.",
      "Your rival is confirmed. Preparing your shared dance room.",
    ],
    connecting: [
      "03 / CONNECTING",
      confirmed ? "Same room. Almost ready." : "Opening the dance floor.",
      confirmed
        ? "Connecting your room before the choreography begins."
        : "Connecting to matchmaking. No opponent has been confirmed yet.",
    ],
    failed: [
      "CONNECTION INTERRUPTED",
      "A break in the rhythm.",
      game.error ??
        "The connection was lost. Start a fresh search when you’re ready.",
    ],
  }[state];
  const Video = renderers.Video;
  return (
    <section className={`entry-lobby entry-lobby-${state}`}>
      <div className="entry-lobby-heading">
        <span className="eyebrow">{copy[0]}</span>
        <span className="badge">LIVE MATCHMAKING</span>
      </div>
      <h1>{copy[1]}</h1>
      <p
        className="entry-lobby-status"
        role={state === "failed" ? "alert" : "status"}
      >
        {copy[2]}
      </p>
      <BeatSignal state={state} confirmed={confirmed} />
      <div className="entry-lobby-actions">
        {state === "failed" ? (
          <>
            <MatchButton onClick={onRetry} />
            <Button variant="quiet" onClick={onLeave}>
              Back to home
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onCancel}>
              Cancel matchmaking
            </Button>
            <span>
              You’re in the shared server queue. You can leave at any time.
            </span>
          </>
        )}
      </div>
      <div className="entry-camera-strip">
        <div className="entry-camera-intro">
          <span className="eyebrow">BEFORE THE BEAT DROPS</span>
          <h2>Give yourself room.</h2>
          <p>
            Step back until your whole body fits. Camera access is always your
            choice.
          </p>
        </div>
        {stream && (
          <div className="entry-camera-preview">
            <Video player={game.players[0]} local stream={stream} />
          </div>
        )}
        {cameraControl}
      </div>
    </section>
  );
}
