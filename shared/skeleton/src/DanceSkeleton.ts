import type {
  BonePose, CoordinateSpace, DepthInfo, JointObservation, JointPose,
  Position, SkeletonFrame, SkeletonPose,
} from './contracts.js'
import { DERIVED_JOINTS, JOINT_NAMES, SKELETON_DEFINITION } from './skeletonDefinition.js'
import type { BoneName, JointName, SkeletonJointDefinition } from './skeletonDefinition.js'
import { validateFrame } from './frameValidation.js'
import { createImmutableSnapshot } from './immutable.js'
import { MISSING_DEPTH, minimumKnownQuality } from './observations.js'

export interface PoseOptions {
  readonly minConfidence?: number
  readonly minVisibility?: number
}

function createInvalidJoint(
  name: JointName,
  derived: boolean,
  reason: JointPose['reason'],
  source?: JointObservation,
): JointPose {
  return {
    name,
    derived,
    valid: false,
    reason,
    position: null,
    confidence: source?.confidence ?? null,
    visibility: source?.visibility ?? null,
    depth: MISSING_DEPTH,
  }
}

function hasFiniteCoordinates(position: Position): boolean {
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && (position.z === null || Number.isFinite(position.z))
}

/** Keep an observation only if its supplied coordinates and quality are usable. */
function createObservedJoint(
  name: JointName,
  observation: JointObservation | undefined,
  minConfidence: number,
  minVisibility: number,
): JointPose {
  if (!observation?.position) {
    return createInvalidJoint(name, false, 'missing', observation)
  }
  if (!observation.valid) {
    return createInvalidJoint(name, false, 'invalid-observation', observation)
  }
  if (!hasFiniteCoordinates(observation.position)) {
    return createInvalidJoint(name, false, 'non-finite', observation)
  }

  // Unknown quality stays unknown. Only an explicitly low value rejects a joint.
  const confidenceIsTooLow = observation.confidence != null
    && observation.confidence < minConfidence
  const visibilityIsTooLow = observation.visibility != null
    && observation.visibility < minVisibility
  if (confidenceIsTooLow || visibilityIsTooLow) {
    return createInvalidJoint(name, false, 'low-confidence', observation)
  }

  return {
    ...observation,
    name,
    derived: false,
    reason: null,
    confidence: observation.confidence ?? null,
    visibility: observation.visibility ?? null,
  }
}

/** Approximate a semantic center from two valid dependencies; never invent depth. */
function createMidpointJoint(name: JointName, first: JointPose, second: JointPose): JointPose {
  const confidence = minimumKnownQuality(first.confidence, second.confidence)
  const visibility = minimumKnownQuality(first.visibility, second.visibility)
  if (!first.valid || !second.valid || !first.position || !second.position) {
    return createInvalidJoint(name, true, 'dependency-invalid', {
      position: null,
      valid: false,
      confidence,
      visibility,
      depth: MISSING_DEPTH,
    })
  }

  let midpointDepth: number | null = null
  let depth: DepthInfo = MISSING_DEPTH
  if (first.position.z !== null && second.position.z !== null) {
    midpointDepth = first.position.z / 2 + second.position.z / 2
    const firstUncertainty = first.depth.uncertainty
    const secondUncertainty = second.depth.uncertainty
    const uncertainty = firstUncertainty === null || secondUncertainty === null
      ? null
      : firstUncertainty / 2 + secondUncertainty / 2
    depth = { provenance: 'derived', status: 'derived', uncertainty }
  }

  return {
    name,
    derived: true,
    valid: true,
    reason: null,
    // Halve before adding so large finite coordinates cannot overflow their sum.
    position: {
      x: first.position.x / 2 + second.position.x / 2,
      y: first.position.y / 2 + second.position.y / 2,
      z: midpointDepth,
    },
    confidence,
    visibility,
    depth,
  }
}

