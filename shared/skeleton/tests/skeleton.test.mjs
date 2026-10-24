import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BONE_NAMES, DanceSkeleton, JOINT_NAMES, SKELETON_DEFINITION,
  MediaPipeStyleAdapter, NamedJointFixtureAdapter, createJointObservation,
  normalizeBody, rootCenter, scaleFrame, mirrorFrame, normalizedImageToPixels,
  PassThroughDepthEstimator, TwoDimensionalDepthEstimator, solveBoneDepth, validateCalibration,
} from '@ojustdance/skeleton'
import { FIXTURES } from '@ojustdance/skeleton/fixtures'

const skeleton = new DanceSkeleton()
const base = FIXTURES['T-pose']
const clone = (x) => structuredClone(x)
const close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`)
function finiteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Non-finite: ${value}`)
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree)
}
function equivalentJoints(a, b) {
  for (const name of JOINT_NAMES) {
    assert.equal(a.joints[name].valid, b.joints[name].valid)
    for (const axis of ['x', 'y', 'z']) {
      const x = a.joints[name].position?.[axis], y = b.joints[name].position?.[axis]
      if (x == null || y == null) assert.equal(x, y)
      else close(x, y)
    }
  }
}

function namedPayload(frame = base) {
  return {
    version: 'named-joints/1', clock: { ms: frame.timestampMs, ...frame.timeline },
    coordinates: clone(frame.coordinates),
    joints: Object.fromEntries(Object.entries(frame.observations).map(([name, o]) => [name,
      o.position === null ? null : {
        xy: [o.position.x, o.position.y],
        depth: o.position.z === null ? null : { value: o.position.z, uncertainty: o.depth.uncertainty },
        quality: o.confidence, seen: o.visibility, present: o.valid,
      },
    ])),
  }
}

// Literal single-pose provider fixture: all provider-specific ordering stays out of core.
function mediaPipePayload() {
  const j = base.observations
  const lm = (o) => o && { ...o.position, presence: o.confidence, visibility: o.visibility }
  return {
    schemaVersion: 'mediapipe-style/1', timestampMs: base.timestampMs, timeline: clone(base.timeline),
    space: 'world-meters', mirrored: false, depth: 'preserve-estimate',
    landmarks: [
      lm(j.head), null, null, null, null, null, null, null, null, null, null,
      lm(j.leftShoulder), lm(j.rightShoulder), lm(j.leftElbow), lm(j.rightElbow),
      lm(j.leftWrist), lm(j.rightWrist), null, null, lm(j.leftHandIndex), lm(j.rightHandIndex), null, null,
      lm(j.leftHip), lm(j.rightHip), lm(j.leftKnee), lm(j.rightKnee), lm(j.leftAnkle), lm(j.rightAnkle),
      lm(j.leftHeel), lm(j.rightHeel), lm(j.leftToe), lm(j.rightToe),
    ],
  }
}

function imageFrame({ width = 1000, height = 500, dx = 0.3, dy = 0, z = null, units = 'normalized-image' } = {}) {
  return {
    schemaVersion: 'dance-skeleton-frame/1', timestampMs: 1000,
    timeline: clone(base.timeline),
    coordinates: {
      kind: 'image', units, imageSize: { width, height }, axes: 'x-right-y-down-z-away',
      handedness: 'right', origin: 'image-top-left', depthModel: z === null ? 'none' : 'image-relative', mirrored: false,
    },
    observations: {
      leftShoulder: createJointObservation(0.1, 0.2, z, 0.95, 0.95),
      leftElbow: createJointObservation(0.1 + dx, 0.2 + dy, z === null ? null : z * 2, 0.95, 0.95),
    },
  }
}
function calibration(length = 0.5, units = 'meters', imageScale = true) {
  return {
    schemaVersion: 'dance-body-calibration/1', id: 'manual-fixture', units,
    boneLengths: { leftUpperArm: { length, uncertainty: 0.01, provenance: 'manual-measurement' } },
    ...(imageScale ? { imageScale: { projection: 'orthographic', metersPerPixel: 0.001, imageSize: { width: 1000, height: 500 } } } : {}),
  }
}
const solve = (options = {}) => solveBoneDepth({ frame: imageFrame(), bone: 'leftUpperArm', calibration: calibration(), ...options })

