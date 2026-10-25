import { DanceSkeleton, mirrorFrame, normalizedImageToPixels } from '@ojustdance/skeleton'
import type { SkeletonFrame } from '@ojustdance/skeleton'
import type { RecordedAttempt } from './contracts'
import { adaptLegacyChartSample } from '../scoring/legacyChartAdapter'

const skeleton = new DanceSkeleton()
function PoseDrawing({ frame, label }: { frame: SkeletonFrame | null; label: string }) {
  if (!frame || frame.coordinates.kind !== 'image') return <div className="attempt-pose"><strong>{label}</strong><p>No measured image pose at this sample.</p></div>
  let geometry
  try {
    const pixels = frame.coordinates.units === 'normalized-image' ? normalizedImageToPixels(frame) : frame
    geometry = { pixels, pose: skeleton.constructPose(pixels) }
  } catch { /* Metadata failures are data failures, not rendering exceptions. */ }
  if (!geometry) return <div className="attempt-pose"><strong>{label}</strong><p>This sample has unusable coordinate metadata.</p></div>
  const { pixels, pose } = geometry
  const joints = Object.values(pose.joints).filter((joint) => joint.valid && joint.position)
  if (!joints.length) return <div className="attempt-pose"><strong>{label}</strong><p>No visible joints.</p></div>
  const xs = joints.map((joint) => joint.position!.x), ys = joints.map((joint) => joint.position!.y)
  const rootRelative = pixels.coordinates.origin === 'root-relative'
  const x = rootRelative ? Math.min(...xs) - 0.15 : 0, y = rootRelative ? Math.min(...ys) - 0.15 : 0
  const width = rootRelative ? Math.max(...xs) - x + 0.15 : pixels.coordinates.imageSize!.width
  const height = rootRelative ? Math.max(...ys) - y + 0.15 : pixels.coordinates.imageSize!.height
  const radius = Math.max(width, height) * 0.009
  return <div className="attempt-pose"><strong>{label}</strong>
    <svg viewBox={`${x} ${y} ${width} ${height}`} role="img" aria-label={`${label}: ${joints.length} usable joints`}>
      {skeleton.validEdges(pose).map((bone) => <line key={bone.name} x1={pose.joints[bone.parent].position!.x}
        y1={pose.joints[bone.parent].position!.y} x2={pose.joints[bone.child].position!.x}
        y2={pose.joints[bone.child].position!.y} stroke="currentColor" strokeWidth={radius * 0.7} />)}
      {joints.map((joint) => <circle key={joint.name} cx={joint.position!.x} cy={joint.position!.y} r={radius} fill="currentColor"><title>{joint.name}</title></circle>)}
    </svg><small>{joints.length} usable joints · missing joints are omitted</small>
  </div>
}
export function AttemptPosePreview({ attempt, songTimeSec }: { attempt: RecordedAttempt; songTimeSec: number }) {
  const samples = attempt.reference.chart.samples
  const sampleTime = (index: number) => attempt.reference.options.timeline === 'source-video' ? samples[index].sourceTimeSec ?? samples[index].t : samples[index].t
  let referenceIndex = 0
  for (let index = 1; index < samples.length; index++) if (Math.abs(sampleTime(index) - songTimeSec) < Math.abs(sampleTime(referenceIndex) - songTimeSec)) referenceIndex = index
  let referenceFrame: SkeletonFrame | null = null
  try {
    const sample = samples[referenceIndex]
    referenceFrame = sample.canonicalFrame ?? (attempt.reference.options.imageSize ? adaptLegacyChartSample(sample, attempt.reference.options.imageSize) : null)
    if (referenceFrame?.coordinates.units === 'normalized-image') referenceFrame = normalizedImageToPixels(referenceFrame)
    if (referenceFrame && attempt.reference.options.reflectDance) referenceFrame = mirrorFrame(referenceFrame, {
      axisX: referenceFrame.coordinates.origin === 'root-relative' ? 0 : referenceFrame.coordinates.imageSize!.width / 2, swapSides: true,
    })
  } catch { /* Rejected source observations remain in the export for diagnosis. */ }
  let observation: Extract<RecordedAttempt['events'][number], { kind: 'observation' }> | null = null
  for (const event of attempt.events) if (event.kind === 'observation'
    && (!observation || Math.abs(event.observation.songTimeSec - songTimeSec) < Math.abs(observation.observation.songTimeSec - songTimeSec))) observation = event
  const playerTime = observation?.observation.songTimeSec
  return <div>
    <div className="attempt-poses"><PoseDrawing frame={referenceFrame} label="Measured reference" />
      <PoseDrawing frame={observation?.observation.frame ?? null} label="Recorded attempt" /></div>
    <p className="meta-sub">Nearest raw samples, without interpolation: reference {sampleTime(referenceIndex).toFixed(3)}s;
      player {playerTime === undefined ? 'unavailable' : `${playerTime.toFixed(3)}s`}. No camera is active.</p>
  </div>
}
