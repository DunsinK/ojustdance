import { MediaPipeStyleAdapter } from '@ojustdance/skeleton'
import type { ImageSize, SkeletonFrame } from '@ojustdance/skeleton'
import type { ChartSample } from '../pose/types.js'

const adapter = new MediaPipeStyleAdapter()
/** Provisional legacy-relative-chart/1. Aspect is required; lost scene travel cannot be recovered. */
export function adaptLegacyChartSample(sample: ChartSample, size: ImageSize): SkeletonFrame {
  if (!(Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0)) throw new Error('Legacy scoring requires the original video dimensions')
  const mapped = adapter.toFrame({ schemaVersion: 'mediapipe-style/1', timestampMs: sample.t * 1000,
    timeline: { origin: 'video-start', id: 'legacy-relative-chart/1' }, space: 'normalized-image', imageSize: size,
    depth: 'omit', mirrored: false, landmarks: sample.landmarks.map((point) => point ? { x: point[0], y: point[1], visibility: point[3] ?? null } : null) })
  return { ...mapped, coordinates: { ...mapped.coordinates, units: 'body-units', origin: 'root-relative' },
    observations: Object.fromEntries(Object.entries(mapped.observations).map(([name, observation]) => [name, { ...observation,
      position: observation.position ? { x: observation.position.x / size.height, y: observation.position.y / size.height, z: null } : null }])) }
}
