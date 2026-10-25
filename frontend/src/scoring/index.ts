export { DanceScorer } from './DanceScorer.js'
export { buildReferenceTrack, poseAtTime } from './referenceTrack.js'
export { extractPoseFeatures } from './features.js'
export { comparePoses, compareMotion } from './similarity.js'
export { DEFAULT_SCORING_CONFIG, scoringConfig } from './contracts.js'
export type {
  BodyPart, PoseFeature, FeaturePose, TimedPose, ReferenceOpportunity, ReferenceTrack,
  ScoringConfig, ScoreSnapshot, Judgment, JudgmentLabel, PlayerObservation, PoseComparison,
} from './contracts.js'
