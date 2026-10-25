import type { ChartDocument } from '../pose/types.js'
import type { PlayerObservation, ScoreSnapshot, ScoringConfig } from '../scoring/contracts.js'
import type { ReferenceOptions } from '../scoring/referenceTrack.js'

export const ATTEMPT_LIMITS = Object.freeze({ bytes: 128 * 1024 * 1024, events: 250_000, observations: 75_000, trace: 25_000 })
// Historical policies/results are data. Never validate them against today's fixed scoring rules.
export type SavedPolicy = Omit<ScoringConfig, 'schemaVersion' | 'motionWindowSec'> & { readonly schemaVersion: string; readonly motionWindowSec?: number }
type NewScoreFields = 'pointCredit' | 'motion' | 'trackingCoverage' | 'judgedCoverage'
export type SavedScore = Omit<ScoreSnapshot, 'schemaVersion' | 'maxScore' | NewScoreFields>
  & Partial<Pick<ScoreSnapshot, NewScoreFields>> & { readonly schemaVersion: string; readonly maxScore: number }
export interface ScoreTracePoint { readonly songTimeSec: number; readonly result: SavedScore }
export type AttemptEvent =
  | { readonly kind: 'observation'; readonly observation: PlayerObservation; readonly originallyAccepted: boolean }
  | { readonly kind: 'advance'; readonly songTimeSec: number }
  | { readonly kind: 'finish'; readonly songTimeSec: number }

export interface RecordedAttempt {
  readonly schemaVersion: 'dance-attempt/1'
  readonly id: string
  readonly createdAt: string
  readonly mode: 'solo' | 'battle'
  readonly recordingStatus: 'complete' | 'limit-exceeded'
  readonly reference: {
    readonly chart: ChartDocument
    readonly options: Omit<ReferenceOptions, 'config'>
  }
  readonly events: readonly AttemptEvent[]
  readonly original: {
    readonly implementationId: string
    readonly policy: SavedPolicy
    readonly result: SavedScore
    readonly trace: readonly ScoreTracePoint[]
  }
}
export interface AttemptEvaluation {
  readonly schemaVersion: 'dance-attempt-evaluation/1'
  readonly id: string
  readonly attemptId: string
  readonly createdAt: string
  readonly label: string
  readonly implementationId: string
  readonly policy: SavedPolicy
  readonly result: SavedScore
  readonly trace: readonly ScoreTracePoint[]
}
export interface AttemptSummary {
  readonly id: string
  readonly createdAt: string
  readonly title: string
  readonly score: number
  readonly maxScore: number
  readonly durationSec: number
  readonly observations: number
  readonly recordingStatus: RecordedAttempt['recordingStatus']
}
