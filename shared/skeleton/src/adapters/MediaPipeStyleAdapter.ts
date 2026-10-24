import type { JointObservation, PoseSourceAdapter, SkeletonFrame } from '../contracts.js'
import type { JointName } from '../skeletonDefinition.js'
import { requireFiniteNumber, requireObject, readOptionalQuality, validateFrame } from '../frameValidation.js'
import { createImmutableSnapshot } from '../immutable.js'
import { createJointObservation } from '../observations.js'
import { normalizedImageToPixels } from '../transforms.js'

// Only this boundary knows provider indices. 'head' is a nose proxy, not a skull center.
const LANDMARK_INDEX_BY_JOINT: Readonly<Partial<Record<JointName, number>>> = Object.freeze({
  head: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHandIndex: 19,
  rightHandIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
})

function readLandmark(entry: unknown, index: number, omitDepth: boolean): JointObservation | null {
  if (entry == null) {
    return null
  }

  const landmark = requireObject(entry, `landmarks[${index}]`)
  const x = requireFiniteNumber(landmark.x, `landmarks[${index}].x`)
  const y = requireFiniteNumber(landmark.y, `landmarks[${index}].y`)
  let z: number | null = null
  if (landmark.z != null) {
    const suppliedDepth = requireFiniteNumber(landmark.z, `landmarks[${index}].z`)
    if (!omitDepth) {
      z = suppliedDepth
    }
  }
  if (landmark.valid !== undefined && typeof landmark.valid !== 'boolean') {
    throw new Error(`landmarks[${index}].valid must be boolean`)
  }

  const confidence = readOptionalQuality(landmark.presence, `landmarks[${index}].presence`)
  const visibility = readOptionalQuality(landmark.visibility, `landmarks[${index}].visibility`)
  return {
    ...createJointObservation(x, y, z, confidence, visibility),
    valid: landmark.valid !== false,
  }
}

/** Accepts one selected pose with explicit clock, coordinate source, and depth policy. */
export class MediaPipeStyleAdapter implements PoseSourceAdapter {
  readonly id = 'mediapipe-style/1'

  toFrame(payload: unknown): SkeletonFrame {
    const input = requireObject(payload, this.id)
    if (input.schemaVersion !== this.id) {
      throw new Error('Unsupported MediaPipe-style schemaVersion')
    }
    if (input.space !== 'normalized-image' && input.space !== 'world-meters') {
      throw new Error('MediaPipe space must be normalized-image or world-meters')
    }
    if (input.depth !== 'preserve-estimate' && input.depth !== 'omit') {
      throw new Error('Explicit MediaPipe depth policy required: preserve-estimate/omit')
    }
    if (!Array.isArray(input.landmarks) || input.landmarks.length > 33) {
      throw new Error('landmarks must be a single-pose array of at most 33 entries')
    }

    const isImageSpace = input.space === 'normalized-image'
    const omitDepth = input.depth === 'omit'
    if (!isImageSpace && input.imageSize !== undefined) {
      throw new Error('world-meters must not include imageSize; image/world data are separate')
    }

    // Validate every supplied landmark, including entries the canonical topology omits.
    const landmarks = input.landmarks.map((entry, index) => readLandmark(entry, index, omitDepth))
    const observations: Partial<Record<JointName, JointObservation>> = {}
    for (const [name, index] of Object.entries(LANDMARK_INDEX_BY_JOINT)) {
      const observation = landmarks[index]
      if (observation) {
        observations[name as JointName] = observation
      }
    }

    let depthModel = 'euclidean'
    if (isImageSpace) {
      depthModel = omitDepth ? 'none' : 'image-relative'
    }
    const frame = {
      schemaVersion: 'dance-skeleton-frame/1',
      timestampMs: input.timestampMs,
      timeline: input.timeline,
      coordinates: {
        kind: isImageSpace ? 'image' : 'estimated-3d',
        units: isImageSpace ? 'normalized-image' : 'meters',
        axes: 'x-right-y-down-z-away',
        handedness: 'right',
        mirrored: input.mirrored,
        origin: isImageSpace ? 'image-top-left' : 'hip-center',
        depthModel,
        ...(isImageSpace ? { imageSize: input.imageSize } : {}),
      },
      observations,
    }
    validateFrame(frame)

    if (isImageSpace) {
      return normalizedImageToPixels(frame)
    }
    return createImmutableSnapshot(frame)
  }
}
