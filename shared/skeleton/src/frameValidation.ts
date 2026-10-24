import type { CoordinateSpace, JointObservation, SkeletonFrame } from './contracts.js'
import { isJointName } from './skeletonDefinition.js'

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

export function requirePositiveNumber(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label)
  if (number <= 0) {
    throw new Error(`${label} must be positive`)
  }
  return number
}

export function readOptionalQuality(value: unknown, label: string): number | null {
  if (value == null) {
    return null
  }
  const quality = requireFiniteNumber(value, label)
  if (quality < 0 || quality > 1) {
    throw new Error(`${label} must be null/omitted or within [0, 1]`)
  }
  return quality
}

/** Reject incompatible spaces before any geometry or transformation is attempted. */
export function validateCoordinates(value: unknown): asserts value is CoordinateSpace {
  const coordinates = requireObject(value, 'coordinates')
  const supportedAxes = coordinates.axes === 'x-right-y-down-z-away'
  const supportedHandedness = coordinates.handedness === 'right'
  if (!supportedAxes || !supportedHandedness || typeof coordinates.mirrored !== 'boolean') {
    throw new Error('coordinates require x-right-y-down-z-away, right handedness and explicit mirrored boolean')
  }

  const supportedOrigins = ['image-top-left', 'hip-center', 'provider-origin', 'root-relative']
  if (!supportedOrigins.includes(String(coordinates.origin))) {
    throw new Error('Unsupported coordinate origin')
  }

  if (coordinates.kind === 'image') {
    const supportedUnits = ['normalized-image', 'pixels', 'body-units']
    const supportedDepthModels = ['none', 'image-relative']
    if (!supportedUnits.includes(String(coordinates.units))
      || !supportedDepthModels.includes(String(coordinates.depthModel))) {
      throw new Error('Incompatible image coordinate units/depthModel')
    }

    const imageSize = requireObject(coordinates.imageSize, 'image coordinates.imageSize')
    requirePositiveNumber(imageSize.width, 'imageSize.width')
    requirePositiveNumber(imageSize.height, 'imageSize.height')

    const hasImageOrigin = coordinates.origin === 'image-top-left' || coordinates.origin === 'root-relative'
    const normalizedOriginIsValid = coordinates.units !== 'normalized-image'
      || coordinates.origin === 'image-top-left'
    if (!hasImageOrigin || !normalizedOriginIsValid) {
      throw new Error('Image coordinates require image-top-left/root-relative origin; normalized-image requires image-top-left')
    }
    return
  }

  if (coordinates.kind === 'estimated-3d') {
    const supportedUnits = coordinates.units === 'meters' || coordinates.units === 'body-units'
    if (!supportedUnits || coordinates.depthModel !== 'euclidean') {
      throw new Error('Estimated 3D requires meters/body-units and euclidean depthModel')
    }
    if (coordinates.origin === 'image-top-left' || coordinates.imageSize !== undefined) {
      throw new Error('Estimated 3D must use a 3D origin without imageSize')
    }
    return
  }

  throw new Error('Unsupported coordinate kind')
}

/** Validate metadata strictly; leave non-finite numeric observations available for diagnostics. */
export function validateFrame(value: unknown): asserts value is SkeletonFrame {
  const frame = requireObject(value, 'frame')
  if (frame.schemaVersion !== 'dance-skeleton-frame/1') {
    throw new Error('Unsupported skeleton frame schemaVersion')
  }
  if (requireFiniteNumber(frame.timestampMs, 'timestampMs') < 0) {
    throw new Error('timestampMs must be nonnegative milliseconds')
  }

  const timeline = requireObject(frame.timeline, 'timeline')
  const supportedTimelineOrigin = timeline.origin === 'video-start' || timeline.origin === 'session-start'
  if (!supportedTimelineOrigin || typeof timeline.id !== 'string' || !timeline.id.trim()) {
    throw new Error('timeline needs video-start/session-start origin and a nonempty id')
  }

  validateCoordinates(frame.coordinates)
  const observations = requireObject(frame.observations, 'observations')
  for (const [name, observation] of Object.entries(observations)) {
    if (!isJointName(name)) {
      throw new Error(`Unknown canonical joint: ${name}`)
    }
    validateObservation(observation, name)
    if (frame.coordinates.depthModel === 'none' && observation.position?.z != null) {
      throw new Error(`${name}: depthModel none cannot contain Z`)
    }
  }
}

export function validateObservation(value: unknown, name: string): asserts value is JointObservation {
  const observation = requireObject(value, name)
  if (typeof observation.valid !== 'boolean') {
    throw new Error(`${name}.valid must be boolean`)
  }
  readOptionalQuality(observation.confidence, `${name}.confidence`)
  readOptionalQuality(observation.visibility, `${name}.visibility`)

  let suppliedDepth: unknown = null
  if (observation.position !== null) {
    const position = requireObject(observation.position, `${name}.position`)
    // NaN/Infinity remain in the source snapshot, but DanceSkeleton rejects the joint.
    const numericXY = typeof position.x === 'number' && typeof position.y === 'number'
    const numericOrMissingZ = position.z === null || typeof position.z === 'number'
    if (!numericXY || !numericOrMissingZ) {
      throw new Error(`${name}.position requires numeric x/y and numeric or null z`)
    }
    suppliedDepth = position.z
  }

  const depth = requireObject(observation.depth, `${name}.depth`)
  const supportedProvenance = [
    'missing', 'provider-estimate', 'measurement', 'constraint-estimate', 'derived', 'discarded',
  ]
  const supportedStatuses = [
    'missing', 'estimated', 'measured', 'derived', 'discarded', 'ambiguous', 'inconsistent',
  ]
  if (!supportedProvenance.includes(String(depth.provenance))
    || !supportedStatuses.includes(String(depth.status))) {
    throw new Error(`${name}: unsupported depth provenance/status`)
  }
  if (depth.uncertainty !== null) {
    const uncertainty = requireFiniteNumber(depth.uncertainty, `${name}.depth.uncertainty`)
    if (uncertainty < 0) {
      throw new Error(`${name}: depth uncertainty must be nonnegative`)
    }
  }

  const claimsKnownDepth = ['estimated', 'measured', 'derived'].includes(String(depth.status))
  const claimsUnknownDepth = ['missing', 'discarded', 'ambiguous', 'inconsistent'].includes(String(depth.status))
    || ['missing', 'discarded'].includes(String(depth.provenance))
  if (suppliedDepth == null && claimsKnownDepth) {
    throw new Error(`${name}: known depth status requires Z`)
  }
  if (suppliedDepth != null && claimsUnknownDepth) {
    throw new Error(`${name}: unknown depth must use z: null`)
  }
}