test('definition is immutable, connected, acyclic and has valid parents/bone names', () => {
  assert.ok(Object.isFrozen(SKELETON_DEFINITION))
  assert.ok(Object.isFrozen(SKELETON_DEFINITION.joints))
  const seen = new Set()
  for (const node of skeleton.traverse()) {
    assert.ok(!seen.has(node.name))
    if (node.parent !== null) assert.ok(seen.has(node.parent))
    else assert.equal(node.name, 'pelvis')
    seen.add(node.name)
    assert.ok(Object.isFrozen(node))
  }
  assert.equal(seen.size, JOINT_NAMES.length)
  assert.equal(BONE_NAMES.length, JOINT_NAMES.length - 1)
  assert.equal(new Set(BONE_NAMES).size, BONE_NAMES.length)
  assert.deepEqual([...skeleton.traverse('leftShoulder')].map((n) => n.name),
    ['leftShoulder', 'leftElbow', 'leftWrist', 'leftHandIndex'])
})

test('T-pose derives explicit midpoints and observed geometry', () => {
  const pose = skeleton.constructPose(base)
  assert.deepEqual(skeleton.getJoint(pose, 'pelvis').position, { x: 0, y: 0, z: 0 })
  assert.deepEqual(pose.joints.chest.position, { x: 0, y: -0.8, z: 0 })
  assert.deepEqual(pose.joints.spine.position, { x: 0, y: -0.4, z: 0 })
  assert.deepEqual(pose.joints.neck.position, { x: 0, y: -1, z: 0 })
  assert.equal(pose.joints.spine.derived, true)
  close(skeleton.getBone(pose, 'leftUpperArm').observedLength, 0.35)
  assert.equal(skeleton.validEdges(pose).length, BONE_NAMES.length)
  assert.ok(Object.isFrozen(pose.joints.leftElbow.position))
})

test('distinct deterministic fixtures contain the requested arm and knee bends', () => {
  const raised = skeleton.constructPose(FIXTURES['One arm raised'])
  const elbow = skeleton.constructPose(FIXTURES['Bent elbow'])
  const knee = skeleton.constructPose(FIXTURES['Bent knee / crouch'])
  assert.ok(raised.joints.leftWrist.position.y < raised.joints.leftShoulder.position.y)
  close(elbow.bones.leftUpperArm.direction.x * elbow.bones.leftForearm.direction.x +
    elbow.bones.leftUpperArm.direction.y * elbow.bones.leftForearm.direction.y, 0)
  assert.ok(knee.bones.leftThigh.direction.z < 0)
  assert.ok(knee.bones.leftShin.direction.z > 0)
})

test('all valid fixture bone directions are normalized and finite', () => {
  for (const frame of Object.values(FIXTURES)) {
    const pose = skeleton.constructPose(frame)
    finiteTree(pose)
    for (const bone of skeleton.validEdges(pose)) {
      close(Math.hypot(bone.direction.x, bone.direction.y, bone.direction.z ?? 0), 1)
      assert.ok(bone.observedLength > 0)
    }
  }
})

test('a 30-by-40 pixel limb gives the explainable 50-pixel length and 0.6/0.8 direction', () => {
  const frame = imageFrame({ units: 'pixels' })
  frame.observations.leftShoulder = createJointObservation(100, 200, null, 0.95, 0.95)
  frame.observations.leftElbow = createJointObservation(130, 240, null, 0.95, 0.95)

  const pose = skeleton.constructPose(frame)
  const upperArm = pose.bones.leftUpperArm
  assert.deepEqual(upperArm.vector, { x: 30, y: 40, z: null })
  assert.equal(upperArm.observedLength, 50)
  assert.deepEqual(upperArm.direction, { x: 0.6, y: 0.8, z: null })
  assert.equal(upperArm.geometry, 'projected-2d')
})

