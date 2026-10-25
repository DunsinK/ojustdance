import type { MotionThumbnails } from './contracts.js'
import { CURRENT_SELECTION_ALGORITHM, CURRENT_THUMBNAIL_ASSETS, THUMBNAIL_LIMITS } from './contracts.js'
const PARTS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'torso', 'travel']
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}
function finite(value: unknown, name: string, minimum: number = 0, maximum: number = THUMBNAIL_LIMITS.sourceDurationSec): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} is outside the supported range`)
  return value
}
export function validateMotionThumbnails(value: unknown, requireImages = true): asserts value is MotionThumbnails {
  const data = object(value, 'motion thumbnails')
  if (data.schemaVersion !== 'motion-thumbnails/1' || !['canonical-pose-events/1', 'canonical-pose-events/2', 'canonical-pose-events/3', CURRENT_SELECTION_ALGORITHM].includes(String(data.algorithm)) || data.clock !== 'reference-video-seconds') throw new Error('Unsupported motion thumbnail schema, algorithm, or clock')
  if (data.assetVersion !== undefined && !['source-resolution-still/1', CURRENT_THUMBNAIL_ASSETS].includes(String(data.assetVersion))) throw new Error('Unsupported thumbnail asset version')
  finite(data.sourceWidth, 'source width', 0, 16384); finite(data.sourceHeight, 'source height', 0, 16384)
  if (!Array.isArray(data.cues) || data.cues.length > THUMBNAIL_LIMITS.cues) throw new Error('Motion cue cache exceeds its bounded size')
  if (data.appearance !== undefined) {
    const appearance = object(data.appearance, 'thumbnail appearance')
    if (appearance.version !== 'person-cutout/1' || !['removed', 'original'].includes(String(appearance.background)) || typeof appearance.centered !== 'boolean') throw new Error('Unsupported thumbnail appearance')
  }
  const appearance = data.appearance as { background: string; centered: boolean } | undefined
  const frames = object(data.frames, 'thumbnail frames')
  if (Object.keys(frames).length > THUMBNAIL_LIMITS.cues * 2) throw new Error('Too many cached thumbnail images')
  let totalChars = 0
  for (const [id, value] of Object.entries(frames)) {
    if (!/^frame-\d+(?:-view-\d+)?$/.test(id)) throw new Error('Invalid thumbnail frame ID')
    const image = object(value, 'thumbnail image')
    finite(image.sourceTimeSec, 'image timestamp')
    finite(image.width, 'thumbnail width', 1, THUMBNAIL_LIMITS.imageWidth)
    finite(image.height, 'thumbnail height', 1, THUMBNAIL_LIMITS.imageHeight)
    if (typeof image.dataUrl !== 'string' || image.dataUrl.length > THUMBNAIL_LIMITS.encodedImageChars || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl)) throw new Error('Thumbnails must be bounded, embedded JPEG/PNG/WebP images')
    if (image.background !== undefined && !['removed', 'original'].includes(String(image.background))) throw new Error('Invalid per-image background appearance')
    if (image.centered !== undefined && typeof image.centered !== 'boolean') throw new Error('Invalid per-image centering appearance')
    const background = image.background ?? appearance?.background
    const centered = image.centered ?? appearance?.centered
    if (background === 'removed' && !/^data:image\/(png|webp);base64,/.test(image.dataUrl)) throw new Error('Background-removed thumbnails require an alpha-capable image format')
    if (centered && !['hip-midpoint', 'torso-average', 'mask-centroid'].includes(String(image.centerMethod))) throw new Error('Centered thumbnails must declare their center anchor')
    totalChars += image.dataUrl.length
  }
  if (totalChars > THUMBNAIL_LIMITS.metadataChars) throw new Error('Thumbnail images exceed the 24 MB cache budget; use a shorter reference clip')
  if (data.preparation !== undefined) {
    const report = object(data.preparation, 'thumbnail preparation report')
    if (report.schemaVersion !== 'thumbnail-preparation/1') throw new Error('Unsupported thumbnail preparation report')
    const count = (key: string) => {
      const value = finite(report[key], key, 0, THUMBNAIL_LIMITS.cues)
      if (!Number.isInteger(value)) throw new Error('Preparation counts must be integers')
      return value
    }
    const requested = count('requestedCueCount'), skipped = count('skippedCueCount')
    const fallback = count('fallbackCueCount'), recovered = count('recoveredCueCount')
    if (requested - skipped !== data.cues.length || fallback + recovered > data.cues.length) throw new Error('Preparation counts do not match the saved cues')
    if (!Array.isArray(report.issues) || report.issues.length !== skipped + fallback + recovered) throw new Error('Invalid preparation issue count')
    const seen = new Set<string>(), outcomes = { skipped: 0, fallback: 0, recovered: 0 }
    for (const entry of report.issues) {
      const issue = object(entry, 'thumbnail preparation issue')
      if (typeof issue.cueId !== 'string' || !/^motion-\d+-\d+$/.test(issue.cueId) || seen.has(issue.cueId)) throw new Error('Invalid preparation cue reference')
      seen.add(issue.cueId)
      finite(issue.sourceTimeSec, 'preparation timestamp')
      if (!['skipped', 'fallback', 'recovered'].includes(String(issue.outcome)) || !['person-unavailable', 'segmentation-unavailable', 'frame-unavailable', 'image-budget', 'neighbor-frame'].includes(String(issue.reason))) throw new Error('Invalid preparation issue status')
      outcomes[issue.outcome as keyof typeof outcomes]++
    }
    if (outcomes.skipped !== skipped || outcomes.fallback !== fallback || outcomes.recovered !== recovered) throw new Error('Preparation outcomes do not match their counts')
  }
  const ids = new Set<string>()
  let previous = -Infinity
  for (const value of data.cues) {
    const cue = object(value, 'motion cue')
    if (typeof cue.id !== 'string' || !/^motion-\d+-\d+$/.test(cue.id) || ids.has(cue.id)) throw new Error('Motion cue IDs must be stable and unique')
    ids.add(cue.id)
    const start = finite(cue.startTimeSec, 'cue activation'), end = finite(cue.endTimeSec, 'cue end')
    if (end <= start || start <= previous) throw new Error('Motion cues must be chronological and have positive durations')
    previous = start
    finite(cue.thumbnailTimeSec, 'representative frame', start, Math.min(THUMBNAIL_LIMITS.sourceDurationSec, end + 0.2))
    if (!Array.isArray(cue.parts) || !cue.parts.length || cue.parts.some((part) => !PARTS.includes(part)) || new Set(cue.parts).size !== cue.parts.length) throw new Error('Invalid motion body-part groups')
    if (!['pose', 'pair'].includes(String(cue.presentation)) || !Array.isArray(cue.frameIds) || cue.frameIds.length !== (cue.presentation === 'pair' ? 2 : 1)) throw new Error('Invalid motion thumbnail presentation')
    if ((data.algorithm === CURRENT_SELECTION_ALGORITHM || data.assetVersion === CURRENT_THUMBNAIL_ASSETS) && cue.presentation !== 'pose') throw new Error('Current thumbnails must contain one still image per cue')
    let previousImageTime = -Infinity
    for (const id of cue.frameIds) {
      if (typeof id !== 'string' || !/^frame-\d+(?:-view-\d+)?$/.test(id)) throw new Error('Invalid image reference')
      if (requireImages && !Object.hasOwn(frames, id)) throw new Error(`Missing cached image ${id}`)
      if (Object.hasOwn(frames, id)) {
        const imageTime = (frames[id] as { sourceTimeSec: number }).sourceTimeSec
        if (imageTime < start - 0.001 || imageTime > end + 0.201 || imageTime <= previousImageTime) throw new Error('Thumbnail frames must be chronological and belong to the motion interval')
        previousImageTime = imageTime
      }
    }
    if (!Array.isArray(cue.candidateTimesSec) || !cue.candidateTimesSec.length || cue.candidateTimesSec.length > 3) throw new Error('Invalid thumbnail candidate budget')
    for (const seconds of cue.candidateTimesSec) finite(seconds, 'candidate time', start, Math.min(THUMBNAIL_LIMITS.sourceDurationSec, end + 0.2))
  }
}
