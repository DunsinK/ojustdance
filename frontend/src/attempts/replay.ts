import { DanceScorer } from '../scoring/DanceScorer.js'
import { scoringConfig } from '../scoring/contracts.js'
import type { ScoringConfig } from '../scoring/contracts.js'
import { buildReferenceTrack } from '../scoring/referenceTrack.js'
import type { AttemptEvaluation, RecordedAttempt, ScoreTracePoint } from './contracts.js'
import { validateAttempt } from './validation.js'

export interface ReplayOptions {
  readonly id: string
  readonly createdAt: string
  readonly implementationId: string
  readonly label: string
  readonly timingToleranceMs?: number
  readonly signal?: AbortSignal
  readonly onProgress?: (fraction: number) => void
  readonly yieldToUI?: () => Promise<void>
}
export async function replayAttempt(attempt: RecordedAttempt, options: ReplayOptions): Promise<AttemptEvaluation> {
  validateAttempt(attempt)
  if (attempt.recordingStatus !== 'complete') throw new Error('This recording reached its limit; its original score is saved, but the full performance cannot be replayed')
  const config: ScoringConfig = scoringConfig({ timingToleranceMs: options.timingToleranceMs ?? attempt.original.policy.timingToleranceMs })
  const scorer = new DanceScorer(buildReferenceTrack(attempt.reference.chart, { ...attempt.reference.options, config }), config)
  const trace: ScoreTracePoint[] = []
  let result = scorer.snapshot()
  const checkpoint = (songTimeSec: number, force = false) => {
    if (force || trace.at(-1)?.result.processedOpportunities !== result.processedOpportunities) {
      trace.push({ songTimeSec: Math.min(songTimeSec, scorer.reference.durationSec), result: structuredClone(result) })
    }
  }
  for (let index = 0; index < attempt.events.length; index++) {
    options.signal?.throwIfAborted()
    const event = attempt.events[index]
    if (event.kind === 'observation') scorer.addObservation(event.observation)
    else if (event.kind === 'advance') { result = scorer.advance(event.songTimeSec); checkpoint(event.songTimeSec) }
    else { result = scorer.finish(event.songTimeSec); checkpoint(event.songTimeSec, true) }
    if (index % 256 === 0) {
      options.onProgress?.(index / attempt.events.length)
      await options.yieldToUI?.()
    }
  }
  options.signal?.throwIfAborted()
  options.onProgress?.(1)
  return { schemaVersion: 'dance-attempt-evaluation/1', id: options.id, attemptId: attempt.id, createdAt: options.createdAt,
    label: options.label.trim() || 'Current algorithm', implementationId: options.implementationId, policy: config, result, trace }
}
