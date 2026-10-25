import { FIXTURES } from '../../../shared/skeleton/dist/fixtures.js'
import { createJointObservation } from '../../../shared/skeleton/dist/index.js'

/** Synthetic measured-image fixtures. No webcam or generated judgments are involved. */
export function imageFrame(time = 0, transform) {
  const frame = structuredClone(FIXTURES['T-pose'])
  frame.timestampMs = Math.max(0, time * 1000)
  frame.coordinates = {
    kind: 'image', units: 'pixels', axes: 'x-right-y-down-z-away', handedness: 'right',
    origin: 'image-top-left', depthModel: 'none', mirrored: false, imageSize: { width: 1000, height: 1000 },
  }
  for (const [name, observation] of Object.entries(frame.observations)) {
    frame.observations[name] = createJointObservation(500 + observation.position.x * 160, 450 + observation.position.y * 160, null, 0.95, 0.95)
  }
  transform?.(frame, time)
  return frame
}

export function hide(frame, ...names) {
  for (const name of names) frame.observations[name].visibility = 0.1
  return frame
}

function rotateChain(frame, side, angle) {
  const shoulder = frame.observations[`${side}Shoulder`].position
  for (const name of [`${side}Elbow`, `${side}Wrist`, `${side}HandIndex`]) {
    const position = frame.observations[name].position
    const x = position.x - shoulder.x, y = position.y - shoulder.y
    position.x = shoulder.x + x * Math.cos(angle) - y * Math.sin(angle)
    position.y = shoulder.y + x * Math.sin(angle) + y * Math.cos(angle)
  }
}

export function danceFrame(time, transform) {
  return imageFrame(time, (frame) => {
    rotateChain(frame, 'left', 1.1 * Math.sin(time * Math.PI * 1.7))
    rotateChain(frame, 'right', -0.9 * Math.sin(time * Math.PI * 1.3 + 0.4))
    // Elbow bend changes independently of whole-arm direction.
    frame.observations.leftWrist.position.y += 25 * Math.sin(time * Math.PI * 2.3)
    transform?.(frame, time)
  })
}

export function chartFor(frameAtTime = danceFrame, duration = 3, hz = 60) {
  const samples = Array.from({ length: Math.round(duration * hz) + 1 }, (_, index) => {
    const t = index / hz
    return { t, sourceTimeSec: t, canonicalFrame: frameAtTime(t), landmarks: [] }
  })
  return {
    version: 1, sampleRateHz: hz, durationSec: duration, title: 'Synthetic scoring regression', difficulty: 'normal',
    model: 'lite', recordedAt: '2026-10-24T00:00:00Z', normalization: { origin: 'hip_midpoint', scale: 'torso_length', axes: ['x', 'y', 'z', 'visibility'] },
    landmarkNames: [], segments: [{ id: 'one-clip', startSec: 0, endSec: duration, sampleCount: samples.length }], samples,
  }
}
