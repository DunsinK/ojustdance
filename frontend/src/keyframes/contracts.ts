import type { SkeletonFrame } from '@ojustdance/skeleton'

export const CURRENT_SELECTION_ALGORITHM = 'canonical-pose-events/4' as const
export const CURRENT_THUMBNAIL_ASSETS = 'source-resolution-still/2' as const
export const MINIMUM_TARGET_SPACING_SEC = 0.25

/** All queue times refer to the ORIGINAL preview video's clock, in seconds. */
export type MotionPart = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'torso' | 'travel'
export interface CanonicalMotionSample {
  chartTimeSec: number
  sourceTimeSec: number
  segmentId: string
  frame: SkeletonFrame
}
export interface MotionThumbnailCue {
  id: string
  startTimeSec: number
  endTimeSec: number
  thumbnailTimeSec: number
  // Pair is retained for importing old charts; new cues always contain one still.
  presentation: 'pose' | 'pair'
  frameIds: string[]
  parts: MotionPart[]
  // Bounded neighboring measured frames from which the sharpest thumbnail is selected.
  candidateTimesSec: number[]
}
export interface ThumbnailAppearance {
  version: 'person-cutout/1'
  background: 'removed' | 'original'
  centered: boolean
}
export const DEFAULT_THUMBNAIL_APPEARANCE: Readonly<ThumbnailAppearance> = Object.freeze({
  version: 'person-cutout/1', background: 'removed', centered: true,
})
export function matchesThumbnailAppearance(track: MotionThumbnails, appearance: ThumbnailAppearance): boolean {
  const actual = track.appearance
  return actual ? actual.version === appearance.version && actual.background === appearance.background && actual.centered === appearance.centered
    : appearance.background === 'original' && !appearance.centered
}
export interface ThumbnailImage {
  sourceTimeSec: number
  width: number
  height: number
  dataUrl: string
  centerMethod?: 'hip-midpoint' | 'torso-average' | 'mask-centroid'
  // Actual per-image appearance can differ when mask generation needs a fallback.
  background?: 'removed' | 'original'
  centered?: boolean
}
export type ThumbnailIssueReason = 'person-unavailable' | 'segmentation-unavailable' | 'frame-unavailable' | 'image-budget' | 'neighbor-frame'
export interface ThumbnailPreparationReport {
  schemaVersion: 'thumbnail-preparation/1'
  requestedCueCount: number
  skippedCueCount: number
  fallbackCueCount: number
  recoveredCueCount: number
  issues: { cueId: string; sourceTimeSec: number; outcome: 'skipped' | 'fallback' | 'recovered'; reason: ThumbnailIssueReason }[]
}
export interface MotionThumbnails {
  schemaVersion: 'motion-thumbnails/1'
  algorithm: 'canonical-pose-events/1' | 'canonical-pose-events/2' | 'canonical-pose-events/3' | typeof CURRENT_SELECTION_ALGORITHM
  clock: 'reference-video-seconds'
  appearance?: ThumbnailAppearance
  assetVersion?: 'source-resolution-still/1' | typeof CURRENT_THUMBNAIL_ASSETS
  preparation?: ThumbnailPreparationReport
  sourceWidth: number
  sourceHeight: number
  cues: MotionThumbnailCue[]
  frames: Record<string, ThumbnailImage>
}
export const THUMBNAIL_LIMITS = Object.freeze({ cues: 256, samples: 18000, sourceDurationSec: 1200, imageWidth: 576, imageHeight: 432, centeredWidth: 384, centeredHeight: 432, encodedImageChars: 256000, metadataChars: 24 * 1024 * 1024 })
export function isCurrentThumbnailTrack(track: MotionThumbnails): boolean {
  return track.algorithm === CURRENT_SELECTION_ALGORITHM && track.assetVersion === CURRENT_THUMBNAIL_ASSETS
    && track.cues.every((cue) => cue.presentation === 'pose' && cue.frameIds.length === 1)
}
export function frameId(seconds: number): string { return `frame-${Math.round(seconds * 1000000)}` }