test('degenerate, empty and non-finite input never fabricate valid bone directions', () => {
  const coincident = skeleton.constructPose(FIXTURES['Coincident joints'])
  for (const bone of Object.values(coincident.bones)) {
    assert.equal(bone.valid, false)
    assert.equal(bone.reason, 'degenerate')
    assert.equal(bone.observedLength, 0)
    assert.equal(bone.direction, null)
  }
  const empty = skeleton.constructPose({ ...base, observations: {} })
  assert.equal(skeleton.validEdges(empty).length, 0)
  for (const value of [NaN, Infinity, -Infinity]) {
    for (const axis of ['x', 'y', 'z']) {
      const frame = clone(base)
      frame.observations.leftElbow.position[axis] = value
      const pose = skeleton.constructPose(frame)
      assert.equal(pose.joints.leftElbow.valid, false)
      assert.equal(pose.joints.leftElbow.position, null)
      assert.equal(pose.joints.leftElbow.reason, 'non-finite')
      finiteTree(pose.joints)
      finiteTree(pose.bones)
      assert.ok(Object.is(pose.originalFrame.observations.leftElbow.position[axis], value))
    }
  }
  const overflow = clone(base)
  overflow.observations.leftShoulder.position.x = -Number.MAX_VALUE
  overflow.observations.leftElbow.position.x = Number.MAX_VALUE
  const pose = skeleton.constructPose(overflow)
  assert.equal(pose.bones.leftUpperArm.reason, 'non-finite')
  finiteTree(pose.joints)
  finiteTree(pose.bones)
})

test('confidence and validity propagate conservatively; unknown remains unknown', () => {
  const frame = clone(base)
  frame.observations.leftHip.confidence = null
  frame.observations.rightHip.confidence = 0.8
  frame.observations.rightShoulder.visibility = 0.1
  const pose = skeleton.constructPose(frame)
  assert.equal(pose.joints.pelvis.confidence, null)
  assert.equal(pose.joints.pelvis.valid, true)
  assert.equal(pose.joints.rightShoulder.reason, 'low-confidence')
  assert.equal(pose.joints.chest.reason, 'dependency-invalid')
  assert.equal(pose.joints.neck.valid, false)
  assert.equal(pose.bones.rightClavicle.valid, false)
  const bad = skeleton.constructPose(FIXTURES['Missing / low confidence'])
  assert.equal(bad.joints.leftWrist.reason, 'missing')
  assert.equal(bad.joints.leftElbow.reason, 'low-confidence')
  assert.throws(() => new DanceSkeleton({ minConfidence: NaN }), /threshold/)
})

test('source observations are not mutated or aliased and call order has no effect', () => {
  const input = clone(base), before = clone(input)
  const a = skeleton.constructPose(input)
  for (const frame of Object.values(FIXTURES).reverse()) skeleton.constructPose(frame)
  assert.deepEqual(a, skeleton.constructPose(input))
  assert.deepEqual(input, before)
  input.observations.leftElbow.position.x = 999
  assert.notEqual(a.originalFrame.observations.leftElbow.position.x, 999)
  assert.deepEqual(a.frame, before)
})

test('external adapters produce equivalent observations and poses', () => {
  const mpPayload = mediaPipePayload(), named = namedPayload()
  named.coordinates.origin = 'hip-center'
  const before = clone(mpPayload), beforeNamed = clone(named)
  const a = new MediaPipeStyleAdapter().toFrame(mpPayload)
  const b = new NamedJointFixtureAdapter().toFrame(named)
  assert.deepEqual(a, b)
  assert.deepEqual(skeleton.constructPose(a), skeleton.constructPose(b))
  assert.deepEqual(mpPayload, before)
  assert.deepEqual(named, beforeNamed)
  mpPayload.landmarks[0].x = 99
  assert.notEqual(a.observations.head.position.x, 99)
})

test('MediaPipe image adapter applies aspect correction and does not mix image/world Z', () => {
  const payload = { ...mediaPipePayload(), space: 'normalized-image', imageSize: { width: 1000, height: 500 } }
  const frame = new MediaPipeStyleAdapter().toFrame(payload)
  assert.equal(frame.coordinates.kind, 'image')
  assert.equal(frame.coordinates.units, 'pixels')
  assert.equal(frame.coordinates.depthModel, 'image-relative')
  close(frame.observations.leftShoulder.position.y, -400)
  const depth = clone(frame)
  depth.observations.leftElbow.position.z = 10000
  const pose = skeleton.constructPose(depth)
  close(pose.bones.leftUpperArm.observedLength, 350)
  assert.equal(pose.bones.leftUpperArm.geometry, 'projected-2d')
  assert.equal(pose.bones.leftUpperArm.vector.z, null)
  const omit = new MediaPipeStyleAdapter().toFrame({ ...payload, depth: 'omit' })
  assert.equal(omit.coordinates.depthModel, 'none')
  assert.equal(omit.observations.head.position.z, null)
  assert.deepEqual(new NamedJointFixtureAdapter().toFrame(namedPayload(frame)), frame)
})

