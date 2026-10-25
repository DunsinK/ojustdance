import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FIXTURES } from '../../shared/skeleton/dist/fixtures.js'
import { createJointObservation } from '../../shared/skeleton/dist/index.js'
import { CURRENT_SELECTION_ALGORITHM, CURRENT_THUMBNAIL_ASSETS, DEFAULT_THUMBNAIL_APPEARANCE, isCurrentThumbnailTrack, matchesThumbnailAppearance, MINIMUM_TARGET_SPACING_SEC, THUMBNAIL_LIMITS } from '../.keyframe-tests/keyframes/contracts.js'
import { applyPersonAlpha, personFraming, centeredTransforms, maskAlphaAt } from '../.keyframe-tests/keyframes/personMatte.js'
import { evaluateMotionSelection, selectMotionKeyframes } from '../.keyframe-tests/keyframes/selectKeyframes.js'
import { buildSelectionReview } from '../.keyframe-tests/keyframes/selectionReview.js'
import { validateMotionThumbnails } from '../.keyframe-tests/keyframes/validation.js'
import { thumbnailPosition, thumbnailState } from '../.keyframe-tests/keyframes/timing.js'
import { canonicalMotionSamples } from '../.keyframe-tests/keyframes/chartSamples.js'
import { buildChartDocument, closeGaps } from '../.keyframe-tests/pose/exportChart.js'
import { parseChartDocument } from '../.keyframe-tests/pose/parseChart.js'
import { captureThumbnailAssets } from '../.keyframe-tests/keyframes/thumbnailAssets.js'
import { observationFraming } from '../.keyframe-tests/keyframes/observationFraming.js'
import { PersonNotFoundError } from '../.keyframe-tests/keyframes/personSegmentation.js'
import { analyzeVideoFile } from '../.keyframe-tests/pose/analyzeVideo.js'
import { compareVisualTargets } from '../.keyframe-tests/keyframes/visualReview.js'
import { seekVideo } from '../.keyframe-tests/keyframes/media.js'

function sample(time, transform) {
  const frame = structuredClone(FIXTURES['T-pose'])
  frame.coordinates = { kind: 'image', units: 'pixels', axes: 'x-right-y-down-z-away', handedness: 'right', origin: 'image-top-left', depthModel: 'none', mirrored: false, imageSize: { width: 640, height: 640 } }
  frame.timestampMs = time * 1000
  for (const [name, observation] of Object.entries(frame.observations)) {
    // Leave headroom for a raised arm; out-of-frame behavior has separate fixtures.
    frame.observations[name] = createJointObservation(320 + observation.position.x * 170, 400 + observation.position.y * 170, null, 0.95, 0.95)
  }
  transform?.(frame, time)
  return { chartTimeSec: time, sourceTimeSec: time, segmentId: 'clip-a', frame }
}
function sequence(transform, seconds = 6) { return Array.from({ length: seconds * 15 + 1 }, (_, index) => sample(index / 15, transform)) }
function liftAmount(time) { return time < 1 ? 0 : time < 2 ? time - 1 : time < 3 ? 1 : time < 4 ? 4 - time : 0 }
function armLift(frame, time, side = 'left') {
  frame.observations[`${side}Wrist`].position.y -= 180 * liftAmount(time)
  frame.observations[`${side}Elbow`].position.y -= 90 * liftAmount(time)
}
const lift = () => sequence(armLift)
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
function finiteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value))
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree)
}
function withImages(plan) {
  const result = structuredClone(plan)
  for (const cue of result.cues) for (const [index, id] of cue.frameIds.entries()) {
    result.frames[id] = { sourceTimeSec: cue.presentation === 'pair' && index === 0 ? cue.startTimeSec : cue.thumbnailTimeSec, width: 192, height: 144, dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }
  }
  return result
}

