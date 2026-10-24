import type { JointObservation, Position, SkeletonFrame } from './contracts.js'
import type { JointName } from './skeletonDefinition.js'
import { oppositeJoint } from './skeletonDefinition.js'
import { DanceSkeleton } from './DanceSkeleton.js'
import { validateFrame, requireFiniteNumber, requirePositiveNumber } from './frameValidation.js'
import { createImmutableSnapshot } from './immutable.js'
import { MISSING_DEPTH } from './observations.js'

export interface FrameTransform {
  readonly originalFrame: SkeletonFrame
  readonly frame: SkeletonFrame
  readonly rootPosition: Position | null
  // For normalizeBody: normalized = (original - rootPosition) / scale.
  readonly scale: number
}

function mapObservations(
  frame: SkeletonFrame,
  transform: (observation: JointObservation) => JointObservation,
): SkeletonFrame['observations'] {
  const transformed: Partial<Record<JointName, JointObservation>> = {}
  for (const [name, observation] of Object.entries(frame.observations)) {
    transformed[name as JointName] = transform(observation)
  }
  return transformed
}

/** Correct the different image-width/image-height denominators before computing geometry. */
export function normalizedImageToPixels(frame: SkeletonFrame): SkeletonFrame {
  validateFrame(frame)
  const coordinates = frame.coordinates
  const imageSize = coordinates.imageSize
  if (coordinates.kind !== 'image' || coordinates.units !== 'normalized-image'
    || coordinates.origin !== 'image-top-left' || !imageSize) {
    throw new Error('normalizedImageToPixels requires normalized-image at image-top-left')
  }

  const observations = mapObservations(frame, (observation) => {
    const position = observation.position
    return {
      ...observation,
      position: position === null ? null : {
        x: position.x * imageSize.width,
        y: position.y * imageSize.height,
        // Image-relative Z uses the width denominator. It remains non-metric depth.
        z: position.z === null ? null : position.z * imageSize.width,
      },
      depth: {
        ...observation.depth,
        uncertainty: observation.depth.uncertainty === null
          ? null
          : observation.depth.uncertainty * imageSize.width,
      },
    }
  })

  return createImmutableSnapshot({
    ...frame,
    coordinates: { ...coordinates, units: 'pixels' },
    observations,
  })
}

/** Move the hip midpoint to the origin while retaining its original scene position. */
export function rootCenter(frame: SkeletonFrame): FrameTransform {
  const pose = new DanceSkeleton().constructPose(frame)
  const rootJoint = pose.joints.pelvis
  if (!rootJoint.valid || !rootJoint.position) {
    throw new Error('Root centering requires valid leftHip and rightHip')
  }
  const rootPosition = rootJoint.position

  const observations = mapObservations(frame, (observation) => {
    const position = observation.position
    if (position === null) {
      return observation
    }

    let centeredDepth: number | null = null
    let depth = MISSING_DEPTH
    if (position.z !== null && rootPosition.z !== null) {
      centeredDepth = position.z - rootPosition.z
      const sourceUncertainty = observation.depth.uncertainty
      const rootUncertainty = rootJoint.depth.uncertainty
      depth = {
        provenance: 'derived',
        status: 'derived',
        uncertainty: sourceUncertainty === null || rootUncertainty === null
          ? null
          : sourceUncertainty + rootUncertainty,
      }
    }

    return {
      ...observation,
      position: {
        x: position.x - rootPosition.x,
        y: position.y - rootPosition.y,
        z: centeredDepth,
      },
      depth,
    }
  })

  return createImmutableSnapshot({
    originalFrame: frame,
    rootPosition,
    scale: 1,
    frame: {
      ...frame,
      coordinates: { ...frame.coordinates, origin: 'root-relative' },
      observations,
    },
  })
}

/** Resize observed geometry in its current units; this does not convert pixels to meters. */
export function scaleFrame(frame: SkeletonFrame, factor: number): SkeletonFrame {
  validateFrame(frame)
  requirePositiveNumber(factor, 'scale factor')
  if (frame.coordinates.units === 'normalized-image') {
    throw new Error('Convert normalized-image before scaling')
  }

  const observations = mapObservations(frame, (observation) => {
    const position = observation.position
    return {
      ...observation,
      position: position === null ? null : {
        x: position.x * factor,
        y: position.y * factor,
        z: position.z === null ? null : position.z * factor,
      },
      depth: {
        ...observation.depth,
        uncertainty: observation.depth.uncertainty === null
          ? null
          : observation.depth.uncertainty * factor,
      },
    }
  })

  return createImmutableSnapshot({ ...frame, observations })
}

/** Center on the hips and divide by hip-to-shoulder-midpoint distance. No fallback scale. */
export function normalizeBody(frame: SkeletonFrame): FrameTransform {
  const centered = rootCenter(frame)
  const centeredPose = new DanceSkeleton().constructPose(centered.frame)
  const chestJoint = centeredPose.joints.chest
  if (!chestJoint.valid || !chestJoint.position) {
    throw new Error('Body normalization requires valid shoulders and hips')
  }

  const chestPosition = chestJoint.position
  let torsoLength: number
  if (frame.coordinates.depthModel === 'euclidean' && chestPosition.z !== null) {
    torsoLength = Math.hypot(chestPosition.x, chestPosition.y, chestPosition.z)
  } else {
    torsoLength = Math.hypot(chestPosition.x, chestPosition.y)
  }
  if (!Number.isFinite(torsoLength) || torsoLength <= 0) {
    throw new Error('Body normalization requires a nonzero finite torso length')
  }

  const scaledFrame = scaleFrame(centered.frame, 1 / torsoLength)
  return createImmutableSnapshot({
    originalFrame: centered.originalFrame,
    rootPosition: centered.rootPosition,
    scale: torsoLength,
    frame: {
      ...scaledFrame,
      coordinates: { ...scaledFrame.coordinates, units: 'body-units' },
    },
  })
}

export interface MirrorConvention {
  readonly axisX: number
  // True reflects a reference dance; false reflects display positions only.
  readonly swapSides: boolean
}

/** Reflect spatial X explicitly; the caller chooses whether anatomical labels exchange. */
export function mirrorFrame(frame: SkeletonFrame, convention: MirrorConvention): SkeletonFrame {
  validateFrame(frame)
  requireFiniteNumber(convention.axisX, 'mirror axisX')
  if (typeof convention.swapSides !== 'boolean') {
    throw new Error('Mirror requires explicit swapSides')
  }

  const observations: Partial<Record<JointName, JointObservation>> = {}
  for (const [name, observation] of Object.entries(frame.observations)) {
    let targetName = name as JointName
    if (convention.swapSides) {
      targetName = oppositeJoint(targetName)
    }
    observations[targetName] = {
      ...observation,
      position: observation.position === null ? null : {
        ...observation.position,
        x: 2 * convention.axisX - observation.position.x,
      },
    }
  }

  return createImmutableSnapshot({
    ...frame,
    coordinates: { ...frame.coordinates, mirrored: !frame.coordinates.mirrored },
    observations,
  })
}
