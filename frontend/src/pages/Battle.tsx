import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LiveChartMatch,
  type LiveMatchResult,
} from "../components/LiveChartMatch";
import { parseChartDocument } from "../pose/parseChart";
import type { ChartDocument } from "../pose/types";
import {
  connectSocket,
  disconnectSocket,
  type MatchFoundPayload,
  type MatchResultPayload,
} from "../lib/socket";
import "./pages.css";
import "./Battle.css";

type Phase = "idle" | "searching" | "matched" | "live" | "result";

export function Battle() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("Dancer");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchFoundPayload | null>(null);
  const [chart, setChart] = useState<ChartDocument | null>(null);
  const [startToken, setStartToken] = useState<number | undefined>(undefined);
  const [rivalScore, setRivalScore] = useState(0);
  const [result, setResult] = useState<MatchResultPayload | null>(null);
  const [showMotionThumbnails, setShowMotionThumbnails] = useState(false);
  const matchIdRef = useRef<string | null>(null);

  useEffect(() => {
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
  }, []);

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
          showMotionThumbnails={showMotionThumbnails}
          onShowMotionThumbnailsChange={setShowMotionThumbnails}
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

  return (
    <main className="page battle">
      <header className="page-head">
        <h1>Battle</h1>
        <p>
          Queue for a random rival. Same chart, live scores over Socket.io —
          camera stays on your machine.
        </p>
      </header>

      {error && <p className="api-error">{error}</p>}

      <section className="battle-lobby">
        <label className="battle-thumbnail-option">
          <input type="checkbox" checked={showMotionThumbnails}
            onChange={(event) => setShowMotionThumbnails(event.target.checked)} />
          Show upcoming move thumbnails
        </label>
        <p className="meta-sub">Optional reference poses below the dance video. You can change this during a match.</p>
        {phase === "idle" && (
          <>
            <label className="field">
              Display name
              <input
                type="text"
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dancer"
              />
            </label>
            <button type="button" className="btn primary" onClick={queueUp}>
              Queue up
            </button>
            <p className="meta-sub">
              Needs at least one published chart. Open two browser windows to
              test locally.
            </p>
          </>
        )}

        {phase === "searching" && (
          <>
            <p className="meta-title searching">Finding rival…</p>
            <p className="meta-sub">{statusMsg}</p>
            <button type="button" className="btn ghost" onClick={cancelQueue}>
              Cancel
            </button>
          </>
        )}

        {phase === "result" && result && (
          <div className="battle-result">
            <p className="meta-title">
              {result.outcome === "win"
                ? "You win"
                : result.outcome === "lose"
                  ? "You lose"
                  : "Draw"}
            </p>
            <p className="meta-sub">
              {result.you.score.toLocaleString()} — {result.rival.score.toLocaleString()}{" "}
              ({result.rival.name})
            </p>
            <div className="page-actions">
              <button type="button" className="btn primary" onClick={queueUp}>
                Queue again
              </button>
              <Link to="/solo" className="btn ghost">
                Solo practice
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
