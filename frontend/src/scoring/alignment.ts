import type { FeaturePose, Judgment, ReferenceOpportunity, ScoringConfig, TimedPose } from './contracts.js'
import { hasReferenceEvidence } from './features.js'
import { poseAtTime } from './referenceTrack.js'
import { comparePoses } from './similarity.js'
import { compareMotionWindow } from './motionWindow.js'

export interface AlignmentAnchor { readonly reference: FeaturePose; readonly player: FeaturePose | null; readonly playerTimeSec: number; readonly referenceTimeSec: number }
export interface AlignedJudgment { readonly judgment: Judgment; readonly anchor: AlignmentAnchor | null }
interface Cell { cost: number; parent: number; judgment: Judgment; pose: FeaturePose | null; playerTimeSec: number }

function offsets(toleranceMs: number): number[] {
  const values = new Set([0, -toleranceMs, toleranceMs])
  for (let value = 10; value < toleranceMs; value += 10) { values.add(value); values.add(-value) }
  return [...values].sort((a, b) => a - b)
}
/** Blockwise, band-constrained dynamic programming. No unlimited frame repetition or global time shift. */
export function alignBlock(reference: readonly ReferenceOpportunity[], live: readonly TimedPose[], config: ScoringConfig,
  anchor: AlignmentAnchor | null, history: readonly TimedPose[] = []): AlignedJudgment[] {
  if (!reference.length) return []
  const lags = offsets(config.timingToleranceMs), rows: Cell[][] = []
  const motionReference = [...history, ...reference]
  for (let index = 0; index < reference.length; index++) {
    const target = reference[index]
    const row = lags.map((lag): Cell => {
      const playerTimeSec = target.timeSec + lag / 1000
      const pose = poseAtTime(live, playerTimeSec, config.maximumSampleGapMs / 1000)
      const motion = compareMotionWindow(motionReference, live, target.timeSec, lag / 1000, config.motionWindowSec, config.maximumSampleGapMs / 1000)
      const grade = target.pose ? comparePoses(pose, target.pose, config.minimumCoverage, motion.activeParts) : null
      const timing = motion.active ? Math.max(0.5, 1 - 0.5 * (Math.abs(lag) / config.timingToleranceMs) ** 2) : 1
      const available = grade && grade.status !== 'unavailable'
      // Unknown motion is not a failed movement. Points independently account for missing evidence.
      const pointCredit = available ? motion.active
        ? 0.55 * grade.coverage * grade.form + 0.3 * motion.similarity * motion.coverage + 0.15 * timing * grade.coverage
        : grade.coverage * grade.form : 0
      const measuredWeight = motion.active ? 0.7 * (grade?.coverage ?? 0) + 0.3 * motion.coverage : grade?.coverage ?? 0
      const accuracy = available && measuredWeight > 0 ? pointCredit / measuredWeight : 0
      const label = !target.pose ? 'NO REFERENCE' : !available ? 'TRACKING'
        : accuracy >= 0.9 && grade.coverage >= 0.95 && (!motion.active || motion.coverage >= 0.8) && Math.abs(lag) <= 30
          ? 'PERFECT' : accuracy >= 0.7 ? 'GOOD' : accuracy >= 0.45 ? 'OK' : 'MISS'
      const judgment: Judgment = { timeSec: target.timeSec, accuracy, pointCredit, form: grade?.form ?? 0,
        motion: motion.active && motion.coverage > 0 ? motion.similarity : null, timing, coverage: grade?.coverage ?? 0,
        offsetMs: motion.active && available ? lag : null, label }
      let best: Cell | null = null
      for (let previousIndex = 0; previousIndex < (index ? rows[index - 1].length : 1); previousIndex++) {
        const previous = index ? rows[index - 1][previousIndex] : null
        const priorAnchor = index ? null : anchor
        const previousTime = previous?.playerTimeSec ?? priorAnchor?.playerTimeSec
        const previousReferenceTime = index ? reference[index - 1].timeSec : priorAnchor?.referenceTimeSec
        if (previousTime !== undefined && previousReferenceTime !== undefined) {
          const referenceStep = target.timeSec - previousReferenceTime, playerStep = playerTimeSec - previousTime
          if (playerStep < referenceStep * 0.5 - 1e-7 || playerStep > referenceStep * 1.5 + 1e-7) continue
        }
        const cost = (previous?.cost ?? 0) + (1 - pointCredit) + 0.01 * Math.abs(lag) / config.timingToleranceMs
        if (!best || cost < best.cost) best = { cost, parent: previousIndex, judgment, pose, playerTimeSec }
      }
      return best ?? { cost: Infinity, parent: 0, pose, playerTimeSec, judgment: { timeSec: target.timeSec, accuracy: 0, pointCredit: 0, form: 0, motion: null, timing: 0, coverage: 0, offsetMs: null, label: 'TRACKING' } }
    })
    rows.push(row)
  }
  let chosen = rows.at(-1)!.reduce((best, cell, index, row) => cell.cost < row[best].cost ? index : best, 0)
  const aligned: AlignedJudgment[] = []
  for (let index = rows.length - 1; index >= 0; index--) {
    const cell = rows[index][chosen], target = reference[index]
    aligned.unshift({ judgment: cell.judgment, anchor: hasReferenceEvidence(target.pose) ? {
      reference: target.pose, player: cell.pose, playerTimeSec: cell.playerTimeSec, referenceTimeSec: target.timeSec,
    } : null })
    chosen = cell.parent
  }
  return aligned
}
