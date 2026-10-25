import type { BodyPart, FeaturePose, TimedPose } from './contracts.js'
import { poseAtTime } from './referenceTrack.js'
import { compareMotion } from './similarity.js'
import type { MotionComparison } from './similarity.js'

const UNKNOWN: MotionComparison = { active: false, similarity: 1, coverage: 0, activeParts: [] }
/** Restrict to a continuous measured span; never compare endpoints across a tracking gap. */
function span(nodes: readonly TimedPose[], start: number, end: number, maximumGap: number): [FeaturePose, FeaturePose, FeaturePose] | null {
  const first = poseAtTime(nodes, start, maximumGap), last = poseAtTime(nodes, end, maximumGap)
  const middle = poseAtTime(nodes, (start + end) / 2, maximumGap)
  if (!first || !middle || !last || first.continuity !== last.continuity || first.continuity !== middle.continuity) return null
  const between = nodes.filter((node) => node.timeSec > start && node.timeSec < end)
  if (between.some((node) => !node.pose || node.pose.continuity !== first.continuity)) return null
  for (let index = 1; index < between.length; index++) if (between[index].timeSec - between[index - 1].timeSec > maximumGap + 1e-7) return null
  // A feature disappearing mid-window is unknown motion, even if both endpoints exist.
  const names = Object.keys(first.features).filter((name) => middle.features[name] && last.features[name]
    && between.every((node) => node.pose!.features[name]))
  const restrict = (pose: FeaturePose): FeaturePose => ({ ...pose, features: Object.fromEntries(names.map((name) => [name, pose.features[name]])),
    root: between.every((node) => node.pose!.root && node.pose!.scale) ? pose.root : null })
  return [restrict(first), restrict(middle), restrict(last)]
}
/** A fixed 200 ms measurement window does not enlarge the ±30–70 ms timing band. */
export function compareMotionWindow(reference: readonly TimedPose[], live: readonly TimedPose[], timeSec: number,
  lagSec: number, windowSec = 0.2, maximumGap = 0.1): MotionComparison {
  const target = span(reference, timeSec - windowSec, timeSec, maximumGap)
  if (!target) return UNKNOWN
  const player = span(live, timeSec + lagSec - windowSec, timeSec + lagSec, maximumGap)
  // The full span rejects jitter; its halves retain quick out-and-back movements.
  const pairs = [[0, 2], [0, 1], [1, 2]] as const
  const comparisons = pairs.map(([a, b]) => compareMotion(target[a], target[b], player?.[a] ?? null, player?.[b] ?? null)).filter((item) => item.active)
  if (!comparisons.length) return UNKNOWN
  const parts = new Set<BodyPart>(comparisons.flatMap((item) => item.activeParts))
  const observed = comparisons.reduce((sum, item) => sum + item.coverage, 0)
  return { active: true, activeParts: [...parts], coverage: observed / comparisons.length,
    similarity: observed ? comparisons.reduce((sum, item) => sum + item.similarity * item.coverage, 0) / observed : 1 }
}
