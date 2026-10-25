import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AttemptEvaluation, AttemptSummary, RecordedAttempt, ScoreTracePoint } from '../attempts/contracts'
import { ATTEMPT_LIMITS } from '../attempts/contracts'
import { AttemptPosePreview } from '../attempts/AttemptPosePreview'
import { downloadAttempt } from '../attempts/download'
import { replayAttempt } from '../attempts/replay'
import { scorerImplementationId } from '../attempts/scorerBuild'
import { deleteAttempt, listAttempts, readAttempt, readEvaluations, saveAttempt, saveEvaluation } from '../attempts/storage'
import { parseAttempt } from '../attempts/validation'
import './Attempts.css'

const points = (value: number) => Math.round(value).toLocaleString()
const message = (error: unknown) => error instanceof Error ? error.message : 'Attempt operation failed'
function tracePath(trace: readonly ScoreTracePoint[], duration: number, maximum: number) {
  const stride = Math.max(1, Math.ceil(trace.length / 400))
  return trace.filter((_point, index) => index % stride === 0 || index === trace.length - 1)
    .map((point, index) => `${index ? 'L' : 'M'}${40 + point.songTimeSec / duration * 700},${170 - point.result.score / maximum * 150}`).join(' ')
}
export function Attempts() {
  const [summaries, setSummaries] = useState<AttemptSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<{ attempt: RecordedAttempt; evaluations: AttemptEvaluation[] } | null>(null)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('Current algorithm')
  const [tolerance, setTolerance] = useState(50)
  const [previewTime, setPreviewTime] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const attempt = loaded?.attempt.id === selectedId ? loaded.attempt : null
  const evaluations = attempt ? loaded!.evaluations : []
  const duration = attempt?.reference.options.durationSec ?? attempt?.reference.chart.durationSec ?? 1

  useEffect(() => {
    let active = true
    listAttempts().then((rows) => {
      if (!active) return
      setSummaries(rows); setLoading(false)
      setSelectedId((current) => current ?? rows[0]?.id ?? null)
    }).catch((error) => { if (active) { setError(message(error)); setLoading(false) } })
    return () => { active = false }
  }, [reload])
  useEffect(() => {
    let active = true
    if (selectedId) Promise.all([readAttempt(selectedId), readEvaluations(selectedId)]).then(([attempt, evaluations]) => {
      if (!active) return
      if (!attempt) { setError('Recording was removed from this device.'); return }
      setLoaded({ attempt, evaluations }); setPreviewTime(0)
      setTolerance(Math.max(30, Math.min(70, attempt.original.policy.timingToleranceMs)))
    }).catch((error) => { if (active) setError(message(error)) })
    return () => { active = false; abortRef.current?.abort() }
  }, [selectedId])

  async function importFile(file: File) {
    setError(null); setNotice(null)
    try {
      if (file.size > ATTEMPT_LIMITS.bytes) throw new Error('Attempt file exceeds 128 MB')
      const imported = parseAttempt(await file.text())
      await saveAttempt(imported)
      setSelectedId(imported.id); setReload((value) => value + 1); setNotice('Recording imported. Its original score was preserved.')
    } catch (error) { setError(message(error)) }
  }
  async function evaluate() {
    if (!attempt || busy) return
    const controller = new AbortController(); abortRef.current = controller
    setBusy(true); setProgress(0); setError(null); setNotice(null)
    try {
      const evaluation = await replayAttempt(attempt, {
        id: crypto.randomUUID(), createdAt: new Date().toISOString(), label,
        implementationId: await scorerImplementationId(), timingToleranceMs: tolerance,
        signal: controller.signal, onProgress: setProgress, yieldToUI: () => new Promise((resolve) => setTimeout(resolve, 0)),
      })
      controller.signal.throwIfAborted()
      await saveEvaluation(evaluation)
      setLoaded({ attempt, evaluations: [evaluation, ...evaluations] })
      setNotice('Comparison saved separately. The original score and pose recording were not changed.')
    } catch (error) { if (controller.signal.aborted) setNotice('Replay cancelled.'); else setError(message(error)) }
    finally { setBusy(false); if (abortRef.current === controller) abortRef.current = null }
  }
  async function remove() {
    if (!attempt || busy) return
    try { await deleteAttempt(attempt.id); setSelectedId(null); setLoaded(null); setReload((value) => value + 1); setNotice('Recording and its comparisons deleted from this device.') }
    catch (error) { setError(message(error)) }
  }
  const latest = evaluations[0]
  return <main className="page attempts-page">
    <header className="page-head"><h1>Saved attempts</h1>
      <p>Dance once, test the same joint points repeatedly. Original scores stay fixed; every replay creates a separate comparison.</p>
    </header>
    <div className="attempt-toolbar"><Link to="/solo">Back to Solo</Link>
      <label className="btn ghost">Import recording<input type="file" accept="application/json,.json" disabled={busy}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} /></label>
      <span className="meta-sub">Saved in this browser and origin. Export a backup before clearing site data.</span>
    </div>
    {error && <p className="api-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p>Loading recordings…</p>}
    {!loading && !summaries.length && <p>No attempts saved yet. In Solo, keep “Save pose data for scoring tests” enabled, then finish or end a dance.</p>}
    <div className="attempt-layout"><aside aria-label="Recorded attempts">
      {summaries.map((summary) => <button className={`attempt-choice${selectedId === summary.id ? ' selected' : ''}`} type="button" key={summary.id} disabled={busy}
        onClick={() => { setSelectedId(summary.id); setError(null); setNotice(null) }}>
        <strong>{summary.title}</strong><span>Original {points(summary.score)} / {points(summary.maxScore)}</span>
        <small>{new Date(summary.createdAt).toLocaleString()} · {summary.durationSec.toFixed(1)}s · {summary.observations} observations</small>
      </button>)}
    </aside><section aria-label="Attempt comparison">
      {selectedId && !attempt && <p>Loading this recording…</p>}
      {attempt && <>
        <h2>{attempt.reference.chart.title}</h2>
        <p><strong>Original score: {points(attempt.original.result.score)} / {points(attempt.original.result.maxScore)}</strong>
          {' · '}{attempt.original.policy.timingToleranceMs} ms tolerance · {attempt.mode}</p>
        <details><summary>Original scoring version</summary><code className="attempt-revision">{attempt.original.implementationId}</code>
          <p>Policy {attempt.original.policy.schemaVersion}. Recorded {new Date(attempt.createdAt).toLocaleString()}.</p></details>
        <div className="attempt-toolbar"><button className="btn ghost" type="button" onClick={() => downloadAttempt(attempt)}>Export recording</button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void remove()}>Delete recording</button></div>
        {attempt.recordingStatus !== 'complete' && <p role="alert">The recording reached its size limit. The original score is preserved, but the full attempt cannot be replayed.</p>}
        <div className="attempt-run-controls">
          <label>Comparison label<input value={label} maxLength={200} disabled={busy} onChange={(event) => setLabel(event.target.value)} /></label>
          <label>Replay tolerance ±{tolerance} ms<input type="range" min="30" max="70" step="5" value={tolerance} disabled={busy} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
          <button type="button" className="btn primary" disabled={busy || attempt.recordingStatus !== 'complete'} onClick={() => void evaluate()}>Replay with current algorithm</button>
          {busy && <><span role="status">Replaying {Math.round(progress * 100)}%…</span><button type="button" className="btn ghost" onClick={() => abortRef.current?.abort()}>Cancel replay</button></>}
        </div>
        <div className="attempt-table-wrap"><table><caption>Original baseline and saved comparisons</caption><thead><tr><th>Run</th><th>Score</th><th>Difference</th><th>Measured match</th><th>Judged</th><th>Tracking misses</th><th>Tolerance</th></tr></thead>
          <tbody><tr><th>Original (fixed)</th><td>{points(attempt.original.result.score)}</td><td>—</td><td>{Math.round(attempt.original.result.averageAccuracy * 100)}%
            {attempt.original.result.schemaVersion !== 'dance-score/3' && <small>v2 includes tracking loss</small>}</td>
            <td>{attempt.original.result.judgedCoverage === undefined ? '—' : `${Math.round(attempt.original.result.judgedCoverage * 100)}%`}</td><td>{attempt.original.result.trackingMisses}</td><td>±{attempt.original.policy.timingToleranceMs} ms</td></tr>
            {evaluations.map((evaluation) => { const difference = evaluation.result.score - attempt.original.result.score
              return <tr key={evaluation.id}><th>{evaluation.label}<small title={evaluation.implementationId}>{evaluation.implementationId.replace('sha256:', '').slice(0, 12)} · {new Date(evaluation.createdAt).toLocaleString()}</small></th>
                <td>{points(evaluation.result.score)}</td><td>{difference >= 0 ? '+' : ''}{points(difference)}</td><td>{Math.round(evaluation.result.averageAccuracy * 100)}%
                  {evaluation.result.schemaVersion !== 'dance-score/3' && <small>v2 includes tracking loss</small>}</td>
                <td>{evaluation.result.judgedCoverage === undefined ? '—' : `${Math.round(evaluation.result.judgedCoverage * 100)}%`}</td><td>{evaluation.result.trackingMisses}</td><td>±{evaluation.policy.timingToleranceMs} ms</td></tr>
            })}</tbody></table></div>
        <figure className="attempt-score-plot"><svg viewBox="0 0 780 200" role="img" aria-label="Cumulative score over song time: original in gray, latest replay in green">
          <path d="M40 20V170H740" fill="none" stroke="#888" />
          <path d={tracePath(attempt.original.trace, duration, attempt.original.result.maxScore)} fill="none" stroke="#666" strokeWidth="3" />
          {latest && <path d={tracePath(latest.trace, duration, Math.max(attempt.original.result.maxScore, latest.result.maxScore))} fill="none" stroke="#497b0b" strokeWidth="3" />}
          <text x="0" y="20">{points(attempt.original.result.maxScore)}</text><text x="25" y="190">0s</text><text x="700" y="190">{duration.toFixed(1)}s</text>
        </svg><figcaption>Cumulative points: original in gray{latest && ', latest replay in green'}. A score increase measures algorithm behavior; it does not prove a better judgment.</figcaption></figure>
        <label className="attempt-scrub">Inspect recorded joint points: {previewTime.toFixed(3)}s
          <input aria-label="Inspect recorded joint points" type="range" min="0" max={duration} step="0.01" value={previewTime} onChange={(event) => setPreviewTime(Number(event.target.value))} /></label>
        <AttemptPosePreview attempt={attempt} songTimeSec={previewTime} />
      </>}
    </section></div>
  </main>
}
