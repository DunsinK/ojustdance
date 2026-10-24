import { useEffect, useRef, useState } from "react";
import {
  applyScoreTick,
  gradePose,
  sampleAtTime,
  type ScoreTick,
} from "../pose/gradePose";
import { PoseStage } from "../pose/PoseStage";
import type { ChartDocument, RelativeLandmark } from "../pose/types";
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
  /** Visual mode label — solo vs future p2p battle share this component. */
  mode?: "solo" | "battle";
  onExit?: () => void;
  onComplete?: (result: LiveMatchResult) => void;
};

const INITIAL_TICK: ScoreTick = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  label: "…",
};

export function LiveChartMatch({
  chart,
  videoUrl,
  title,
  mode = "solo",
  onExit,
  onComplete,
}: Props) {
  const refVideoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [chartTime, setChartTime] = useState(0);
  const [tick, setTick] = useState<ScoreTick>(INITIAL_TICK);
  const [accuracy, setAccuracy] = useState(0);
  const [finalAvg, setFinalAvg] = useState(0);

  const liveLandmarksRef = useRef<RelativeLandmark[]>([]);
  const hasPoseRef = useRef(false);
  const tickRef = useRef<ScoreTick>(INITIAL_TICK);
  const lastGradeAtRef = useRef(0);
  const chartTimeRef = useRef(0);
  const accuracySumRef = useRef(0);
  const accuracyCountRef = useRef(0);
  const completedRef = useRef(false);
  const playingRef = useRef(false);

  const duration = Math.max(
    chart.durationSec || 0,
    chart.samples.at(-1)?.t ?? 0,
    1
  );

  const { videoRef, canvasRef, ready, error, hasPose, fps } = usePoseSource({
    mode: "camera",
    enabled: true,
    onFrame: (frame) => {
      hasPoseRef.current = frame.hasPose;
      if (frame.hasPose) liveLandmarksRef.current = frame.landmarks;
    },
  });

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  function finishMatch(endT: number) {
    if (completedRef.current) return;
    completedRef.current = true;
    playingRef.current = false;
    setPlaying(false);
    setFinished(true);
    setChartTime(endT);
    chartTimeRef.current = endT;
    const avg =
      accuracyCountRef.current > 0
        ? accuracySumRef.current / accuracyCountRef.current
        : 0;
    setFinalAvg(avg);
    refVideoRef.current?.pause();
    onComplete?.({
      score: Math.round(tickRef.current.score),
      maxCombo: tickRef.current.maxCombo,
      avgAccuracy: avg,
      durationSec: endT,
    });
  }

  useEffect(() => {
    if (!playing) return;

    let raf = 0;
    const loop = () => {
      if (!playingRef.current) return;

      const refVid = refVideoRef.current;
      let t = chartTimeRef.current;
      const now = performance.now();
      const dt =
        lastGradeAtRef.current > 0
          ? Math.min(0.08, (now - lastGradeAtRef.current) / 1000)
          : 1 / 30;
      lastGradeAtRef.current = now;

      if (refVid && videoUrl && !refVid.paused) {
        t = refVid.currentTime;
        if (refVid.ended || t >= duration - 0.05) {
          finishMatch(Math.min(t, duration));
          return;
        }
      } else if (!videoUrl) {
        t = Math.min(duration, chartTimeRef.current + dt);
        if (t >= duration) {
          finishMatch(duration);
          return;
        }
      }

      chartTimeRef.current = t;

      const sample = sampleAtTime(chart.samples, t);
      let nextAcc = 0;
      if (sample && hasPoseRef.current && liveLandmarksRef.current.length) {
        nextAcc = gradePose(liveLandmarksRef.current, sample.landmarks).accuracy;
        accuracySumRef.current += nextAcc;
        accuracyCountRef.current += 1;
      } else {
        nextAcc = 0.15;
      }

      const nextTick = applyScoreTick(tickRef.current, nextAcc, dt);
      tickRef.current = nextTick;
      setTick(nextTick);
      setAccuracy(nextAcc);
      setChartTime(t);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoUrl, duration, chart.samples]);

  async function start() {
    completedRef.current = false;
    accuracySumRef.current = 0;
    accuracyCountRef.current = 0;
    lastGradeAtRef.current = 0;
    chartTimeRef.current = 0;
    tickRef.current = INITIAL_TICK;
    setTick(INITIAL_TICK);
    setAccuracy(0);
    setChartTime(0);
    setFinalAvg(0);
    setFinished(false);

    const refVid = refVideoRef.current;
    if (refVid && videoUrl) {
      refVid.currentTime = 0;
      try {
        await refVid.play();
      } catch (err) {
        console.error(err);
      }
    }
    playingRef.current = true;
    setPlaying(true);
  }

  function stopEarly() {
    finishMatch(chartTimeRef.current);
  }

  const progress = Math.min(1, chartTime / duration);
  const meterClass =
    accuracy >= 0.82
      ? "hot"
      : accuracy >= 0.65
        ? "good"
        : accuracy >= 0.45
          ? "ok"
          : "miss";

  let liveStatus = "Enable camera permission";
  if (error) liveStatus = error;
  else if (!ready) liveStatus = "Loading MediaPipe…";
  else if (playing)
    liveStatus = hasPose ? `Live · ${fps} FPS` : "No body in frame";
  else if (finished) liveStatus = "Match over";
  else liveStatus = hasPose ? "Ready — hit Start" : "Step into frame";

  return (
    <div className={`live-match mode-${mode}`}>
      <header className="live-match-head">
        <div>
          <p className="live-mode">{mode === "solo" ? "Solo battle" : "Battle"}</p>
          <h2>{title || chart.title}</h2>
        </div>
        <div className="live-scoreboard">
          <div className="live-score">
            <span className="live-score-label">Score</span>
            <span className="live-score-value">
              {Math.round(tick.score).toLocaleString()}
            </span>
          </div>
          <div className="live-combo">
            <span className={`live-judge ${meterClass}`}>{tick.label}</span>
            {tick.combo > 0 && (
              <span className="live-combo-n">×{tick.combo}</span>
            )}
          </div>
        </div>
      </header>

      <div className="live-match-stages">
        <div className="live-pane">
          <p className="live-pane-label">Chart</p>
          {videoUrl ? (
            <video
              ref={refVideoRef}
              className="live-ref-video"
              src={videoUrl}
              playsInline
              muted
              preload="auto"
              onEnded={() => finishMatch(duration)}
            />
          ) : (
            <div className="live-ref-video placeholder">
              No preview video — timing from chart clock
            </div>
          )}
        </div>

        <div className="live-pane">
          <p className="live-pane-label">You</p>
          <PoseStage
            videoRef={videoRef}
            canvasRef={canvasRef}
            status={liveStatus}
            recording={playing}
          />
        </div>
      </div>

      <div className="live-meter" aria-hidden="true">
        <div
          className={`live-meter-fill ${meterClass}`}
          style={{ width: `${Math.round(accuracy * 100)}%` }}
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
        {!playing && !finished && (
          <button
            type="button"
            className="btn primary"
            disabled={!ready}
            onClick={() => void start()}
          >
            Start
          </button>
        )}
        {playing && (
          <button type="button" className="btn danger" onClick={stopEarly}>
            End early
          </button>
        )}
        {finished && (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => void start()}
            >
              Retry
            </button>
            {onExit && (
              <button type="button" className="btn ghost" onClick={onExit}>
                Back to library
              </button>
            )}
          </>
        )}
        {!playing && !finished && onExit && (
          <button type="button" className="btn ghost" onClick={onExit}>
            Back
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
