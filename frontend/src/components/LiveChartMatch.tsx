import { useEffect, useRef, useState } from "react";
import { useBattleRtc } from "../lib/battleRtc";
import {
  DanceScorer,
  buildReferenceTrack,
  scoringConfig,
  type ScoreSnapshot,
} from "../pose/gradePose";
import { PoseStage } from "../pose/PoseStage";
import type { ChartDocument } from "../pose/types";
import { usePoseSource } from "../pose/usePoseSource";
import "./LiveChartMatch.css";

export type LiveMatchResult = {
  score: number;
  maxCombo: number;
  avgAccuracy: number;
  durationSec: number;
};

type Props = {
  chart: ChartDocument;
  videoUrl: string | null;
  title?: string;
  mode?: "solo" | "battle";
  onExit?: () => void;
  onComplete?: (result: LiveMatchResult) => void;
  /** Bump (e.g. Date.now()) to auto-start when camera is ready — used by P2P battles. */
  startToken?: number;
  onScoreUpdate?: (score: number) => void;
  rivalScore?: number | null;
  rivalName?: string;
  /** Hide local Start/Retry (parent drives lifecycle). */
  controlled?: boolean;
  matchId?: string | null;
  role?: "a" | "b" | null;
};

type RitualPhase =
  | "idle"
  | "count1"
  | "preview"
  | "getReady"
  | "count2"
  | "live"
  | "done";

const INITIAL_TICK: ScoreSnapshot = {
  schemaVersion: "dance-score/3",
  timeSec: 0,
  accuracy: 0,
  pointCredit: 0,
  form: 0,
  motion: null,
  timing: 0,
  coverage: 0,
  offsetMs: null,
  label: "…",
  score: 0,
  maxScore: 10000,
  combo: 0,
  maxCombo: 0,
  averageAccuracy: 0,
  trackingCoverage: 0,
  judgedCoverage: 0,
  trackingMisses: 0,
  processedOpportunities: 0,
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function waitForReferenceVideo(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load the chart preview video"));
    };
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
  });
}