/** Compute observed geometry for one predefined edge, independently of other edges. */
function createBonePose(
  name: BoneName,
  parent: JointPose,
  child: JointPose,
  coordinates: CoordinateSpace,
): BonePose {
  const parentPosition = parent.position
  const childPosition = child.position
  const hasEuclideanDepth = coordinates.depthModel === 'euclidean'
    && parentPosition?.z != null
    && childPosition?.z != null
  const unavailableBone: BonePose = {
    name,
    parent: parent.name,
    child: child.name,
    valid: false,
    reason: 'invalid-joint',
    geometry: hasEuclideanDepth ? 'estimated-3d' : 'projected-2d',
    vector: null,
    direction: null,
    observedLength: null,
    confidence: minimumKnownQuality(parent.confidence, child.confidence),
  }
  if (!parent.valid || !child.valid || !parentPosition || !childPosition) {
    return unavailableBone
  }

  // Image-relative Z cannot define Euclidean bone length.
  let deltaZ: number | null = null
  if (hasEuclideanDepth && parentPosition.z !== null && childPosition.z !== null) {
    deltaZ = childPosition.z - parentPosition.z
  }
  const vector: Position = {
    x: childPosition.x - parentPosition.x,
    y: childPosition.y - parentPosition.y,
    z: deltaZ,
  }
  const observedLength = Math.hypot(vector.x, vector.y, vector.z ?? 0)
  if (!Number.isFinite(observedLength)) {
    return { ...unavailableBone, reason: 'non-finite' }
  }
  if (observedLength === 0) {
    return { ...unavailableBone, reason: 'degenerate', vector, observedLength }
  }

  return {
    ...unavailableBone,
    valid: true,
    reason: null,
    vector,
    observedLength,
    direction: {
      x: vector.x / observedLength,
      y: vector.y / observedLength,
      z: vector.z === null ? null : vector.z / observedLength,
    },
  }
}

function* traverseJointHierarchy(root: JointName): Generator<SkeletonJointDefinition> {
  const joint = SKELETON_DEFINITION.joints.find((entry) => entry.name === root)
  if (!joint) {
    throw new Error(`Unknown skeleton joint: ${root}`)
  }
  yield joint
  for (const child of SKELETON_DEFINITION.joints) {
    if (child.parent === root) {
      yield* traverseJointHierarchy(child.name)
    }
  }
}

/**
 * Turns one canonical frame into usable joint and bone geometry.
 * The definition is immutable. All per-frame data is local to constructPose.
 */
export class DanceSkeleton {
  readonly definition = SKELETON_DEFINITION
  readonly #minConfidence: number
  readonly #minVisibility: number

  constructor(options: PoseOptions = {}) {
    this.#minConfidence = options.minConfidence ?? 0.5
    this.#minVisibility = options.minVisibility ?? 0.5
    for (const threshold of [this.#minConfidence, this.#minVisibility]) {
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new Error('Confidence thresholds must be in [0, 1]')
      }
    }
  }

  constructPose(frame: SkeletonFrame, originalFrame: SkeletonFrame = frame): SkeletonPose {
    validateFrame(frame)
    validateFrame(originalFrame)
    if (frame.coordinates.units === 'normalized-image') {
      throw new Error('Convert normalized-image to isotropic pixels before constructing a pose')
    }

    // 1. Resolve observations and explicitly declared midpoint dependencies.
    // This lookup exists for one call only; it never caches previous frames.
    const joints = {} as Record<JointName, JointPose>
    const resolveJoint = (name: JointName): JointPose => {
      const alreadyResolved = joints[name]
      if (alreadyResolved) {
        return alreadyResolved
      }
      const dependencies = DERIVED_JOINTS[name]
      let joint: JointPose
      if (dependencies) {
        const firstDependency = resolveJoint(dependencies[0])
        const secondDependency = resolveJoint(dependencies[1])
        joint = createMidpointJoint(name, firstDependency, secondDependency)
      } else {
        joint = createObservedJoint(
          name,
          frame.observations[name],
          this.#minConfidence,
          this.#minVisibility,
        )
      }
      joints[name] = joint
      return joint
    }
    for (const name of JOINT_NAMES) {
      resolveJoint(name)
    }

    // 2. Compute geometry only for edges declared by the fixed topology.
    const bones = {} as Record<BoneName, BonePose>
    for (const jointDefinition of this.definition.joints) {
      if (jointDefinition.bone === null || jointDefinition.parent === null) {
        continue
      }
      bones[jointDefinition.bone] = createBonePose(
        jointDefinition.bone,
        joints[jointDefinition.parent],
        joints[jointDefinition.name],
        frame.coordinates,
      )
    }

    // 3. Return an independent snapshot, including rejected source observations.
    return createImmutableSnapshot({
      schemaVersion: 'dance-skeleton-pose/1',
      originalFrame,
      frame,
      joints,
      bones,
    })
  }

  getJoint(pose: SkeletonPose, name: JointName): JointPose {
    return pose.joints[name]
  }

  getBone(pose: SkeletonPose, name: BoneName): BonePose {
    return pose.bones[name]
  }

  *traverse(root: JointName = this.definition.root): Generator<SkeletonJointDefinition> {
    yield* traverseJointHierarchy(root)
  }

  validEdges(pose: SkeletonPose): readonly BonePose[] {
    return Object.values(pose.bones).filter((bone) => bone.valid)
  }
}