test('adapters reject unsupported schemas, invalid timestamps and incompatible metadata', () => {
  const mp = new MediaPipeStyleAdapter(), named = new NamedJointFixtureAdapter()
  assert.throws(() => mp.toFrame({ ...mediaPipePayload(), schemaVersion: 'other/2' }), /schemaVersion/)
  assert.throws(() => named.toFrame({ ...namedPayload(), version: 2 }), /version/)
  for (const timestampMs of [-1, NaN, Infinity, '100']) {
    assert.throws(() => mp.toFrame({ ...mediaPipePayload(), timestampMs }), /timestampMs/)
  }
  assert.throws(() => mp.toFrame({ ...mediaPipePayload(), timeline: { origin: 'unix', id: '' } }), /timeline/)
  assert.throws(() => mp.toFrame({ ...mediaPipePayload(), mirrored: undefined }), /mirrored/)
  assert.throws(() => mp.toFrame({ ...mediaPipePayload(), imageSize: { width: 100, height: 100 } }), /separate/)
  assert.throws(() => mp.toFrame({ ...mediaPipePayload(), landmarks: [[1, 2, 3]] }), /object/)
  const p = namedPayload()
  p.coordinates.units = 'pixels'
  assert.throws(() => named.toFrame(p), /Estimated 3D/)
  p.coordinates = { ...base.coordinates, axes: 'y-up' }
  assert.throws(() => named.toFrame(p), /coordinates/)
  assert.throws(() => named.toFrame({ ...namedPayload(), joints: { bogus: {} } }), /Unknown/)
  const bad = mediaPipePayload()
  bad.landmarks[0].x = NaN
  assert.throws(() => mp.toFrame(bad), /finite/)
  bad.landmarks[0].x = 0
  bad.landmarks[0].visibility = 2
  assert.throws(() => mp.toFrame(bad), /within/)
})

test('canonical validation rejects inconsistent depth and invalid observation structure', () => {
  const frame = clone(base)
  frame.observations.head.position.z = null
  assert.throws(() => skeleton.constructPose(frame), /requires Z/)
  frame.observations.head = createJointObservation(0, 0, null)
  frame.observations.head.depth = { ...frame.observations.head.depth, uncertainty: -1 }
  assert.throws(() => skeleton.constructPose(frame), /nonnegative/)
  assert.throws(() => skeleton.constructPose({ ...base, schemaVersion: 'dance-skeleton-frame/2' }), /schemaVersion/)
  assert.throws(() => skeleton.constructPose(imageFrame()), /isotropic/)
})

test('equivalent pixels after aspect-ratio correction have equivalent geometry', () => {
  const a = imageFrame({ width: 1000, height: 500, dx: 0.1, dy: 0.2 })
  const b = clone(a)
  b.coordinates.imageSize = { width: 500, height: 1000 }
  for (const o of Object.values(b.observations)) {
    o.position.x *= 2
    o.position.y /= 2
  }
  const pa = skeleton.constructPose(normalizedImageToPixels(a))
  const pb = skeleton.constructPose(normalizedImageToPixels(b))
  equivalentJoints(pa, pb)
  close(pa.bones.leftUpperArm.observedLength, Math.sqrt(20000))
  close(pa.bones.leftUpperArm.observedLength, pb.bones.leftUpperArm.observedLength)
  assert.throws(() => normalizedImageToPixels(base), /requires/)
  const invalid = clone(a)
  invalid.coordinates.imageSize.width = 0
  assert.throws(() => normalizedImageToPixels(invalid), /positive/)
})

test('root centering retains original root and source frame for recovering translation', () => {
  const result = rootCenter(FIXTURES.Translated)
  assert.deepEqual(result.rootPosition, { x: 3, y: -2, z: 4 })
  assert.deepEqual(result.originalFrame, FIXTURES.Translated)
  assert.equal(result.frame.coordinates.origin, 'root-relative')
  equivalentJoints(skeleton.constructPose(result.frame), skeleton.constructPose(base))
  assert.deepEqual(skeleton.constructPose(result.frame, result.originalFrame).originalFrame, FIXTURES.Translated)
})

