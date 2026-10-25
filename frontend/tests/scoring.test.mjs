import test from 'node:test'
import assert from 'node:assert/strict'
import { MediaPipeStyleAdapter, mirrorFrame } from '../../shared/skeleton/dist/index.js'
import { imageFrame, danceFrame, chartFor, hide } from './fixtures/scoring.mjs'
import { DanceScorer } from '../.keyframe-tests/scoring/DanceScorer.js'
import { scoringConfig } from '../.keyframe-tests/scoring/contracts.js'
import { extractPoseFeatures, hasReferenceEvidence } from '../.keyframe-tests/scoring/features.js'
import { comparePoses, compareMotion } from '../.keyframe-tests/scoring/similarity.js'
import { buildReferenceTrack, poseAtTime } from '../.keyframe-tests/scoring/referenceTrack.js'
import { adaptLegacyChartSample } from '../.keyframe-tests/scoring/legacyChartAdapter.js'
import { alignBlock } from '../.keyframe-tests/scoring/alignment.js'

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
function finiteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'non-finite output')
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree)
}

/** Fixed camera stream, independent render clock. Never supply future observations. */
function replay({ reference = chartFor(), player = danceFrame, renderHz = 60, cameraHz = 60, delaySec = 0.02, tolerance = 50, stopAt, trackOptions = {} } = {}) {
  const config = scoringConfig({ timingToleranceMs: tolerance })
  const track = buildReferenceTrack(reference, { ...trackOptions, config })
  const scorer = new DanceScorer(track, config)
  const stop = stopAt ?? track.durationSec
  const end = stopAt === undefined ? stop + 0.4 : stop
  let cameraIndex = 0
  for (let renderIndex = 0; renderIndex / renderHz <= end + 1e-7; renderIndex++) {
    const now = renderIndex / renderHz
    while (cameraIndex / cameraHz + delaySec <= now + 1e-7) {
      const capture = cameraIndex++ / cameraHz
      scorer.addObservation({ songTimeSec: capture, receivedAtSongTimeSec: capture + delaySec, frame: player(capture) })
    }
    scorer.advance(now)
  }
  return { result: scorer.finish(stop), scorer, track }
}

test('pose comparison uses normalized limb directions, bends, and endpoints without modifying observations', () => {
  const frame = danceFrame(0.3), original = structuredClone(frame)
  const features = extractPoseFeatures(frame)
  assert.ok(Object.values(features.features).some((feature) => feature.kind === 'bend'))
  for (const feature of Object.values(features.features).filter((feature) => feature.kind === 'direction')) close(Math.hypot(...feature.value), 1)
  close(comparePoses(features, features).form, 1)
  assert.deepEqual(frame, original)
})

test('body translation and uniform scale do not change form or normalized movement', () => {
  const transformed = (time) => danceFrame(time, (frame) => {
    for (const observation of Object.values(frame.observations)) {
      observation.position.x = 500 + (observation.position.x - 500) * 0.7 + 60
      observation.position.y = 450 + (observation.position.y - 450) * 0.7 - 30
    }
  })
  close(replay({ player: transformed }).result.score, replay().result.score)
})

test('aspect-ratio corrected normalized-image coordinates equal isotropic pixel features', () => {
  const pixels = danceFrame(0.4)
  pixels.coordinates.imageSize = { width: 1600, height: 900 }
  const normalized = structuredClone(pixels)
  normalized.coordinates.units = 'normalized-image'
  for (const observation of Object.values(normalized.observations)) {
    observation.position.x /= 1600; observation.position.y /= 900
  }
  close(comparePoses(extractPoseFeatures(normalized), extractPoseFeatures(pixels)).form, 1)
})