test('static poses and subpixel tracking noise do not invent movement thumbnails', () => {
  assert.equal(selectMotionKeyframes(sequence()).cues.length, 0)
  const jitter = sequence((frame, time) => {
    const noise = Math.sin(time * 271) * 0.7
    frame.observations.leftWrist.position.x += noise
    frame.observations.leftWrist.position.y -= noise
  })
  assert.equal(selectMotionKeyframes(jitter).cues.length, 0)
})
test('arm lift and return produce distinct measured extrema with earlier activation times', () => {
  const plan = selectMotionKeyframes(lift())
  assert.equal(plan.cues.length, 2)
  for (const [index, cue] of plan.cues.entries()) {
    assert.deepEqual(cue.parts, ['leftArm'])
    // A clear measured frame just inside the hold is preferable to a blurred
    // transition frame at its exact mathematical boundary.
    assert.ok(cue.thumbnailTimeSec >= (index ? 4 : 2) - 0.08 && cue.thumbnailTimeSec <= (index ? 4 : 2) + 0.2)
    assert.ok(cue.startTimeSec < cue.thumbnailTimeSec - 0.5)
    assert.equal(cue.presentation, 'pose')
    assert.equal(cue.frameIds.length, 1)
  }
  validateMotionThumbnails(plan, false)
  finiteTree(plan)
})
test('simultaneous arm movements merge while later repetitions remain separate', () => {
  const both = selectMotionKeyframes(sequence((frame, time) => { armLift(frame, time); armLift(frame, time, 'right') }))
  assert.equal(both.cues.length, 2)
  assert.deepEqual([...both.cues[0].parts].sort(), ['leftArm', 'rightArm'])
  const repeated = selectMotionKeyframes(sequence((frame, time) => armLift(frame, time % 4), 8))
  assert.equal(repeated.cues.length, 4)
  assert.ok(repeated.cues[2].startTimeSec > 4)
})
test('root travel survives body-relative normalization and uniform body scaling does not create cues', () => {
  const translated = selectMotionKeyframes(sequence((frame, time) => {
    for (const observation of Object.values(frame.observations)) observation.position.x += 150 * liftAmount(time)
  }))
  assert.equal(translated.cues.length, 2)
  assert.deepEqual(translated.cues[0].parts, ['travel'])
  const zoomed = selectMotionKeyframes(sequence((frame, time) => {
    const factor = 1 + liftAmount(time)
    for (const observation of Object.values(frame.observations)) {
      observation.position.x = 320 + (observation.position.x - 320) * factor
      observation.position.y = 400 + (observation.position.y - 400) * factor
    }
  }))
  assert.equal(zoomed.cues.length, 0)
})
test('missing, low-confidence, non-finite, and coincident observations do not fabricate cues', () => {
  for (const kind of ['missing', 'low', 'non-finite', 'coincident']) {
    const values = sequence((frame, time) => {
      armLift(frame, time)
      if (kind === 'missing') delete frame.observations.leftWrist
      if (kind === 'low') frame.observations.leftWrist.visibility = 0.1
      if (kind === 'non-finite') frame.observations.leftWrist.position.x = NaN
      if (kind === 'coincident') for (const observation of Object.values(frame.observations)) observation.position = { x: 0, y: 0, z: null }
    })
    const plan = selectMotionKeyframes(values)
    assert.equal(plan.cues.length, 0, kind)
    finiteTree(plan)
  }
})
test('tracking gaps, clip boundaries, and camera cuts do not become interpolated movements', () => {
  const before = sequence(undefined, 1)
  const after = sequence((frame) => armLift(frame, 2), 1).map((entry) => ({ ...entry, sourceTimeSec: entry.sourceTimeSec + 2, chartTimeSec: entry.chartTimeSec + 2 }))
  assert.equal(selectMotionKeyframes([...before, ...after]).cues.length, 0)
  const separateClips = sequence((frame, time) => { if (time > 2) armLift(frame, 2) }).map((entry) => ({ ...entry, segmentId: entry.sourceTimeSec > 2 ? 'clip-b' : 'clip-a' }))
  assert.equal(selectMotionKeyframes(separateClips).cues.length, 0)
  const cut = sequence((frame, time) => {
    if (time >= 2) for (const observation of Object.values(frame.observations)) observation.position.x += 1000
  })
  assert.equal(selectMotionKeyframes(cut).cues.length, 0)
})
test('uncertain image Z never affects candidate selection', () => {
  const original = lift()
  const depth = structuredClone(original)
  for (const entry of depth) {
    entry.frame.coordinates.depthModel = 'image-relative'
    for (const observation of Object.values(entry.frame.observations)) {
      observation.position.z = Math.sin(entry.sourceTimeSec * 63) * 9999
      observation.depth = { provenance: 'provider-estimate', status: 'estimated', uncertainty: null }
    }
  }
  assert.deepEqual(selectMotionKeyframes(depth), selectMotionKeyframes(original))
})
test('selection is deterministic, preserves inputs, and never mixes coordinate spaces', () => {
  const values = lift(), snapshot = structuredClone(values)
  const result = selectMotionKeyframes(values)
  assert.deepEqual(selectMotionKeyframes([...values].reverse()), result)
  selectMotionKeyframes(sequence())
  assert.deepEqual(selectMotionKeyframes(values), result)
  assert.deepEqual(values, snapshot)
  const invalid = structuredClone(values)
  invalid[1].frame.coordinates.units = 'normalized-image'
  assert.throws(() => selectMotionKeyframes(invalid), /canonical pixel/)
  invalid[1] = { ...values[1], sourceTimeSec: Infinity }
  assert.throws(() => selectMotionKeyframes(invalid), /timestamps/)
})
test('moving/packing chart clips retains original video timestamps for image capture and queue timing', () => {
  const samples = lift().map((entry) => ({ t: entry.chartTimeSec + 10, sourceTimeSec: entry.sourceTimeSec + 5, canonicalFrame: entry.frame, landmarks: [] }))
  const packed = closeGaps([{ id: 'moved-clip', startSec: 10, endSec: 16, samples }])
  const canonical = canonicalMotionSamples(packed)
  assert.equal(canonical[0].chartTimeSec, 0)
  assert.equal(canonical[0].sourceTimeSec, 5)
  const plan = selectMotionKeyframes(canonical)
  assert.ok(plan.cues[0].startTimeSec >= 6 && plan.cues[0].startTimeSec < 6.3)
  close(plan.cues[0].thumbnailTimeSec, 7, 0.2)
})
test('glow arrival, lead-in, pause, and backwards seeking are pure functions of media time', () => {
  const cue = selectMotionKeyframes(lift()).cues[0]
  close(thumbnailPosition(cue.startTimeSec, cue.startTimeSec, 3, 900), 70)
  assert.ok(thumbnailPosition(cue.startTimeSec, cue.startTimeSec - 1, 3, 900) > 70)
  assert.ok(thumbnailPosition(cue.startTimeSec, cue.startTimeSec + 1, 3, 900) < 70)
  assert.equal(thumbnailState(cue, cue.startTimeSec - 4, 3), 'hidden')
  assert.equal(thumbnailState(cue, cue.startTimeSec - 2, 3), 'upcoming')
  assert.equal(thumbnailState(cue, cue.startTimeSec, 3), 'active')
  assert.equal(thumbnailState(cue, cue.endTimeSec, 3), 'past')
  const initial = thumbnailPosition(cue.startTimeSec, 0, 3, 900)
  thumbnailPosition(cue.startTimeSec, 5, 3, 900)
  close(thumbnailPosition(cue.startTimeSec, 0, 3, 900), initial)
  assert.equal(cue.presentation, 'pose')
  assert.equal(cue.frameIds.length, 1)
})
test('chart save/reload retains the complete thumbnail cache without inference or selection', () => {
  const plan = withImages(selectMotionKeyframes(lift()))
  validateMotionThumbnails(plan)
  const chart = buildChartDocument({ segments: [{ id: 'test', startSec: 0, endSec: 6, samples: [{ t: 0, landmarks: [] }] }], title: 'test', difficulty: 'easy', model: 'lite', sampleRateHz: 15, motionThumbnails: plan })
  const reloaded = parseChartDocument(JSON.stringify(chart))
  assert.deepEqual(reloaded.motionThumbnails, plan)
  const legacy = { ...chart }; delete legacy.motionThumbnails
  assert.equal(parseChartDocument(legacy).motionThumbnails, undefined)
})
test('malformed, oversized, executable, and incompatible persisted thumbnail data is rejected', () => {
  const valid = withImages(selectMotionKeyframes(lift()))
  for (const mutate of [
    (plan) => { plan.schemaVersion = 'motion-thumbnails/2' },
    (plan) => { plan.clock = 'milliseconds' },
    (plan) => { plan.cues[0].startTimeSec = NaN },
    (plan) => { plan.cues[1].id = plan.cues[0].id },
    (plan) => { plan.cues[1].startTimeSec = plan.cues[0].startTimeSec - 1 },
    (plan) => { delete plan.frames[plan.cues[0].frameIds[0]] },
    (plan) => { plan.frames[plan.cues[0].frameIds[0]].dataUrl = 'javascript:alert(1)' },
    (plan) => { plan.frames[plan.cues[0].frameIds[0]].dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(THUMBNAIL_LIMITS.encodedImageChars + 1) },
    (plan) => { plan.cues[0].parts = ['invented-part'] },
  ]) {
    const invalid = structuredClone(valid); mutate(invalid)
    assert.throws(() => validateMotionThumbnails(invalid))
  }
})