test('body normalization removes uniform scale and translation and is reversible using metadata', () => {
  const a = normalizeBody(base), b = normalizeBody(FIXTURES.Scaled), c = normalizeBody(FIXTURES.Translated)
  close(a.scale, 0.8)
  close(b.scale, 1.6)
  assert.equal(a.frame.coordinates.units, 'body-units')
  equivalentJoints(skeleton.constructPose(a.frame), skeleton.constructPose(b.frame))
  equivalentJoints(skeleton.constructPose(a.frame), skeleton.constructPose(c.frame))
  for (const [name, o] of Object.entries(c.frame.observations)) {
    for (const axis of ['x', 'y', 'z']) close(o.position[axis] * c.scale + c.rootPosition[axis],
      c.originalFrame.observations[name].position[axis])
  }
  assert.throws(() => normalizeBody(FIXTURES['Coincident joints']), /nonzero/)
  assert.throws(() => rootCenter({ ...base, observations: {} }), /leftHip/)
  assert.throws(() => scaleFrame(base, 0), /positive/)
})

test('mirroring twice restores positions, semantic names and mirrored flag in both conventions', () => {
  for (const swapSides of [false, true]) {
    const original = FIXTURES['One arm raised']
    const first = mirrorFrame(original, { axisX: 0, swapSides })
    assert.equal(first.coordinates.mirrored, true)
    if (swapSides) close(first.observations.rightWrist.position.y, original.observations.leftWrist.position.y)
    else close(first.observations.leftWrist.position.y, original.observations.leftWrist.position.y)
    assert.deepEqual(mirrorFrame(first, { axisX: 0, swapSides }), original)
    equivalentJoints(skeleton.constructPose(mirrorFrame(first, { axisX: 0, swapSides })), skeleton.constructPose(original))
  }
})

test('pass-through and 2D estimators preserve source and separate visibility from depth', () => {
  const pass = new PassThroughDepthEstimator().reconstruct({ frame: base })
  assert.deepEqual(pass.pose, skeleton.constructPose(base))
  const two = new TwoDimensionalDepthEstimator().reconstruct({ frame: base })
  assert.deepEqual(two.pose.originalFrame, base)
  assert.equal(two.pose.joints.leftElbow.valid, true)
  assert.equal(two.pose.joints.leftElbow.position.z, null)
  assert.equal(two.pose.joints.leftElbow.depth.status, 'discarded')
  assert.equal(two.pose.bones.leftUpperArm.geometry, 'projected-2d')
  const missing = skeleton.constructPose(FIXTURES['Missing depth'])
  assert.equal(missing.joints.pelvis.position.z, null)
  assert.equal(missing.joints.pelvis.depth.status, 'missing')
  assert.equal(missing.joints.leftElbow.visibility, 0.95)
  assert.equal(missing.joints.leftElbow.depth.uncertainty, null)
  assert.equal(missing.bones.leftUpperArm.geometry, 'projected-2d')
})

test('depth uncertainty remains separate, scales with coordinates, and uses conservative derived bounds', () => {
  const frame = clone(base)
  frame.observations.leftHip.depth.uncertainty = 0.2
  frame.observations.rightHip.depth.uncertainty = 0.4
  const pose = skeleton.constructPose(frame)
  close(pose.joints.pelvis.depth.uncertainty, 0.3)
  close(rootCenter(frame).frame.observations.leftHip.depth.uncertainty, 0.5)
  close(scaleFrame(frame, 2).observations.leftHip.depth.uncertainty, 0.4)
  assert.equal(scaleFrame(frame, 2).observations.leftHip.visibility, 0.95)
  frame.observations.leftHip.depth.uncertainty = null
  assert.equal(skeleton.constructPose(frame).joints.pelvis.depth.uncertainty, null)
  const image = imageFrame({ z: 0.1 })
  image.observations.leftShoulder.depth.uncertainty = 0.02
  close(normalizedImageToPixels(image).observations.leftShoulder.depth.uncertainty, 20)
})

test('calibration boundary validates versions, units, provenance and finite positive estimates', () => {
  assert.throws(() => validateCalibration({ ...calibration(), schemaVersion: '2' }), /schemaVersion/)
  assert.throws(() => validateCalibration(calibration(-1)), /positive/)
  assert.throws(() => validateCalibration(calibration(1, 'inches', false)), /units/)
  const bad = calibration()
  bad.boneLengths.leftUpperArm.provenance = 'avatar-mesh'
  assert.throws(() => validateCalibration(bad), /provenance/)
  bad.boneLengths.leftUpperArm.provenance = 'population-average'
  assert.doesNotThrow(() => validateCalibration(bad))
  bad.imageScale.metersPerPixel = 0
  assert.throws(() => validateCalibration(bad), /positive/)
})

