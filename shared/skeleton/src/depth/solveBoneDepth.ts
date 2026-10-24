import type { BodyCalibration, SkeletonFrame, SkeletonPose } from '../contracts.js'
import type { BoneName } from '../skeletonDefinition.js'
import { isBoneName } from '../skeletonDefinition.js'
import { DanceSkeleton } from '../DanceSkeleton.js'
import { requireFiniteNumber, validateFrame } from '../frameValidation.js'
import { createImmutableSnapshot } from '../immutable.js'
import { normalizedImageToPixels } from '../transforms.js'
import { validateCalibration } from './bodyCalibration.js'

export interface BoneDepthRequest {
  readonly frame: SkeletonFrame
  readonly bone: BoneName
  readonly calibration?: BodyCalibration
  // Child Z minus parent Z, in calibration units. Only the sign chooses a candidate.
  readonly priorDeltaZ?: number
  readonly previousPose?: SkeletonPose
}

export interface BoneDepthSolution {
  readonly experimental: true
  readonly status: 'ambiguous' | 'prior-selected' | 'planar' | 'inconsistent'
    | 'missing-calibration' | 'incompatible-units' | 'invalid-observation'
  readonly message: string
  readonly units: BodyCalibration['units'] | null
  readonly candidates: readonly number[]
  readonly selectedDeltaZ: number | null
  readonly projectedLength: number | null
  readonly assumedLength: number | null
  readonly sensitivity: 'regular' | 'ill-conditioned' | null
  // |d(deltaZ)/d(projectedLength)|. Null at planar depth, where it is unbounded.
  readonly uncertaintyAmplification: number | null
}

/** Read caller-supplied information only; there is no hidden previous-frame state. */
function readDepthPrior(
  request: BoneDepthRequest,
  frame: SkeletonFrame,
  calibration: BodyCalibration,
): number | undefined {
  if (request.priorDeltaZ !== undefined) {
    return requireFiniteNumber(request.priorDeltaZ, 'priorDeltaZ')
  }
  const previousPose = request.previousPose
  if (!previousPose) {
    return undefined
  }

  const previousFrame = previousPose.frame
  validateFrame(previousFrame)
  const sameUnits = previousFrame.coordinates.units === calibration.units
  const sameMirrorConvention = previousFrame.coordinates.mirrored === frame.coordinates.mirrored
  const sameTimeline = previousFrame.timeline.id === frame.timeline.id
    && previousFrame.timeline.origin === frame.timeline.origin
  const earlierTimestamp = previousFrame.timestampMs <= frame.timestampMs
  if (!sameUnits || !sameMirrorConvention || !sameTimeline || !earlierTimestamp) {
    throw new Error('previousPose must share calibration units, mirror convention and timeline, and precede this frame')
  }

  const previousBone = previousPose.bones[request.bone]
  if (previousBone.valid && previousBone.geometry === 'estimated-3d'
    && previousBone.vector?.z != null) {
    return previousBone.vector.z
  }
  return undefined
}

/**
 * Experimental single-bone orthographic constraint, not a full-body depth estimator.
 * Produces relative-depth candidates without modifying or choosing an absolute pose.
 */
