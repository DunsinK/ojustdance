import test from 'node:test'
import assert from 'node:assert/strict'
import { chartFor, danceFrame, hide, imageFrame } from './fixtures/scoring.mjs'
import { DanceScorer } from '../.keyframe-tests/scoring/DanceScorer.js'
import { buildReferenceTrack } from '../.keyframe-tests/scoring/referenceTrack.js'
import { scoringConfig } from '../.keyframe-tests/scoring/contracts.js'
import { AttemptRecorder } from '../.keyframe-tests/attempts/AttemptRecorder.js'
import { encodeAttemptData } from '../.keyframe-tests/attempts/serialization.js'
import { ATTEMPT_LIMITS } from '../.keyframe-tests/attempts/contracts.js'
import { validateAttempt, parseAttempt, validateEvaluation } from '../.keyframe-tests/attempts/validation.js'
import { replayAttempt } from '../.keyframe-tests/attempts/replay.js'
import { recordedFixture } from './fixtures/recordedAttempt.mjs'
import { implementationId } from '../.keyframe-tests/attempts/implementationId.js'

const replayOptions = (extra = {}) => ({ id: 'comparison-one', createdAt: '2026-10-24T00:00:00Z', implementationId: 'test-build', label: 'Regression', ...extra })

test('recording and replay preserve exact scores, combos, judgments, and trace at different render cadences', async () => {
  for (const renderHz of [30, 60, 144]) {
    const attempt = recordedFixture({ renderHz })
    const evaluation = await replayAttempt(attempt, replayOptions())
    assert.deepEqual(evaluation.result, attempt.original.result)
    assert.deepEqual(evaluation.trace, attempt.original.trace)
    validateEvaluation(evaluation)
  }
})
test('source observations, chart snapshots, and sealed original results are independent copies', () => {
  const chart = chartFor(imageFrame, 1)
  chart.motionThumbnails = { arbitraryImageCache: 'data:image/...' }
  const config = scoringConfig(), scorer = new DanceScorer(buildReferenceTrack(chart), config)
  const recorder = new AttemptRecorder({ id: 'snapshot', createdAt: '2026-10-24T00:00:00Z', mode: 'solo', implementationId: 'test' }, chart, {}, config)
  const frame = imageFrame(), observation = { songTimeSec: 0, receivedAtSongTimeSec: 0, frame }
  recorder.observe(observation, scorer.addObservation(observation))
  const score = scorer.finish(1), attempt = recorder.finish(1, score)
  frame.observations.leftWrist.position.x = -900
  chart.samples[0].canonicalFrame.observations.leftWrist.position.x = 2000
  score.score = 9999
  assert.equal(attempt.reference.chart.motionThumbnails, undefined)
  assert.ok(attempt.events[0].observation.frame.observations.leftWrist.position.x > 0)
  assert.ok(attempt.reference.chart.samples[0].canonicalFrame.observations.leftWrist.position.x < 1000)
  assert.notEqual(attempt.original.result.score, 9999)
  attempt.original.result.score = 123
  assert.notEqual(recorder.finish(1, score).original.result.score, 123)
})
test('replay reuses null, low-confidence, hidden, and originally rejected observations without rerunning detection', async () => {
  const attempt = recordedFixture({ rejected: true, player: (time) => time > 1 && time < 2 ? null : danceFrame(time, (frame) => hide(frame, 'leftWrist')) })
  const before = encodeAttemptData(attempt)
  assert.ok(attempt.events.some((event) => event.kind === 'observation' && !event.originallyAccepted))
  const evaluation = await replayAttempt(attempt, replayOptions())
  assert.deepEqual(evaluation.result, attempt.original.result)
  assert.equal(encodeAttemptData(attempt), before)
  assert.ok(evaluation.result.trackingMisses > 0)
})
test('new comparison settings create different results without changing original points or earlier runs', async () => {
  const attempt = recordedFixture({ player: (time) => danceFrame(time - 0.06) })
  const original = structuredClone(attempt.original)
  const narrow = await replayAttempt(attempt, replayOptions({ timingToleranceMs: 30 }))
  const narrowSnapshot = structuredClone(narrow)
  const wide = await replayAttempt(attempt, replayOptions({ id: 'comparison-two', timingToleranceMs: 70 }))
  assert.ok(wide.result.score > narrow.result.score)
  assert.deepEqual(narrow, narrowSnapshot)
  assert.deepEqual(attempt.original, original)
  assert.notEqual(narrow.id, wide.id)
})
test('historical policy/version and old scores are accepted as fixed data, not recalculated on import', async () => {
  const attempt = recordedFixture()
  attempt.original.policy.schemaVersion = 'historical-scoring/0'
  attempt.original.policy.sampleHz = 10
  attempt.original.result.schemaVersion = 'historical-score/0'
  attempt.original.result.score = 1234
  attempt.original.trace.at(-1).result = structuredClone(attempt.original.result)
  const imported = parseAttempt(encodeAttemptData(attempt))
  const evaluation = await replayAttempt(imported, replayOptions())
  assert.equal(imported.original.result.score, 1234)
  assert.ok(evaluation.result.score > 9900)
  assert.equal(evaluation.policy.sampleHz, 20)
})
test('version 2 recordings without new accuracy/coverage fields replay under version 3 unchanged', async () => {
  const attempt = recordedFixture({ player: (time) => hide(imageFrame(time), 'leftWrist'), chart: chartFor(imageFrame) })
  attempt.original.policy.schemaVersion = 'dance-scoring/2'
  delete attempt.original.policy.motionWindowSec
  const historic = (result) => {
    result.schemaVersion = 'dance-score/2'
    result.averageAccuracy = result.score / result.maxScore
    for (const field of ['pointCredit', 'motion', 'judgedCoverage', 'trackingCoverage']) delete result[field]
  }
  historic(attempt.original.result)
  attempt.original.trace.forEach((point) => historic(point.result))
  const before = encodeAttemptData(attempt)
  const replay = await replayAttempt(parseAttempt(before), replayOptions())
  assert.equal(encodeAttemptData(attempt), before)
  assert.equal(replay.result.schemaVersion, 'dance-score/3')
  assert.equal(replay.policy.schemaVersion, 'dance-scoring/3')
  assert.equal(replay.result.averageAccuracy, 1)
  assert.ok(replay.result.trackingCoverage < 0.9)
})
test('an early exit replays the actual finish call and retains the full original reference denominator', async () => {
  const attempt = recordedFixture({ chart: chartFor(imageFrame), player: imageFrame, stopAt: 1 })
  const evaluation = await replayAttempt(attempt, replayOptions())
  assert.deepEqual(evaluation.result, attempt.original.result)
  assert.ok(evaluation.result.score < 3400)
  assert.equal(attempt.events.at(-1).songTimeSec, 1)
})
test('JSON export/import preserves missing depth and rejected non-finite coordinates exactly', async () => {
  const attempt = recordedFixture({ player: (time) => danceFrame(time, (frame) => {
    frame.observations.leftWrist.position.x = NaN
    frame.observations.rightWrist.position.y = Infinity
    frame.observations.leftAnkle.position.x = -Infinity
  }) })
  const text = encodeAttemptData(attempt), imported = parseAttempt(text)
  assert.match(text, /\$number/)
  const frame = imported.events.find((event) => event.kind === 'observation').observation.frame
  assert.ok(Number.isNaN(frame.observations.leftWrist.position.x))
  assert.equal(frame.observations.rightWrist.position.y, Infinity)
  assert.equal(frame.observations.leftAnkle.position.x, -Infinity)
  assert.equal(frame.observations.leftWrist.position.z, null)
  assert.deepEqual((await replayAttempt(imported, replayOptions())).result, attempt.original.result)
})
test('malformed schemas, timestamps, metadata, scores, and premature finish events are rejected', () => {
  const original = recordedFixture()
  const cases = [
    (a) => { a.schemaVersion = 'unknown' },
    (a) => { a.createdAt = 'yesterday' },
    (a) => { a.original.result.score = NaN },
    (a) => { a.events.find((event) => event.kind === 'observation').observation.receivedAtSongTimeSec = Infinity },
    (a) => { a.events.find((event) => event.kind === 'observation').observation.frame.coordinates.units = 'meters' },
    (a) => { a.events.unshift({ kind: 'finish', songTimeSec: 0 }) },
    (a) => { a.events.pop() },
    (a) => { a.reference.options.config = { sampleHz: 1000 } },
    (a) => { a.events = Array(ATTEMPT_LIMITS.events + 1).fill({ kind: 'advance', songTimeSec: 0 }) },
  ]
  for (const mutate of cases) { const attempt = structuredClone(original); mutate(attempt); assert.throws(() => validateAttempt(attempt)) }
  assert.throws(() => parseAttempt('{"$number":"bad"}'), /marker/)
})
test('incomplete recording preserves its original result but cannot masquerade as a full replay', async () => {
  const attempt = recordedFixture()
  attempt.recordingStatus = 'limit-exceeded'; attempt.events.pop()
  validateAttempt(attempt)
  await assert.rejects(replayAttempt(attempt, replayOptions()), /full performance cannot be replayed/)
  assert.ok(attempt.original.result.score > 9900)
})
test('replay progress, yielding, and cancellation leave the original immutable', async () => {
  const attempt = recordedFixture(), before = encodeAttemptData(attempt), controller = new AbortController()
  let yields = 0, progress = 0
  await assert.rejects(replayAttempt(attempt, replayOptions({ signal: controller.signal,
    onProgress: (fraction) => { progress = fraction }, yieldToUI: async () => { yields++; controller.abort() },
  })), { name: 'AbortError' })
  assert.equal(yields, 1); assert.ok(progress < 1); assert.equal(encodeAttemptData(attempt), before)
})
test('implementation fingerprints are stable across key ordering and change when scoring source changes', async () => {
  const one = await implementationId({ 'a.ts': 'one', 'b.ts': 'two' })
  assert.equal(one, await implementationId({ 'b.ts': 'two', 'a.ts': 'one' }))
  assert.notEqual(one, await implementationId({ 'a.ts': 'changed', 'b.ts': 'two' }))
  assert.match(one, /^sha256:[a-f0-9]{64}$/)
})
