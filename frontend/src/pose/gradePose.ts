/** Scoring v2 entry point. Numeric provider indices belong in input adapters, not scoring. */
export { DanceScorer, buildReferenceTrack, extractPoseFeatures, comparePoses, scoringConfig } from '../scoring/index.js'
export type { ScoringConfig, ScoreSnapshot, Judgment, JudgmentLabel } from '../scoring/index.js'
