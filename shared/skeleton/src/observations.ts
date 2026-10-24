import type { DepthInfo, JointObservation } from './contracts.js'

export const MISSING_DEPTH: DepthInfo = Object.freeze({
  provenance: 'missing',
  status: 'missing',
  uncertainty: null,
})

/** Convenient for adapters and fixtures; a supplied Z is an estimate, not a measurement. */
export function createJointObservation(
  x: number,
  y: number,
  z: number | null = null,
  confidence: number | null = null,
  visibility: number | null = null,
): JointObservation {
  let depth: DepthInfo = MISSING_DEPTH
  if (z !== null) {
    depth = {
      provenance: 'provider-estimate',
      status: 'estimated',
      uncertainty: null,
    }
  }

  return {
    position: { x, y, z },
    valid: true,
    confidence,
    visibility,
    depth,
  }
}

/** Two known values use the lower one. Any unknown input keeps the result unknown. */
export function minimumKnownQuality(
  first: number | null | undefined,
  second: number | null | undefined,
): number | null {
  if (first == null || second == null) {
    return null
  }
  return Math.min(first, second)
}
