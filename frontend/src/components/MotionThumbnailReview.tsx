import { useMemo, useState } from 'react'
import type { RefObject } from 'react'
import type { CanonicalMotionSample, MotionThumbnails } from '../keyframes/contracts.js'
import { buildSelectionReview } from '../keyframes/selectionReview.js'

/** Inspection only: keyframe generation remains fully automatic. */
export function MotionThumbnailReview({ track, samples, mediaRef, mirrored }: {
  track: MotionThumbnails
  samples: CanonicalMotionSample[]
  mediaRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
}) {
  const [open, setOpen] = useState(false)
  const review = useMemo(() => open ? buildSelectionReview(samples, track) : null, [open, samples, track])
  const diagnostics = review?.diagnostics
  const duration = Math.max(1, ...track.cues.map((cue) => cue.endTimeSec))
  function downloadReview() {
    if (!review) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(review)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'motion-selection-review.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <details className="motion-review" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Inspect {track.cues.length} selected motion frames</summary>
    {review && diagnostics && <>
      <p>Click a frame to seek the original video. These are automatic selections; no editing is required.</p>
      <p>{diagnostics.usableRootSamples}/{diagnostics.sampleCount} samples have a usable body center.
        {' '}Motion reconstruction error: {diagnostics.meanMotionError.toFixed(3)} torso lengths on average.
        This measures pose coverage, not dance understanding.</p>
      <svg className="motion-review-graph" viewBox="0 0 1000 110" role="img" aria-label="Motion reconstruction error over video time. Taller peaks indicate motion less well represented by the selected frames.">
        <path d="M0 90H1000" stroke="#667a8f" />
        <path fill="none" stroke="#ffb56b" strokeWidth="2" d={diagnostics.curve.map((point, index) =>
          `${index === 0 || point.runId !== diagnostics.curve[index - 1].runId ? 'M' : 'L'}${point.sourceTimeSec / duration * 1000},${90 - Math.min(1, point.error) * 80}`).join(' ')} />
        {track.cues.map((cue) => <line key={cue.id} x1={cue.thumbnailTimeSec / duration * 1000} x2={cue.thumbnailTimeSec / duration * 1000} y1="92" y2="105" stroke="#8ee7ff" />)}
      </svg>
      <button type="button" className="btn" onClick={downloadReview}>Download local analysis</button>
      <div className="motion-review-grid">
        {track.cues.map((cue) => <button type="button" className="motion-review-frame" key={cue.id} onClick={() => {
          const video = mediaRef.current
          if (video) { video.pause(); video.currentTime = cue.thumbnailTimeSec }
        }} aria-label={`Seek to reference pose at ${cue.thumbnailTimeSec.toFixed(2)} seconds`}>
          <img src={track.frames[cue.frameIds.at(-1)!].dataUrl} alt={`Selected pose at ${cue.thumbnailTimeSec.toFixed(2)} seconds`}
            style={{ transform: mirrored ? 'scaleX(-1)' : undefined }} />
          <span>{cue.thumbnailTimeSec.toFixed(2)}s</span>
          {track.appearance?.background === 'removed' && track.frames[cue.frameIds.at(-1)!].background === 'original' && <small>Original crop</small>}
        </button>)}
      </div>
    </>}
  </details>
}
