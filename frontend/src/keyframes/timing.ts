import type { MotionThumbnailCue } from './contracts.js'

export function thumbnailPosition(cueStartSec: number, mediaTimeSec: number, leadInSec: number, width: number, targetX = 70): number {
  const speed = Math.max(1, width - targetX - 50) / Math.max(0.5, leadInSec)
  return targetX + (cueStartSec - mediaTimeSec) * speed
}
export function thumbnailState(cue: MotionThumbnailCue, mediaTimeSec: number, leadInSec: number): 'hidden' | 'upcoming' | 'active' | 'past' {
  if (mediaTimeSec < cue.startTimeSec - leadInSec) return 'hidden'
  if (mediaTimeSec < cue.startTimeSec) return 'upcoming'
  if (mediaTimeSec < cue.endTimeSec) return 'active'
  return 'past'
}