class FakeVideo extends EventTarget {
  videoWidth = 640; videoHeight = 360; duration = 6; readyState = 2; src = ''; time = 0; closed = false; neverSeek = false
  get currentTime() { return this.time }
  set currentTime(value) { this.time = value; if (!this.neverSeek) queueMicrotask(() => this.dispatchEvent(new Event('seeked'))) }
  load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('loadeddata'))) }
  pause() { this.closed = true }
  removeAttribute() { this.src = '' }
}
function mockDocument() {
  const videos = [], renders = [], transforms = [], alphaWrites = [], encodings = []
  let currentVideo
  return { videos, renders, transforms, alphaWrites, encodings, document: { createElement(name) {
    if (name === 'video') { currentVideo = new FakeVideo(); videos.push(currentVideo); return currentVideo }
    const context = {
      drawImage(video) { renders.push(video.currentTime) },
      getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4).fill(255) } },
      putImageData(pixels) { alphaWrites.push(new Uint8ClampedArray(pixels.data)) },
      clearRect() {},
      setTransform(...values) { transforms.push(values) },
    }
    return { width: 0, height: 0, getContext() { return context }, toDataURL(mime = 'image/png', quality) { encodings.push({ mime, quality, width: this.width, height: this.height }); return `data:${mime};base64,${Buffer.from(`frame-${currentVideo.currentTime}`).toString('base64')}` } }
  } } }
}
test('thumbnail preparation seeks serially, preserves background frames, caches images, and releases media', async () => {
  const mock = mockDocument(), before = globalThis.document
  globalThis.document = mock.document
  try {
    const plan = selectMotionKeyframes(lift()), copy = structuredClone(plan)
    const result = await captureThumbnailAssets('blob:test-source-one', plan, undefined, undefined, { appearance: { version: 'person-cutout/1', background: 'original', centered: false } })
    validateMotionThumbnails(result)
    assert.deepEqual(plan, copy)
    assert.ok(Object.keys(result.frames).length > 0)
    assert.ok(mock.videos.every((video) => video.closed && video.src === ''))
    const firstRenderCount = mock.renders.length
    await captureThumbnailAssets('blob:test-source-one', plan, undefined, undefined, { appearance: { version: 'person-cutout/1', background: 'original', centered: false } })
    assert.equal(mock.renders.length, firstRenderCount)
  } finally { globalThis.document = before }
})
test('waiting for a video seek can be cancelled promptly', async () => {
  const video = new FakeVideo(); video.neverSeek = true
  const controller = new AbortController()
  const promise = seekVideo(video, 3, controller.signal)
  controller.abort()
  await assert.rejects(promise, { name: 'AbortError' })
})

test('leg bends generate shared knee-motion events independently of the arms', () => {
  const plan = selectMotionKeyframes(sequence((frame, time) => {
    frame.observations.leftKnee.position.y -= liftAmount(time) * 110
    frame.observations.rightKnee.position.y -= liftAmount(time) * 110
  }))
  assert.equal(plan.cues.length, 2)
  assert.ok(plan.cues.every((cue) => cue.parts.includes('leftLeg') && cue.parts.includes('rightLeg')))
  assert.ok(plan.cues.every((cue) => !cue.parts.includes('leftArm')))
})
test('long continuous motion produces bounded-duration visual milestones', () => {
  const plan = selectMotionKeyframes(sequence((frame, time) => {
    frame.observations.leftWrist.position.y -= time * 25
    frame.observations.leftElbow.position.y -= time * 12
  }, 12))
  assert.ok(plan.cues.length >= 3)
  assert.ok(plan.cues.every((cue) => cue.endTimeSec - cue.startTimeSec <= 4.1))
  assert.throws(() => selectMotionKeyframes(Array(18001).fill(sample(0))), /Too many/)
})

