import type { Judgment, PerformanceEvent, PerformanceState, ReferenceCue } from './contracts.js'

export const emptyPerformance = (): PerformanceState => ({ score: 0, combo: 0, maxCombo: 0, quality: 0, coverage: 0,
  accuracy: 0, currentId: null, progress: 0, judged: 0, trackingValid: false, lastJudgment: null })
interface Measurement { timeSec: number; quality: number; trackingValid: boolean }
interface Accumulator { cue: ReferenceCue; observed: number; matched: number; bins: number[]; binQuality: number[] }
/** Presentation policy v1: aggregate measured scorer quality once per reference interval.
 * Replace this quality adapter with the scoring branch's accepted move results later.
 * No move recognition, Muse schema, hidden-joint interpolation, or fake opponent events. */
export class PerformanceDirector {
  private state = emptyPerformance()
  private active: Accumulator | null = null
  private lastTime = 0
  private finished = false
  private judged = new Set<string>()
  private totalMeasured = 0
  private totalMatched = 0
  private totalEligible: number
  private leader: 'you' | 'rival' | null = null
  private sequence = 0
  private runId: string
  private cues: readonly ReferenceCue[]
  private budgets = new Map<string, number>()
  constructor(runId: string, cues: readonly ReferenceCue[]) {
    const ids = new Set<string>()
    for (let index = 0; index < cues.length; index++) {
      const cue = cues[index]
      if (!cue.id || ids.has(cue.id) || !Number.isFinite(cue.startSec) || !Number.isFinite(cue.endSec)
        || cue.startSec < 0 || cue.endSec <= cue.startSec || (index && cue.startSec < cues[index - 1].endSec)) throw new Error('Reference intervals must be finite, ordered, nonoverlapping, and uniquely named')
      ids.add(cue.id)
    }
    this.runId = runId; this.cues = cues.map((cue) => ({ ...cue, parts: [...cue.parts] }))
    this.totalEligible = cues.reduce((sum, cue) => sum + cue.endSec - cue.startSec, 0)
    let elapsed = 0
    for (const cue of cues) {
      const before = Math.round(10000 * elapsed / this.totalEligible)
      elapsed += cue.endSec - cue.startSec
      this.budgets.set(cue.id, Math.round(10000 * elapsed / this.totalEligible) - before)
    }
  }
  snapshot(): PerformanceState { return { ...this.state } }
  advance(input: Measurement): PerformanceEvent[] {
    const events: PerformanceEvent[] = []
    if (this.finished || !Number.isFinite(input.timeSec) || input.timeSec <= this.lastTime) return events
    const dt = input.timeSec - this.lastTime
    if (dt > 0.75) { this.seek(input.timeSec); return events }
    const quality = Number.isFinite(input.quality) ? Math.max(0, Math.min(1, input.quality)) : 0
    for (const cue of this.cues.filter((cue) => cue.startSec < input.timeSec && cue.endSec > this.lastTime && !this.judged.has(cue.id))) {
      if (!this.active) {
        this.active = { cue, observed: 0, matched: 0, bins: [0, 0, 0], binQuality: [0, 0, 0] }
        events.push({ type: 'moveStarted', id: `${this.runId}:${cue.id}:start`, moveId: cue.id })
      }
      const start = Math.max(this.lastTime, cue.startSec), end = Math.min(input.timeSec, cue.endSec)
      const weight = Math.max(0, end - start)
      if (input.trackingValid && dt <= 0.15 && weight > 0) {
        this.active.observed += weight; this.active.matched += quality * weight
        for (let bin = 0; bin < 3; bin++) {
          const binStart = cue.startSec + (cue.endSec - cue.startSec) * bin / 3
          const binEnd = cue.startSec + (cue.endSec - cue.startSec) * (bin + 1) / 3
          const overlap = Math.max(0, Math.min(end, binEnd) - Math.max(start, binStart))
          this.active.bins[bin] += overlap; this.active.binQuality[bin] += quality * overlap
        }
      }
      if (input.timeSec >= cue.endSec - 1e-7) this.finalize(events)
    }
    this.lastTime = input.timeSec
    const cue = this.cues.find((cue) => input.timeSec >= cue.startSec && input.timeSec < cue.endSec && !this.judged.has(cue.id))
    if (cue && !this.active) {
      this.active = { cue, observed: 0, matched: 0, bins: [0, 0, 0], binQuality: [0, 0, 0] }
      events.push({ type: 'moveStarted', id: `${this.runId}:${cue.id}:start`, moveId: cue.id })
    }
    this.state.currentId = cue?.id ?? null
    this.state.progress = cue ? (input.timeSec - cue.startSec) / (cue.endSec - cue.startSec) : 0
    this.state.quality = quality; this.state.trackingValid = input.trackingValid
    if (cue) events.push({ type: 'moveProgress', id: `${this.runId}:${++this.sequence}:progress`, moveId: cue.id,
      progress: this.state.progress, quality, trackingValid: input.trackingValid })
    return events
  }
  /** Backwards seeks never replay grades; forward jumps silently discard skipped intervals. */
  seek(timeSec: number) {
    if (!Number.isFinite(timeSec) || timeSec < 0) return
    if (this.active) this.judged.add(this.active.cue.id)
    for (const cue of this.cues) if (cue.startSec < timeSec) this.judged.add(cue.id)
    this.active = null; this.lastTime = timeSec; this.state.currentId = null; this.state.progress = 0
  }
  updateLeader(rivalScore: number): PerformanceEvent[] {
    if (this.finished || !Number.isFinite(rivalScore) || Math.abs(this.state.score - rivalScore) < 20) return []
    const playerId = this.state.score > rivalScore ? 'you' : 'rival'
    if (playerId === this.leader) return []
    const previous = this.leader; this.leader = playerId
    return previous ? [{ type: 'leadChanged', id: `${this.runId}:lead:${++this.sequence}`, playerId }] : []
  }
  finish(timeSec: number): PerformanceEvent[] {
    if (this.finished) return []
    const events: PerformanceEvent[] = []
    // An early exit cannot claim the unobserved remainder or an unfinished phase.
    if (this.active && timeSec >= this.active.cue.endSec - 0.03) this.finalize(events)
    this.finished = true
    events.push({ type: 'roundFinished', id: `${this.runId}:finish`, score: this.state.score, maxCombo: this.state.maxCombo, accuracy: this.state.accuracy })
    return events
  }
  private finalize(events: PerformanceEvent[]) {
    const active = this.active
    if (!active || this.judged.has(active.cue.id)) return
    this.judged.add(active.cue.id)
    const duration = active.cue.endSec - active.cue.startSec
    const coverage = Math.min(1, active.observed / duration)
    const quality = active.observed ? Math.min(1, active.matched / active.observed) : 0
    const completed = active.bins.every((weight, index) => weight >= duration / 3 * 0.65 && active.binQuality[index] / weight >= 0.65)
    const grade: Judgment = coverage < 0.65 ? 'TRACKING' : quality >= 0.85 && coverage >= 0.85 && completed
      ? 'PERFECT' : quality >= 0.65 ? 'GOOD' : quality >= 0.45 ? 'OK' : 'MISS'
    const points = grade === 'MISS' || grade === 'TRACKING' || !this.totalEligible ? 0
      : Math.round((this.budgets.get(active.cue.id) ?? 0) * quality * coverage)
    const previousCombo = this.state.combo
    this.state.score = Math.min(10000, this.state.score + points)
    this.state.combo = grade === 'GOOD' || grade === 'PERFECT' ? previousCombo + 1 : 0
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
    this.totalMeasured += grade === 'TRACKING' ? 0 : active.observed
    this.totalMatched += grade === 'TRACKING' ? 0 : active.matched
    this.state.accuracy = this.totalMeasured ? this.totalMatched / this.totalMeasured : 0
    this.state.coverage = coverage; this.state.judged++
    const judgment: Extract<PerformanceEvent, { type: 'moveJudged' }> = {
      type: 'moveJudged', id: `${this.runId}:${active.cue.id}:judged`, moveId: active.cue.id, grade, points, quality, coverage, completed,
    }
    this.state.lastJudgment = judgment; events.push(judgment)
    if (previousCombo !== this.state.combo) events.push({ type: 'comboChanged', id: `${judgment.id}:combo`, count: this.state.combo, lost: previousCombo > 0 && !this.state.combo })
    if ([5, 10, 20].includes(this.state.combo) && this.state.combo > previousCombo) events.push({ type: 'comboMilestone', id: `${judgment.id}:milestone`, count: this.state.combo })
    this.active = null
  }
}