export function solveBoneDepth(request: BoneDepthRequest): BoneDepthSolution {
  validateFrame(request.frame)
  const { calibration, bone } = request
  const emptySolution: BoneDepthSolution = {
    experimental: true,
    status: 'missing-calibration',
    message: '',
    units: calibration?.units ?? null,
    candidates: [],
    selectedDeltaZ: null,
    projectedLength: null,
    assumedLength: null,
    sensitivity: null,
    uncertaintyAmplification: null,
  }
  function failure(status: BoneDepthSolution['status'], message: string): BoneDepthSolution {
    return createImmutableSnapshot({ ...emptySolution, status, message })
  }

  // 1. Require an explicitly supplied length assumption for this semantic bone.
  if (!calibration) {
    return failure('missing-calibration', 'Supply versioned bone lengths and explicit image scale where required')
  }
  validateCalibration(calibration)
  if (!isBoneName(bone)) {
    throw new Error(`Unknown bone: ${bone}`)
  }
  const lengthEstimate = calibration.boneLengths[bone]
  if (!lengthEstimate) {
    return failure('missing-calibration', `Missing length estimate for ${bone}`)
  }

  // 2. Correct image aspect ratio, then put projected XY into the calibration's units.
  let frame = request.frame
  if (frame.coordinates.units === 'normalized-image') {
    frame = normalizedImageToPixels(frame)
  }
  const coordinates = frame.coordinates
  let coordinateScale = 1
  const requiresMetricImageScale = coordinates.kind === 'image'
    && coordinates.units === 'pixels'
    && calibration.units === 'meters'
  if (requiresMetricImageScale) {
    const imageScale = calibration.imageScale
    if (!imageScale) {
      return failure('missing-calibration', 'Metric lengths and image XY require explicit metersPerPixel calibration')
    }
    const sameWidth = coordinates.imageSize?.width === imageScale.imageSize.width
    const sameHeight = coordinates.imageSize?.height === imageScale.imageSize.height
    if (!sameWidth || !sameHeight) {
      return failure('incompatible-units', 'Image resolution differs from calibration; recalibrate the scale')
    }
    coordinateScale = imageScale.metersPerPixel
  } else if (coordinates.units !== calibration.units) {
    return failure('incompatible-units', 'Bone lengths and projected coordinates must share a Euclidean scale')
  }

  // 3. Use valid XY endpoints; deliberately ignore any provider image-relative Z.
  const pose = new DanceSkeleton().constructPose(frame)
  const edge = pose.bones[bone]
  const parentJoint = pose.joints[edge.parent]
  const childJoint = pose.joints[edge.child]
  if (!parentJoint.valid || !childJoint.valid || !parentJoint.position || !childJoint.position) {
    return failure('invalid-observation', 'Both endpoints must be valid and pass confidence/visibility thresholds')
  }
  const deltaX = childJoint.position.x - parentJoint.position.x
  const deltaY = childJoint.position.y - parentJoint.position.y
  const projectedLength = Math.hypot(deltaX, deltaY) * coordinateScale
  if (!Number.isFinite(projectedLength)) {
    return failure('invalid-observation', 'Projected bone length is not finite')
  }

  // 4. Solve |deltaZ| = sqrt(L² - projectedLength²).
  // The dimensionless form avoids overflow when squaring a large length.
  const assumedLength = lengthEstimate.length
  const projectedRatio = projectedLength / assumedLength
  const squaredDepthRatio = 1 - projectedRatio * projectedRatio
  const roundoffTolerance = 1e-12
  const observedSolution = { ...emptySolution, projectedLength, assumedLength }
  if (squaredDepthRatio < -roundoffTolerance || !Number.isFinite(squaredDepthRatio)) {
    return createImmutableSnapshot({
      ...observedSolution,
      status: 'inconsistent',
      message: 'Projected length exceeds assumed bone length',
    })
  }

  // Only rounding-level negative values reach this clamp; substantial errors returned above.
  const depthMagnitude = assumedLength * Math.sqrt(Math.max(0, squaredDepthRatio))
  const candidates = depthMagnitude === 0 ? [0] : [-depthMagnitude, depthMagnitude]
  const sensitivity = depthMagnitude / assumedLength < 0.05 ? 'ill-conditioned' : 'regular'
  const uncertaintyAmplification = depthMagnitude === 0 ? null : projectedLength / depthMagnitude

  // 5. Keep both signs unless the caller deliberately supplies a nonzero sign prior.
  const priorDeltaZ = readDepthPrior(request, frame, calibration)
  let selectedDeltaZ: number | null = null
  let status: BoneDepthSolution['status'] = 'ambiguous'
  if (depthMagnitude === 0) {
    selectedDeltaZ = 0
    status = 'planar'
  } else if (priorDeltaZ !== undefined && priorDeltaZ !== 0) {
    selectedDeltaZ = Math.sign(priorDeltaZ) * depthMagnitude
    status = 'prior-selected'
  }

  let message = 'Relative depth has two signs; supply an explicit sign prior or previous 3D pose'
  if (selectedDeltaZ !== null) {
    message = 'Relative depth only; absolute camera distance remains unknown'
  }
  return createImmutableSnapshot({
    ...observedSolution,
    status,
    message,
    candidates,
    selectedDeltaZ,
    sensitivity,
    uncertaintyAmplification,
  })
}
