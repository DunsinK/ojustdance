import { ThumbnailAppearanceControls } from './ThumbnailAppearanceControls';
import { DEFAULT_THUMBNAIL_APPEARANCE } from '../keyframes/contracts';
import type { ThumbnailAppearance } from '../keyframes/contracts';
import { MotionThumbnailQueue } from './MotionThumbnailQueue';
import { useSavedChartThumbnails } from '../keyframes/useSavedChartThumbnails';
import { useEffect, useRef, useState } from "react";
import { Link } from 'react-router-dom';
import { AttemptRecorder } from '../attempts/AttemptRecorder';
import type { RecordedAttempt } from '../attempts/contracts';
import { downloadAttempt } from '../attempts/download';
import { scorerImplementationId } from '../attempts/scorerBuild';
import { saveAttempt } from '../attempts/storage';
import { DanceScorer, buildReferenceTrack, scoringConfig, type ScoreSnapshot } from "../pose/gradePose";
import { waitForMediaEvent } from '../keyframes/media';
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
  /** Visual mode label — solo vs future p2p battle share this component. */
  mode?: "solo" | "battle";
  onExit?: () => void;
  onComplete?: (result: LiveMatchResult) => void;
  /** Bump (e.g. Date.now()) to auto-start when camera is ready — used by P2P battles. */
  startToken?: number;
  /** Live score stream for Socket.io / rival UI. */
  onScoreUpdate?: (score: number) => void;
  rivalScore?: number | null;
  rivalName?: string;
  /** Hide local Start/Retry (parent drives lifecycle). */
  controlled?: boolean;
  /** Local display preference; the battle lobby owns it across matches. */
  showMotionThumbnails?: boolean;
  onShowMotionThumbnailsChange?: (enabled: boolean) => void;
};

