import { DanceSkeleton, mirrorFrame, normalizedImageToPixels } from '@ojustdance/skeleton'
import type { BoneName, JointName, JointPose, SkeletonFrame } from '@ojustdance/skeleton'
import type { BodyPart, FeaturePose, PoseFeature, Vector2 } from './contracts.js'

const skeleton = new DanceSkeleton()
const CHAINS: readonly { part: BodyPart; joints: readonly [JointName, JointName, JointName]; bones: readonly [BoneName, BoneName] }[] = [
  { part: 'leftArm', joints: ['leftShoulder', 'leftElbow', 'leftWrist'], bones: ['leftUpperArm', 'leftForearm'] },
  { part: 'rightArm', joints: ['rightShoulder', 'rightElbow', 'rightWrist'], bones: ['rightUpperArm', 'rightForearm'] },
  { part: 'leftLeg', joints: ['leftHip', 'leftKnee', 'leftAnkle'], bones: ['leftThigh', 'leftShin'] },
  { part: 'rightLeg', joints: ['rightHip', 'rightKnee', 'rightAnkle'], bones: ['rightThigh', 'rightShin'] },
]
const magnitude = (point: Vector2) => Math.hypot(...point)
function quality(joints: readonly JointPose[]): number | null {
  if (joints.some((joint) => joint.confidence == null || joint.visibility == null)) return null
  return Math.min(...joints.flatMap((joint) => [joint.confidence!, joint.visibility!]))
}

/** Observed, isotropic XY only. Depth is deliberately excluded, including from scale. */
export function extractPoseFeatures(input: SkeletonFrame, reflectDance = false): FeaturePose {
  if (input.coordinates.kind !== 'image' || !['normalized-image', 'pixels', 'body-units'].includes(input.coordinates.units)
    || input.coordinates.mirrored) throw new Error('Scoring requires original, unmirrored canonical image observations')
  let frame = input.coordinates.units === 'normalized-image' ? normalizedImageToPixels(input) : input
  if (reflectDance) frame = mirrorFrame(frame, { axisX: frame.coordinates.origin === 'image-top-left' ? frame.coordinates.imageSize!.width / 2 : 0, swapSides: true })
  const pose = skeleton.constructPose(frame)
  const visible = (joint: JointPose) => {
    if (!joint.valid || !joint.position) return false
    if (frame.coordinates.origin !== 'image-top-left') return true
    const size = frame.coordinates.imageSize!
    return joint.position.x >= 0 && joint.position.x <= size.width && joint.position.y >= 0 && joint.position.y <= size.height
  }
  const pelvis = pose.joints.pelvis, chest = pose.joints.chest
  const center = visible(pelvis) ? pelvis.position! : null
  const scale = center && visible(chest) ? Math.hypot(chest.position!.x - center.x, chest.position!.y - center.y) : null
  const usableScale = scale !== null && scale > 1e-6 ? scale : null
  const features: Record<string, PoseFeature> = {}
  for (const chain of CHAINS) {
    const joints = chain.joints.map((name) => pose.joints[name])
    for (let index = 0; index < 2; index++) {
      const bone = pose.bones[chain.bones[index]]
      if (!bone.valid || !visible(joints[index]) || !visible(joints[index + 1]) || !bone.direction) continue
      features[chain.bones[index]] = { part: chain.part, kind: 'direction', value: [bone.direction.x, bone.direction.y], weight: 0.28, quality: quality(joints.slice(index, index + 2)) }
    }
    if (joints.every(visible)) {
      const a: Vector2 = [joints[0].position!.x - joints[1].position!.x, joints[0].position!.y - joints[1].position!.y]
      const b: Vector2 = [joints[2].position!.x - joints[1].position!.x, joints[2].position!.y - joints[1].position!.y]
      const denominator = magnitude(a) * magnitude(b)
      if (denominator > 1e-9) features[chain.joints[1]] = { part: chain.part, kind: 'bend', value: [Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / denominator)))], weight: 0.24, quality: quality(joints) }
    }
    const firstBone = pose.bones[chain.bones[0]], secondBone = pose.bones[chain.bones[1]]
    const chainLength = firstBone.valid && secondBone.valid ? firstBone.observedLength! + secondBone.observedLength! : 0
    if (chainLength > 1e-6 && joints.every(visible)) features[chain.joints[2]] = {
      part: chain.part, kind: 'position', value: [(joints[2].position!.x - joints[0].position!.x) / chainLength, (joints[2].position!.y - joints[0].position!.y) / chainLength], weight: 0.2, quality: quality(joints),
    }
  }
  if (center && usableScale && visible(chest)) features.torsoLean = { part: 'torso', kind: 'direction',
    value: [(chest.position!.x - center.x) / usableScale, (chest.position!.y - center.y) / usableScale], weight: 0.6, quality: quality([pelvis, chest]) }
  return { features, root: center && frame.coordinates.origin === 'image-top-left' ? [center.x, center.y] : null, scale: usableScale,
    continuity: JSON.stringify([input.timeline.id, input.coordinates.kind, input.coordinates.units, input.coordinates.origin, input.coordinates.imageSize]) }
}
export function hasReferenceEvidence(pose: FeaturePose | null): pose is FeaturePose {
  if (!pose) return false
  const parts = new Set(Object.values(pose.features).filter((feature) => feature.part !== 'torso').map((feature) => feature.part))
  return parts.size >= 2 && Object.values(pose.features).reduce((sum, feature) => sum + feature.weight, 0) >= 0.8
}