test('bone depth requires explicit compatible calibration, including image size', () => {
  assert.equal(solve({ calibration: undefined }).status, 'missing-calibration')
  assert.equal(solve({ calibration: calibration(0.5, 'meters', false) }).status, 'missing-calibration')
  assert.equal(solve({ calibration: calibration(0.5, 'body-units', false) }).status, 'incompatible-units')
  assert.equal(solve({ frame: base, calibration: calibration(100, 'pixels', false) }).status, 'incompatible-units')
  const c = calibration()
  c.imageScale.imageSize.width = 999
  assert.equal(solve({ calibration: c }).status, 'incompatible-units')
  assert.equal(solve({ calibration: { ...calibration(), boneLengths: {} } }).status, 'missing-calibration')
})

test('bone depth returns both signs, not an arbitrary positive root or camera distance', () => {
  const result = solve()
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.experimental, true)
  close(result.projectedLength, 0.3)
  close(result.candidates[0], -0.4)
  close(result.candidates[1], 0.4)
  assert.equal(result.selectedDeltaZ, null)
  const metric = solve({ frame: base, calibration: calibration(0.5, 'meters', false) })
  assert.equal(metric.status, 'ambiguous')
  const pixels = solve({ calibration: calibration(500, 'pixels', false) })
  close(pixels.candidates[1], 400)
})

test('inconsistent projected lengths are reported; rounding and near-planar sensitivity stay distinct', () => {
  const bad = solve({ frame: imageFrame({ dx: 0.6 }) })
  assert.equal(bad.status, 'inconsistent')
  assert.deepEqual(bad.candidates, [])
  const near = solve({ frame: imageFrame({ dx: 0.5 - 1e-8 }) })
  assert.equal(near.sensitivity, 'ill-conditioned')
  assert.ok(near.uncertaintyAmplification > 1000)
  const planar = solve({ frame: imageFrame({ dx: 0.5 }) })
  assert.equal(planar.status, 'planar')
  assert.equal(planar.selectedDeltaZ, 0)
  assert.equal(planar.uncertaintyAmplification, null)
  assert.equal(solve({ frame: imageFrame({ dx: 0.5 + 1e-14 }) }).status, 'planar')
  assert.equal(solve({ frame: imageFrame({ dx: 0.5 + 1e-6 }) }).status, 'inconsistent')
})

test('depth constraints ignore unreliable image Z and reject low-confidence endpoints', () => {
  assert.deepEqual(solve({ frame: imageFrame({ z: 999 }) }), solve())
  const f = imageFrame()
  f.observations.leftElbow.confidence = 0.1
  assert.equal(solve({ frame: f }).status, 'invalid-observation')
  const missing = imageFrame()
  delete missing.observations.leftElbow
  assert.equal(solve({ frame: missing }).status, 'invalid-observation')
})

test('depth reconstruction is deterministic with explicit sign priors and previous poses', () => {
  const a = solve({ priorDeltaZ: -2 })
  assert.equal(a.status, 'prior-selected')
  close(a.selectedDeltaZ, -0.4)
  close(solve({ priorDeltaZ: 2 }).selectedDeltaZ, 0.4)
  assert.equal(solve({ priorDeltaZ: 0 }).status, 'ambiguous')
  assert.deepEqual(solve({ priorDeltaZ: -2 }), a)
  assert.throws(() => solve({ priorDeltaZ: NaN }), /finite/)
  const previous = clone(base)
  previous.timestampMs = 900
  previous.observations.leftElbow.position.z = -0.1
  const previousPose = skeleton.constructPose(previous)
  close(solve({ previousPose }).selectedDeltaZ, -0.4)
  assert.deepEqual(solve({ previousPose }), solve({ previousPose }))
  const otherTimeline = { ...previousPose, frame: { ...previousPose.frame, timeline: { origin: 'video-start', id: 'other' } } }
  assert.throws(() => solve({ previousPose: otherTimeline }), /timeline/)
  assert.equal(solve().selectedDeltaZ, null)
})