test('even a short missing-detection gap cannot turn a pose discontinuity into a motion cue', () => {
  const samples = sequence((frame, time) => { if (time >= 2) armLift(frame, 2) })
    .filter((entry) => entry.sourceTimeSec < 2 || entry.sourceTimeSec >= 2.2)
  assert.equal(selectMotionKeyframes(samples).cues.length, 0)
})

function triangle(time, start, peak, end) {
  return time < start || time > end ? 0 : time <= peak ? (time - start) / (peak - start) : (end - time) / (end - peak)
}
test('small but deliberate wrist movements survive whole-limb averaging and do not become background noise', () => {
  const samples = sequence((frame, time) => { frame.observations.leftWrist.position.y -= 22 * triangle(time, 1, 2, 3) })
  const plan = selectMotionKeyframes(samples)
  assert.equal(plan.algorithm, CURRENT_SELECTION_ALGORITHM)
  assert.equal(plan.cues.length, 2)
  close(plan.cues[0].thumbnailTimeSec, 2, 0.08)
  close(plan.cues[1].thumbnailTimeSec, 3, 0.08)
})
test('back-to-back target poses inside a quarter second keep one stronger still', () => {
  const samples = sequence((frame, time) => {
    const amount = time < 1 ? 0 : time < 1.2 ? (time - 1) / 0.2 : time < 1.267 ? 1 : time < 1.4 ? (1.4 - time) / 0.133 : 0
    frame.observations.leftWrist.position.y -= 100 * amount
  })
  const plan = selectMotionKeyframes(samples)
  assert.equal(plan.cues.length, 1)
  assert.equal(plan.cues[0].presentation, 'pose')
  assert.equal(plan.cues[0].frameIds.length, 1)
})
test('quick repeated foot lifts retain every peak rather than merging all nearby movement onsets', () => {
  const samples = sequence((frame, time) => {
    const amount = triangle(time % 0.8, 0.1, 0.3, 0.5)
    frame.observations.leftAnkle.position.y -= 45 * amount
    frame.observations.leftKnee.position.y -= 22 * amount
  }, 4)
  const plan = selectMotionKeyframes(samples)
  assert.equal(plan.cues.length, 10)
  assert.ok(plan.cues.every((cue, index) => index === 0 || cue.thumbnailTimeSec - plan.cues[index - 1].thumbnailTimeSec >= MINIMUM_TARGET_SPACING_SEC - 1e-6))
  for (let repeat = 0; repeat < 5; repeat++) {
    assert.ok(plan.cues.some((cue) => Math.abs(cue.thumbnailTimeSec - (repeat * 0.8 + 0.3)) < 0.08), `Missing foot lift ${repeat}`)
  }
  validateMotionThumbnails(plan, false)
})
test('a long arm gesture cannot swallow the peak of an overlapping fast leg gesture', () => {
  const samples = sequence((frame, time) => {
    frame.observations.leftWrist.position.y -= 180 * triangle(time, 0.5, 2, 3.5)
    frame.observations.rightAnkle.position.y -= 100 * triangle(time, 0.8, 1.13, 1.47)
  })
  const plan = selectMotionKeyframes(samples)
  assert.ok(plan.cues.some((cue) => cue.parts.includes('rightLeg') && Math.abs(cue.thumbnailTimeSec - 1.13) < 0.08))
  assert.ok(plan.cues.some((cue) => cue.parts.includes('leftArm') && Math.abs(cue.thumbnailTimeSec - 2) < 0.08))
  assert.ok(plan.cues.every((cue, index) => index === 0 || cue.startTimeSec >= plan.cues[index - 1].thumbnailTimeSec))
  // Sharpness candidates cannot replace this rapid lift with its standing pose.
  const peak = plan.cues.find((cue) => Math.abs(cue.thumbnailTimeSec - 1.13) < 0.08)
  assert.ok(peak.candidateTimesSec.every((time) => Math.abs(time - peak.thumbnailTimeSec) <= 0.08))
})
test('motion coverage diagnostic detects omitted poses, excludes holds, and remains deterministic without source mutation', () => {
  const samples = lift(), copy = structuredClone(samples), selected = selectMotionKeyframes(samples)
  const complete = evaluateMotionSelection(samples, selected)
  const omitted = evaluateMotionSelection(samples, { ...selected, cues: [] })
  assert.ok(complete.meanMotionError < omitted.meanMotionError)
  assert.ok(complete.coverageFraction > omitted.coverageFraction)
  assert.ok(complete.curve.length <= 600)
  assert.deepEqual(evaluateMotionSelection([...samples].reverse(), selected), complete)
  assert.deepEqual(samples, copy)
  const stationary = evaluateMotionSelection(sequence(), selectMotionKeyframes(sequence()))
  assert.equal(stationary.coverageFraction, null)
  assert.equal(stationary.meanMotionError, 0)
  finiteTree(complete)
})
test('tracking discontinuities remain separate in diagnostics and local review exports exclude cached image pixels', () => {
  const samples = sequence((frame, time) => { if (time >= 2) armLift(frame, 2) })
    .filter((entry) => entry.sourceTimeSec < 2 || entry.sourceTimeSec >= 2.2)
  const plan = selectMotionKeyframes(samples)
  assert.equal(evaluateMotionSelection(samples, plan).movingPartSamples, 0)
  const withCache = withImages(selectMotionKeyframes(lift()))
  const review = buildSelectionReview(lift(), withCache)
  assert.equal(review.schemaVersion, 'motion-selection-review/1')
  assert.deepEqual(review.selection.frames, {})
  assert.ok(Object.keys(withCache.frames).length > 0)
  assert.deepEqual(review.samples, lift())
  const legacy = { ...withCache, algorithm: 'canonical-pose-events/1' }
  validateMotionThumbnails(legacy)
})

