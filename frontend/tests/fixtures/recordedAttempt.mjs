import { chartFor, danceFrame } from './scoring.mjs'
import { DanceScorer } from '../../.keyframe-tests/scoring/DanceScorer.js'
import { buildReferenceTrack } from '../../.keyframe-tests/scoring/referenceTrack.js'
import { scoringConfig } from '../../.keyframe-tests/scoring/contracts.js'
import { AttemptRecorder } from '../../.keyframe-tests/attempts/AttemptRecorder.js'

export function recordedFixture({ player = danceFrame, renderHz = 60, stopAt = 3, chart = chartFor(), tolerance = 50, rejected = false } = {}) {
  const config = scoringConfig({ timingToleranceMs: tolerance }), options = { timeline: 'chart', durationSec: chart.durationSec, reflectDance: false }
  const scorer = new DanceScorer(buildReferenceTrack(chart, { ...options, config }), config)
  const recorder = new AttemptRecorder({ id: 'recorded-fixture', createdAt: '2026-10-24T00:00:00Z', mode: 'solo', implementationId: 'test-build' }, chart, options, config)
  let captureIndex = 0
  const end = stopAt >= chart.durationSec ? stopAt + 0.4 : stopAt
  for (let tick = 0; tick / renderHz <= end + 1e-7; tick++) {
    const now = tick / renderHz
    while (captureIndex / 60 + 0.02 <= now + 1e-7) {
      const time = captureIndex++ / 60
      const observation = { songTimeSec: time, receivedAtSongTimeSec: time + 0.02, frame: player(time) }
      recorder.observe(observation, scorer.addObservation(observation))
      if (rejected && captureIndex % 20 === 0) {
        const late = { songTimeSec: time, receivedAtSongTimeSec: time + 0.3, frame: player(time) }
        recorder.observe(late, scorer.addObservation(late))
      }
    }
    recorder.advance(now, scorer.advance(now))
  }
  return recorder.finish(stopAt, scorer.finish(stopAt))
}