test('image-relative depth is preserved in observations but does not affect scoring', () => {
  const frame = danceFrame(0.4), noisy = structuredClone(frame)
  noisy.coordinates.depthModel = 'image-relative'
  for (const [index, observation] of Object.values(noisy.observations).entries()) {
    observation.position.z = index * 1000
    observation.depth = { provenance: 'provider-estimate', status: 'estimated', uncertainty: null }
  }
  assert.deepEqual(extractPoseFeatures(noisy), extractPoseFeatures(frame))
  assert.throws(() => extractPoseFeatures({ ...frame, coordinates: { ...frame.coordinates, kind: 'estimated-3d', units: 'meters' } }), /image observations/)
})

test('one hidden wrist or hip permits conservative partial scoring; one visible wrist is insufficient', () => {
  const reference = extractPoseFeatures(imageFrame())
  for (const joint of ['leftWrist', 'leftHip']) {
    const partial = comparePoses(extractPoseFeatures(hide(imageFrame(), joint)), reference)
    assert.equal(partial.status, 'partial')
    assert.ok(partial.coverage >= 0.65 && partial.coverage < 1)
    close(partial.form, 1)
  }
  const wristOnly = imageFrame()
  for (const [name, observation] of Object.entries(wristOnly.observations)) if (name !== 'leftWrist') observation.visibility = 0.1
  assert.equal(comparePoses(extractPoseFeatures(wristOnly), reference).status, 'unavailable')
})

test('hiding an incorrect limb does not improve its awarded form contribution', () => {
  const reference = extractPoseFeatures(imageFrame()), wrong = danceFrame(0.28)
  const visible = comparePoses(extractPoseFeatures(wrong), reference)
  const hidden = comparePoses(extractPoseFeatures(hide(wrong, 'leftElbow', 'leftWrist')), reference)
  assert.ok(hidden.coverage * hidden.form <= visible.coverage * visible.form + 1e-8)
})

test('missing, non-finite, coincident, and offscreen joints produce no fabricated perfect pose or NaNs', () => {
  const frames = [imageFrame(), imageFrame(), imageFrame(), imageFrame()]
  for (const observation of Object.values(frames[0].observations)) observation.position = null
  for (const observation of Object.values(frames[1].observations)) observation.position.x = NaN
  for (const observation of Object.values(frames[2].observations)) observation.position = { x: 500, y: 450, z: null }
  for (const observation of Object.values(frames[3].observations)) observation.position.x = -10
  for (const frame of frames) {
    const pose = extractPoseFeatures(frame)
    assert.equal(hasReferenceEvidence(pose), false)
    assert.equal(comparePoses(pose, extractPoseFeatures(imageFrame())).status, 'unavailable')
    finiteTree(pose)
  }
})

test('unknown quality remains usable, explicitly low confidence is excluded', () => {
  const unknown = imageFrame(), low = imageFrame()
  for (const observation of Object.values(unknown.observations)) { observation.visibility = null; observation.confidence = null }
  for (const observation of Object.values(low.observations)) observation.confidence = 0.2
  close(comparePoses(extractPoseFeatures(unknown), extractPoseFeatures(unknown)).coverage, 1)
  assert.equal(hasReferenceEvidence(extractPoseFeatures(low)), false)
})

