import { DanceSkeleton, normalizedImageToPixels } from '@ojustdance/skeleton'
import type { JointName, SkeletonFrame } from '@ojustdance/skeleton'
import type { BodyPart, PlayerEvidence } from './contracts.js'

const body: readonly JointName[] = ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle']
const skeleton = new DanceSkeleton()
export function playerEvidence(frame: SkeletonFrame | null): PlayerEvidence {
  let visible = 0
  const valid = new Set<JointName>()
  let geometry: ReturnType<DanceSkeleton['constructPose']> | null = null
  if (frame && frame.coordinates.kind === 'image' && frame.coordinates.origin === 'image-top-left') {
    try {
      const pixels = frame.coordinates.units === 'normalized-image' ? normalizedImageToPixels(frame) : frame
      if (pixels.coordinates.units !== 'pixels') return { frame, visible: 0, total: body.length, fullBody: false, canJudge: false, parts: [] }
      const pose = skeleton.constructPose(pixels), size = pixels.coordinates.imageSize
      geometry = pose
      visible = body.filter((name) => {
        const joint = pose.joints[name], point = joint.position
        const accepted = joint.valid && point && (!size || frame.coordinates.origin !== 'image-top-left'
          || point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height)
        if (accepted) valid.add(name)
        return accepted
      }).length
    } catch { /* Invalid data is unavailable evidence. */ }
  }
  const chains: [BodyPart, JointName[]][] = [
    ['leftArm', ['leftShoulder', 'leftElbow', 'leftWrist']], ['rightArm', ['rightShoulder', 'rightElbow', 'rightWrist']],
    ['leftLeg', ['leftHip', 'leftKnee', 'leftAnkle']], ['rightLeg', ['rightHip', 'rightKnee', 'rightAnkle']],
    ['torso', ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder']], ['travel', ['leftHip', 'rightHip']],
  ]
  const parts = chains.filter(([, names]) => names.every((name) => valid.has(name)) && names.slice(1).every((name, index) => {
    // Use predefined canonical edges. Coincident observations are not a ready body chain.
    const bone = Object.values(geometry?.bones ?? {}).find((bone) => bone.parent === names[index] && bone.child === name)
    return bone ? bone.valid : names.length < 3 || names[0].includes('Hip')
  })).map(([name]) => name)
  const completeChains = parts.filter((part) => part.endsWith('Arm') || part.endsWith('Leg')).length
  return { frame, visible, total: body.length, fullBody: visible === body.length && completeChains === 4,
    canJudge: visible >= 6 && completeChains >= 2, parts }
}
