import type { CanonicalMotionSample, MotionThumbnails } from './contracts.js'
import { evaluateMotionSelection } from './selectKeyframes.js'

/** Reproducible local diagnostic input. Images and temporary media URLs are excluded. */
export function buildSelectionReview(samples: readonly CanonicalMotionSample[], track: MotionThumbnails) {
  return {
    schemaVersion: 'motion-selection-review/1' as const,
    samples,
    selection: { ...track, frames: {} },
    diagnostics: evaluateMotionSelection(samples, track),
  }
}