test('upper-body-only references can be judged without inventing lower-body positions', () => {
  const upper = imageFrame()
  hide(upper, 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle')
  const pose = extractPoseFeatures(upper)
  assert.equal(hasReferenceEvidence(pose), true)
  assert.equal(comparePoses(pose, pose).status, 'scorable')
})

test('reflection exchanges semantic sides exactly once and rejects pre-mirrored input', () => {
  const frame = danceFrame(0.25), still = imageFrame()
  for (const name of ['rightShoulder', 'rightElbow', 'rightWrist']) frame.observations[name] = still.observations[name]
  const mirrored = structuredClone(mirrorFrame(frame, { axisX: 500, swapSides: true }))
  mirrored.coordinates.mirrored = false // External raw camera observing the opposite choreography.
  close(comparePoses(extractPoseFeatures(mirrored), extractPoseFeatures(frame, true)).form, 1)
  assert.ok(comparePoses(extractPoseFeatures(mirrored), extractPoseFeatures(frame)).form < 0.9)
  assert.throws(() => extractPoseFeatures(mirrorFrame(frame, { axisX: 500, swapSides: true })), /unmirrored/)
})

test('interpolation respects hidden observations, tracking gaps, coordinate changes, and stale edges', () => {
  const a = extractPoseFeatures(imageFrame()), b = extractPoseFeatures(hide(imageFrame(), 'leftWrist'))
  const partial = poseAtTime([{ timeSec: 0, pose: a }, { timeSec: 0.05, pose: b }], 0.025)
  assert.equal(partial.features.leftForearm, undefined)
  assert.equal(poseAtTime([{ timeSec: 0, pose: a }, { timeSec: 0.2, pose: a }], 0.1), null)
  assert.equal(poseAtTime([{ timeSec: 0, pose: a }, { timeSec: 0.05, pose: null }], 0.025), null)
  assert.equal(poseAtTime([{ timeSec: 0, pose: a }, { timeSec: 0.05, pose: { ...a, continuity: 'different' } }], 0.025), null)
  assert.equal(poseAtTime([{ timeSec: 0, pose: a }], 0.02), null)
})

test('identical moving performance scores near 10,000; render refresh rate cannot change score or combo', () => {
  const results = [30, 60, 144].map((renderHz) => replay({ renderHz }).result)
  assert.ok(results[0].score > 9950, JSON.stringify(results[0]))
  assert.equal(results[0].maxCombo, 6)
  assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0])
})

test('missing player frames award no points and do not become dance mistakes or perfect poses', () => {
  const { result } = replay({ player: () => null })
  assert.equal(result.score, 0); assert.equal(result.label, 'TRACKING'); assert.equal(result.maxCombo, 0)
  assert.equal(result.trackingMisses, 60)
})

test('partial evidence lowers points, avoids PERFECT, and survives an occlusion interval', () => {
  const { result } = replay({ reference: chartFor(imageFrame), player: (time) => hide(imageFrame(time), 'leftWrist') })
  assert.ok(result.score > 6500 && result.score < 9000)
  assert.notEqual(result.label, 'PERFECT'); finiteTree(result)
  const hiddenInterval = replay({ player: (time) => time > 1 && time < 2 ? null : danceFrame(time) }).result
  assert.ok(hiddenInterval.score > 5000 && hiddenInterval.score < 7500)
  assert.ok(hiddenInterval.trackingMisses > 0)
})

test('unavailable reference sections are excluded for everyone instead of causing an extraction failure', () => {
  const reference = chartFor((time) => imageFrame(time, (frame) => {
    if (time < 0.5 || time > 2.5) for (const observation of Object.values(frame.observations)) observation.visibility = 0.1
  }))
  const { result, track } = replay({ reference, player: imageFrame })
  assert.ok(track.scorableDurationSec < 2.1 && track.scorableDurationSec > 1.9)
  close(result.score, 10000); assert.equal(result.label, 'NO REFERENCE')
})

test('a stopped camera cannot continue earning points from its last frame', () => {
  const { scorer } = replay({ reference: chartFor(imageFrame), player: (time) => time < 0.5 ? imageFrame(time) : null, stopAt: 1.1 })
  const before = scorer.snapshot().score
  assert.equal(scorer.addObservation({ songTimeSec: 0.1, receivedAtSongTimeSec: 2, frame: imageFrame() }), false)
  close(scorer.advance(2).score, before)
  const frozen = replay({ reference: chartFor(imageFrame), cameraHz: 1, player: imageFrame }).result
  assert.ok(frozen.score < 1000)
})

