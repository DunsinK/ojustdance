import type { ImageSize } from '@ojustdance/skeleton'
import type { ChartDocument } from '../pose/types.js'
import type { FeaturePose, PoseFeature, ReferenceTrack, ScoringConfig, TimedPose } from './contracts.js'
import { scoringConfig } from './contracts.js'
import { extractPoseFeatures, hasReferenceEvidence } from './features.js'
import { adaptLegacyChartSample } from './legacyChartAdapter.js'

export function interpolatePose(a: FeaturePose, b: FeaturePose, fraction: number): FeaturePose | null {
  if (a.continuity !== b.continuity) return null
  const features: Record<string, PoseFeature> = {}
  for (const [name, first] of Object.entries(a.features)) {
    const second = b.features[name]
    if (!second || first.kind !== second.kind) continue
    let value = first.value.map((item, index) => item + (second.value[index] - item) * fraction)
    if (first.kind === 'direction') {
      const length = Math.hypot(...value)
      if (length < 1e-6) continue
      value = value.map((item) => item / length)
    }
    features[name] = { ...first, value, quality: first.quality === null || second.quality === null ? null : Math.min(first.quality, second.quality) }
  }
  return { features, root: a.root && b.root ? [a.root[0] + (b.root[0] - a.root[0]) * fraction, a.root[1] + (b.root[1] - a.root[1]) * fraction] : null,
    scale: a.scale && b.scale ? a.scale + (b.scale - a.scale) * fraction : null, continuity: a.continuity }
}
/** No interpolation across gaps, invalid observations, clip boundaries, or coordinate changes. */
export function poseAtTime(nodes: readonly TimedPose[], timeSec: number, maximumGapSec = 0.1): FeaturePose | null {
  if (!nodes.length) return null
  let low = 0, high = nodes.length
  while (low < high) { const middle = (low + high) >>> 1; if (nodes[middle].timeSec < timeSec) low = middle + 1; else high = middle }
  const after = nodes[low], before = nodes[low - 1]
  if (after && Math.abs(after.timeSec - timeSec) < 1e-7) return after.pose
  if (!before || !after) {
    const edge = before ?? after
    return edge && Math.abs(edge.timeSec - timeSec) <= 0.015 ? edge.pose : null
  }
  const gap = after.timeSec - before.timeSec
  if (!before.pose || !after.pose || gap <= 0 || gap > maximumGapSec + 1e-7) return null
  return interpolatePose(before.pose, after.pose, (timeSec - before.timeSec) / gap)
}
export interface ReferenceOptions {
  readonly imageSize?: ImageSize
  readonly timeline?: 'chart' | 'source-video'
  readonly durationSec?: number
  readonly reflectDance?: boolean
  readonly config?: Partial<ScoringConfig>
}
export function buildReferenceTrack(chart: ChartDocument, options: ReferenceOptions = {}): ReferenceTrack {
  const config = scoringConfig(options.config)
  const durationSec = options.durationSec ?? chart.durationSec
  // Product target is ~10–20s battles; hard cap ~90s (~1,350 samples @ 15 Hz).
  const maxDurationSec = 90
  const maxSamples = 1350
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > maxDurationSec || chart.samples.length > maxSamples) {
    throw new Error(`Scoring requires a finite reference up to ${maxDurationSec}s / ${maxSamples.toLocaleString()} samples (aim for 10–20s)`)
  }
  const warnings = new Set<string>()
  const nodes: TimedPose[] = chart.samples.map((sample) => {
    const timeSec = options.timeline === 'source-video' ? sample.sourceTimeSec ?? sample.t : sample.t
    if (!Number.isFinite(timeSec) || timeSec < 0) throw new Error('Invalid reference song timestamp')
    let pose: FeaturePose | null = null
    try {
      const frame = sample.canonicalFrame ?? (options.imageSize ? adaptLegacyChartSample(sample, options.imageSize) : null)
      if (!sample.canonicalFrame) warnings.add(options.imageSize ? 'Legacy reference: aspect-corrected XY, scene travel unavailable.' : 'This older chart needs its reference video or a fresh import for accurate scoring.')
      if (frame) {
        const extracted = extractPoseFeatures(frame, options.reflectDance)
        const segment = chart.segments.find((entry) => sample.t >= entry.startSec && sample.t <= entry.endSec)
        pose = hasReferenceEvidence(extracted) ? { ...extracted, continuity: extracted.continuity + ':' + (segment?.id ?? 'chart') } : null
      }
    } catch { warnings.add('Some reference observations are unusable and are excluded from scoring.') }
    return { timeSec, pose }
  }).sort((a, b) => a.timeSec - b.timeSec)
  // Duplicate source times are ambiguous; do not silently select a different clip.
  for (let index = 1; index < nodes.length; index++) if (nodes[index].timeSec === nodes[index - 1].timeSec) {
    nodes[index] = { ...nodes[index], pose: null }; nodes[index - 1] = { ...nodes[index - 1], pose: null }
  }
  const opportunities = Array.from({ length: Math.ceil(durationSec * config.sampleHz) }, (_, index) => {
    const start = index / config.sampleHz, duration = Math.min(1 / config.sampleHz, durationSec - start)
    return { timeSec: start + duration / 2, durationSec: duration, pose: poseAtTime(nodes, start + duration / 2, config.maximumSampleGapMs / 1000) }
  })
  return { schemaVersion: 'dance-score-reference/2', durationSec, opportunities,
    scorableDurationSec: opportunities.reduce((sum, point) => sum + (hasReferenceEvidence(point.pose) ? point.durationSec : 0), 0), warnings: [...warnings] }
}
