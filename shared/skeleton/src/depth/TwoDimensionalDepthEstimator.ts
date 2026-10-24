import type { DepthEstimator, DepthRequest, DepthResult, JointObservation, SkeletonFrame } from '../contracts.js'
import type { JointName } from '../skeletonDefinition.js'
import { DanceSkeleton } from '../DanceSkeleton.js'
import { validateFrame } from '../frameValidation.js'

/** Discard depth explicitly while preserving the original observations for later strategies. */
export class TwoDimensionalDepthEstimator implements DepthEstimator {
  readonly id = '2d-only/1'

  reconstruct({ frame }: DepthRequest): DepthResult {
    validateFrame(frame)
    const observations: Partial<Record<JointName, JointObservation>> = {}
    for (const [name, observation] of Object.entries(frame.observations)) {
      observations[name as JointName] = {
        ...observation,
        position: observation.position === null ? null : { ...observation.position, z: null },
        depth: {
          provenance: 'discarded',
          status: 'discarded',
          uncertainty: null,
        },
      }
    }

    let coordinates = frame.coordinates
    if (coordinates.kind === 'image') {
      coordinates = { ...coordinates, depthModel: 'none' }
    }
    // Projected metric observations keep metric XY; missing Z remains explicit in each joint.
    const projectedFrame: SkeletonFrame = { ...frame, coordinates, observations }
    const pose = new DanceSkeleton().constructPose(projectedFrame, frame)
    return {
      strategy: this.id,
      status: '2d-only',
      pose,
    }
  }
}