test('observation deadlines reject late, duplicate, invalid, and out-of-order deliveries', () => {
  const scorer = new DanceScorer(buildReferenceTrack(chartFor()))
  const add = (capture, arrival) => scorer.addObservation({ songTimeSec: capture, receivedAtSongTimeSec: arrival, frame: danceFrame(capture) })
  assert.equal(add(0, 0.2), true)
  assert.equal(add(0, 0.2), false)
  assert.equal(add(0.1, 0.301), false)
  assert.equal(add(0.2, 0.19), false)
  assert.equal(add(NaN, 0.2), false)
  assert.equal(add(0.1, 0.12), true)
  assert.throws(() => scorer.advance(NaN), /finite song seconds/)
})

test('repeated render ticks, paused song time, and repeated finish cannot award twice; early exit uses full denominator', () => {
  const { result, scorer } = replay({ reference: chartFor(imageFrame), player: imageFrame, stopAt: 1 })
  assert.ok(result.score <= 3400)
  assert.deepEqual(scorer.advance(1), result); assert.deepEqual(scorer.finish(3), result)
  assert.equal(scorer.addObservation({ songTimeSec: 2, receivedAtSongTimeSec: 2, frame: imageFrame() }), false)
  assert.deepEqual(replay({ reference: chartFor(imageFrame), player: imageFrame }).result, replay({ reference: chartFor(imageFrame), player: imageFrame }).result)
})

test('timing policy accepts 30–70 ms only; inference delivery budget does not widen the matching band', () => {
  assert.equal(scoringConfig().timingToleranceMs, 50)
  for (const value of [30, 50, 70]) assert.equal(scoringConfig({ timingToleranceMs: value }).timingToleranceMs, value)
  for (const value of [0, 29, 71, 200, NaN]) assert.throws(() => scoringConfig({ timingToleranceMs: value }), /30–70/)
  assert.throws(() => scoringConfig({ sampleHz: 60 }), /version/)
  const reference = buildReferenceTrack(chartFor()).opportunities.slice(12, 16)
  const live = Array.from({ length: 80 }, (_, index) => ({ timeSec: index / 60, pose: extractPoseFeatures(danceFrame(index / 60 - 0.12)) }))
  const aligned = alignBlock(reference, live, scoringConfig({ timingToleranceMs: 30 }), null)
  for (let index = 0; index < aligned.length; index++) {
    const anchor = aligned[index].anchor
    assert.ok(Math.abs(anchor.playerTimeSec - anchor.referenceTimeSec) <= 0.0300001)
    if (index) {
      const step = anchor.playerTimeSec - aligned[index - 1].anchor.playerTimeSec
      assert.ok(step >= 0.025 - 1e-7 && step <= 0.075 + 1e-7)
    }
  }
})

test('early and late movement degrade gracefully; wider allowed timing helps more than a narrow band', () => {
  const exact = replay().result.score
  for (const shift of [-0.06, 0.06]) {
    const player = (time) => danceFrame(time - shift)
    const narrow = replay({ player, tolerance: 30 }).result
    const wide = replay({ player, tolerance: 70 }).result
    assert.ok(wide.score > narrow.score, `${shift}: ${wide.score} <= ${narrow.score}`)
    assert.ok(exact > wide.score)
    assert.ok(Math.abs(wide.offsetMs ?? 0) <= 70)
  }
  const veryLate = replay({ player: (time) => danceFrame(time - 0.3), tolerance: 70 }).result
  assert.ok(veryLate.score < exact - 1800)
})

test('standing still, reversing a sequence, and moving the wrong arm cannot match a moving reference', () => {
  const exact = replay().result.score
  const standing = replay({ player: imageFrame }).result.score
  const reversed = replay({ player: (time) => danceFrame(3 - time) }).result.score
  const wrongSide = replay({ player: (time) => {
    const frame = structuredClone(mirrorFrame(danceFrame(time), { axisX: 500, swapSides: true }))
    frame.coordinates.mirrored = false
    return frame
  } }).result.score
  assert.ok(standing < exact - 1800, `${standing}`)
  assert.ok(reversed < exact - 1800, `${reversed}`)
  assert.ok(wrongSide < exact - 1000, `${wrongSide}`)
})

