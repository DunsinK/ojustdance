import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { GameAction, GameAdapter, GameRenderers } from "./types";
import type { DemoController } from "./demo/controller";
import { Brand, Spark } from "./components/Brand";
import { ChoreographyStage, VideoPanel } from "./components/Stage";
import { useCamera } from "./hooks/useCamera";
import { ReducedMotionContext } from "./ui/Motion";
import { Button } from "./ui/Button";
import { Landing } from "./screens/Landing";
import { Preview } from "./screens/Room";
import { Matchmaking } from "./screens/Matchmaking";
import { Battle } from "./screens/Battle";
import { Results } from "./screens/Results";
const defaults: GameRenderers = {
  Video: VideoPanel,
  Choreography: ChoreographyStage,
};
export function App({
  adapter,
  renderers = defaults,
  demoControls,
  streams = {},
}: {
  adapter: GameAdapter;
  renderers?: GameRenderers;
  demoControls?: DemoController;
  streams?: Record<string, MediaStream>;
}) {
  const game = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
  const camera = useCamera();
  const main = useRef<HTMLElement>(null);
  const systemReduced = useReducedMotion();
  const quiet = !!systemReduced;
  const { phase } = game;
  const [cancelledSearch, setCancelledSearch] = useState(false);
  const home = phase === "home" && !cancelledSearch;
  const lobby =
    phase === "searching" ||
    phase === "found" ||
    (phase === "home" && cancelledSearch);
  const failed =
    game.connection === "error" || game.connection === "disconnected";
  const battle = phase === "battle" || phase === "countdown";
  const step = lobby ? 0 : phase === "preview" ? 1 : battle ? 2 : 3;
  const videoStreams = {
    ...streams,
    [game.players[0].id]: camera.stream ?? streams[game.players[0].id],
  };
  const focusKey = lobby ? "matchmaking" : phase;
  useEffect(() => {
    main.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [focusKey, failed, cancelledSearch]);
  const act = (action: GameAction) => {
    if (action === "leave" || action === "cancel") camera.stop();
    setCancelledSearch(action === "cancel");
    adapter.dispatch(action);
  };
  const cameraControl = (
    <div className="camera-control">
      <div>
        <span className="camera-status">
          <i
            className={camera.status === "on" ? "status-dot" : "status-dot off"}
          />
          {camera.status === "on" ? "Camera ready" : "Camera is off"}
        </span>
        <p>
          {camera.status === "on"
            ? "Microphone off. Local preview in demo."
            : game.demo
              ? "Optional in demo. Your camera, your call."
              : "Enable your camera to check your framing."}
        </p>
      </div>
      <Button
        variant="secondary"
        disabled={camera.status === "requesting"}
        onClick={camera.status === "on" ? camera.stop : camera.enable}
      >
        {camera.status === "requesting"
          ? "Requesting access…"
          : camera.status === "on"
            ? "Turn off"
            : camera.status === "error"
              ? "Retry camera"
              : "Enable camera"}
      </Button>
      {camera.error && (
        <p className="camera-error" role="alert">
          {camera.error}
        </p>
      )}
    </div>
  );
  return (
    <ReducedMotionContext.Provider value={quiet}>
      <div
        className={`app ${home ? "is-home" : "is-game"} ${battle ? "is-battle" : ""} ${home || lobby ? "is-entry" : ""} ${quiet ? "motion-reduced" : ""}`}
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <button
            className="brand-button"
            aria-label="ojustdance home"
            onClick={() => act("leave")}
          >
            <Brand />
          </button>
          {home ? (
            <nav className="landing-nav" aria-label="Main navigation">
              <a href="#how-it-works">How to play</a>
              <a href="#ground-rules">Your move</a>
            </nav>
          ) : (
            <ol className="round-steps" aria-label="Round progress">
              {["Match", "Learn", "Battle", "Results"].map((name, i) => (
                <li
                  key={name}
                  aria-current={step === i ? "step" : undefined}
                  className={step === i ? "active" : step > i ? "complete" : ""}
                >
                  <span>{step > i ? "✓" : `0${i + 1}`}</span>
                  {name}
                </li>
              ))}
            </ol>
          )}
          <div className="header-actions">
            <span className="badge mode-badge">
              <i className="status-dot" />
              {game.demo ? "DEMO MODE" : game.connection.toUpperCase()}
            </span>
            {!home && (
              <Button variant="quiet" onClick={() => act("leave")}>
                Leave room ↗
              </Button>
            )}
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1}>
          <motion.div
            key={lobby ? "matchmaking" : `${phase}-${failed}`}
            className={home ? "" : lobby ? "entry-content" : "game-content"}
            initial={quiet ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32 }}
          >
            {home ? (
              <Landing onFind={() => act("find")} renderers={renderers} />
            ) : lobby ? (
              <Matchmaking
                game={game}
                renderers={renderers}
                stream={videoStreams[game.players[0].id]}
                cameraControl={cameraControl}
                cancelled={cancelledSearch}
                onCancel={() => act("cancel")}
                onRetry={() => act("retry")}
                onLeave={() => act("leave")}
              />
            ) : failed ? (
              <section className="status-screen">
                <Spark />
                <span className="eyebrow">LET’S FIND YOUR RHYTHM AGAIN</span>
                <h1>
                  {game.connection === "error"
                    ? "A technical time-out."
                    : "Connection interrupted."}
                </h1>
                <p role="alert">
                  {game.error ??
                    "Your room disconnected. Start a new match when you’re ready."}
                </p>
                <Button onClick={() => act("retry")} arrow>
                  Find a new match
                </Button>
                <Button variant="quiet" onClick={() => act("leave")}>
                  Back to home
                </Button>
              </section>
            ) : phase === "preview" ? (
              <Preview
                game={game}
                renderers={renderers}
                streams={videoStreams}
                cameraControl={cameraControl}
                onReady={() => act("ready")}
              />
            ) : battle ? (
              <Battle
                game={game}
                renderers={renderers}
                streams={videoStreams}
              />
            ) : (
              <Results
                game={game}
                onNext={() => act("next")}
                onRematch={() => act("rematch")}
                onLeave={() => act("leave")}
              />
            )}
            {!home &&
              ((!lobby && failed) || battle || phase === "results") &&
              camera.status === "on" && (
                <div className="camera-in-session">
                  <span>
                    <i className="status-dot" />
                    Your camera is on
                  </span>
                  <Button variant="quiet" onClick={camera.stop}>
                    Turn camera off
                  </Button>
                </div>
              )}
            {!home && !cancelledSearch && demoControls && (
              <details className="demo-tools">
                <summary>
                  Demo controls{" "}
                  <span>Skip timers · test connection states</span>
                </summary>
                <div>
                  <Button
                    variant="secondary"
                    onClick={demoControls.skip}
                    disabled={phase === "results" || failed}
                  >
                    Skip current timer
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => demoControls.setConnection("disconnected")}
                  >
                    Simulate disconnect
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => demoControls.setConnection("error")}
                  >
                    Simulate error
                  </Button>
                  <span>Preview requires “I’m ready to dance”.</span>
                </div>
              </details>
            )}
          </motion.div>
        </main>
        <footer className="site-footer">
          <span>NO SMALL TALK. JUST DANCE.</span>
          <span>ojustdance / HACKTX 2026</span>
        </footer>
      </div>
    </ReducedMotionContext.Provider>
  );
}