const INITIAL_TICK: ScoreSnapshot = {
  schemaVersion: 'dance-score/3', score: 0, maxScore: 10000, combo: 0, maxCombo: 0,
  accuracy: 0, pointCredit: 0, averageAccuracy: 0, form: 0, motion: null, timing: 0, coverage: 0, offsetMs: null,
  trackingCoverage: 0, judgedCoverage: 0,
  timeSec: 0, label: '…', trackingMisses: 0, processedOpportunities: 0,
};

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
  showMotionThumbnails,
  onShowMotionThumbnailsChange,
}: Props) {
  const refVideoRef = useRef<HTMLVideoElement | null>(null);
  const [localShowThumbnails, setLocalShowThumbnails] = useState(mode === "solo");
  const thumbnailsEnabled = (showMotionThumbnails ?? localShowThumbnails) && Boolean(videoUrl);
  const [thumbnailAppearance, setThumbnailAppearance] = useState<ThumbnailAppearance>({ ...DEFAULT_THUMBNAIL_APPEARANCE });
  const thumbnails = useSavedChartThumbnails(chart, videoUrl, thumbnailAppearance, thumbnailsEnabled);
  const [leadInSec, setLeadInSec] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [chartTime, setChartTime] = useState(0);
  const [tick, setTick] = useState<ScoreSnapshot>(INITIAL_TICK);
  const [accuracy, setAccuracy] = useState(0);
  const [finalAvg, setFinalAvg] = useState(0);
  const [timingToleranceMs, setTimingToleranceMs] = useState(50);
  const [referenceDuration, setReferenceDuration] = useState<number | null>(null);
  const [scoringNotice, setScoringNotice] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [recordAttempt, setRecordAttempt] = useState(true);
  const [completedAttempt, setCompletedAttempt] = useState<RecordedAttempt | null>(null);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [recordingSaveFailed, setRecordingSaveFailed] = useState(false);
  /** Chart preview is often opposite the mirrored live cam — default flip on. */
  const [mirrorChart, setMirrorChart] = useState(true);

  const scorerRef = useRef<DanceScorer | null>(null);
  const recorderRef = useRef<AttemptRecorder | null>(null);
  const chartTimeRef = useRef(0);
  const completedRef = useRef(false);
  const playingRef = useRef(false);
  const startingRef = useRef(false);
  const startAttemptRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const endingStartedAtRef = useRef<number | null>(null);
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const lastScoreEmitRef = useRef(0);
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate; }, [onScoreUpdate]);

  const duration = referenceDuration ?? Math.max(
    chart.durationSec || 0,
    chart.samples.at(-1)?.t ?? 0,
    1
  );

  const { videoRef, canvasRef, ready, error, hasPose, fps } = usePoseSource({
    mode: "camera",
    enabled: true,
    onFrame: (frame) => {
      const scorer = scorerRef.current;
      if (!playingRef.current || !scorer || frame.capturedAtMs == null) return;
      const now = performance.now(), video = refVideoRef.current;
      const receivedTime = endingStartedAtRef.current !== null
        ? scorer.reference.durationSec + (now - endingStartedAtRef.current) / 1000
        : videoUrl && video ? video.currentTime : (now - sessionStartedAtRef.current) / 1000;
      const inferenceDelaySec = Math.max(0, now - frame.capturedAtMs) / 1000;
      const observation = { songTimeSec: receivedTime - inferenceDelaySec * (video?.playbackRate ?? 1),
        receivedAtSongTimeSec: receivedTime, frame: frame.hasPose ? frame.canonicalFrame ?? null : null };
      const accepted = scorer.addObservation(observation);
      recorderRef.current?.observe(observation, accepted);
    },
  });

  useEffect(() => () => {
    startAttemptRef.current++;
    playingRef.current = false;
    scorerRef.current = null;
    recorderRef.current = null;
  }, []);

  async function persistRecording(attempt: RecordedAttempt) {
    setRecordingSaveFailed(false); setRecordingNotice('Saving pose recording on this device…');
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await saveAttempt(attempt);
      setRecordingNotice(attempt.recordingStatus === 'complete'
        ? 'Attempt saved on this device. Replay it in Saved attempts without using the camera.'
        : 'Original score saved, but the pose recording reached its size limit and cannot be fully replayed.');
    } catch (error) {
      setRecordingSaveFailed(true);
      setRecordingNotice(error instanceof Error ? error.message : 'Could not save the attempt. Download it before leaving.');
    }
  }

  function finishMatch(endT: number) {
    if (completedRef.current) return;
    completedRef.current = true;
    playingRef.current = false;
    const result = scorerRef.current?.finish(endT) ?? INITIAL_TICK;
    if (recorderRef.current) {
      const recording = recorderRef.current.finish(endT, result);
      recorderRef.current = null;
      setCompletedAttempt(recording); void persistRecording(recording);
    }
    setPlaying(false); setFinished(true); setTick(result); setAccuracy(result.accuracy);
    setChartTime(endT); chartTimeRef.current = endT; setFinalAvg(result.averageAccuracy);
    refVideoRef.current?.pause();
    onComplete?.({ score: Math.round(result.score), maxCombo: result.maxCombo, avgAccuracy: result.averageAccuracy, durationSec: endT });
  }

  function beginReferenceEnd() {
    if (playingRef.current && endingStartedAtRef.current === null) endingStartedAtRef.current = performance.now();
  }

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const scorer = scorerRef.current;
      if (!playingRef.current || !scorer) return;
      const now = performance.now(), video = refVideoRef.current;
      let time = videoUrl && video ? video.currentTime : (now - sessionStartedAtRef.current) / 1000;
      const end = scorer.reference.durationSec;
      if (time >= end || video?.ended) {
        if (endingStartedAtRef.current === null) endingStartedAtRef.current = videoUrl ? now : sessionStartedAtRef.current + end * 1000;
      }
      if (endingStartedAtRef.current !== null) time = end + (now - endingStartedAtRef.current) / 1000;
      const result = scorer.advance(time);
      recorderRef.current?.advance(time, result);
      setTick(result); setAccuracy(result.accuracy);
      chartTimeRef.current = Math.min(time, end); setChartTime(chartTimeRef.current);
      if (now - lastScoreEmitRef.current > 200) { lastScoreEmitRef.current = now; onScoreUpdateRef.current?.(Math.round(result.score)); }
      // Processing grace accepts delayed results, not late dancing outside ±30–70 ms.
      if (time >= end + (scorer.config.timingToleranceMs + scorer.config.processingDeadlineMs) / 1000) { finishMatch(end); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, videoUrl]);

  async function start() {
    if (playingRef.current || startingRef.current) return;
    startingRef.current = true; setStarting(true); setPlaybackError(null);
    const attempt = ++startAttemptRef.current;
    try {
      const video = refVideoRef.current;
      if (videoUrl && video && video.readyState < 2) await waitForMediaEvent(video, 'loadeddata', () => video.load());
      if (attempt !== startAttemptRef.current) return;
      const config = scoringConfig({ timingToleranceMs });
      const referenceOptions = { reflectDance: !mirrorChart, timeline: videoUrl ? 'source-video' as const : 'chart' as const,
        ...(videoUrl && video ? { durationSec: video.duration, imageSize: { width: video.videoWidth, height: video.videoHeight } } : {}) };
      const track = buildReferenceTrack(chart, { ...referenceOptions, config });
      const scorer = new DanceScorer(track, config);
      let recorder: AttemptRecorder | null = null;
      setRecordingNotice(null); setRecordingSaveFailed(false); setCompletedAttempt(null);
      if (recordAttempt) {
        try {
          recorder = new AttemptRecorder({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), mode,
            implementationId: await scorerImplementationId() }, chart, referenceOptions, config);
        } catch { setRecordingNotice('Pose recording could not start. This match will still be scored, but will not be saved.'); }
      }
      if (attempt !== startAttemptRef.current) return;
      if (videoUrl && video) { video.currentTime = 0; await video.play(); }
      if (attempt !== startAttemptRef.current) { video?.pause(); return; }
      scorerRef.current = scorer; recorderRef.current = recorder;
      sessionStartedAtRef.current = performance.now(); endingStartedAtRef.current = null;
      completedRef.current = false; lastScoreEmitRef.current = 0; chartTimeRef.current = 0;
      setReferenceDuration(track.durationSec);
      setScoringNotice(track.scorableDurationSec === 0 ? 'No usable reference poses. Reimport this chart in Map to enable scoring.' : track.warnings[0] ?? null);
      setTick(INITIAL_TICK); setAccuracy(0); setChartTime(0); setFinalAvg(0); setFinished(false);
      playingRef.current = true; setPlaying(true);
    } catch (error) {
      if (attempt === startAttemptRef.current) setPlaybackError(error instanceof Error ? error.message : 'Could not start playback');
    } finally { startingRef.current = false; if (attempt === startAttemptRef.current) setStarting(false); }
  }

  useEffect(() => {
    if (startToken == null || !ready || playing || finished) return;
    const timer = setTimeout(() => { void start(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startToken, ready]);

  function stopEarly() {
    finishMatch(chartTimeRef.current);
  }

  const progress = Math.min(1, chartTime / duration);
  const meterClass =
    tick.label === 'TRACKING' || tick.label === 'NO REFERENCE' ? 'unavailable' : accuracy >= 0.82
      ? "hot"
      : accuracy >= 0.65
        ? "good"
        : accuracy >= 0.45
          ? "ok"
          : "miss";

  let liveStatus: string;
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
            <span className={`live-judge ${meterClass}`}>{tick.label}</span>
            {tick.combo > 0 && (
              <span className="live-combo-n">×{tick.combo}</span>
            )}
          </div>
        </div>
      </header>

      <div className="live-match-stages">
        <div className="live-pane">
          <div className="live-pane-bar">
            <p className="live-pane-label">Chart</p>
            {videoUrl && (
              <label className="live-mirror-toggle">
                <input
                  type="checkbox"
                  checked={mirrorChart}
                  disabled={playing || starting}
                  onChange={(e) => setMirrorChart(e.target.checked)}
                />
                Mirror video and scoring
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
              onEnded={beginReferenceEnd}
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

      <div className="motion-thumbnail-controls"><label>
        <input type="checkbox" checked={thumbnailsEnabled} disabled={!videoUrl}
          onChange={(event) => {
            setLocalShowThumbnails(event.target.checked);
            onShowMotionThumbnailsChange?.(event.target.checked);
          }} /> Show upcoming move thumbnails
      </label>
        {!videoUrl && <span className="meta-sub">A reference video is needed for move thumbnails.</span>}
      </div>
      {thumbnailsEnabled && <ThumbnailAppearanceControls appearance={thumbnailAppearance} onChange={setThumbnailAppearance} />}
      {thumbnailsEnabled && thumbnails.loading && <p className="motion-thumbnail-status" role="status">{thumbnails.message} You can keep dancing while previews load.</p>}
      {thumbnailsEnabled && thumbnails.error && <div role="alert"><p className="api-error">Motion thumbnails: {thumbnails.error}</p>
        {videoUrl && <button type="button" className="btn ghost" onClick={thumbnails.retry}>Retry thumbnails</button>}
      </div>}
      {thumbnailsEnabled && thumbnails.plan && <>
        <MotionThumbnailQueue track={thumbnails.plan} mediaRef={refVideoRef} mirrored={mirrorChart} leadInSec={leadInSec} onRetry={thumbnails.retry} />
        <div className="motion-thumbnail-controls"><label>Preview lead-in
          <input type="range" min="1.5" max="6" step="0.5" value={leadInSec} onChange={(event) => setLeadInSec(Number(event.target.value))} />
          {leadInSec.toFixed(1)}s
        </label></div>
      </>}

      <div className="live-scoring-controls">
        <label>Timing tolerance ±{timingToleranceMs} ms
          <input type="range" min="30" max="70" step="5" value={timingToleranceMs} disabled={playing || starting || mode === 'battle'}
            title={mode === 'battle' ? 'Battle uses the same ±50 ms timing policy for both players' : undefined}
            onChange={(event) => setTimingToleranceMs(Number(event.target.value))} />
        </label>
        <span>Form {Math.round(tick.form * 100)}% · Visible evidence {Math.round(tick.coverage * 100)}%
          {tick.motion !== null && ` · Motion ${Math.round(tick.motion * 100)}%`}
          {tick.offsetMs !== null && ` · ${Math.abs(tick.offsetMs)} ms ${tick.offsetMs < 0 ? 'early' : tick.offsetMs > 0 ? 'late' : 'on time'}`}</span>
      </div>
      <div className="live-scoring-controls">
        <label><input type="checkbox" checked={recordAttempt} disabled={playing || starting}
          onChange={(event) => setRecordAttempt(event.target.checked)} /> Save pose data for scoring tests</label>
        <span>On this device only · joint points and timing · no camera video</span>
        {!playing && !starting && <Link to="/attempts">Saved attempts</Link>}
      </div>
      {recordingNotice && <p className="hint" role="status">{recordingNotice}</p>}
      {finished && completedAttempt && <div className="live-scoring-controls">
        <button type="button" className="btn ghost" onClick={() => downloadAttempt(completedAttempt)}>Download attempt</button>
        {recordingSaveFailed && <button type="button" className="btn ghost" onClick={() => void persistRecording(completedAttempt)}>Retry saving attempt</button>}
      </div>}
      {scoringNotice && <p className="hint" role="status">{scoringNotice}</p>}
      {tick.label === 'TRACKING' && <p className="hint" role="status">Not enough fresh, visible body points to judge this moment. Keep your body in frame.</p>}
      {playbackError && <div role="alert"><p className="api-error">{playbackError}</p>
        <button type="button" className="btn ghost" onClick={() => void start()}>Retry playback</button></div>}

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
        {controlled && !playing && !finished && (
          <p className="meta-sub">Waiting for match start…</p>
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
            onClick={() => void start()}
          >
            Retry
          </button>
        )}
        {(finished || (!playing && !finished)) && onExit && (
          <button type="button" className="btn ghost" onClick={onExit}>
            {mode === "battle" ? "Leave battle" : finished ? "Back to library" : "Back"}
          </button>
        )}
      </div>

      {finished && (
        <p className="live-result">
          Final {Math.round(tick.score).toLocaleString()} · max combo{" "}
          {tick.maxCombo} · measured match {Math.round(finalAvg * 100)}%
          {' · '}judged {Math.round(tick.judgedCoverage * 100)}% of reference moments
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
