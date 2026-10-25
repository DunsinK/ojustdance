import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { gradePose } from '../pose/gradePose';
import { PoseStage } from '../pose/PoseStage';
import type { ChartDocument, RelativeLandmark } from '../pose/types';
import { usePoseSource } from '../pose/usePoseSource';
import { AnimatedNumber } from '../ui/Motion';
import { EffectsControls } from '../performance/EffectsControls';
import { useEffects } from '../performance/EffectsContext';
import { CueLane } from '../performance/CueLane';
import { CuePose } from '../performance/CuePose';
import { playerEvidence } from '../performance/evidence';
import { PerformanceDirector, emptyPerformance } from '../performance/PerformanceDirector';
import { PerformanceEvents } from '../performance/PerformanceEvents';
import type { PerformanceEvent } from '../performance/contracts';
import { nearestReference, practiceCues } from '../performance/reference';
import { ReactiveStage } from '../performance/ReactiveStage';
import type { StageSignal } from '../performance/ReactiveStage';
import { StageAudio } from '../performance/StageAudio';
import { StageCelebration } from '../performance/StageCelebration';
import { MovementTrails } from '../performance/MovementTrails';
import type { SkeletonFrame } from '@ojustdance/skeleton';
import './PerformanceBattle.css';

export type LiveMatchResult = { score: number; maxCombo: number; avgAccuracy: number; durationSec: number };
type Props = {
  chart: ChartDocument; videoUrl: string | null; title?: string; mode?: 'solo' | 'battle';
  onExit?: () => void; onComplete?: (result: LiveMatchResult) => void; startToken?: number;
  onScoreUpdate?: (score: number) => void; rivalScore?: number | null; rivalName?: string; controlled?: boolean;
};

function metadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('The reference video is taking too long. Retry playback.')), 15000);
    const loaded = () => done(); const failed = () => done(new Error('Reference video could not load. Retry after the preview loads.'));
    const done = (error?: Error) => { clearTimeout(timer); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); if (error) reject(error); else resolve(); };
    video.addEventListener('loadedmetadata', loaded, { once: true }); video.addEventListener('error', failed, { once: true });
  });
}
export function PerformanceBattle({ chart, videoUrl, title, mode = 'solo', onExit, onComplete, startToken,
  onScoreUpdate, rivalScore = null, rivalName = 'Rival', controlled = false }: Props) {
  const { preferences, reduced, update } = useEffects();
  const refVideoRef = useRef<HTMLVideoElement | null>(null);
  const director = useRef<PerformanceDirector | null>(null);
  const [bus] = useState(() => new PerformanceEvents());
  const [audio] = useState(() => new StageAudio());
  const audioRef = useRef<StageAudio | null>(audio);
  const signal = useRef<StageSignal>({ energy: 0, combo: 0, peakUntil: 0 });
  const observed = useRef<{ value: SkeletonFrame | null; at: number }>({ value: null, at: -Infinity });
  const motionEnergy = useRef(0);
  const landmarks = useRef<RelativeLandmark[]>([]);
  const evidence = useRef(playerEvidence(null));
  const clock = useRef(0), epoch = useRef(0), started = useRef(false), complete = useRef(false), attempt = useRef(0);
  const [playing, setPlaying] = useState(false), [paused, setPaused] = useState(false), [finished, setFinished] = useState(false);
  const [starting, setStarting] = useState(false), [countdown, setCountdown] = useState<number | null>(null);
  const [view, setView] = useState(emptyPerformance), [time, setTime] = useState(0), [bodyPoints, setBodyPoints] = useState(0);
  const [fullBodyReady, setFullBodyReady] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null), [aspect, setAspect] = useState(16 / 9);
  const [mirror, setMirror] = useState(true), [leadIn, setLeadIn] = useState(3);
  const [error, setError] = useState<string | null>(null), [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [cors, setCors] = useState(true);
  const arena = useRef<HTMLDivElement>(null);
  const [judgment, setJudgment] = useState<Extract<PerformanceEvent, { type: 'moveJudged' }> | null>(null);
  const [banner, setBanner] = useState<{ id: string; text: string } | null>(null);
  const scoreCallback = useRef(onScoreUpdate);
  const rivalValue = useRef(rivalScore);
  useEffect(() => { scoreCallback.current = onScoreUpdate; }, [onScoreUpdate]);
  useEffect(() => { rivalValue.current = rivalScore; }, [rivalScore]);
  const duration = mediaDuration ?? Math.max(chart.durationSec, chart.samples.at(-1)?.t ?? 0, 1);
  const samples = useMemo(() => chart.samples.map((sample) => ({ ...sample, t: videoUrl ? sample.sourceTimeSec ?? sample.t : sample.t,
    landmarks: sample.landmarks.map(([x, y, , visibility]): RelativeLandmark => [x, y, 0, visibility]) })).sort((a, b) => a.t - b.t), [chart.samples, videoUrl]);
  const cues = useMemo(() => videoUrl && chart.referenceCues?.length
    ? chart.referenceCues.filter((cue) => cue.startSec < duration && cue.referenceSec <= duration + 0.001).map((cue) => ({ ...cue, endSec: Math.min(duration, cue.endSec) }))
    : practiceCues(samples, duration), [chart.referenceCues, duration, samples, videoUrl]);
  const current = cues.find((cue) => cue.id === view.currentId) ?? cues.find((cue) => time >= cue.startSec && time < cue.endSec);
  const next = cues.find((cue) => cue.startSec > time + 0.02);
  const { videoRef, canvasRef, ready, error: cameraError, hasPose, fps } = usePoseSource({ mode: 'camera', enabled: true, includeCanonical: true,
    onFrame: (frame) => {
      const now = performance.now(), previous = observed.current, next = frame.canonicalFrame;
      if (next?.coordinates.imageSize && previous.value && now - previous.at >= 10 && now - previous.at < 200) {
        const distances = (['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'] as const).flatMap((name) => {
          const a = next.observations[name], b = previous.value!.observations[name];
          if (!a?.position || !b?.position || !a.valid || !b.valid || (a.visibility != null && a.visibility < 0.5)) return [];
          const distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
          return Number.isFinite(distance) ? [distance / next.coordinates.imageSize!.height / ((now - previous.at) / 1000)] : [];
        });
        motionEnergy.current = distances.length ? Math.min(1, distances.reduce((sum, value) => sum + value, 0) / distances.length * 0.5) : 0;
      }
      observed.current = { value: next ?? null, at: now };
      evidence.current = playerEvidence(frame.canonicalFrame ?? null);
      // Explicit 2D projection for the legacy quality adapter. Original canonical depth is retained.
      landmarks.current = frame.hasPose ? frame.landmarks.map(([x, y, , visibility]): RelativeLandmark => [x, y, 0, visibility]) : [];
      setBodyPoints(evidence.current.visible);
      setFullBodyReady(evidence.current.fullBody);
    },
  });

  useEffect(() => bus.subscribe((event) => {
    if (preferences.sound) audio.play(event);
    if (event.type === 'moveJudged') {
      setJudgment(event);
      if (event.grade === 'PERFECT') signal.current.peakUntil = performance.now() + 750;
    } else if (event.type === 'comboMilestone') {
      setBanner({ id: event.id, text: `${event.count}× COMBO · ON FIRE` }); signal.current.peakUntil = performance.now() + 1000;
    } else if (event.type === 'leadChanged') setBanner({ id: event.id, text: event.playerId === 'you' ? 'YOU TAKE THE LEAD' : `${rivalName.toUpperCase()} TAKES THE LEAD` });
  }), [audio, bus, preferences.sound, rivalName]);
  useEffect(() => { if (!judgment) return; const timer = setTimeout(() => setJudgment(null), 1100); return () => clearTimeout(timer); }, [judgment]);
  useEffect(() => { if (!banner) return; const timer = setTimeout(() => setBanner(null), 1500); return () => clearTimeout(timer); }, [banner]);
  useEffect(() => { const media = refVideoRef.current; if (media) { media.muted = !preferences.music; media.volume = 0.65; } }, [preferences.music]);
  useEffect(() => { if (rivalScore !== null) bus.publish(director.current?.updateLeader(rivalScore) ?? []); }, [bus, rivalScore]);
  useEffect(() => () => { attempt.current++; started.current = false; audio.dispose(); }, [audio]);

  function finish(end: number) {
    if (complete.current || !director.current) return;
    complete.current = true; started.current = false;
    bus.publish(director.current.finish(end));
    const final = director.current.snapshot(); setView(final); setFinished(true); setPlaying(false); setTime(end); clock.current = end;
    refVideoRef.current?.pause(); signal.current.energy = 0;
    scoreCallback.current?.(final.score);
    onComplete?.({ score: final.score, maxCombo: final.maxCombo, avgAccuracy: final.accuracy, durationSec: end });
  }
  useEffect(() => {
    if (!playing) return;
    let raf = 0, lastUI = 0, lastSend = 0;
    const loop = (now: number) => {
      if (!started.current || !director.current) return;
      const video = refVideoRef.current;
      const t = videoUrl && video ? video.currentTime : paused ? clock.current : Math.min(duration, (now - epoch.current) / 1000);
      clock.current = t;
      const target = nearestReference(samples, t);
      const validReference = !!target && Math.abs(target.t - t) <= 0.07;
      const required = cues.find((cue) => t >= cue.startSec && t < cue.endSec)?.parts ?? [];
      const fresh = now - observed.current.at < 100 && evidence.current.canJudge && required.every((part) => evidence.current.parts.includes(part));
      const result = validReference && fresh ? gradePose(landmarks.current, target!.landmarks) : null;
      const trackingValid = !!result && result.comparedJoints >= 6 && Number.isFinite(result.accuracy);
      const quality = trackingValid ? result!.accuracy : 0;
      signal.current.energy += ((trackingValid ? motionEnergy.current * 0.7 + quality * 0.3 : 0) - signal.current.energy) * 0.15;
      const isPaused = videoUrl ? !!video?.paused && !video.ended : paused;
      if (!isPaused) bus.publish(director.current.advance({ timeSec: t, quality, trackingValid }));
      const snapshot = director.current.snapshot(); signal.current.combo = snapshot.combo;
      if (now - lastUI >= 85) {
        lastUI = now; setTime(t); setView(snapshot);
        if (rivalValue.current !== null) bus.publish(director.current.updateLeader(rivalValue.current));
      }
      if (now - lastSend >= 200) { lastSend = now; scoreCallback.current?.(snapshot.score); }
      if (t >= duration - 0.015 || video?.ended) { finish(duration); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // The round owns its clock and director. Prop updates cannot recreate a running round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, paused, videoUrl, duration, samples, bus]);

  async function start() {
    if (starting || started.current) return;
    const id = ++attempt.current;
    setStarting(true); setError(null); setFinished(false); setJudgment(null); setBanner(null);
    try {
      await audio.unlock();
      const media = refVideoRef.current;
      if (videoUrl && media) await metadata(media);
      if (id !== attempt.current) return;
      if (!controlled) {
        for (const number of [3, 2, 1]) {
          setCountdown(number); if (preferences.sound) audio.tone(330 + (3 - number) * 110);
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (id !== attempt.current) return;
        }
      }
      setCountdown(null);
      if (media && videoUrl) {
        media.currentTime = 0; media.muted = !preferences.music; media.volume = 0.65;
        await audio.connect(media);
        try { await media.play(); } catch { media.muted = true; await media.play(); setAudioNotice('Tap Music to enable the reference soundtrack.'); }
      }
      if (id !== attempt.current) { media?.pause(); return; }
      const actualDuration = videoUrl && media ? media.duration : duration;
      const sessionCues = videoUrl && chart.referenceCues?.length
        ? chart.referenceCues.filter((cue) => cue.startSec < actualDuration && cue.referenceSec <= actualDuration + 0.001).map((cue) => ({ ...cue, endSec: Math.min(actualDuration, cue.endSec) }))
        : practiceCues(samples, actualDuration);
      director.current = new PerformanceDirector(crypto.randomUUID(), sessionCues);
      clock.current = 0; epoch.current = performance.now(); complete.current = false; started.current = true;
      setView(emptyPerformance()); setTime(0); setPaused(false); setPlaying(true);
    } catch (error) { if (id === attempt.current) setError(error instanceof Error ? error.message : 'Could not start the round'); }
    finally { if (id === attempt.current) { setStarting(false); setCountdown(null); } }
  }
  useEffect(() => {
    if (startToken == null || !ready || started.current || complete.current) return;
    const timer = setTimeout(() => { void start(); }, 0); return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startToken, ready]);

  async function toggleMusic() {
    const enabled = !preferences.music; update({ music: enabled });
    if (enabled) { await audio.unlock(); if (refVideoRef.current) { await audio.connect(refVideoRef.current); refVideoRef.current.muted = false; } }
    setAudioNotice(null);
  }
  function togglePause() {
    if (videoUrl && refVideoRef.current) { if (paused) void refVideoRef.current.play().catch(() => setError('Playback paused. Press Resume to try again.')); else refVideoRef.current.pause(); }
    else if (paused) epoch.current = performance.now() - clock.current * 1000;
    setPaused(!paused);
  }
  const leadShare = rivalScore === null || view.score + rivalScore === 0 ? 0.5 : view.score / (view.score + rivalScore);
  const tier = view.combo >= 5 ? 'building' : 'normal';
  const status = cameraError ?? (!ready ? 'Loading pose tracking…' : fullBodyReady ? 'Full body ready ✓' : hasPose ? `${bodyPoints}/12 points · step back for full body` : 'Step into frame');
  const rating = !playing || !view.trackingValid ? 'tracking' : view.quality >= 0.85 ? 'perfect' : view.quality >= 0.65 ? 'good' : view.quality >= 0.45 ? 'ok' : 'miss';
  return <div ref={arena} className={`live-match performance-arena energy-${tier}${finished ? ' round-finished' : ''}`} data-rating={rating}>
    <ReactiveStage signal={signal} audio={audioRef} />
    <header className="live-match-head"><div className="live-track"><span className={`spinning-record${playing && !paused ? ' is-playing' : ''}`} aria-hidden="true">✦</span>
      <div><p className="live-mode">{mode === 'battle' ? 'HEAD TO HEAD' : 'SOLO SESSION'} / {playing ? paused ? 'PAUSED' : 'ON STAGE' : finished ? 'ROUND COMPLETE' : 'SOUNDCHECK'}</p><h2>{title || chart.title}</h2></div></div>
      <EffectsControls />
    </header>
    <div className="arena-hud"><div className="arena-score"><span>YOUR SCORE</span><strong><AnimatedNumber value={view.score} reveal={finished} /></strong></div>
      <div className="arena-combo"><span>COMBO</span><AnimatePresence mode="popLayout"><motion.strong key={view.combo}
        initial={reduced ? false : { y: -14, scale: 1.4, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ opacity: 0, scale: 0.6 }}>{view.combo}<small>×</small></motion.strong></AnimatePresence></div>
      <div className="arena-phase"><span>{current ? 'CURRENT REFERENCE' : finished ? 'THAT’S A WRAP' : 'GET INTO POSITION'}</span><strong>{current?.label ?? 'Find your stance'}</strong>
        <div className="phase-progress"><i style={{ transform: `scaleX(${view.progress})` }} /></div></div>
      <div className="arena-rival"><span>{rivalScore === null ? 'NEXT UP' : rivalName.toUpperCase()}</span><strong>{rivalScore === null ? next?.label ?? 'Final phase' : <AnimatedNumber value={rivalScore} />}</strong></div>
    </div>
    {rivalScore !== null && <div className="versus-meter" aria-label={`Your score ${view.score}, ${rivalName} ${rivalScore}`}><span>YOU</span><div><i style={{ width: `${leadShare * 100}%` }} /><b style={{ left: `${leadShare * 100}%` }}>✦</b></div><span>{rivalName}</span></div>}
    <div className="live-match-stages">
      <motion.section className="live-pane reference-pane" initial={reduced ? false : { x: -70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 24 }}>
        <div className="live-pane-bar"><span className="live-pane-label"><i /> THE REFERENCE</span><label className="live-mirror-toggle"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} /> Mirror display</label></div>
        <div className="reference-viewport">{videoUrl ? <video key={cors ? 'cors' : 'native'} ref={refVideoRef} className={`live-ref-video${mirror ? ' mirrored' : ''}`}
          src={videoUrl} crossOrigin={cors ? 'anonymous' : undefined} playsInline muted preload="auto"
          onLoadedMetadata={(event) => { const media = event.currentTarget; if (Number.isFinite(media.duration) && media.duration > 0) setMediaDuration(media.duration); if (media.videoHeight) setAspect(media.videoWidth / media.videoHeight); }}
          onError={() => { if (cors) { setCors(false); setAudioNotice('Using standard video playback; audio-reactive visuals may be unavailable.'); } else setError('Reference video could not load. Check its URL or choose another chart.'); }}
          onSeeking={() => { if (started.current) director.current?.seek(refVideoRef.current?.currentTime ?? 0); }}
          onEnded={() => finish(duration)} /> : <div className="reference-skeleton">{current ?? cues[0] ? <CuePose cue={(current ?? cues[0])!} samples={samples} aspect={aspect} mirrored={mirror} /> : <p>No reference poses available</p>}</div>}
          <span className="viewport-corner top-left" /><span className="viewport-corner bottom-right" />
          <div className="reference-caption"><span>FOLLOW THE MEASURED POSE</span><strong>{current?.label ?? 'Get ready'}</strong></div>
        </div>
      </motion.section>
      <motion.section className={`live-pane camera-pane${fullBodyReady ? ' body-ready' : ''}`} initial={reduced ? false : { x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 24 }}>
        <div className="live-pane-bar"><span className="live-pane-label"><i /> YOU / {fps} FPS</span><span className="body-readiness"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /><circle cx="16" cy="16" r="12" pathLength="100" strokeDasharray={`${bodyPoints / 12 * 100} 100`} /></svg>{fullBodyReady ? 'READY ✓' : `${bodyPoints}/12 VISIBLE`}</span></div>
        <div className="player-viewport"><PoseStage videoRef={videoRef} canvasRef={canvasRef} status={status} recording={playing && !paused} />
          <MovementTrails frame={observed} mirrored />
          <div className="player-glow" aria-hidden="true" /><span className="viewport-corner top-left" /><span className="viewport-corner bottom-right" />
        </div>
      </motion.section>
      <span className="arena-separator" aria-hidden="true">✦</span>
    </div>
    <StageCelebration judgment={judgment} banner={banner} />
    <AnimatePresence>{countdown !== null && <motion.div className="performance-countdown" key={countdown} initial={{ opacity: 0, scale: reduced ? 1 : 1.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.6 }}>
      <span>YOUR STAGE. YOUR MOMENT.</span><strong>{countdown}</strong><small>GET READY TO MOVE</small></motion.div>}</AnimatePresence>
    {playing && time < 2.1 && <div className="track-sweep" ><small>NOW PLAYING</small><strong>{chart.title}</strong><span>MAKE IT YOURS ↗</span></div>}
    <div className="performance-strip"><span>{playing && !view.trackingValid ? '◌ Tracking needs more visible points' : playing ? '✦ Match the reference' : '✦ The floor is yours'}</span>
      <div className="live-meter"><i className={rating} style={{ transform: `scaleX(${view.quality})` }} /></div><span>{playing ? `${Math.round(view.quality * 100)}% MATCH` : 'READY WHEN YOU ARE'}</span></div>
    <CueLane cues={cues} samples={samples} timeSec={time} clock={clock} leadInSec={leadIn} aspect={aspect} mirrored={mirror} />
    <div className="arena-bottom"><div className="round-timeline"><div className="round-progress"><i style={{ width: `${Math.min(100, time / duration * 100)}%` }} />{[0.25, 0.5, 0.75].map((position) => <b key={position} style={{ left: `${position * 100}%` }} />)}</div>
      <span>{formatClock(time)} <small>/ {formatClock(duration)}</small></span>{playing && duration - time <= 5 && <strong className="final-seconds">FINAL {Math.ceil(duration - time)}</strong>}</div>
      <div className="live-actions">
        <button className="btn ghost" type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void arena.current?.requestFullscreen().catch(() => setAudioNotice('Fullscreen is unavailable in this browser.')); }}>⛶ Fullscreen</button>
        <button className="btn ghost" type="button" aria-pressed={preferences.music} onClick={() => void toggleMusic()}>{preferences.music ? '♫ Music on' : '♫ Music off'}</button>
        {!controlled && !playing && <button className="btn primary" disabled={!ready || starting} type="button" onClick={() => void start()}>{starting ? 'Get ready…' : finished ? 'Run it back ↗' : 'Take the stage ↗'}</button>}
        {controlled && !playing && !finished && <span className="arena-waiting">Waiting for the shared start…</span>}
        {playing && !controlled && <button className="btn ghost" type="button" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>}
        {playing && <button className="btn ghost" type="button" onClick={() => finish(clock.current)}>End early</button>}
        {!playing && onExit && <button className="btn ghost" type="button" onClick={onExit}>{mode === 'battle' ? 'Leave battle' : 'Back to library'}</button>}
      </div>
    </div>
    <div className="arena-settings"><span>{cues[0]?.source === 'authored' ? 'REFERENCE MOVE CUES' : 'TIMED PRACTICE PHASES'} · {audio.isAnalysing() && preferences.music ? 'AUDIO-REACTIVE STAGE' : 'AMBIENT STAGE'}</span>
      <label>Cue lead-in <input aria-label="Cue lead-in" type="range" min="2" max="6" step="0.5" value={leadIn} onChange={(event) => setLeadIn(Number(event.target.value))} />{leadIn.toFixed(1)}s</label></div>
    {audioNotice && <p className="arena-notice" role="status">{audioNotice}</p>}
    {error && <p className="api-error" role="alert">{error}</p>}
    {finished && <motion.div className="live-result" initial={reduced ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
      <span>ROUND COMPLETE</span><strong><AnimatedNumber value={view.score} reveal /></strong><p>Max combo {view.maxCombo}× · {Math.round(view.accuracy * 100)}% measured match · {view.judged} phases judged</p>
    </motion.div>}
  </div>;
}
function formatClock(seconds: number) { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
