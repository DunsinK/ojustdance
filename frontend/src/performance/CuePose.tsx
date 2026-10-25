import { useMemo } from 'react'
import type { ChartSample } from '../pose/types'
import { nearestReference, referencePose } from './reference'
import type { ReferenceCue } from './contracts'

export function CuePose({ cue, samples, aspect, mirrored = false }: { cue: ReferenceCue; samples: readonly ChartSample[]; aspect: number; mirrored?: boolean }) {
  const geometry = useMemo(() => {
    const pose = referencePose(nearestReference(samples, cue.referenceSec), aspect)
    if (!pose) return null
    const joints = Object.values(pose.joints).filter((joint) => joint.valid && joint.position)
    if (!joints.length) return null
    const xs = joints.map((joint) => joint.position!.x), ys = joints.map((joint) => joint.position!.y)
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys)
    const margin = Math.max(width, height) * 0.14 || 1
    return { pose, joints, box: `${Math.min(...xs) - margin} ${Math.min(...ys) - margin} ${width + margin * 2} ${height + margin * 2}`, stroke: margin * 0.18 }
  }, [aspect, cue.referenceSec, samples])
  if (cue.image) return <img className={`cue-pose${mirrored ? ' mirrored' : ''}`} src={cue.image} alt="Measured reference pose" draggable={false} />
  if (!geometry) return <span className="cue-unavailable">Pose unavailable</span>
  return <svg className={`cue-pose${mirrored ? ' mirrored' : ''}`} viewBox={geometry.box} role="img" aria-label="Measured reference skeleton">
    {Object.values(geometry.pose.bones).filter((bone) => bone.valid).map((bone) => <line key={bone.name}
      x1={geometry.pose.joints[bone.parent].position!.x} y1={geometry.pose.joints[bone.parent].position!.y}
      x2={geometry.pose.joints[bone.child].position!.x} y2={geometry.pose.joints[bone.child].position!.y}
      stroke="currentColor" strokeWidth={geometry.stroke} strokeLinecap="round" />)}
    {geometry.joints.map((joint) => <circle key={joint.name} cx={joint.position!.x} cy={joint.position!.y} r={geometry.stroke * 0.8} fill="currentColor" />)}
  </svg>
}
