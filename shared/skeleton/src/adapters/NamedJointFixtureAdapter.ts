import type { JointObservation, PoseSourceAdapter, SkeletonFrame } from '../contracts.js'
import type { JointName } from '../skeletonDefinition.js'
import { JOINT_NAMES } from '../skeletonDefinition.js'
import { requireFiniteNumber, requireObject, readOptionalQuality, validateFrame } from '../frameValidation.js'
import { createImmutableSnapshot } from '../immutable.js'
import { createJointObservation, MISSING_DEPTH } from '../observations.js'

/** A separate wire format for tests, hand-authored clips, and future providers. */
export class NamedJointFixtureAdapter implements PoseSourceAdapter {
  readonly id = 'named-joints/1'

  toFrame(payload: unknown): SkeletonFrame {
    const input = requireObject(payload, this.id)
    if (input.version !== this.id) {
      throw new Error('Unsupported named-joints version')
    }

    const clock = requireObject(input.clock, 'clock')
    const namedJoints = requireObject(input.joints, 'joints')
    const observations: Partial<Record<JointName, JointObservation>> = {}
    for (const [name, entry] of Object.entries(namedJoints)) {
      if (!JOINT_NAMES.includes(name as JointName)) {
        throw new Error(`Unknown named joint: ${name}`)
      }
      if (entry === null) {
        observations[name as JointName] = {
          position: null,
          valid: false,
          depth: MISSING_DEPTH,
        }
        continue
      }

      const joint = requireObject(entry, `joints.${name}`)
      if (!Array.isArray(joint.xy) || joint.xy.length !== 2) {
        throw new Error(`${name}.xy must be [x, y]`)
      }
      if (joint.present !== undefined && typeof joint.present !== 'boolean') {
        throw new Error(`${name}.present must be boolean`)
      }

      const x = requireFiniteNumber(joint.xy[0], `${name}.x`)
      const y = requireFiniteNumber(joint.xy[1], `${name}.y`)
      let z: number | null = null
      let uncertainty: number | null = null
      if (joint.depth != null) {
        const depth = requireObject(joint.depth, `${name}.depth`)
        z = requireFiniteNumber(depth.value, `${name}.depth.value`)
        if (depth.uncertainty != null) {
          uncertainty = requireFiniteNumber(depth.uncertainty, `${name}.depth.uncertainty`)
        }
      }

      const confidence = readOptionalQuality(joint.quality, `${name}.quality`)
      const visibility = readOptionalQuality(joint.seen, `${name}.seen`)
      const observation = createJointObservation(x, y, z, confidence, visibility)
      observations[name as JointName] = {
        ...observation,
        valid: joint.present !== false,
        depth: { ...observation.depth, uncertainty },
      }
    }

    const frame = {
      schemaVersion: 'dance-skeleton-frame/1',
      timestampMs: clock.ms,
      timeline: { id: clock.id, origin: clock.origin },
      coordinates: input.coordinates,
      observations,
    }
    validateFrame(frame)
    return createImmutableSnapshot(frame)
  }
}
