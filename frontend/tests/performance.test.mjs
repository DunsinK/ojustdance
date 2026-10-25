import test from 'node:test'
import assert from 'node:assert/strict'
import { PerformanceDirector } from '../.performance-tests/performance/PerformanceDirector.js'
import { PerformanceEvents } from '../.performance-tests/performance/PerformanceEvents.js'
import { practiceCues, readStoredCues, referencePose } from '../.performance-tests/performance/reference.js'
import { playerEvidence } from '../.performance-tests/performance/evidence.js'
import { FIXTURES } from '../../shared/skeleton/dist/fixtures.js'
import { createJointObservation } from '../../shared/skeleton/dist/index.js'

const cues = (count = 3) => Array.from({ length: count }, (_, index) => ({ id: `cue-${index}`, startSec: index * 2, endSec: index * 2 + 2, referenceSec: index * 2 + 1, label: `Phase ${index + 1}`, parts: [], source: 'practice-phase' }))
function run({ hz = 60, count = 3, quality = () => 1, tracked = () => true, stop = count * 2 } = {}) {
 const director = new PerformanceDirector('test', cues(count)), events = []
 for (let index = 1; index / hz <= stop + 1e-7; index++) {
  const timeSec = Math.min(stop, index / hz)
  events.push(...director.advance({ timeSec, quality: quality(timeSec), trackingValid: tracked(timeSec) }))
 }
 events.push(...director.finish(stop))
 return { director, events, state: director.snapshot() }
}
const judgments = (events) => events.filter((event) => event.type === 'moveJudged')
test('one final judgment per phase, identical perfect scores/combos at 30, 60 and 144 render FPS', () => {
 for (const hz of [30, 60, 144]) {
  const { state, events } = run({ hz })
  assert.equal(state.score, 10000)
  assert.equal(state.combo, 3); assert.equal(state.maxCombo, 3)
  assert.equal(judgments(events).length, 3)
  assert.ok(judgments(events).every((event) => event.grade === 'PERFECT'))
  assert.equal(events.filter((event) => event.type === 'roundFinished').length, 1)
 }
})
test('missing tracking stays neutral and cannot earn positive points', () => {
 const { state, events } = run({ tracked: () => false })
 assert.equal(state.score, 0); assert.equal(state.combo, 0)
 assert.ok(judgments(events).every((event) => event.grade === 'TRACKING' && event.points === 0))
})
test('perfect requires observed preparation, transition and completion, not just a high average', () => {
 const { events } = run({ count: 1, quality: (t) => t <= 0.3 ? 0 : 1 })
 const result = judgments(events)[0]
 assert.ok(result.quality >= 0.84)
 assert.equal(result.completed, false)
 assert.notEqual(result.grade, 'PERFECT')
 const hidden = run({ count: 1, tracked: (t) => t > 0.4 })
 assert.notEqual(judgments(hidden.events)[0].grade, 'PERFECT')
})
test('continuous progress is not a grade; no event storms per frame', () => {
 const director = new PerformanceDirector('round', cues(1))
 const events = []
 for (let index = 1; index < 100; index++) events.push(...director.advance({ timeSec: index / 100, quality: 0.9, trackingValid: true }))
 assert.equal(judgments(events).length, 0)
 assert.equal(director.snapshot().score, 0)
 assert.equal(events.filter((event) => event.type === 'moveStarted').length, 1)
})
test('combo increments per successful phase and milestones fire once at 5, 10 and 20', () => {
 const { events, state } = run({ count: 20 })
 assert.deepEqual(events.filter((event) => event.type === 'comboMilestone').map((event) => event.count), [5, 10, 20])
 assert.equal(state.maxCombo, 20)
 assert.equal(state.score, 10000)
})
test('a miss breaks the combo; tracking lost is a different result', () => {
 const { events } = run({ quality: (time) => time > 2 && time <= 4 ? 0.1 : 1 })
 assert.deepEqual(judgments(events).map((event) => event.grade), ['PERFECT', 'MISS', 'PERFECT'])
 assert.equal(judgments(events)[1].points, 0)
 assert.equal(events.filter((event) => event.type === 'comboChanged' && event.lost).length, 1)
})
test('duplicate ticks, seeks, finish calls and backwards clocks cannot replay grades or farm points', () => {
 const { director, state } = run()
 assert.deepEqual(director.finish(6), [])
 assert.deepEqual(director.advance({ timeSec: 6, quality: 1, trackingValid: true }), [])
 assert.equal(director.snapshot().score, state.score)
 const live = new PerformanceDirector('seek', cues())
 const emitted = []
 for (let index = 1; index <= 120; index++) emitted.push(...live.advance({ timeSec: index / 60, quality: 1, trackingValid: true }))
 const before = live.snapshot().score
 live.seek(0)
 for (let index = 1; index <= 120; index++) emitted.push(...live.advance({ timeSec: index / 60, quality: 1, trackingValid: true }))
 assert.equal(live.snapshot().score, before)
 assert.equal(judgments(emitted).length, 1)
 assert.deepEqual(live.advance({ timeSec: 1, quality: 1, trackingValid: true }), [])
 live.seek(5)
 assert.equal(live.snapshot().score, before)
})
test('pauses and early exit cannot manufacture full reference points', () => {
 const { state } = run({ stop: 1 })
 assert.equal(state.score, 0)
 const { state: partial } = run({ stop: 2 })
 assert.ok(partial.score <= 3334)
})
test('lead changes require a genuine reversal and ignore ties, repeated updates and invalid data', () => {
 const { director } = run({ stop: 2 })
 // Finished director does not emit additional events.
 assert.deepEqual(director.updateLeader(0), [])
 const live = new PerformanceDirector('lead', cues())
 assert.deepEqual(live.updateLeader(100), [])
 for (let index = 1; index <= 120; index++) live.advance({ timeSec: index / 60, quality: 1, trackingValid: true })
 const change = live.updateLeader(100)
 assert.equal(change[0].playerId, 'you')
 assert.deepEqual(live.updateLeader(100), [])
 assert.deepEqual(live.updateLeader(NaN), [])
 assert.equal(live.updateLeader(5000)[0].playerId, 'rival')
})
test('stable event IDs remain deduplicated after thousands of progress updates', () => {
 const bus = new PerformanceEvents(), seen = []
 const result = { type: 'roundFinished', id: 'round:finish', score: 1, maxCombo: 1, accuracy: 1 }
 const unsubscribe = bus.subscribe((event) => { if (event.type === 'roundFinished') seen.push(event) })
 bus.publish([result])
 for (let index = 0; index < 10000; index++) bus.publish([{ type: 'moveProgress', id: `progress:${index}`, moveId: 'one', progress: 0.5, quality: 1, trackingValid: true }])
 bus.publish([result]); assert.equal(seen.length, 1)
 unsubscribe(); bus.publish([{ ...result, id: 'another' }]); assert.equal(seen.length, 1)
})
test('stored authored cue contract preserves measured frames, rejects malformed intervals and unsafe images', () => {
 const track = { schemaVersion: 'motion-thumbnails/1', clock: 'reference-video-seconds', frames: { one: { dataUrl: 'data:image/png;base64,YQ==' } }, cues: [
  { id: 'one', startTimeSec: 0, endTimeSec: 3, thumbnailTimeSec: 1, frameIds: ['one'], parts: ['leftArm'] },
  { id: 'two', startTimeSec: 2, endTimeSec: 4, thumbnailTimeSec: 3, frameIds: [], parts: [] },
 ] }
 const result = readStoredCues(track, 4)
 assert.equal(result[0].endSec, 2)
 assert.equal(result[0].image, 'data:image/png;base64,YQ==')
 assert.equal(result[0].source, 'authored')
 assert.deepEqual(result[0].parts, ['leftArm'])
 assert.deepEqual(readStoredCues({ ...track, schemaVersion: 'unknown' }, 4), [])
 assert.deepEqual(readStoredCues({ ...track, cues: [{ ...track.cues[0], startTimeSec: NaN }] }, 4), [])
 const unsafe = structuredClone(track); unsafe.frames.one.dataUrl = 'data:image/svg+xml,<svg onload=alert(1)>'
 assert.equal(readStoredCues(unsafe, 4)[0].image, undefined)
 assert.deepEqual(readStoredCues({ ...track, cues: [track.cues[0], track.cues[0]] }, 4), [])
})
test('practice fallback is explicitly labeled and only displays observed geometry through the shared skeleton', () => {
 const sample = { t: 1, landmarks: [] }
 const result = practiceCues([sample, { t: 3, landmarks: [] }, { t: 4.5, landmarks: [] }], 5)
 assert.equal(result.length, 3); assert.equal(result.at(-1).endSec, 5)
 assert.ok(result.every((cue) => cue.source === 'practice-phase'))
 assert.equal(practiceCues([sample], 5).length, 1)
 assert.equal(referencePose(null), null)
 assert.ok(referencePose(sample))
 assert.ok(Object.values(referencePose(sample).bones).every((bone) => !bone.valid))
 assert.deepEqual(practiceCues([], Infinity), [])
})
test('readiness respects canonical confidence and requires independent body chains', () => {
 const frame = structuredClone(FIXTURES['T-pose'])
 frame.coordinates = { kind: 'image', units: 'pixels', axes: 'x-right-y-down-z-away', handedness: 'right', origin: 'image-top-left', depthModel: 'none', mirrored: false, imageSize: { width: 640, height: 640 } }
 for (const observation of Object.values(frame.observations)) {
  observation.position = { x: 320 + observation.position.x * 100, y: 320 + observation.position.y * 100, z: null }
  observation.depth = { provenance: 'missing', status: 'missing', uncertainty: null }
 }
 assert.equal(playerEvidence(frame).fullBody, true)
 frame.observations.leftWrist.visibility = 0.1
 const partial = playerEvidence(frame)
 assert.equal(partial.fullBody, false); assert.equal(partial.canJudge, true)
 assert.ok(!partial.parts.includes('leftArm'))
 for (const name of Object.keys(frame.observations)) frame.observations[name] = createJointObservation(0, 0, null, 0.1, 0.1)
 assert.equal(playerEvidence(frame).canJudge, false)
 assert.equal(playerEvidence(null).visible, 0)
 const degenerate = structuredClone(frame)
 for (const name of Object.keys(degenerate.observations)) degenerate.observations[name] = createJointObservation(100, 100, null, 0.95, 0.95)
 assert.equal(playerEvidence(degenerate).canJudge, false)
 assert.equal(playerEvidence(degenerate).fullBody, false)
 assert.equal(playerEvidence(FIXTURES['T-pose']).fullBody, false, 'world coordinates cannot establish camera framing')
})
test('invalid or overlapping reference phases are rejected before a round starts', () => {
 const invalid = cues(); invalid[1].startSec = 1
 assert.throws(() => new PerformanceDirector('invalid', invalid), /nonoverlapping/)
 const duplicate = cues(); duplicate[1].id = duplicate[0].id
 assert.throws(() => new PerformanceDirector('invalid', duplicate), /uniquely/)
})
