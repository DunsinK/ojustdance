import { memo, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { MotionThumbnails } from '../keyframes/contracts.js'
import { thumbnailPosition, thumbnailState } from '../keyframes/timing.js'
import './MotionThumbnailQueue.css'

export const MotionThumbnailQueue = memo(function MotionThumbnailQueue({ track, mediaRef, mirrored = false, leadInSec = 3, onRetry }: {
  track: MotionThumbnails
  mediaRef: RefObject<HTMLVideoElement | null>
  mirrored?: boolean
  leadInSec?: number
  onRetry?: () => void
}) {
  const lane = useRef<HTMLDivElement | null>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    const media = mediaRef.current, container = lane.current
    if (!media || !container) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      const time = media.currentTime
      const width = container.clientWidth
      track.cues.forEach((cue, index) => {
        const card = cards.current[index]
        if (!card) return
        const position = thumbnailPosition(cue.startTimeSec, time, leadInSec, width)
        const state = thumbnailState(cue, time, leadInSec)
        card.style.transform = `translate3d(${position - card.offsetWidth / 2}px, 0, 0)`
        card.style.visibility = state === 'hidden' || position < -120 || position > width + 120 ? 'hidden' : 'visible'
        card.dataset.state = state
      })
      if (!media.paused && !media.ended) frame = requestAnimationFrame(update)
    }
    const events = ['timeupdate', 'seeking', 'seeked', 'play', 'pause', 'ended', 'loadedmetadata', 'ratechange']
    events.forEach((event) => media.addEventListener(event, update))
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(container)
    update()
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); events.forEach((event) => media.removeEventListener(event, update)) }
  }, [track, mediaRef, leadInSec])

  return <section className="motion-queue" aria-label="Upcoming motion thumbnails">
    <div className="motion-queue-heading"><span>Upcoming moves</span><span>{leadInSec.toFixed(1)}s preview</span></div>
    {track.preparation && (track.preparation.skippedCueCount > 0 || track.preparation.fallbackCueCount > 0) && <div className="motion-queue-notice" role="status">
      <span>{track.preparation.skippedCueCount > 0 && `${track.preparation.skippedCueCount} unavailable poses skipped. `}
        {track.preparation.fallbackCueCount > 0 && `${track.preparation.fallbackCueCount} thumbnails use original-video crops because the person mask was unavailable.`}</span>
      {onRetry && <button type="button" className="btn ghost" onClick={onRetry}>Retry skipped/fallback thumbnails</button>}
    </div>}
    {track.cues.length ? <div ref={lane} className="motion-queue-lane">
      <div className="motion-queue-rail" />
      <div className="motion-queue-target" aria-label="Start the motion when its thumbnail reaches this glow"><span>NOW</span></div>
      {track.cues.map((cue, index) => <figure key={cue.id} className={`motion-queue-card${(track.frames[cue.frameIds.at(-1)!].background ?? track.appearance?.background) === 'removed' ? ' is-cutout' : ''}`}
        style={{ visibility: 'hidden' }} ref={(node) => { cards.current[index] = node }}
        aria-label={`Reference motion at ${cue.startTimeSec.toFixed(2)} seconds`}>
        <div className={`motion-queue-images${mirrored ? ' mirrored' : ''}`}>
          <img src={track.frames[cue.frameIds.at(-1)!].dataUrl}
            alt="Reference pose from the original dance video" draggable={false} />
        </div>
        {track.appearance?.background === 'removed' && track.frames[cue.frameIds.at(-1)!].background === 'original' && <figcaption className="motion-queue-original">Original</figcaption>}
      </figure>)}
    </div> : <p className="motion-queue-empty">{track.preparation?.skippedCueCount
      ? 'No usable person frames were available for these cues. The original video is preserved; you can retry.'
      : 'No significant visible motion was detected. No thumbnails were invented.'}</p>}
  </section>
})
