import type { ChartDocument } from '../pose/types.js'
import type { PlayerObservation, ScoreSnapshot, ScoringConfig } from '../scoring/contracts.js'
import type { ReferenceOptions } from '../scoring/referenceTrack.js'
import { ATTEMPT_LIMITS } from './contracts.js'
import type { AttemptEvent, RecordedAttempt, ScoreTracePoint } from './contracts.js'
import { encodeAttemptData } from './serialization.js'

/** Records scorer calls, not video. Call order and delivery times are part of the experiment. */
export class AttemptRecorder {
  private events: AttemptEvent[] = []
  private trace: ScoreTracePoint[] = []
  private observationCount = 0
  private bytes = 0
  private exceeded = false
  private sealed: RecordedAttempt | null = null
  private readonly reference: RecordedAttempt['reference']
  private readonly policy: ScoringConfig
  private readonly metadata: { id: string; createdAt: string; mode: 'solo' | 'battle'; implementationId: string }

  constructor(metadata: { id: string; createdAt: string; mode: 'solo' | 'battle'; implementationId: string },
    chart: ChartDocument, options: Omit<ReferenceOptions, 'config'>, policy: ScoringConfig) {
    this.metadata = { ...metadata }
    // Images/object URLs are unrelated to scoring and must not become recording dependencies.
    const { motionThumbnails: _thumbnails, ...scoringChart } = chart
    void _thumbnails
    this.reference = structuredClone({ chart: scoringChart, options })
    this.policy = structuredClone(policy)
    this.bytes = encodeAttemptData(this.reference).length
  }
  observe(observation: PlayerObservation, originallyAccepted: boolean) {
    this.append({ kind: 'observation', observation, originallyAccepted })
  }
  advance(songTimeSec: number, result: ScoreSnapshot) {
    if (this.sealed) return
    this.append({ kind: 'advance', songTimeSec })
    if (this.trace.at(-1)?.result.processedOpportunities !== result.processedOpportunities) this.addTrace(songTimeSec, result)
  }
  finish(songTimeSec: number, result: ScoreSnapshot): RecordedAttempt {
    if (this.sealed) return structuredClone(this.sealed)
    this.append({ kind: 'finish', songTimeSec })
    this.addTrace(songTimeSec, result)
    this.sealed = {
      schemaVersion: 'dance-attempt/1', id: this.metadata.id, createdAt: this.metadata.createdAt, mode: this.metadata.mode,
      recordingStatus: this.exceeded ? 'limit-exceeded' : 'complete', reference: this.reference, events: this.events,
      original: { implementationId: this.metadata.implementationId, policy: this.policy, result: structuredClone(result), trace: this.trace },
    }
    return structuredClone(this.sealed)
  }
  private addTrace(songTimeSec: number, result: ScoreSnapshot) {
    if (this.trace.length < ATTEMPT_LIMITS.trace) this.trace.push({ songTimeSec: Math.min(songTimeSec, this.reference.options.durationSec ?? this.reference.chart.durationSec), result: structuredClone(result) })
  }
  private append(event: AttemptEvent) {
    if (this.sealed || this.exceeded) return
    const length = encodeAttemptData(event).length
    if (this.events.length >= ATTEMPT_LIMITS.events - 1 || this.bytes + length > ATTEMPT_LIMITS.bytes * 0.85
      || (event.kind === 'observation' && this.observationCount >= ATTEMPT_LIMITS.observations)) { this.exceeded = true; return }
    this.events.push(structuredClone(event)); this.bytes += length
    if (event.kind === 'observation') this.observationCount++
  }
}