test('scene travel is compared separately from translation-invariant form', () => {
  const moving = (time) => imageFrame(time, (frame) => {
    for (const observation of Object.values(frame.observations)) observation.position.x += 75 * time
  })
  const reference = chartFor(moving)
  const matched = replay({ reference, player: moving }).result.score
  const stationary = replay({ reference, player: imageFrame }).result.score
  assert.ok(matched > stationary + 1800, `${matched} versus ${stationary}`)
  close(comparePoses(extractPoseFeatures(moving(1)), extractPoseFeatures(imageFrame())).form, 1)
  assert.equal(compareMotion(extractPoseFeatures(moving(0)), extractPoseFeatures(moving(0.05)), extractPoseFeatures(imageFrame()), extractPoseFeatures(imageFrame())).active, true)
})

test('original-video scoring uses source seconds after chart edits; chart mode uses chart seconds', () => {
  const reference = chartFor(imageFrame, 1)
  for (const sample of reference.samples) { sample.sourceTimeSec = sample.t; sample.t += 2 }
  reference.segments = [{ id: 'moved', startSec: 2, endSec: 3, sampleCount: reference.samples.length }]
  reference.durationSec = 3
  const source = buildReferenceTrack(reference, { timeline: 'source-video', durationSec: 1 })
  const chart = buildReferenceTrack(reference)
  close(source.scorableDurationSec, 1)
  assert.equal(chart.opportunities[0].pose, null)
  assert.ok(chart.opportunities.at(-1).pose)
})

test('legacy boundary uses existing provider mapping and requires explicit aspect instead of guessing', () => {
  const size = { width: 1600, height: 900 }
  const points = Array.from({ length: 33 }, (_, index) => ({ x: 0.3 + (index % 5) * 0.06, y: 0.2 + Math.floor(index / 5) * 0.07, visibility: 0.95 }))
  const modern = new MediaPipeStyleAdapter().toFrame({ schemaVersion: 'mediapipe-style/1', timestampMs: 0,
    timeline: { origin: 'video-start', id: 'test' }, space: 'normalized-image', imageSize: size, mirrored: false, depth: 'omit', landmarks: points })
  const legacySample = { t: 0, landmarks: points.map((point) => [(point.x - 0.5) / 0.3, (point.y - 0.5) / 0.3, 0, point.visibility]) }
  close(comparePoses(extractPoseFeatures(adaptLegacyChartSample(legacySample, size)), extractPoseFeatures(modern)).form, 1)
  assert.equal(extractPoseFeatures(adaptLegacyChartSample(legacySample, size)).root, null)
  assert.throws(() => adaptLegacyChartSample(legacySample, { width: 0, height: 900 }), /dimensions/)
  const reference = chartFor(imageFrame, 1)
  reference.samples = reference.samples.map((sample) => ({ t: sample.t, landmarks: legacySample.landmarks }))
  const missingAspect = buildReferenceTrack(reference)
  assert.equal(missingAspect.scorableDurationSec, 0)
  assert.match(missingAspect.warnings[0], /reference video/)
  assert.ok(buildReferenceTrack(reference, { imageSize: size }).scorableDurationSec > 0)
})

test('invalid reference timestamps, excessive tracks, malformed frames, and unsupported policies fail safely', () => {
  assert.throws(() => buildReferenceTrack({ ...chartFor(), durationSec: Infinity }), /finite reference/)
  const badTime = chartFor(); badTime.samples[0].t = NaN
  assert.throws(() => buildReferenceTrack(badTime), /timestamp/)
  const badMetadata = chartFor((time) => ({ ...imageFrame(time), schemaVersion: 'unknown' }))
  const track = buildReferenceTrack(badMetadata)
  assert.equal(track.scorableDurationSec, 0); assert.ok(track.warnings.length)
  assert.throws(() => new DanceScorer({ ...track, schemaVersion: 'unknown' }), /version/)
})
