import type { MotionThumbnails } from './contracts.js'
import { THUMBNAIL_LIMITS } from './contracts.js'

export interface VisualTargetReference {
  schemaVersion: 'keyframe-visual-targets/1'
  id: string
  method: string
  targets: { id: string; startTimeSec: number; endTimeSec: number; note?: string }[]
  exclude: { startTimeSec: number; endTimeSec: number; reason?: string }[]
}

/** Compare exact representative-frame times with independently reviewed source windows. */
export function compareVisualTargets(track: MotionThumbnails, reference: VisualTargetReference) {
  if (reference.schemaVersion !== 'keyframe-visual-targets/1' || !Array.isArray(reference.targets) || !Array.isArray(reference.exclude)
    || reference.targets.length > 256 || reference.exclude.length > 256) throw new Error('Unsupported visual target reference')
  const validWindow = (window: { startTimeSec: number; endTimeSec: number }) => Number.isFinite(window.startTimeSec) && Number.isFinite(window.endTimeSec)
    && window.startTimeSec >= 0 && window.endTimeSec >= window.startTimeSec && window.endTimeSec <= THUMBNAIL_LIMITS.sourceDurationSec
  const ids = new Set<string>()
  let previousEnd = -Infinity
  const targets = reference.targets.map((target) => {
    if (!validWindow(target) || typeof target.id !== 'string' || !target.id.length || ids.has(target.id) || target.startTimeSec <= previousEnd) throw new Error('Visual target windows must be chronological, disjoint, and uniquely named')
    ids.add(target.id); previousEnd = target.endTimeSec
    return { id: target.id, matchedFrameTimesSec: track.cues.filter((cue) => cue.thumbnailTimeSec >= target.startTimeSec && cue.thumbnailTimeSec <= target.endTimeSec).map((cue) => cue.thumbnailTimeSec) }
  })
  if (!reference.exclude.every(validWindow)) throw new Error('Invalid excluded visual window')
  const excludedFrameTimesSec = track.cues.filter((cue) => reference.exclude.some((window) => cue.thumbnailTimeSec >= window.startTimeSec && cue.thumbnailTimeSec <= window.endTimeSec)).map((cue) => cue.thumbnailTimeSec)
  return { schemaVersion: 'keyframe-visual-comparison/1' as const, referenceId: reference.id, targetCount: targets.length,
    matchedCount: targets.filter((target) => target.matchedFrameTimesSec.length > 0).length,
    missedTargetIds: targets.filter((target) => !target.matchedFrameTimesSec.length).map((target) => target.id), targets, excludedFrameTimesSec }
}
