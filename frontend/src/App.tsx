import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GameAction, GameAdapter, GameRenderers } from "./types";
import type { DemoController } from "./demo/controller";
import { Arrow, Brand, Dancer, Star } from "./components/Brand";
import { ChoreographyStage, VideoPanel } from "./components/Stage";
import { useCamera } from "./hooks/useCamera";
const defaults: GameRenderers = {
  Video: VideoPanel,
  Choreography: ChoreographyStage,
};
const formatTime = (ms: number) =>
  `${Math.floor(Math.ceil(Math.max(0, ms) / 1000) / 60)}:${(Math.ceil(Math.max(0, ms) / 1000) % 60).toString().padStart(2, "0")}`;
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
  const game = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const camera = useCamera();
  const main = useRef<HTMLElement>(null);
  const [motionPaused, setMotionPaused] = useState(false);
  const {
    phase,
    players,
    choreography: dance,
    remainingMs,
    elapsedMs,
    result,
  } = game;
  const home = phase === "home";
  const searching = phase === "searching" || phase === "found";
  const playing = phase === "battle" || phase === "countdown";
  const moveIndex =
    dance?.moves.reduce(
      (current, move, index) => (elapsedMs >= move.startMs ? index : current),
      0,
    ) ?? 0;
  const stepIndex = searching ? 0 : phase === "preview" ? 1 : playing ? 2 : 3;
  const Video = renderers.Video;
  const Stage = renderers.Choreography;
  useEffect(() => {
    main.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [phase, game.connection]);
  const act = (action: GameAction) => {
    if (action === "leave" || action === "cancel") camera.stop();
    adapter.dispatch(action);
  };
  const cameraControl = (
    <div className="camera-control">
      <div>
        <strong>
          {camera.status === "on"
            ? "Camera is ready"
            : "Make room for your moves"}
        </strong>
        <p>
          {camera.status === "on"
            ? "Local preview only in demo mode. Microphone is off."
            : "Your camera stays off until you enable it. Demo works without one."}
        </p>
      </div>
      <button
        className="button secondary"
        disabled={camera.status === "requesting"}
        onClick={camera.status === "on" ? camera.stop : camera.enable}
      >
        {camera.status === "requesting"
          ? "Requesting access…"
          : camera.status === "on"
            ? "Turn camera off"
            : "Enable camera"}
      </button>
      {camera.error && (
        <p className="error-text" role="alert">
          {camera.error}
        </p>
      )}
    </div>
  );
  return (
    <div className={motionPaused ? "app motion-paused" : "app"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <button
          className="brand-button"
          aria-label="Shared Beat home"
          onClick={() => act("leave")}
        >
          <Brand />
        </button>
        <nav aria-label="Main navigation">
          {home ? (
            <>
              <a href="#how-it-works">How it works</a>
              <a href="#the-rules">The ground rules</a>
            </>
          ) : (
            <span className="room-label">
              THE DANCE FLOOR <span>/</span>{" "}
              {phase === "results" ? "ROUND COMPLETE" : "1 VS 1"}
            </span>
          )}
        </nav>
        <span className="header-tag">
          <i />
          {game.demo ? "DEMO MODE" : game.connection.toUpperCase()}
        </span>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        {home ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="small-line" /> GOOD MOVES. NEW CONNECTIONS.
                </div>
                <h1>
                  Two strangers.
                  <br />
                  <span className="cobalt-text">One beat.</span>
                  <Star className="headline-star" />
                </h1>
                <p className="hero-description">
                  Meet someone new. Learn the moves.
                  <br />
                  Leave it all on the dance floor.
                </p>
                <div className="hero-actions">
                  <button
                    className="button primary large"
                    onClick={() => act("find")}
                  >
                    Find a match <Arrow />
                  </button>
                  <span className="entry-note">
                    No sign-up.
                    <br />
                    Just show up.
                  </span>
                </div>
                <div className="hero-meta">
                  <span>01 — RANDOM MATCH</span>
                  <span>02 — SHARED ROUTINE</span>
                  <span>03 — YOUR MOMENT</span>
                </div>
              </div>
              <div
                className="hero-art"
                aria-label="Two geometric dancers sharing a dance floor"
                role="img"
              >
                <div className="art-top">
                  <span>DIFFERENT PEOPLE.</span>
                  <Star />
                  <span>SAME FREQUENCY.</span>
                </div>
                <div className="art-ring ring-one" />
                <div className="art-ring ring-two" />
                <div className="art-dancer first">
                  <Dancer />
                </div>
                <div className="art-dancer second">
                  <Dancer variant="coral" />
                </div>
                <span className="art-pill pill-you">
                  YOU <span>↗</span>
                </span>
                <span className="art-pill pill-them">
                  SOMEONE NEW <span>↙</span>
                </span>
                <div className="shared-mark">
                  VS<span>ONE SHARED BEAT</span>
                </div>
                <div className="art-bottom">
                  <span>STEP OUT OF YOUR FEED.</span>
                  <span>STEP INTO THE RHYTHM. ↗</span>
                </div>
              </div>
            </section>
            <div className="manifesto-strip">
              <span>NO FOLLOWERS.</span>
              <Star />
              <span>NO PERFECT MOVES.</span>
              <Star />
              <span>JUST GOOD ENERGY.</span>
              <Star />
            </div>
            <section id="how-it-works" className="how-section">
              <div className="section-heading">
                <span className="eyebrow">
                  A LITTLE SPONTANEITY GOES A LONG WAY
                </span>
                <h2>
                  From strangers to
                  <br />
                  dance rivals. In seconds.
                </h2>
                <p>
                  You bring the energy.
                  <br />
                  We’ll bring the shared beat.
                </p>
              </div>
              <div className="steps">
                {[
                  {
                    title: "Meet your match.",
                    text: "A random connection. A fresh challenger. No profiles, no overthinking.",
                    glyph: "↗↙",
                  },
                  {
                    title: "Catch the rhythm.",
                    text: "Get a shared AI choreography challenge and 30 seconds to learn the moves.",
                    glyph: "≋",
                  },
                  {
                    title: "Make your move.",
                    text: "Dance together, chase your best score, then run it back with someone new.",
                    glyph: "✳",
                  },
                ].map((s, i) => (
                  <article key={s.title}>
                    <div className="step-top">
                      <span>0{i + 1}</span>
                      <span aria-hidden="true">{s.glyph}</span>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </article>
                ))}
              </div>
            </section>
            <section id="the-rules" className="rules">
              <Star />
              <div>
                <h2>Big energy. Good company.</h2>
                <p>
                  Give yourself space to move. Be kind to your opponent. Leave
                  any time.
                  <br />
                  Camera sharing and movement scoring are simulated in this
                  demo.
                </p>
              </div>
              <button className="button secondary" onClick={() => act("find")}>
                Take the floor <Arrow />
              </button>
            </section>
          </>
        ) : (
          <div className={`game-shell ${playing ? "game-shell-battle" : ""}`}>
            <div className="game-topbar">
              <div className="flow-steps" aria-label="Round progress">
                {["Match", "Learn", "Battle", "Results"].map((label, i) => (
                  <span
                    key={label}
                    className={stepIndex === i ? "active" : ""}
                    aria-current={stepIndex === i ? "step" : undefined}
                  >
                    <span className="step-number" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>{" "}
                    {label}
                  </span>
                ))}
              </div>
              <button className="text-button" onClick={() => act("leave")}>
                Leave room ↗
              </button>
            </div>
            {game.connection === "disconnected" ||
            game.connection === "error" ? (
              <section className="state-card">
                <Star className="state-star" />
                <span className="eyebrow">LET’S GET YOU BACK ON BEAT</span>
                <h1>
                  {game.connection === "error"
                    ? "A little technical pause."
                    : "Connection interrupted."}
                </h1>
                <p role="alert">
                  {game.error ??
                    "The room disconnected. Start a new match when you’re ready."}
                </p>
                <button className="button primary" onClick={() => act("retry")}>
                  Try a new match <Arrow />
                </button>
                <button className="text-button" onClick={() => act("leave")}>
                  Back to home
                </button>
              </section>
            ) : searching ? (
              <>
                <div className="screen-heading">
                  <span className="eyebrow">
                    {phase === "found"
                      ? "THE FLOOR IS YOURS"
                      : "A NEW CONNECTION IS COMING"}
                  </span>
                  <h1>
                    {phase === "found"
                      ? "Stranger. Meet stranger."
                      : "Finding your frequency."}
                  </h1>
                  <p role="status">
                    {phase === "found"
                      ? "Match found. Getting your shared routine ready…"
                      : "Looking for a dance partner. Your next rival is a few beats away."}
                  </p>
                </div>
                <div className="match-layout">
                  <Video
                    player={players[0]}
                    local
                    demo={game.demo}
                    stream={camera.stream ?? streams[players[0].id]}
                  />
                  <div
                    className={`match-symbol ${phase === "searching" ? "searching" : ""}`}
                  >
                    <Star />
                    <span>{phase === "found" ? "MATCHED" : "SEARCHING"}</span>
                  </div>
                  <div className="waiting-panel">
                    {phase === "found" ? (
                      <Dancer variant="coral" />
                    ) : (
                      <div className="radar">
                        <div />
                        <Star />
                      </div>
                    )}
                    <h2>
                      {phase === "found"
                        ? "Your challenger is here."
                        : "Someone with your energy."}
                    </h2>
                    <p>
                      {phase === "found"
                        ? "Anonymous. Ready to dance."
                        : "Anonymous matching · simulated in demo"}
                    </p>
                  </div>
                </div>
                {cameraControl}
                <div className="center-actions">
                  <button className="text-button" onClick={() => act("cancel")}>
                    Cancel matchmaking
                  </button>
                  <span className="muted">
                    No camera? No problem. Explore with demo dancers.
                  </span>
                </div>
              </>
            ) : phase === "preview" ? (
              <>
                <div className="screen-heading split">
                  <div>
                    <span className="eyebrow">
                      SAME ROUTINE. YOUR OWN STYLE.
                    </span>
                    <h1>Get a feel for the beat.</h1>
                    <p>
                      Watch the moves. You have 30 seconds to make them yours.
                    </p>
                  </div>
                  <div className="timer">
                    <span>PREVIEW ENDS IN</span>
                    <strong>{formatTime(remainingMs)}</strong>
                  </div>
                </div>
                <div className="preview-layout">
                  <div className="preview-main">
                    <Stage
                      choreography={dance}
                      elapsedMs={elapsedMs}
                      playing={remainingMs > 0}
                    />
                    <div className="preview-players">
                      {players.map((player, i) => (
                        <Video
                          key={player.id}
                          player={player}
                          local={i === 0}
                          demo={game.demo}
                          stream={
                            i === 0
                              ? (camera.stream ?? streams[player.id])
                              : streams[player.id]
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <aside className="routine-sidebar">
                    <div className="song-info">
                      <span className="eyebrow">YOUR SHARED CHALLENGE</span>
                      <h2>{dance?.title ?? "Loading routine…"}</h2>
                      <p>{dance?.artist}</p>
                      <div className="tags">
                        <span>{dance?.bpm ?? "—"} BPM</span>
                        <span>{dance?.difficulty ?? "—"}</span>
                        <span>
                          {Math.round((dance?.durationMs ?? 0) / 1000)} SEC
                        </span>
                      </div>
                    </div>
                    <div className="readiness">
                      <span>
                        {players[1].name}{" "}
                        <b className={players[1].ready ? "is-ready" : ""}>
                          {players[1].ready ? "✓ Ready" : "Getting ready…"}
                        </b>
                      </span>
                      <button
                        className="button primary"
                        disabled={players[0].ready || !dance}
                        onClick={() => act("ready")}
                      >
                        {players[0].ready ? "✓ You’re ready" : "I’m ready"}
                        {!players[0].ready && <Arrow />}
                      </button>
                      <p role="status">
                        {players[0].ready
                          ? remainingMs > 0
                            ? "Battle starts when the preview ends."
                            : "Ready. Waiting for your opponent…"
                          : remainingMs === 0
                            ? "Preview complete. Ready when you are."
                            : "The preview finishes before the battle starts."}
                      </p>
                    </div>
                    <div className="move-list">
                      <span className="eyebrow">THE MOVE LIST</span>
                      {dance?.moves.map((move, i) => (
                        <div
                          key={move.id}
                          className={i === moveIndex ? "current" : ""}
                        >
                          <span>0{i + 1}</span>
                          <strong>{move.name}</strong>
                          <span>
                            {i === moveIndex
                              ? "NOW"
                              : `${move.startMs / 1000}s`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
                {cameraControl}
              </>
            ) : playing ? (
              <>
                <div className="screen-heading split battle-heading">
                  <div>
                    <span className="eyebrow">
                      {phase === "countdown"
                        ? "GET INTO POSITION"
                        : "THIS IS YOUR MOMENT"}
                    </span>
                    <h1>
                      {phase === "countdown"
                        ? "Ready. Set. Move."
                        : "Make the beat yours."}
                    </h1>
                  </div>
                  <div className="connection">
                    <i />
                    {game.demo
                      ? "Demo room · simulated scores"
                      : game.connection}
                  </div>
                </div>
                {phase === "countdown" && (
                  <div className="countdown-overlay" role="status">
                    <span>YOUR BATTLE STARTS IN</span>
                    <strong>
                      {Math.max(1, Math.ceil(remainingMs / 1000))}
                    </strong>
                    <span>Step back. Get your whole body in frame.</span>
                  </div>
                )}
                <div className="battle-arena">
                  {players.map((player, i) => (
                    <div key={player.id} className="battle-player">
                      <div className={`scoreboard ${player.color}`}>
                        <span>{i === 0 ? "YOU" : "STRANGER"}</span>
                        <strong>{player.score.toLocaleString()}</strong>
                        <span>{i === 0 ? "PLAYER 01" : "PLAYER 02"}</span>
                      </div>
                      <Video
                        player={player}
                        local={i === 0}
                        demo={game.demo}
                        stream={
                          i === 0
                            ? (camera.stream ?? streams[player.id])
                            : streams[player.id]
                        }
                      >
                        <span>
                          {game.demo ? "DEMO PERFORMANCE" : "LIVE PERFORMANCE"}
                        </span>
                        <strong>
                          {i === 0 ? "Find your flow" : "Keep the energy"}
                        </strong>
                      </Video>
                    </div>
                  ))}
                  <div className="versus">VS</div>
                </div>
                <div className="battle-track">
                  <div className="track-art">
                    <Star />
                  </div>
                  <div>
                    <strong>{dance?.title ?? "Waiting for routine"}</strong>
                    <span>
                      {dance?.bpm} BPM · {dance?.difficulty}
                    </span>
                  </div>
                  <div className="move-cue" role="status" aria-atomic="true">
                    <span>CURRENT MOVE</span>
                    <strong>
                      {phase === "countdown"
                        ? "Get ready"
                        : (dance?.moves[moveIndex]?.name ?? "Get ready")}
                    </strong>
                  </div>
                  <div className="next-cue">
                    <span>UP NEXT</span>
                    <strong>
                      {dance?.moves[moveIndex + 1]?.name ?? "Your finish"}
                    </strong>
                  </div>
                  <strong className="track-time">
                    {formatTime(
                      phase === "countdown"
                        ? (dance?.durationMs ?? 0)
                        : remainingMs,
                    )}
                  </strong>
                  <progress
                    aria-label="Song progress"
                    value={phase === "countdown" ? 0 : elapsedMs}
                    max={dance?.durationMs ?? 30000}
                  />
                </div>
                <p className="game-hint">
                  {game.demo
                    ? "Demo choreography and scores · no music or motion tracking is running."
                    : "Keep your whole body in frame and follow the shared routine."}
                </p>
                {camera.status === "on" && (
                  <button className="text-button" onClick={camera.stop}>
                    Turn camera off
                  </button>
                )}
              </>
            ) : phase === "results" && result ? (
              <>
                <div className="results-heading">
                  <Star className="result-star" />
                  <span className="eyebrow">
                    THAT’S A WRAP · {dance?.title.toUpperCase()}
                  </span>
                  <h1>
                    {result.winnerId === players[0].id
                      ? "You owned that beat."
                      : result.winnerId === null
                        ? "A perfectly shared beat."
                        : "What a showdown."}
                  </h1>
                  <p>
                    {result.winnerId === players[0].id
                      ? "Your moves. Your moment. Take a bow."
                      : "Good energy from both sides of the floor. Ready for another?"}
                  </p>
                  <span className="tag">
                    {game.demo ? "DEMO ROUND COMPLETE" : "ROUND COMPLETE"}
                  </span>
                </div>
                <div className="results-scores">
                  {players.map((p, i) => (
                    <div
                      className={`result-card ${p.color} ${result.winnerId === p.id ? "winner" : ""}`}
                      key={p.id}
                    >
                      <span className="eyebrow">
                        {result.winnerId === p.id
                          ? "★ WINNER"
                          : result.winnerId === null
                            ? "TIED ROUND"
                            : "WORTHY RIVAL"}
                      </span>
                      <div>
                        <Dancer variant={p.color} />
                        <div>
                          <span>{i === 0 ? "You" : p.name}</span>
                          <strong>
                            {(result.scores[p.id] ?? p.score).toLocaleString()}
                          </strong>
                          <span>FINAL SCORE</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="performance">
                  <div>
                    <strong>{result.accuracy}%</strong>
                    <span>Move accuracy</span>
                  </div>
                  <div>
                    <strong>{result.bestCombo}×</strong>
                    <span>Best combo</span>
                  </div>
                  <div>
                    <strong>{result.perfectMoves}</strong>
                    <span>Perfect moves</span>
                  </div>
                </div>
                <div className="result-actions">
                  <button
                    className="button primary"
                    onClick={() => act("next")}
                  >
                    Next opponent <Arrow />
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => act("rematch")}
                  >
                    Play again
                  </button>
                  <button className="text-button" onClick={() => act("leave")}>
                    Leave the floor
                  </button>
                </div>
                <p className="game-hint">
                  {game.demo
                    ? "Demo results are simulated. Play again repeats the routine with the same demo opponent."
                    : "One round down. The next connection is up to you."}
                </p>
              </>
            ) : (
              <section className="state-card" role="status">
                <h1>Preparing your room…</h1>
                <p>Your shared challenge will appear here.</p>
              </section>
            )}
            {(phase === "results" ||
              game.connection === "disconnected" ||
              game.connection === "error") &&
              camera.status === "on" &&
              cameraControl}
            {demoControls && (
              <details className="demo-tools">
                <summary>
                  Demo controls{" "}
                  <span>Skip waits or explore connection states</span>
                </summary>
                <div>
                  <button
                    className="button secondary"
                    onClick={demoControls.skip}
                    disabled={
                      ["results", "home"].includes(phase) ||
                      game.connection !== "connected"
                    }
                  >
                    Skip current timer
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => demoControls.setConnection("disconnected")}
                  >
                    Simulate disconnect
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => demoControls.setConnection("error")}
                  >
                    Simulate error
                  </button>
                  <span>Preview still requires “I’m ready”.</span>
                </div>
              </details>
            )}
          </div>
        )}
      </main>
      <footer>
        <Brand />
        <span>DIFFERENT MOVES. SHARED BEAT.</span>
        <button
          className="text-button"
          aria-pressed={motionPaused}
          onClick={() => setMotionPaused((v) => !v)}
        >
          Reduce motion
        </button>
        <span>MADE FOR HACKTX / 2026</span>
      </footer>
    </div>
  );
}
