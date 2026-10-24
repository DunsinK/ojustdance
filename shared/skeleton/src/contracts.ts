import type { BoneName, JointName } from './skeletonDefinition.js'

export interface Position {
  readonly x: number
  readonly y: number
  // Null is unknown depth; zero is an explicitly supplied depth value.
  readonly z: number | null
}

export interface DepthInfo {
  readonly provenance: 'missing' | 'provider-estimate' | 'measurement' | 'constraint-estimate' | 'derived' | 'discarded'
  readonly status: 'missing' | 'estimated' | 'measured' | 'derived' | 'discarded' | 'ambiguous' | 'inconsistent'
  // Standard-deviation estimate in the current Z units, or null if unknown.
  readonly uncertainty: number | null
}

export interface JointObservation {
  readonly position: Position | null
  readonly valid: boolean
  // Null/omitted means unknown, never implicitly 0 or 1.
  readonly confidence?: number | null
  readonly visibility?: number | null
  readonly depth: DepthInfo
}

export interface CoordinateSpace {
  readonly kind: 'image' | 'estimated-3d'
  readonly units: 'normalized-image' | 'pixels' | 'meters' | 'body-units'
  readonly axes: 'x-right-y-down-z-away'
  readonly handedness: 'right'
  readonly origin: 'image-top-left' | 'hip-center' | 'provider-origin' | 'root-relative'
  readonly depthModel: 'none' | 'image-relative' | 'euclidean'
  readonly mirrored: boolean
  readonly imageSize?: ImageSize
}

export interface ImageSize {
  readonly width: number
  readonly height: number
}

export interface FrameTimeline {
  readonly origin: 'video-start' | 'session-start'
  readonly id: string
}

/** Input observations at one instant, before deriving joints or reconstructing depth. */
export interface SkeletonFrame {
  readonly schemaVersion: 'dance-skeleton-frame/1'
  // Nonnegative milliseconds on this named timeline, NOT wall-clock epoch time.
  readonly timestampMs: number
  readonly timeline: FrameTimeline
  readonly coordinates: CoordinateSpace
  readonly observations: Readonly<Partial<Record<JointName, JointObservation>>>
}

export interface JointPose extends JointObservation {
  readonly name: JointName
  readonly derived: boolean
  readonly reason: 'missing' | 'invalid-observation' | 'non-finite' | 'low-confidence' | 'dependency-invalid' | null
}

export interface BonePose {
  readonly name: BoneName
  readonly parent: JointName
  readonly child: JointName
  readonly valid: boolean
  readonly reason: 'invalid-joint' | 'degenerate' | 'non-finite' | null
  readonly geometry: 'projected-2d' | 'estimated-3d'
  readonly vector: Position | null
  readonly direction: Position | null
  readonly observedLength: number | null
  readonly confidence: number | null
}

export interface SkeletonPose {
  readonly schemaVersion: 'dance-skeleton-pose/1'
  // Snapshot of the ORIGINAL input, including rejected observations.
  readonly originalFrame: SkeletonFrame
  readonly frame: SkeletonFrame
  readonly joints: Readonly<Record<JointName, JointPose>>
  readonly bones: Readonly<Record<BoneName, BonePose>>
}

export interface PoseSourceAdapter {
  readonly id: string
  // Implementations must validate unknown payloads before returning a frame.
  toFrame(payload: unknown): SkeletonFrame
}

/** An assumption about a user's bone length, including how the estimate was obtained. */
export interface BoneLengthEstimate {
  readonly length: number
  readonly uncertainty: number | null
  readonly provenance: 'manual-measurement' | 'population-average' | 'observed-estimate'
}

/** Explicit uniform image scale under an orthographic or weak-perspective assumption. */
export interface ImageScaleCalibration {
  readonly projection: 'orthographic' | 'weak-perspective'
  readonly metersPerPixel: number
  readonly imageSize: ImageSize
}

export interface BodyCalibration {
  readonly schemaVersion: 'dance-body-calibration/1'
  readonly id: string
  readonly units: 'meters' | 'pixels' | 'body-units'
  readonly boneLengths: Readonly<Partial<Record<BoneName, BoneLengthEstimate>>>
  // Required to combine metric lengths with image observations. No camera inference.
  readonly imageScale?: ImageScaleCalibration
}

export interface DepthRequest {
  readonly frame: SkeletonFrame
  readonly calibration?: BodyCalibration
  // Explicit only: implementations must never maintain hidden temporal state.
  readonly previousPose?: SkeletonPose
}

export interface DepthResult {
  readonly strategy: string
  readonly status: 'pass-through' | '2d-only' | 'reconstructed' | 'partial' | 'ambiguous' | 'inconsistent'
  readonly pose: SkeletonPose
}

export interface DepthEstimator {
  readonly id: string
  reconstruct(request: DepthRequest): DepthResult
}
