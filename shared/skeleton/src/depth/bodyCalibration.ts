import type { BodyCalibration } from '../contracts.js'
import { isBoneName } from '../skeletonDefinition.js'
import { requireFiniteNumber, requireObject, requirePositiveNumber } from '../frameValidation.js'

/** Calibration is a supplied assumption about the user's body, never an avatar measurement. */
export function validateCalibration(value: unknown): asserts value is BodyCalibration {
  const calibration = requireObject(value, 'calibration')
  if (calibration.schemaVersion !== 'dance-body-calibration/1') {
    throw new Error('Unsupported BodyCalibration schemaVersion')
  }
  if (typeof calibration.id !== 'string' || !calibration.id.trim()) {
    throw new Error('Calibration needs a nonempty id')
  }
  if (!['meters', 'pixels', 'body-units'].includes(String(calibration.units))) {
    throw new Error('Unsupported calibration units')
  }

  const boneLengths = requireObject(calibration.boneLengths, 'calibration.boneLengths')
  for (const [bone, value] of Object.entries(boneLengths)) {
    if (!isBoneName(bone)) {
      throw new Error(`Unknown calibration bone: ${bone}`)
    }
    const estimate = requireObject(value, `calibration.${bone}`)
    requirePositiveNumber(estimate.length, `${bone}.length`)
    if (estimate.uncertainty !== null) {
      const uncertainty = requireFiniteNumber(estimate.uncertainty, `${bone}.uncertainty`)
      if (uncertainty < 0) {
        throw new Error(`${bone}.uncertainty must be nonnegative or null`)
      }
    }
    const supportedProvenance = ['manual-measurement', 'population-average', 'observed-estimate']
    if (!supportedProvenance.includes(String(estimate.provenance))) {
      throw new Error(`${bone} requires explicit calibration provenance`)
    }
  }

  if (calibration.imageScale !== undefined) {
    const imageScale = requireObject(calibration.imageScale, 'calibration.imageScale')
    if (imageScale.projection !== 'orthographic' && imageScale.projection !== 'weak-perspective') {
      throw new Error('Unsupported imageScale projection')
    }
    requirePositiveNumber(imageScale.metersPerPixel, 'metersPerPixel')
    const imageSize = requireObject(imageScale.imageSize, 'calibration.imageScale.imageSize')
    requirePositiveNumber(imageSize.width, 'calibration.imageScale.imageSize.width')
    requirePositiveNumber(imageSize.height, 'calibration.imageScale.imageSize.height')
    if (calibration.units !== 'meters') {
      throw new Error('imageScale requires metric bone lengths')
    }
  }
}
