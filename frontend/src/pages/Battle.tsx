import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  PerformanceBattle,
  type LiveMatchResult,
} from "../components/PerformanceBattle";
import { parseChartDocument } from "../pose/parseChart";
import type { ChartDocument } from "../pose/types";
import { hasCameraCheckPassed } from "../lib/cameraGate";
import {
  connectSocket,
  disconnectSocket,
  type MatchFoundPayload,
  type MatchResultPayload,
} from "../lib/socket";
import "./pages.css";
import "./Battle.css";
import '../performance/performance.css';
import { motion } from 'motion/react';
import { EffectsControls } from '../performance/EffectsControls';
import { useEffects } from '../performance/EffectsContext';
import { ReactiveStage } from '../performance/ReactiveStage';
import { AnimatedNumber } from '../ui/Motion';

type Phase = "idle" | "searching" | "matched" | "live" | "result";

export function Battle() {
  const { reduced } = useEffects();
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
  const [introCount, setIntroCount] = useState(2);
  const matchIdRef = useRef<string | null>(null);

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
        setIntroCount(2);
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

  useEffect(() => {
    if (phase !== 'matched') return;
    // Anticipation only: the actual media start still comes from match:start.
    const timer = setTimeout(() => setIntroCount(1), 750);
    return () => clearTimeout(timer);
  }, [phase]);

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
      <main className="page battle battle-theatre">
        <PerformanceBattle
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
        {phase === 'matched' && <div className="match-intro" role="status"><motion.span initial={reduced ? false : { x: -120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>{match.you.name}</motion.span><motion.strong initial={reduced ? false : { scale: 3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }}>VS</motion.strong><motion.span initial={reduced ? false : { x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>{match.rival.name}</motion.span><div className="intro-countdown"><span>GET INTO POSITION</span><motion.b key={introCount} initial={reduced ? false : { scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{introCount}</motion.b><span>WAITING FOR THE SHARED START</span></div></div>}
        {statusMsg && <p className="battle-status">{statusMsg}</p>}
      </main>
    );
  }

  return (
    <main className="page battle battle-theatre">
      <div className="battle-stage-header"><Link to="/">← BACKSTAGE</Link><EffectsControls /></div>
      {error && <p className="api-error" role="alert">{error}</p>}
      {phase === 'result' && result ? <motion.section className={`battle-finale ${result.outcome}`} initial={reduced ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
        <ReactiveStage />
        <div className="finale-orbit" aria-hidden="true">✦</div><p className="battle-kicker">THE FINAL BEAT / ROUND COMPLETE</p>
        <motion.h1 initial={reduced ? false : { scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 20 }}>
          {result.outcome === 'win' ? <>YOU OWNED<br /><em>THAT FLOOR.</em></> : result.outcome === 'lose' ? <>WHAT A<br /><em>SHOWDOWN.</em></> : <>ONE BEAT.<br /><em>TWO WINNERS.</em></>}
        </motion.h1>
        <div className="finale-scores"><div className={result.outcome === 'win' ? 'winner' : ''}><span>YOU {result.outcome === 'win' && '✦ WINNER'}</span><strong><AnimatedNumber value={result.you.score} reveal /></strong></div><span>VS</span><div className={result.outcome === 'lose' ? 'winner' : ''}><span>{result.rival.name} {result.outcome === 'lose' && '✦ WINNER'}</span><strong><AnimatedNumber value={result.rival.score} reveal /></strong></div></div>
        <div className="finale-actions"><button type="button" className="btn primary" onClick={queueUp}>Run it back ↗</button><Link to="/solo" className="btn ghost">Solo practice</Link></div>
      </motion.section> : <section className={`battle-lobby-stage ${phase === 'searching' ? 'is-searching' : ''}`}>
        <ReactiveStage />
        <img className="battle-scribble scribble-left" src="/brand/scribble-music.png" alt="" aria-hidden="true" />
        <img className="battle-scribble scribble-right" src="/brand/scribble-anywhere.png" alt="" aria-hidden="true" />
        <div className="lobby-copy"><span className="battle-kicker"><i /> HEAD TO HEAD / ONE SHARED FLOOR</span>
          <h1>{phase === 'searching' ? <>FINDING<br />YOUR <em>RIVAL.</em></> : <>TAKE<br />THE <em>FLOOR.</em></>}</h1>
          <p>{phase === 'searching' ? 'A little anticipation. A whole lot of energy. Hang tight while we find your next dance partner.' : 'Same routine. Same moment. Your own style. Go head-to-head with someone new.'}</p>
          {phase === 'idle' ? <div className="lobby-join"><label htmlFor="dancer-name">YOUR STAGE NAME</label><div><input id="dancer-name" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Dancer" /><button className="btn primary" type="button" onClick={queueUp}>Find my rival <span>↗</span></button></div><small>Camera starts after a match is found. Your camera stays on your device.</small></div>
            : <div className="lobby-search"><div className="search-signal"><i /><i /><i /><i /><span>◉</span></div><div><strong>LOOKING FOR YOUR MATCH</strong><span role="status">{statusMsg}</span></div><button className="btn ghost" type="button" onClick={cancelQueue}>Cancel search</button></div>}
          <div className="lobby-ground-rules"><span>01 · FIND A RIVAL</span><span>02 · CATCH THE MOVES</span><span>03 · MAKE IT YOURS</span></div>
        </div>
        <div className="lobby-preview" aria-label="Dance stage artwork preview"><span className="lobby-preview-tag">ONE BEAT. TWO DANCERS.</span>
          <div className="lobby-preview-floor" aria-hidden="true" /><strong className="lobby-vs" aria-hidden="true">VS</strong>
          <div className="lobby-player-chips"><div><span>PLAYER 01</span><strong>{name || 'YOU'}</strong><small>YOUR SIDE OF THE FLOOR</small></div><div><span>PLAYER 02</span><strong>{phase === 'searching' ? 'SEARCHING…' : 'YOUR NEXT RIVAL'}</strong><small>{phase === 'searching' ? 'LOOKING FOR A MATCH' : 'THE OTHER SIDE OF THE BEAT'}</small></div></div>
          <span className="lobby-preview-note">STAGE ARTWORK · CAMERA OFF</span><div className="lobby-preview-bars" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -0.13}s`, height: `${12 + index % 7 * 8}px` }} />)}</div>
        </div>
      </section>}
      <footer className="battle-lobby-footer"><span>REAL PEOPLE. REAL MOVES. GOOD ENERGY.</span><Link to="/solo">Warm up in Solo →</Link></footer>
    </main>
  );
}
