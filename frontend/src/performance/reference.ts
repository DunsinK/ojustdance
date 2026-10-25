import { DanceSkeleton, MediaPipeStyleAdapter } from '@ojustdance/skeleton'
import type { SkeletonFrame, SkeletonPose } from '@ojustdance/skeleton'
import type { ChartSample } from '../pose/types.js'
import type { BodyPart, ReferenceCue } from './contracts.js'

const parts: readonly BodyPart[] = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'torso', 'travel']
const adapter = new MediaPipeStyleAdapter()
const skeleton = new DanceSkeleton()
/** Compatibility with stored motion-thumbnails/1. No selector/provider is duplicated here. */
export function readStoredCues(payload: unknown, duration: number): ReferenceCue[] {
  if (!payload || typeof payload !== 'object') return []
  const track = payload as Record<string, unknown>
  if (track.schemaVersion !== 'motion-thumbnails/1' || track.clock !== 'reference-video-seconds'
    || !Array.isArray(track.cues) || track.cues.length > 256) return []
  const images = track.frames && typeof track.frames === 'object' ? track.frames as Record<string, { dataUrl?: string }> : {}
  const result: ReferenceCue[] = [], ids = new Set<string>()
  for (const raw of track.cues) {
    if (!raw || typeof raw !== 'object') return []
    const cue = raw as Record<string, unknown>
    if (typeof cue.id !== 'string' || !cue.id || cue.id.length > 100 || ids.has(cue.id)
      || typeof cue.startTimeSec !== 'number' || typeof cue.endTimeSec !== 'number' || typeof cue.thumbnailTimeSec !== 'number'
      || ![cue.startTimeSec, cue.endTimeSec, cue.thumbnailTimeSec].every(Number.isFinite)
      || cue.startTimeSec < 0 || cue.endTimeSec <= cue.startTimeSec || cue.endTimeSec > duration + 0.15
      || cue.thumbnailTimeSec < 0 || cue.thumbnailTimeSec > duration + 0.15
      || !Array.isArray(cue.parts) || cue.parts.some((part) => !parts.includes(part as BodyPart))) return []
    ids.add(cue.id)
    const imageId = Array.isArray(cue.frameIds) && typeof cue.frameIds[0] === 'string' ? cue.frameIds[0] : ''
    const image = images[imageId]?.dataUrl
    const safeImage = typeof image === 'string' && image.length <= 256000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ? image : undefined
    result.push({ id: cue.id, startSec: cue.startTimeSec, endSec: Math.min(duration, cue.endTimeSec),
      referenceSec: cue.thumbnailTimeSec, label: `Move ${String(result.length + 1).padStart(2, '0')}`,
      parts: Array.isArray(cue.parts) ? cue.parts.filter((part): part is BodyPart => parts.includes(part as BodyPart)) : [],
      image: safeImage, source: 'authored' })
  }
  result.sort((a, b) => a.startSec - b.startSec)
  // Overlaps belong to the next cue at its activation time. Duplicate onsets are ambiguous.
  for (let index = 0; index < result.length - 1; index++) {
    if (result[index + 1].startSec === result[index].startSec) return []
    result[index].endSec = Math.min(result[index].endSec, result[index + 1].startSec)
  }
  return result
}
/** Timed practice phases are explicitly not recognized movement segments. */
export function practiceCues(samples: readonly ChartSample[], duration: number): ReferenceCue[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1200) return []
  return Array.from({ length: Math.ceil(duration / 2) }, (_, index): ReferenceCue | null => {
    const startSec = index * 2, endSec = Math.min(duration, startSec + 2)
    const middle = (startSec + endSec) / 2
    const sample = nearestReference(samples, middle)
    if (!sample || sample.t < startSec || sample.t > endSec) return null
    return { id: `practice-${index}`, startSec, endSec, referenceSec: sample?.t ?? middle,
      label: `Phase ${String(index + 1).padStart(2, '0')}`, parts: [], source: 'practice-phase' }
  }).filter((cue): cue is ReferenceCue => cue !== null)
}
export function nearestReference(samples: readonly ChartSample[], time: number): ChartSample | null {
  if (!samples.length || !Number.isFinite(time)) return null
  let low = 0, high = samples.length
  while (low < high) { const middle = (low + high) >>> 1; if (samples[middle].t < time) low = middle + 1; else high = middle }
  const before = samples[low - 1], after = samples[low]
  return !before ? after ?? null : !after || time - before.t <= after.t - time ? before : after
}
/** Legacy tuples are provider data; only the existing shared adapter maps numeric indices. */
export function referencePose(sample: ChartSample | null, aspect = 16 / 9): SkeletonPose | null {
  if (!sample) return null
  try {
    if (sample.canonicalFrame) return skeleton.constructPose(sample.canonicalFrame)
    const mapped = adapter.toFrame({ schemaVersion: 'mediapipe-style/1', timestampMs: Math.max(0, sample.t * 1000),
      timeline: { origin: 'video-start', id: 'presentation-legacy/1' }, space: 'normalized-image',
      imageSize: { width: 1000 * aspect, height: 1000 }, depth: 'omit', mirrored: false,
      landmarks: sample.landmarks.map((point) => point ? { x: point[0], y: point[1], visibility: point[3] ?? null } : null) })
    const frame: SkeletonFrame = { ...mapped, coordinates: { ...mapped.coordinates, origin: 'root-relative' } }
    return skeleton.constructPose(frame)
  } catch { return null }
}
