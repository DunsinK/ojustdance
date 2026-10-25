import type { TimelineSegment } from '../pose/types.js'
import type { CanonicalMotionSample } from './contracts.js'

export function canonicalMotionSamples(segments: readonly TimelineSegment[]): CanonicalMotionSample[] {
  return segments.flatMap((segment) => segment.samples.flatMap((sample) => sample.canonicalFrame ? [{
    chartTimeSec: sample.t, sourceTimeSec: sample.sourceTimeSec ?? sample.t,
    segmentId: segment.id, frame: sample.canonicalFrame,
  }] : []))
}