function maskFixture() {
  const values = new Float32Array(64)
  for (let y = 1; y <= 6; y++) for (let x = 2; x <= 4; x++) values[y * 8 + x] = 1
  values[7] = 1 // An isolated background speck must not determine the body crop.
  return { width: 8, height: 8, values }
}
test('foreground mask removes background alpha, preserves RGB/source opacity, and feathering stays bounded', () => {
  const pixels = new Uint8ClampedArray([10, 20, 30, 200, 40, 50, 60, 200, 70, 80, 90, 200])
  applyPersonAlpha(pixels, 3, 1, { width: 3, height: 1, values: new Float32Array([0, 0.5, 1]) })
  assert.deepEqual([...pixels], [10, 20, 30, 0, 40, 50, 60, 100, 70, 80, 90, 200])
  const scaled = { width: 2, height: 1, values: new Float32Array([0, 1]) }
  close(maskAlphaAt(scaled, 1, 0, 3, 1), 0.5)
  const invalidValues = { width: 3, height: 1, values: new Float32Array([NaN, -1, 2]) }
  assert.equal(maskAlphaAt(invalidValues, 0, 0, 3, 1), 0)
  assert.equal(maskAlphaAt(invalidValues, 2, 0, 3, 1), 1)
  assert.throws(() => applyPersonAlpha(new Uint8ClampedArray(3), 3, 1, scaled), /RGBA/)
  assert.throws(() => applyPersonAlpha(new Uint8ClampedArray(), 0, 0, scaled), /RGBA/)
})
test('the inverse crop transform maps the small mask onto original-resolution video RGB', () => {
  const pixels = new Uint8ClampedArray([7, 9, 11, 180, 7, 9, 11, 180, 7, 9, 11, 180])
  const mask = { width: 8, height: 1, values: new Float32Array([0, 0, 1, 1, 1, 0, 0, 0]) }
  applyPersonAlpha(pixels, 3, 1, mask, { width: 8, height: 1, transform: { scale: 1, offsetX: -4, offsetY: 0 } })
  assert.deepEqual([...pixels], [7, 9, 11, 180, 7, 9, 11, 0, 7, 9, 11, 0])
  assert.throws(() => applyPersonAlpha(pixels, 3, 1, mask, { width: 8, height: 1, transform: { scale: 0, offsetX: 0, offsetY: 0 } }), /source-to-thumbnail/)
})
test('hip midpoint is the center anchor and tiny isolated mask speckles do not shrink the body', () => {
  const mask = maskFixture(), snapshot = new Float32Array(mask.values)
  const framing = personFraming(mask, 8, 8, { hips: [{ x: 2.5, y: 4.5 }, { x: 4.5, y: 4.5 }], torso: [] })
  assert.equal(framing.centerMethod, 'hip-midpoint')
  assert.deepEqual(framing.center, { x: 3.5, y: 4.5 })
  assert.deepEqual(framing.bounds, { left: 2, top: 1, right: 5, bottom: 7 })
  assert.deepEqual(mask.values, snapshot)
})
test('centering falls back to reliable torso average and mask centroid when hip observations are unavailable', () => {
  const mask = maskFixture()
  const torso = personFraming(mask, 8, 8, { torso: [{ x: 2.5, y: 2.5 }, { x: 4.5, y: 4.5 }] })
  assert.equal(torso.centerMethod, 'torso-average')
  assert.deepEqual(torso.center, { x: 3.5, y: 3.5 })
  const centroid = personFraming(mask, 8, 8, { torso: [] })
  assert.equal(centroid.centerMethod, 'mask-centroid')
  assert.deepEqual(centroid.center, { x: 3.5, y: 4 })
  const outside = personFraming(mask, 8, 8, { hips: [{ x: -40, y: -40 }, { x: -20, y: -20 }], torso: [] })
  assert.equal(outside.centerMethod, 'mask-centroid')
  assert.throws(() => personFraming({ width: 8, height: 8, values: new Float32Array(64) }, 8, 8, { torso: [] }), /No reliable person/)
  assert.throws(() => personFraming(mask, Infinity, 8, { torso: [] }), /Invalid source image/)
})
test('start/end pair keeps one scale, centers both cores exactly, and fits both complete body bounds', () => {
  const people = [
    { center: { x: 80, y: 100 }, centerMethod: 'hip-midpoint', bounds: { left: 50, top: 25, right: 100, bottom: 190 } },
    { center: { x: 210, y: 110 }, centerMethod: 'hip-midpoint', bounds: { left: 100, top: 5, right: 300, bottom: 180 } },
  ]
  const transforms = centeredTransforms(people, 128, 144)
  assert.throws(() => centeredTransforms(people, 128, 144, NaN), /Invalid centered/)
  assert.throws(() => centeredTransforms([{ ...people[0], center: { x: NaN, y: 100 } }], 128, 144), /Invalid person framing/)
  close(transforms[0].scale, transforms[1].scale)
  for (let index = 0; index < people.length; index++) {
    const { center, bounds } = people[index], transform = transforms[index]
    close(center.x * transform.scale + transform.offsetX, 64)
    close(center.y * transform.scale + transform.offsetY, 72)
    assert.ok(bounds.left * transform.scale + transform.offsetX >= 8 - 1e-7)
    assert.ok(bounds.right * transform.scale + transform.offsetX <= 120 + 1e-7)
    assert.ok(bounds.top * transform.scale + transform.offsetY >= 8 - 1e-7)
    assert.ok(bounds.bottom * transform.scale + transform.offsetY <= 136 + 1e-7)
  }
})
test('appearance metadata distinguishes old full-frame JPEGs from centered alpha cutouts', () => {
  const legacy = withImages(selectMotionKeyframes(lift()))
  assert.equal(matchesThumbnailAppearance(legacy, DEFAULT_THUMBNAIL_APPEARANCE), false)
  assert.equal(matchesThumbnailAppearance(legacy, { version: 'person-cutout/1', background: 'original', centered: false }), true)
  const mislabeled = structuredClone(legacy)
  mislabeled.appearance = { ...DEFAULT_THUMBNAIL_APPEARANCE }
  assert.throws(() => validateMotionThumbnails(mislabeled), /alpha-capable/)
  mislabeled.appearance.version = 'person-cutout/99'
  assert.throws(() => validateMotionThumbnails(mislabeled), /appearance/)
})
function mockPersonSegmenter() {
  const counters = { created: 0, segmented: 0, closed: 0 }
  const factory = async () => {
    counters.created++
    return {
      segment(image) {
        counters.segmented++
        const mask = maskFixture()
        return { mask, framing: personFraming(mask, image.width, image.height, {
          hips: [{ x: image.width * 0.35, y: image.height * 0.55 }, { x: image.width * 0.5, y: image.height * 0.55 }], torso: [],
        }) }
      },
      close() { counters.closed++ },
    }
  }
  return { counters, factory }
}
test('capture produces transparent, core-centered images and saves/reloads them without touching cues or observations', async () => {
  const mock = mockDocument(), before = globalThis.document
  const segmenter = mockPersonSegmenter()
  globalThis.document = mock.document
  try {
    const plan = selectMotionKeyframes(lift()), original = structuredClone(plan)
    const result = await captureThumbnailAssets('blob:cutout-source', plan, undefined, undefined, { segmenterFactory: segmenter.factory })
    validateMotionThumbnails(result)
    assert.deepEqual(plan, original)
    assert.deepEqual(result.appearance, DEFAULT_THUMBNAIL_APPEARANCE)
    assert.equal(segmenter.counters.created, 1)
    assert.equal(segmenter.counters.closed, 1)
    assert.ok(segmenter.counters.segmented > 0)
    assert.ok(mock.alphaWrites.some((pixels) => pixels.some((value, index) => index % 4 === 3 && value === 0)))
    for (const image of Object.values(result.frames)) {
      assert.match(image.dataUrl, /^data:image\/(webp|png);base64,/)
      assert.equal(image.width, 384); assert.equal(image.height, 432)
      assert.equal(image.centerMethod, 'hip-midpoint')
    }
    assert.ok(result.cues.every((cue) => cue.presentation === 'pose' && cue.frameIds.length === 1))
    assert.ok(mock.renders.every(Number.isFinite), 'RGB is drawn directly from the video, never from the small analysis canvas')
    assert.ok(mock.encodings.every((encoding) => encoding.quality === 0.94))
    assert.equal(result.assetVersion, CURRENT_THUMBNAIL_ASSETS)
    assert.equal(isCurrentThumbnailTrack(result), true)
    const chart = buildChartDocument({ segments: [{ id: 'test', startSec: 0, endSec: 6, samples: [{ t: 0, landmarks: [] }] }], title: 'cutouts', difficulty: 'easy', model: 'lite', sampleRateHz: 15, motionThumbnails: result })
    assert.deepEqual(parseChartDocument(JSON.stringify(chart)).motionThumbnails, result)
    assert.ok(mock.videos.every((video) => video.closed && !video.src))
  } finally { globalThis.document = before }
})
test('a segmentation failure skips unavailable cues, retains the preparation report, and disposes resources', async () => {
  const mock = mockDocument(), before = globalThis.document
  let closed = 0
  globalThis.document = mock.document
  try {
    const result = await captureThumbnailAssets('blob:failed-cutout', selectMotionKeyframes(lift()), undefined, undefined, {
      segmenterFactory: async () => ({ segment() { throw new Error('No mask') }, close() { closed++ } }),
    })
    assert.equal(result.cues.length, 0)
    assert.equal(result.preparation.skippedCueCount, result.preparation.requestedCueCount)
    assert.ok(result.preparation.issues.every((issue) => issue.outcome === 'skipped'))
    validateMotionThumbnails(result)
    assert.equal(closed, 1)
    assert.ok(mock.videos.every((video) => video.closed && !video.src))
  } finally { globalThis.document = before }
})
test('old pair tracks recapture one high-quality still and old asset caches cannot masquerade as current', async () => {
  const mock = mockDocument(), before = globalThis.document
  globalThis.document = mock.document
  try {
    const legacy = selectMotionKeyframes(lift())
    legacy.algorithm = 'canonical-pose-events/2'
    for (const cue of legacy.cues) {
      cue.presentation = 'pair'
      cue.frameIds = [`frame-${Math.round(cue.startTimeSec * 1000000)}`, ...cue.frameIds]
    }
    const copy = structuredClone(legacy)
    validateMotionThumbnails(legacy, false)
    const result = await captureThumbnailAssets('blob:legacy-pair-to-still', legacy, undefined, undefined,
      { appearance: { version: 'person-cutout/1', background: 'original', centered: false } })
    assert.deepEqual(legacy, copy)
    assert.ok(result.cues.every((cue) => cue.presentation === 'pose' && cue.frameIds.length === 1))
    assert.ok(Object.values(result.frames).every((image) => image.width === 576 && image.height === 324))
    assert.equal(result.assetVersion, CURRENT_THUMBNAIL_ASSETS)
    assert.equal(isCurrentThumbnailTrack(result), false, 'Legacy selection still needs regeneration')
    const current = { ...result, algorithm: CURRENT_SELECTION_ALGORITHM }
    assert.equal(isCurrentThumbnailTrack(current), true)
    delete current.assetVersion
    assert.equal(isCurrentThumbnailTrack(current), false, 'Low-resolution caches are stale')
    assert.ok(mock.videos.every((video) => video.closed))
  } finally { globalThis.document = before }
})

