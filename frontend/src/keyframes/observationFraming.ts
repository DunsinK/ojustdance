import { DanceSkeleton } from '@ojustdance/skeleton'
import type { SkeletonFrame } from '@ojustdance/skeleton'
import type { PersonFraming } from './personMatte.js'

const skeleton = new DanceSkeleton()

/** A measured-pose crop is a safe fallback when only the person mask is unavailable. */
export function observationFraming(frame: SkeletonFrame, width: number, height: number): PersonFraming | null {
  const coordinates = frame.coordinates
  const size = coordinates.imageSize
  if (coordinates.kind !== 'image' || coordinates.units !== 'pixels' || coordinates.origin !== 'image-top-left'
    || coordinates.axes !== 'x-right-y-down-z-away' || coordinates.mirrored || !size
    || Math.abs(size.width / size.height - width / height) > 0.01) return null
  const pose = skeleton.constructPose(frame)
  const root = pose.joints.pelvis.position, chest = pose.joints.chest.position
  const inFrame = (point: { x: number; y: number }) => point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.height
  if (!root || !chest || !inFrame(root) || !inFrame(chest)) return null
  const torsoSize = Math.hypot(root.x - chest.x, root.y - chest.y)
  if (torsoSize < 1) return null
  const points = Object.values(pose.joints).flatMap((joint) => !joint.derived && joint.valid && joint.position && inFrame(joint.position) ? [joint.position] : [])
  if (points.length < 5) return null
  const sx = width / size.width, sy = height / size.height
  return { centerMethod: 'hip-midpoint', center: { x: root.x * sx, y: root.y * sy }, bounds: {
    left: Math.max(0, Math.min(...points.map((point) => point.x)) - torsoSize * 0.15) * sx,
    right: Math.min(size.width, Math.max(...points.map((point) => point.x)) + torsoSize * 0.15) * sx,
    top: Math.max(0, Math.min(...points.map((point) => point.y)) - torsoSize * 0.25) * sy,
    bottom: Math.min(size.height, Math.max(...points.map((point) => point.y)) + torsoSize * 0.1) * sy,
  } }
}
