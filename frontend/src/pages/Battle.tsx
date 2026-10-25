import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  LiveChartMatch,
  type LiveMatchResult,
} from "../components/LiveChartMatch";
import { hasCameraCheckPassed } from "../lib/cameraGate";
import {
  connectSocket,
  disconnectSocket,
  type MatchFoundPayload,
  type MatchResultPayload,
} from "../lib/socket";
import { parseChartDocument } from "../pose/parseChart";
import { PoseStage } from "../pose/PoseStage";
import type { ChartDocument } from "../pose/types";
import { usePoseSource } from "../pose/usePoseSource";
import "./pages.css";
import "./Battle.css";

type Phase = "idle" | "searching" | "matched" | "live" | "result";

const STEPS = [
  { label: "Camera Check", done: true },
  { label: "Find Opponent", active: true },
  { label: "Get Ready" },
  { label: "Battle!" },
] as const;

export function Battle() {
  const cameraOk = hasCameraCheckPassed();
  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("Dancer");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchFoundPayload | null>(null);
  const [chart, setChart] = useState<ChartDocument | null>(null);
  const [startToken, setStartToken] = useState<number | undefined>(undefined);
  const [rivalScore, setRivalScore] = useState(0);
  const [result, setResult] = useState<MatchResultPayload | null>(null);
  const matchIdRef = useRef<string | null>(null);

  const lobbyCamera = phase === "idle" || phase === "searching" || phase === "result";
  const { videoRef, canvasRef, ready } = usePoseSource({
    mode: "camera",
    enabled: cameraOk && lobbyCamera,
    model: "lite",
    liveDetect: false,
  });

  useEffect(() => {
    if (!cameraOk) return;
    const socket = connectSocket();

    const onWaiting = () => {
      setPhase("searching");
      setStatusMsg("In queue — waiting for a rival…");
    };

    const onFound = (payload: MatchFoundPayload) => {
      try {
        const doc = parseChartDocument(payload.chart.chartJson);
        doc.title = payload.chart.title || doc.title;
        matchIdRef.current = payload.matchId;
        setMatch(payload);
        setChart(doc);
        setRivalScore(0);
        setResult(null);
        setPhase("matched");
        setStatusMsg(`Matched with ${payload.rival.name} — get ready`);
        socket.emit("match:ready", { matchId: payload.matchId });
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Bad chart payload");
        setPhase("idle");
      }
    };

    const onStart = () => {
      setPhase("live");
      setStatusMsg(null);
      setStartToken(Date.now());
    };

    const onRivalScore = (payload: { score: number }) => {
      setRivalScore(payload.score ?? 0);
    };

    const onResult = (payload: MatchResultPayload) => {
      setResult(payload);
      setPhase("result");
      setStatusMsg(null);
      matchIdRef.current = null;
    };

    const onRivalLeft = () => {
      setStatusMsg("Rival left the match");
    };

    const onErr = (payload: { message?: string }) => {
      setError(payload.message || "Socket error");
      setPhase("idle");
    };

    socket.on("queue:waiting", onWaiting);
    socket.on("match:found", onFound);
    socket.on("match:start", onStart);
    socket.on("match:rivalScore", onRivalScore);
    socket.on("match:result", onResult);
    socket.on("match:rivalLeft", onRivalLeft);
    socket.on("error:message", onErr);

    return () => {
      socket.off("queue:waiting", onWaiting);
      socket.off("match:found", onFound);
      socket.off("match:start", onStart);
      socket.off("match:rivalScore", onRivalScore);
      socket.off("match:result", onResult);
      socket.off("match:rivalLeft", onRivalLeft);
      socket.off("error:message", onErr);
      socket.emit("queue:leave");
      disconnectSocket();
    };
  }, [cameraOk]);

  if (!cameraOk) {
    return <Navigate to="/camera-check" replace />;
  }

  function queueUp() {
    setError(null);
    setResult(null);
    setMatch(null);
    setChart(null);
    setRivalScore(0);
    setStartToken(undefined);
    matchIdRef.current = null;
    setPhase("searching");
    setStatusMsg("Connecting…");
    const socket = connectSocket();
    socket.emit("queue:join", { name: name.trim() || "Dancer" });
  }

  function cancelQueue() {
    connectSocket().emit("queue:leave");
    setPhase("idle");
    setStatusMsg(null);
  }

  function leaveBattle() {
    const socket = connectSocket();
    if (matchIdRef.current) {
      socket.emit("match:finished", {
        matchId: matchIdRef.current,
        score: 0,
      });
    }
    socket.emit("queue:leave");
    matchIdRef.current = null;
    setPhase("idle");
    setMatch(null);
    setChart(null);
    setStartToken(undefined);
    setStatusMsg(null);
  }

  function onScoreUpdate(score: number) {
    const id = matchIdRef.current;
    if (!id) return;
    connectSocket().emit("match:score", { matchId: id, score });
  }

  function onComplete(res: LiveMatchResult) {
    const id = matchIdRef.current;
    if (!id) return;
    connectSocket().emit("match:finished", {
      matchId: id,
      score: res.score,
    });
    setStatusMsg("Waiting for rival to finish…");
  }

  if ((phase === "matched" || phase === "live") && chart && match) {
    return (
      <main className="page battle">
        <LiveChartMatch
          mode="battle"
          controlled
          chart={chart}
          videoUrl={match.chart.videoUrl}
          title={`${match.chart.title} vs ${match.rival.name}`}
          startToken={startToken}
          rivalScore={rivalScore}
          rivalName={match.rival.name}
          onScoreUpdate={onScoreUpdate}
          onComplete={onComplete}
          onExit={leaveBattle}
        />
        {statusMsg && <p className="battle-status">{statusMsg}</p>}
      </main>
    );
  }

  const searching = phase === "searching";
  const displayName = name.trim() || "Dancer";

  return (
    <main className="page battle battle-arena">
      <div className="battle-arena-bg" aria-hidden="true" />

      <div className="battle-arena-top">
        <header className="battle-arena-head">
          <p className="battle-kicker">02 / MATCHMAKING</p>
          <h1>
            Find your <span>rival.</span>
          </h1>
          <p>
            Queue for a random rival. Same chart, live scores over Socket.io —
            camera stays on your machine.
          </p>
        </header>

        <ol className="battle-steps" aria-label="Battle flow">
          {STEPS.map((step) => (
            <li
              key={step.label}
              className={
                "done" in step && step.done
                  ? "done"
                  : "active" in step && step.active
                    ? "active"
                    : undefined
              }
            >
              <span className="battle-step-dot" aria-hidden="true">
                {"done" in step && step.done ? "✓" : ""}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      </div>

      {error && <p className="api-error battle-arena-error">{error}</p>}

      <section className="battle-vs" aria-label="Match lobby">
        <article className="battle-card battle-card--you">
          <div className="battle-card-avatar">
            <PoseStage videoRef={videoRef} canvasRef={canvasRef} mirror />
          </div>
          <p className="battle-card-role">YOU</p>
          <p className="battle-card-status">
            {phase === "result" && result
              ? result.outcome === "win"
                ? "Victory!"
                : result.outcome === "lose"
                  ? "Nice try"
                  : "Draw"
              : searching
                ? "In queue…"
                : "Ready to dance!"}
          </p>

          {phase !== "result" && (
            <label className="battle-name-field">
              Display name
              <input
                type="text"
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dancer"
                disabled={searching}
              />
            </label>
          )}

          {phase === "result" && result && (
            <p className="battle-card-score">
              {result.you.score.toLocaleString()} pts
            </p>
          )}

          <ul className="battle-card-flags">
            <li className={ready ? "ok" : ""}>
              <span aria-hidden="true">✓</span> Camera ready
            </li>
            <li className="ok">
              <span aria-hidden="true">✓</span> Private video
            </li>
          </ul>
        </article>

        <div className="battle-vs-mark" aria-hidden="true">
          <span className="battle-vs-glow" />
          <span className="battle-vs-text">VS</span>
        </div>

        <article
          className={`battle-card battle-card--rival${searching ? " searching" : ""}`}
        >
          <div className="battle-card-avatar battle-card-avatar--rival">
            {phase === "result" && result ? (
              <span className="battle-rival-letter">
                {(result.rival.name || "?").slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <span className="battle-rival-q">?</span>
            )}
          </div>
          <p className="battle-card-role">RIVAL</p>
          <p className="battle-card-status">
            {phase === "result" && result
              ? result.rival.name
              : searching
                ? "Searching for a dancer…"
                : "Waiting for you to queue"}
          </p>

          {phase === "result" && result ? (
            <p className="battle-card-score">
              {result.rival.score.toLocaleString()} pts
            </p>
          ) : (
            <div className="battle-search-panel">
              {searching ? (
                <>
                  <span className="battle-spinner" aria-hidden="true" />
                  <p>
                    <strong>Finding your rival…</strong>
                    <span>This won’t take long. Get ready!</span>
                  </p>
                </>
              ) : (
                <p className="battle-search-idle">
                  Hit find when you’re set. Needs a published chart and another
                  dancer in queue.
                </p>
              )}
            </div>
          )}
        </article>
      </section>

      <div className="battle-arena-actions">
        {phase === "idle" && (
          <button type="button" className="battle-find" onClick={queueUp}>
            <span aria-hidden="true">▶</span>
            FIND A BATTLE
            <span aria-hidden="true">→</span>
          </button>
        )}
        {phase === "searching" && (
          <button type="button" className="battle-find ghost" onClick={cancelQueue}>
            CANCEL SEARCH
          </button>
        )}
        {phase === "result" && (
          <button type="button" className="battle-find" onClick={queueUp}>
            <span aria-hidden="true">▶</span>
            QUEUE AGAIN
            <span aria-hidden="true">→</span>
          </button>
        )}
        <Link to="/" className="battle-home">
          ⌂ Back home
        </Link>
      </div>

      {statusMsg && phase === "searching" && (
        <p className="battle-queue-note">{statusMsg}</p>
      )}

      <section className="battle-features" aria-label="How battles work">
        <article>
          <span className="battle-feature-icon" aria-hidden="true">
            👥
          </span>
          <h3>Live 1v1 dance battles</h3>
          <p>One song. Two dancers. Who takes the crown?</p>
        </article>
        <article>
          <span className="battle-feature-icon" aria-hidden="true">
            ▮▮
          </span>
          <h3>Same chart, live scores</h3>
          <p>
            Both players dance to the same chart with real-time scoring over
            Socket.io.
          </p>
        </article>
        <article>
          <span className="battle-feature-icon" aria-hidden="true">
            ⚡
          </span>
          <h3>Camera stays on you</h3>
          <p>
            Your video never leaves your device. Dance with privacy and
            confidence.
          </p>
        </article>
      </section>

      <p className="battle-you-label sr-only">Playing as {displayName}</p>
    </main>
  );
}