export function LiveChartMatch({
  chart,
  videoUrl,
  title,
  mode = "solo",
  onExit,
  onComplete,
  startToken,
  onScoreUpdate,
  rivalScore = null,
  rivalName = "Rival",
  controlled = false,
  matchId = null,
  role = null,
}: Props) {
  const refVideoRef = useRef<HTMLVideoElement | null>(null);
  const rivalVideoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [chartTime, setChartTime] = useState(0);
  const [tick, setTick] = useState<ScoreSnapshot>(INITIAL_TICK);
  const [accuracy, setAccuracy] = useState(0);
  const [finalAvg, setFinalAvg] = useState(0);
  const [referenceDuration, setReferenceDuration] = useState<number | null>(
    null,
  );
  const [starting, setStarting] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [mirrorChart, setMirrorChart] = useState(true);
  const [ritual, setRitual] = useState<RitualPhase>("idle");
  const [countDigit, setCountDigit] = useState<number | null>(null);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(
    null
  );

  const tickRef = useRef<ScoreSnapshot>(INITIAL_TICK);
  const scorerRef = useRef<DanceScorer | null>(null);
  const startingRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const endingStartedAtRef = useRef<number | null>(null);
  const chartTimeRef = useRef(0);
  const completedRef = useRef(false);
  const playingRef = useRef(false);
  const ritualRef = useRef<RitualPhase>("idle");
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const lastScoreEmitRef = useRef(0);
  const ritualAbortRef = useRef<AbortController | null>(null);
  onScoreUpdateRef.current = onScoreUpdate;

  const useRitual = mode === "battle" && controlled;

  const duration =
    referenceDuration ??
    Math.max(chart.durationSec || 0, chart.samples.at(-1)?.t ?? 0, 1);

  const { videoRef, canvasRef, streamRef, ready, error, hasPose, fps } =
    usePoseSource({
      mode: "camera",
      enabled: true,
      onFrame: (frame) => {
        const scorer = scorerRef.current;
        if (!playingRef.current || !scorer || frame.capturedAtMs == null) return;

        const now = performance.now();
        const video = refVideoRef.current;
        const receivedAtSongTimeSec =
          endingStartedAtRef.current !== null
            ? scorer.reference.durationSec +
              (now - endingStartedAtRef.current) / 1000
            : videoUrl && video
              ? video.currentTime
              : (now - sessionStartedAtRef.current) / 1000;
        const inferenceDelaySec = Math.max(0, now - frame.capturedAtMs) / 1000;
        scorer.addObservation({
          songTimeSec:
            receivedAtSongTimeSec -
            inferenceDelaySec * (video?.playbackRate ?? 1),
          receivedAtSongTimeSec,
          frame: frame.hasPose ? frame.canonicalFrame ?? null : null,
        });
      },
    });

  useEffect(() => {
    if (ready && streamRef.current) {
      setLocalVideoStream(streamRef.current);
    }
  }, [ready, streamRef]);

  const rtcEnabled = mode === "battle" && controlled && Boolean(matchId && role);
  const { remoteStream, status: rtcStatus } = useBattleRtc({
    enabled: rtcEnabled,
    matchId,
    role,
    localVideoStream,
  });

  useEffect(() => {
    const el = rivalVideoRef.current;
    if (!el) return;
    if (remoteStream) {
      el.srcObject = remoteStream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [remoteStream]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    ritualRef.current = ritual;
  }, [ritual]);

  useEffect(() => {
    return () => {
      ritualAbortRef.current?.abort();
    };
  }, []);

  function finishMatch(endT: number) {
    if (completedRef.current) return;
    completedRef.current = true;
    playingRef.current = false;
    const result = scorerRef.current?.finish(endT) ?? INITIAL_TICK;
    tickRef.current = result;
    setPlaying(false);
    setFinished(true);
    setRitual("done");
    setCountDigit(null);
    setChartTime(endT);
    chartTimeRef.current = endT;
    setTick(result);
    setAccuracy(result.accuracy);
    setFinalAvg(result.averageAccuracy);
    refVideoRef.current?.pause();
    onComplete?.({
      score: Math.round(result.score),
      maxCombo: result.maxCombo,
      avgAccuracy: result.averageAccuracy,
      durationSec: endT,
    });
  }

  useEffect(() => {
    if (!playing) return;

    let raf = 0;
    const loop = () => {
      if (!playingRef.current) return;

      const refVid = refVideoRef.current;
      const now = performance.now();
      const scorer = scorerRef.current;
      if (!scorer) return;
      const end = scorer.reference.durationSec;
      let time =
        videoUrl && refVid
          ? refVid.currentTime
          : (now - sessionStartedAtRef.current) / 1000;
      if (time >= end || refVid?.ended) {
        if (endingStartedAtRef.current === null) {
          endingStartedAtRef.current = videoUrl
            ? now
            : sessionStartedAtRef.current + end * 1000;
        }
      }
      if (endingStartedAtRef.current !== null) {
        time = end + (now - endingStartedAtRef.current) / 1000;
      }

      const nextTick = scorer.advance(time);
      tickRef.current = nextTick;
      setTick(nextTick);
      setAccuracy(nextTick.accuracy);
      chartTimeRef.current = Math.min(time, end);
      setChartTime(chartTimeRef.current);

      if (now - lastScoreEmitRef.current > 200) {
        lastScoreEmitRef.current = now;
        onScoreUpdateRef.current?.(Math.round(nextTick.score));
      }

      if (
        time >=
        end +
        (scorer.config.timingToleranceMs +
          scorer.config.processingDeadlineMs) /
          1000
      ) {
        finishMatch(end);
        return;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoUrl]);

  async function playPreview(signal: AbortSignal) {
    setRitual("preview");
    ritualRef.current = "preview";
    setChartTime(0);
    chartTimeRef.current = 0;

    const refVid = refVideoRef.current;
    if (refVid && videoUrl) {
      refVid.currentTime = 0;
      try {
        await refVid.play();
      } catch (err) {
        console.error(err);
      }

      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const onEnd = () => {
          cleanup();
          resolve();
        };
        const onAbort = () => {
          cleanup();
          refVid.pause();
          reject(new DOMException("Aborted", "AbortError"));
        };
        const onTime = () => {
          setChartTime(refVid.currentTime);
          chartTimeRef.current = refVid.currentTime;
        };
        const cleanup = () => {
          refVid.removeEventListener("ended", onEnd);
          refVid.removeEventListener("timeupdate", onTime);
          signal.removeEventListener("abort", onAbort);
        };
        refVid.addEventListener("ended", onEnd);
        refVid.addEventListener("timeupdate", onTime);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      refVid.pause();
    } else {
      // No video — soft preview wait so the rhythm still exists.
      const waitMs = Math.min(duration, 12) * 1000;
      const started = performance.now();
      while (performance.now() - started < waitMs) {
        signal.throwIfAborted?.();
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const t = (performance.now() - started) / 1000;
        setChartTime(t);
        chartTimeRef.current = t;
        await sleep(100, signal);
      }
    }
  }

  async function runCountdown(signal: AbortSignal, phase: "count1" | "count2") {
    setRitual(phase);
    ritualRef.current = phase;
    for (const n of [3, 2, 1]) {
      setCountDigit(n);
      await sleep(900, signal);
    }
    setCountDigit(null);
  }

  async function startLive() {
    if (playingRef.current || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setPlaybackError(null);
    try {
      const refVid = refVideoRef.current;
      if (videoUrl && refVid) await waitForReferenceVideo(refVid);

      const config = scoringConfig();
      const referenceOptions = {
        reflectDance: !mirrorChart,
        timeline: videoUrl ? ("source-video" as const) : ("chart" as const),
        ...(videoUrl && refVid
          ? {
              durationSec: refVid.duration,
              imageSize: {
                width: refVid.videoWidth,
                height: refVid.videoHeight,
              },
            }
          : {}),
      };
      const track = buildReferenceTrack(chart, {
        ...referenceOptions,
        config,
      });
      const scorer = new DanceScorer(track, config);

      if (refVid && videoUrl) {
        refVid.currentTime = 0;
        await refVid.play();
      }

      scorerRef.current = scorer;
      setReferenceDuration(track.durationSec);
      completedRef.current = false;
      lastScoreEmitRef.current = 0;
      chartTimeRef.current = 0;
      sessionStartedAtRef.current = performance.now();
      endingStartedAtRef.current = null;
      tickRef.current = INITIAL_TICK;
      setTick(INITIAL_TICK);
      setAccuracy(0);
      setChartTime(0);
      setFinalAvg(0);
      setFinished(false);
      setRitual("live");
      ritualRef.current = "live";
      playingRef.current = true;
      setPlaying(true);
    } catch (err) {
      console.error(err);
      setPlaybackError(
        err instanceof Error ? err.message : "Could not start playback",
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function beginRitual() {
    ritualAbortRef.current?.abort();
    const ac = new AbortController();
    ritualAbortRef.current = ac;
    const { signal } = ac;

    try {
      await runCountdown(signal, "count1");
      await playPreview(signal);
      setRitual("getReady");
      ritualRef.current = "getReady";
      setCountDigit(null);
      await sleep(1800, signal);
      await runCountdown(signal, "count2");
      await startLive();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }

  async function start() {
    await startLive();
  }

  useEffect(() => {
    if (startToken == null || !ready || playing || finished) return;
    if (ritual !== "idle" && ritual !== "done") return;
    if (useRitual) {
      void beginRitual();
    } else {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startToken, ready]);

  function stopEarly() {
    ritualAbortRef.current?.abort();
    finishMatch(chartTimeRef.current);
  }

  const progress = Math.min(1, chartTime / duration);
  const meterClass =
    tick.label === "TRACKING" || tick.label === "NO REFERENCE"
      ? "unavailable"
      : accuracy >= 0.82
      ? "hot"
      : accuracy >= 0.65
        ? "good"
        : accuracy >= 0.45
          ? "ok"
          : "miss";

  const inRitual =
    ritual === "count1" ||
    ritual === "preview" ||
    ritual === "getReady" ||
    ritual === "count2";

  const stageLayout =
    mode !== "battle"
      ? "split"
      : ritual === "preview" || ritual === "count1"
        ? "preview"
        : ritual === "done" || finished
          ? "done"
          : "fight";

  let liveStatus = "Enable camera permission";
  if (error) liveStatus = error;
  else if (!ready) liveStatus = "Loading MediaPipe…";
  else if (ritual === "preview")
    liveStatus = "Preview — watch the routine";
  else if (ritual === "getReady") liveStatus = "Get ready…";
  else if (ritual === "count1" || ritual === "count2")
    liveStatus = "Countdown";
  else if (playing)
    liveStatus = hasPose ? `Live · ${fps} FPS` : "No body in frame";
  else if (finished) liveStatus = "Match over";
  else liveStatus = hasPose ? "Ready — hit Start" : "Step into frame";

  const chartPane = (
    <div className="live-pane live-pane--chart">
      <div className="live-pane-bar">
        <p className="live-pane-label">
          {ritual === "preview" ? "Routine preview" : "Routine"}
        </p>
        {videoUrl && (
          <label className="live-mirror-toggle">
            <input
              type="checkbox"
              checked={mirrorChart}
              disabled={playing || starting}
              onChange={(e) => setMirrorChart(e.target.checked)}
            />
            Mirror
          </label>
        )}
      </div>
      {videoUrl ? (
        <video
          ref={refVideoRef}
          className={
            mirrorChart ? "live-ref-video mirrored" : "live-ref-video"
          }
          src={videoUrl}
          playsInline
          muted
          preload="auto"
          onEnded={() => {
            if (
              ritualRef.current === "live" &&
              endingStartedAtRef.current === null
            ) {
              endingStartedAtRef.current = performance.now();
            }
          }}
        />
      ) : (
        <div className="live-ref-video placeholder">
          No preview video — timing from chart clock
        </div>
      )}
    </div>
  );

  const youPane = (
    <div className="live-pane live-pane--you">
      <p className="live-pane-label">You</p>
      <PoseStage
        videoRef={videoRef}
        canvasRef={canvasRef}
        status={liveStatus}
        recording={playing}
      />
      {mode === "battle" && (
        <p className="live-pip-score">
          {Math.round(tick.score).toLocaleString()}
        </p>
      )}
    </div>
  );

  const rivalPane =
    mode === "battle" ? (
      <div className="live-pane live-pane--rival" aria-label={`${rivalName}`}>
        <p className="live-pane-label">{rivalName}</p>
        {remoteStream ? (
          <div className="live-rival-video-wrap">
            <video
              ref={rivalVideoRef}
              className="live-rival-video"
              playsInline
              autoPlay
              muted={false}
            />
            <p className="live-pip-score live-pip-score--rival">
              {Math.round(rivalScore ?? 0).toLocaleString()}
            </p>
            {rtcStatus === "connecting" && (
              <span className="live-rival-connecting">Connecting…</span>
            )}
          </div>
        ) : (
          <div className="live-rival-card">
            <span className="live-rival-letter">
              {(rivalName || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="live-rival-name">{rivalName}</span>
            <span className="live-rival-score">
              {Math.round(rivalScore ?? 0).toLocaleString()}
            </span>
            <span className="live-rival-hint">
              {rtcStatus === "connecting"
                ? "Linking camera & voice…"
                : rtcStatus === "error"
                  ? "Peer link failed — scores still sync"
                  : "Waiting for rival video…"}
            </span>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div
      className={`live-match mode-${mode} layout-${stageLayout}${inRitual ? " ritual" : ""}`}
    >
      <header className="live-match-head">
        <div>
          <p className="live-mode">
            {mode === "solo"
              ? "Solo"
              : stageLayout === "preview"
                ? "Preview"
                : stageLayout === "fight" || playing
                  ? "Battle"
                  : "Get ready"}
          </p>
          <h2>{title || chart.title}</h2>
        </div>
        <div className="live-scoreboard">
          <div className="live-score">
            <span className="live-score-label">You</span>
            <span className="live-score-value">
              {Math.round(tick.score).toLocaleString()}
            </span>
          </div>
          {rivalScore != null && (
            <div className="live-score rival">
              <span className="live-score-label">{rivalName}</span>
              <span className="live-score-value rival">
                {Math.round(rivalScore).toLocaleString()}
              </span>
            </div>
          )}
          <div className="live-combo">
            <span className={`live-judge ${meterClass}`}>
              {ritual === "preview"
                ? "WATCH"
                : inRitual
                  ? "…"
                  : tick.label}
            </span>
            {tick.combo > 0 && playing && (
              <span className="live-combo-n">×{tick.combo}</span>
            )}
          </div>
        </div>
      </header>

      <div className="live-match-stages">
        {chartPane}
        {youPane}
        {rivalPane}
      </div>

      {(countDigit != null || ritual === "getReady") && (
        <div className="live-ritual-overlay" aria-live="assertive">
          {countDigit != null ? (
            <span key={countDigit} className="live-ritual-count">
              {countDigit}
            </span>
          ) : (
            <span className="live-ritual-ready">GET READY</span>
          )}
        </div>
      )}

      {ritual === "preview" && (
        <div className="live-ritual-banner" role="status">
          PREVIEW — watch the full routine once
        </div>
      )}

      <div className="live-meter" aria-hidden="true">
        <div
          className={`live-meter-fill ${meterClass}`}
          style={{
            width: playing ? `${Math.round(accuracy * 100)}%` : "0%",
          }}
        />
      </div>

      <div className="live-progress" aria-label="Chart progress">
        <div
          className="live-progress-fill"
          style={{ width: `${progress * 100}%` }}
        />
        <span className="live-progress-time">
          {formatClock(chartTime)} / {formatClock(duration)}
        </span>
      </div>

      <div className="live-actions">
        {playbackError && <p className="api-error">{playbackError}</p>}
        {!controlled && !playing && !finished && (
          <button
            type="button"
            className="btn primary"
            disabled={!ready || starting}
            onClick={() => void start()}
          >
            {starting ? "Starting…" : "Start"}
          </button>
        )}
        {controlled && ritual === "idle" && !playing && !finished && (
          <p className="meta-sub">Waiting for match start…</p>
        )}
        {controlled && inRitual && (
          <p className="meta-sub">
            {ritual === "count1" && "Starting preview…"}
            {ritual === "preview" && "Preview playing — no scoring yet"}
            {ritual === "getReady" && "Prep for the real run"}
            {ritual === "count2" && "Battle starting…"}
          </p>
        )}
        {playing && (
          <button type="button" className="btn danger" onClick={stopEarly}>
            End early
          </button>
        )}
        {finished && !controlled && (
          <button
            type="button"
            className="btn primary"
            disabled={starting}
            onClick={() => void start()}
          >
            {starting ? "Starting…" : "Retry"}
          </button>
        )}
        {(finished || (!playing && !finished && !inRitual)) && onExit && (
          <button type="button" className="btn ghost" onClick={onExit}>
            {mode === "battle"
              ? "Leave battle"
              : finished
                ? "Back to library"
                : "Back"}
          </button>
        )}
        {inRitual && onExit && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              ritualAbortRef.current?.abort();
              onExit();
            }}
          >
            Leave battle
          </button>
        )}
      </div>

      {finished && (
        <p className="live-result">
          Final {Math.round(tick.score).toLocaleString()} · max combo{" "}
          {tick.maxCombo} · avg match {Math.round(finalAvg * 100)}%
        </p>
      )}
    </div>
  );
}

function formatClock(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
