import type { BodyPart, FeaturePose, PoseComparison, PoseFeature } from './contracts.js'

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
export function featureDifference(a: PoseFeature, b: PoseFeature): number {
  if (a.kind !== b.kind || a.value.length !== b.value.length) return Infinity
  if (a.kind === 'direction') {
    const length = Math.hypot(...a.value) * Math.hypot(...b.value)
    return length > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, (a.value[0] * b.value[0] + a.value[1] * b.value[1]) / length))) : Infinity
  }
  return Math.hypot(...a.value.map((value, index) => value - b.value[index]))
}
function featureSimilarity(a: PoseFeature, b: PoseFeature): number {
  const error = featureDifference(a, b)
  const grace = a.kind === 'position' ? 0.08 : 5 * Math.PI / 180
  const failure = a.kind === 'position' ? 0.75 : 60 * Math.PI / 180
  return 1 - clamp01((error - grace) / (failure - grace))
}
/** Reference weights stay fixed: hiding an incorrect feature cannot increase awarded similarity. */
export function comparePoses(live: FeaturePose | null, reference: FeaturePose, minimumCoverage = 0.65, activeParts: readonly BodyPart[] = []): PoseComparison {
  let expectedWeight = 0, observedWeight = 0, similarity = 0
  const requiredParts = new Set<string>(), supportedParts = new Set<string>()
  for (const [name, target] of Object.entries(reference.features)) {
    const weight = target.weight * (target.quality ?? 0.5) * (activeParts.includes(target.part) ? 2.5 : 1)
    expectedWeight += weight
    if (target.part !== 'torso') requiredParts.add(target.part)
    const observed = live?.features[name]
    if (!observed) continue
    observedWeight += weight
    similarity += weight * featureSimilarity(observed, target)
    if (target.part !== 'torso') supportedParts.add(target.part)
  }
  const coverage = expectedWeight > 0 ? observedWeight / expectedWeight : 0
  const scorable = coverage >= minimumCoverage && supportedParts.size >= Math.min(3, requiredParts.size)
  return { status: !scorable ? 'unavailable' : coverage < 0.999 ? 'partial' : 'scorable', form: observedWeight ? clamp01(similarity / observedWeight) : 0,
    coverage: clamp01(coverage), supportedParts: supportedParts.size }
}
export interface MotionComparison { readonly similarity: number; readonly active: boolean; readonly activeParts: readonly BodyPart[] }
/** Compare changes in observed geometry; root travel is separate from centered pose shape. */
export function compareMotion(previousReference: FeaturePose | null, reference: FeaturePose, previousLive: FeaturePose | null, live: FeaturePose | null): MotionComparison {
  if (!previousReference) return { similarity: 1, active: false, activeParts: [] }
  let expected = 0, matched = 0
  const activeParts = new Set<BodyPart>()
  for (const [name, feature] of Object.entries(reference.features)) {
    const previous = previousReference.features[name]
    if (!previous) continue
    const delta = feature.value.map((value, index) => value - previous.value[index])
    const amount = Math.hypot(...delta)
    const noiseFloor = feature.kind === 'bend' ? 2 * Math.PI / 180 : 0.025
    if (amount < noiseFloor) continue
    activeParts.add(feature.part)
    const weight = feature.weight * (feature.quality ?? 0.5)
    expected += weight
    const currentLive = live?.features[name], priorLive = previousLive?.features[name]
    if (!currentLive || !priorLive) continue
    const difference = Math.hypot(...delta.map((value, index) => value - (currentLive.value[index] - priorLive.value[index])))
    // Once a change exceeds the activity floor, compare its relative magnitude.
    // A stationary limb must not receive full motion credit for a slow movement.
    matched += weight * (1 - clamp01((difference - amount * 0.15) / (amount * 0.85)))
  }
  if (reference.root && previousReference.root && reference.scale && previousReference.scale) {
    const scale = (reference.scale + previousReference.scale) / 2
    const delta = reference.root.map((value, index) => (value - previousReference.root![index]) / scale)
    const amount = Math.hypot(...delta)
    if (amount >= 0.025) {
      activeParts.add('torso')
      expected += 0.6
      if (live?.root && previousLive?.root && live.scale && previousLive.scale) {
        const liveScale = (live.scale + previousLive.scale) / 2
        const error = Math.hypot(...delta.map((value, index) => value - (live.root![index] - previousLive.root![index]) / liveScale))
        matched += 0.6 * (1 - clamp01((error - amount * 0.15) / (amount * 0.85)))
      }
    }
  }
  return { active: expected > 0, similarity: expected ? clamp01(matched / expected) : 1, activeParts: [...activeParts] }
}
