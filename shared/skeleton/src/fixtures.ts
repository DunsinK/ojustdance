import type { JointObservation, SkeletonFrame } from './contracts.js'
import type { JointName } from './skeletonDefinition.js'
import { createImmutableSnapshot } from './immutable.js'
import { MISSING_DEPTH, createJointObservation } from './observations.js'
import { scaleFrame } from './transforms.js'

const joints: Partial<Record<JointName, JointObservation>> = {
  head: createJointObservation(0, -1.2, 0, 0.95, 0.95),
  leftShoulder: createJointObservation(-0.3, -0.8, 0, 0.95, 0.95),
  leftElbow: createJointObservation(-0.65, -0.8, 0, 0.95, 0.95),
  leftWrist: createJointObservation(-1, -0.8, 0, 0.95, 0.95),
  leftHandIndex: createJointObservation(-1.1, -0.8, 0, 0.95, 0.95),
  rightShoulder: createJointObservation(0.3, -0.8, 0, 0.95, 0.95),
  rightElbow: createJointObservation(0.65, -0.8, 0, 0.95, 0.95),
  rightWrist: createJointObservation(1, -0.8, 0, 0.95, 0.95),
  rightHandIndex: createJointObservation(1.1, -0.8, 0, 0.95, 0.95),
  leftHip: createJointObservation(-0.2, 0, 0, 0.95, 0.95),
  leftKnee: createJointObservation(-0.2, 0.5, 0, 0.95, 0.95),
  leftAnkle: createJointObservation(-0.2, 1, 0, 0.95, 0.95),
  leftHeel: createJointObservation(-0.2, 1, 0.1, 0.95, 0.95),
  leftToe: createJointObservation(-0.2, 1.05, -0.15, 0.95, 0.95),
  rightHip: createJointObservation(0.2, 0, 0, 0.95, 0.95),
  rightKnee: createJointObservation(0.2, 0.5, 0, 0.95, 0.95),
  rightAnkle: createJointObservation(0.2, 1, 0, 0.95, 0.95),
  rightHeel: createJointObservation(0.2, 1, 0.1, 0.95, 0.95),
  rightToe: createJointObservation(0.2, 1.05, -0.15, 0.95, 0.95),
}

function fixture(observations: SkeletonFrame['observations'] = joints): SkeletonFrame {
  return createImmutableSnapshot({
    schemaVersion: 'dance-skeleton-frame/1', timestampMs: 1000,
    timeline: { origin: 'video-start', id: 'fixture-clip' },
    coordinates: { kind: 'estimated-3d', units: 'meters', axes: 'x-right-y-down-z-away',
      handedness: 'right', origin: 'provider-origin', depthModel: 'euclidean', mirrored: false },
    observations,
  })
}

function translated(frame: SkeletonFrame): SkeletonFrame {
  return fixture(Object.fromEntries(Object.entries(frame.observations).map(([name, o]) => [name, {
    ...o, position: o.position && { x: o.position.x + 3, y: o.position.y - 2,
      z: o.position.z === null ? null : o.position.z + 4 },
  }])))
}

export const FIXTURES = createImmutableSnapshot({
  'T-pose': fixture(),
  'One arm raised': fixture({ ...joints,
    leftElbow: createJointObservation(-0.3, -1.15, 0, 0.95, 0.95),
    leftWrist: createJointObservation(-0.3, -1.5, 0, 0.95, 0.95),
    leftHandIndex: createJointObservation(-0.3, -1.6, 0, 0.95, 0.95),
  }),
  'Bent elbow': fixture({ ...joints,
    leftWrist: createJointObservation(-0.65, -1.15, 0, 0.95, 0.95),
    leftHandIndex: createJointObservation(-0.65, -1.25, 0, 0.95, 0.95),
  }),
  'Bent knee / crouch': fixture({ ...joints,
    leftKnee: createJointObservation(-0.35, 0.3, -0.3, 0.95, 0.95),
    rightKnee: createJointObservation(0.35, 0.3, -0.3, 0.95, 0.95),
    leftAnkle: createJointObservation(-0.2, 0.65, 0, 0.95, 0.95),
    rightAnkle: createJointObservation(0.2, 0.65, 0, 0.95, 0.95),
    leftHeel: createJointObservation(-0.2, 0.65, 0.1, 0.95, 0.95),
    rightHeel: createJointObservation(0.2, 0.65, 0.1, 0.95, 0.95),
    leftToe: createJointObservation(-0.2, 0.7, -0.15, 0.95, 0.95),
    rightToe: createJointObservation(0.2, 0.7, -0.15, 0.95, 0.95),
  }),
  Translated: translated(fixture()),
  Scaled: scaleFrame(fixture(), 2),
  'Missing / low confidence': fixture({ ...joints,
    leftWrist: { position: null, valid: false, depth: MISSING_DEPTH },
    leftElbow: createJointObservation(-0.65, -0.8, null, 0.1, 0.95),
    rightShoulder: createJointObservation(0.3, -0.8, null, null, null),
  }),
  'Coincident joints': fixture(Object.fromEntries(Object.keys(joints).map((name) =>
    [name, createJointObservation(0, 0, 0, 0.95, 0.95)]))),
  'Missing depth': fixture(Object.fromEntries(Object.entries(joints).map(([name, o]) =>
    [name, { ...o, position: o.position && { ...o.position, z: null }, depth: MISSING_DEPTH }]))),
})

export type FixtureName = keyof typeof FIXTURES
