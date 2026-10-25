import type { SkeletonFrame } from '@ojustdance/skeleton'

export type BodyPart = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'torso'
export type Vector2 = readonly [number, number]
export interface PoseFeature {
  readonly part: BodyPart
  readonly kind: 'direction' | 'bend' | 'position'
  readonly value: readonly number[]
  readonly weight: number
  readonly quality: number | null
}
export interface FeaturePose {
  readonly features: Readonly<Record<string, PoseFeature>>
  readonly root: Vector2 | null
  readonly scale: number | null
  readonly continuity: string
}
export interface TimedPose {
  readonly timeSec: number
  readonly pose: FeaturePose | null
}
export interface ReferenceOpportunity extends TimedPose { readonly durationSec: number }
export interface ReferenceTrack {
  readonly schemaVersion: 'dance-score-reference/2'
  readonly durationSec: number
  readonly opportunities: readonly ReferenceOpportunity[]
  readonly scorableDurationSec: number
  readonly warnings: readonly string[]
}
export interface ScoringConfig {
  readonly schemaVersion: 'dance-scoring/3'
  readonly timingToleranceMs: number
  readonly sampleHz: number
  readonly blockSize: number
  readonly processingDeadlineMs: number
  readonly maximumSampleGapMs: number
  readonly minimumCoverage: number
  readonly comboWindowSec: number
  readonly motionWindowSec: number
}
export const DEFAULT_SCORING_CONFIG: ScoringConfig = Object.freeze({
  schemaVersion: 'dance-scoring/3', timingToleranceMs: 50, sampleHz: 20, blockSize: 4,
  processingDeadlineMs: 200, maximumSampleGapMs: 100, minimumCoverage: 0.65, comboWindowSec: 0.5,
  motionWindowSec: 0.2,
})
export function scoringConfig(options: Partial<ScoringConfig> = {}): ScoringConfig {
  const config = { ...DEFAULT_SCORING_CONFIG, ...options }
  if (config.schemaVersion !== 'dance-scoring/3' || !Number.isFinite(config.timingToleranceMs)
    || config.timingToleranceMs < 30 || config.timingToleranceMs > 70) throw new Error('Scoring timing tolerance must be 30–70 ms')
  if (config.sampleHz !== 20 || config.blockSize !== 4 || config.processingDeadlineMs !== 200
    || config.maximumSampleGapMs !== 100 || config.minimumCoverage !== 0.65 || config.comboWindowSec !== 0.5
    || config.motionWindowSec !== 0.2) throw new Error('Unsupported dance-scoring/3 policy; change its version before changing fixed scoring rules')
  return Object.freeze(config)
}
export type JudgmentLabel = '…' | 'PERFECT' | 'GOOD' | 'OK' | 'MISS' | 'TRACKING' | 'NO REFERENCE'
export interface PoseComparison {
  readonly status: 'scorable' | 'partial' | 'unavailable'
  readonly form: number
  readonly coverage: number
  readonly supportedParts: number
}
export interface Judgment {
  readonly timeSec: number
  readonly accuracy: number
  /** Awarded points still account for missing evidence; accuracy describes measured movement. */
  readonly pointCredit: number
  readonly form: number
  readonly motion: number | null
  readonly timing: number
  readonly coverage: number
  readonly offsetMs: number | null
  readonly label: JudgmentLabel
}
export interface ScoreSnapshot extends Judgment {
  readonly schemaVersion: 'dance-score/3'
  readonly score: number
  readonly maxScore: 10000
  readonly combo: number
  readonly maxCombo: number
  readonly averageAccuracy: number
  readonly trackingCoverage: number
  readonly judgedCoverage: number
  readonly trackingMisses: number
  readonly processedOpportunities: number
}
export interface PlayerObservation {
  readonly songTimeSec: number
  readonly receivedAtSongTimeSec: number
  readonly frame: SkeletonFrame | null
}