test('out-of-frame lead-ins and outros are excluded without discarding the valid middle of the recording', () => {
  const samples = sequence((frame, time) => {
    armLift(frame, time)
    if (time < 0.8 || time > 4.8) for (const joint of Object.values(frame.observations)) joint.position.x += 1000
  })
  const copy = structuredClone(samples), plan = selectMotionKeyframes(samples)
  assert.equal(plan.cues.length, 2)
  assert.ok(plan.cues.every((cue) => cue.startTimeSec >= 0.8 && cue.thumbnailTimeSec <= 4.8))
  assert.deepEqual(samples, copy)
  assert.equal(selectMotionKeyframes(sequence((frame) => { frame.observations = {} })).cues.length, 0)
})
test('a quick transition into a held wide stance keeps the measured landing and its return', () => {
  const samples = sequence((frame, time) => {
    const amount = time < 1 ? 0 : time < 1.1334 ? (time - 1) / 0.1334 : time < 2 ? 1 : time < 2.1334 ? (2.1334 - time) / 0.1334 : 0
    frame.observations.leftAnkle.position.x -= 80 * amount
    frame.observations.rightAnkle.position.x += 80 * amount
    frame.observations.leftKnee.position.x -= 40 * amount
    frame.observations.rightKnee.position.x += 40 * amount
  }, 3)
  const plan = selectMotionKeyframes(samples)
  assert.ok(plan.cues.some((cue) => cue.thumbnailTimeSec >= 1.13 && cue.thumbnailTimeSec <= 1.4))
  assert.ok(plan.cues.some((cue) => cue.thumbnailTimeSec >= 2.13 && cue.thumbnailTimeSec <= 2.4))
  assert.ok(plan.cues.every((cue) => cue.parts.some((part) => part.endsWith('Leg'))))
})
test('canonical fallback framing requires an on-screen core and rescales only compatible image coordinates', () => {
  const frame = sample(0).frame, before = structuredClone(frame)
  const crop = observationFraming(frame, 320, 320)
  assert.equal(crop.centerMethod, 'hip-midpoint')
  close(crop.center.x, 160); close(crop.center.y, 200)
  assert.equal(observationFraming(frame, 640, 360), null)
  const outside = structuredClone(frame)
  outside.observations.leftHip.position.x += 2000
  outside.observations.rightHip.position.x += 2000
  assert.equal(observationFraming(outside, 640, 640), null)
  assert.deepEqual(frame, before)
})
function threeCuePlan() {
  const base = selectMotionKeyframes(lift())
  const cue = base.cues[0]
  base.cues = [1, 3, 5].map((time) => ({ ...cue, id: `motion-${(time - 0.5) * 1000000}-${time * 1000000}`,
    startTimeSec: time - 0.5, endTimeSec: time, thumbnailTimeSec: time, candidateTimesSec: [time], frameIds: [`frame-${time * 1000000}`] }))
  return base
}
test('a person missing at both ends cannot erase the successful middle thumbnail', async () => {
  const mock = mockDocument(), before = globalThis.document, progress = []
  const segmenter = mockPersonSegmenter()
  globalThis.document = mock.document
  try {
    const result = await captureThumbnailAssets('blob:missing-ends', threeCuePlan(), undefined, (done) => progress.push(done), {
      segmenterFactory: async () => {
        const delegate = await segmenter.factory()
        return { close: delegate.close, segment(image) {
          if (mock.videos[0].currentTime === 1 || mock.videos[0].currentTime === 5) throw new PersonNotFoundError()
          return delegate.segment(image)
        } }
      },
    })
    assert.deepEqual(result.cues.map((cue) => cue.thumbnailTimeSec), [3])
    assert.equal(result.preparation.skippedCueCount, 2)
    assert.equal(Object.keys(result.frames).length, 1)
    assert.deepEqual(progress, [1, 2, 3])
    validateMotionThumbnails(result)
    assert.equal(segmenter.counters.closed, 1)
  } finally { globalThis.document = before }
})
test('an unavailable target retries a bounded neighboring measured frame and continues', async () => {
  const mock = mockDocument(), before = globalThis.document, segmenter = mockPersonSegmenter()
  globalThis.document = mock.document
  try {
    const plan = threeCuePlan(); plan.cues = [plan.cues[0]]; plan.cues[0].candidateTimesSec.push(1.0666667)
    let attempts = 0
    const result = await captureThumbnailAssets('blob:neighbor-recovery', plan, undefined, undefined, {
      segmenterFactory: async () => {
        const delegate = await segmenter.factory()
        return { close: delegate.close, segment(image) { if (++attempts === 1) throw new PersonNotFoundError(); return delegate.segment(image) } }
      },
    })
    assert.equal(attempts, 2)
    assert.equal(result.cues.length, 1)
    close(result.cues[0].thumbnailTimeSec, 1.0666667)
    assert.equal(result.preparation.recoveredCueCount, 1)
    assert.equal(result.preparation.skippedCueCount, 0)
    validateMotionThumbnails(result)
  } finally { globalThis.document = before }
})
test('mask failures use a labeled measured-pose crop, preserve the original observations, and survive save/reload', async () => {
  const mock = mockDocument(), before = globalThis.document, create = mock.document.createElement
  mock.document.createElement = (name) => { const node = create(name); if (name === 'video') node.videoHeight = 640; return node }
  globalThis.document = mock.document
  const samples = lift(), copy = structuredClone(samples)
  try {
    const result = await captureThumbnailAssets('blob:measured-pose-fallback', selectMotionKeyframes(samples), undefined, undefined, {
      samples, segmenterFactory: async () => ({ segment() { throw new Error('Mask unavailable') }, close() {} }),
    })
    assert.equal(result.cues.length, 2)
    assert.equal(result.preparation.fallbackCueCount, 2)
    assert.equal(result.preparation.skippedCueCount, 0)
    for (const image of Object.values(result.frames)) {
      assert.equal(image.background, 'original'); assert.equal(image.centered, true)
      assert.equal(image.centerMethod, 'hip-midpoint')
      assert.match(image.dataUrl, /^data:image\/jpeg/)
    }
    assert.equal(mock.alphaWrites.length, 0)
    assert.deepEqual(samples, copy)
    validateMotionThumbnails(result)
    const chart = buildChartDocument({ segments: [{ id: 'test', startSec: 0, endSec: 6, samples: [{ t: 0, landmarks: [] }] }], title: 'fallback', difficulty: 'easy', model: 'lite', sampleRateHz: 15, motionThumbnails: result })
    assert.deepEqual(parseChartDocument(JSON.stringify(chart)).motionThumbnails, result)
    const invalid = structuredClone(result); invalid.preparation.skippedCueCount++
    assert.throws(() => validateMotionThumbnails(invalid), /counts/)
  } finally { globalThis.document = before }
})
test('model loading failure falls back to original stills while explicit cancellation still rejects', async () => {
  const mock = mockDocument(), before = globalThis.document
  globalThis.document = mock.document
  try {
    const result = await captureThumbnailAssets('blob:mask-model-offline', threeCuePlan(), undefined, undefined, {
      segmenterFactory: async () => { throw new Error('Model unavailable') },
    })
    assert.equal(result.cues.length, 3)
    assert.equal(result.preparation.fallbackCueCount, 3)
    assert.ok(Object.values(result.frames).every((image) => image.background === 'original' && image.centered === false))
    validateMotionThumbnails(result)
    const controller = new AbortController()
    await assert.rejects(captureThumbnailAssets('blob:cancel-recovery', threeCuePlan(), controller.signal, undefined, {
      segmenterFactory: async () => { controller.abort(); throw new DOMException('Cancelled', 'AbortError') },
    }), { name: 'AbortError' })
    assert.ok(mock.videos.every((video) => video.closed))
  } finally { globalThis.document = before }
})
test('video extraction skips absent, malformed, and failed inference frames, then resumes on the original clock', async () => {
  const video = new FakeVideo(); video.duration = 0.5
  const raw = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.4, z: 0, visibility: 0.95, presence: 0.95 }))
  raw[11].x = 0.4; raw[12].x = 0.6; raw[23].y = 0.6; raw[24].y = 0.6
  let calls = 0, closes = 0, lastStamp = -Infinity
  const progress = []
  const landmarker = { detectForVideo(_video, stamp) {
    assert.ok(stamp > lastStamp); lastStamp = stamp
    const index = calls++
    if (index === 2) throw new Error('Transient inference failure')
    const points = structuredClone(raw)
    if (index === 3) points[15].x = NaN
    return { landmarks: index === 0 || index === 5 ? [] : [points], close() { closes++ } }
  } }
  const result = await analyzeVideoFile({ video, landmarker, sampleHz: 15, onProgress: (event) => progress.push(event) })
  assert.equal(calls, 8)
  assert.equal(closes, 7)
  assert.equal(result.length, 4)
  assert.deepEqual(result.map((frame) => Number(frame.sourceTimeSec.toFixed(4))), [0.0667, 0.2667, 0.4, 0.4667])
  assert.equal(progress.at(-1).skippedFrameCount, 2)
  assert.equal(progress.at(-1).missingPoseCount, 2)
  finiteTree(result)
})
test('visual review compares representative poses rather than onset times, and flags excluded source sections', () => {
  const plan = threeCuePlan()
  const reference = { schemaVersion: 'keyframe-visual-targets/1', id: 'test', method: 'Independent source review',
    targets: [{ id: 'first', startTimeSec: 0.9, endTimeSec: 1.1 }, { id: 'second', startTimeSec: 2.9, endTimeSec: 3.1 }],
    exclude: [{ startTimeSec: 4.9, endTimeSec: 5.1 }] }
  const result = compareVisualTargets(plan, reference)
  assert.equal(result.matchedCount, 2)
  assert.deepEqual(result.missedTargetIds, [])
  assert.deepEqual(result.excludedFrameTimesSec, [5])
  const bad = structuredClone(reference); bad.targets[1].startTimeSec = 1
  assert.throws(() => compareVisualTargets(plan, bad), /disjoint/)
})
test('the red-shirt source review retains ten independently marked windows and rejects unsupported versions', () => {
  const reference = JSON.parse(readFileSync(new URL('./fixtures/red-shirt-cross-step.targets.json', import.meta.url), 'utf8'))
  const plan = { ...selectMotionKeyframes([]), cues: [] }
  const result = compareVisualTargets(plan, reference)
  assert.equal(result.targetCount, 10)
  assert.equal(result.matchedCount, 0)
  assert.equal(result.missedTargetIds.length, 10)
  assert.throws(() => compareVisualTargets(plan, { ...reference, schemaVersion: 'keyframe-visual-targets/99' }), /Unsupported/)
})
