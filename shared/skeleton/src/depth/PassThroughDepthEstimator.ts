import type { DepthEstimator, DepthRequest, DepthResult } from '../contracts.js'
import { DanceSkeleton } from '../DanceSkeleton.js'

/** Keep supplied depth estimates as supplied; do not imply they are measurements. */
export class PassThroughDepthEstimator implements DepthEstimator {
  readonly id = 'pass-through/1'

  reconstruct({ frame }: DepthRequest): DepthResult {
    const pose = new DanceSkeleton().constructPose(frame)
    return {
      strategy: this.id,
      status: 'pass-through',
      pose,
    }
  }
}
