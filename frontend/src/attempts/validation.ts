import { validateFrame } from '@ojustdance/skeleton'
import { ATTEMPT_LIMITS } from './contracts.js'
import type { AttemptEvaluation, RecordedAttempt } from './contracts.js'
import { decodeAttemptData, encodeAttemptData } from './serialization.js'

type ObjectData = Record<string, unknown>
function object(value: unknown, name: string): ObjectData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value as ObjectData
}
function text(value: unknown, name: string, maximum = 500): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${name} must be a nonempty string up to ${maximum} characters`)
}
function number(value: unknown, name: string, minimum = 0, maximum = 1e9): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} must be finite within ${minimum}–${maximum}`)
}
function id(value: unknown, name: string) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${name} is invalid`)
}
function date(value: unknown) {
  text(value, 'createdAt', 100)
  if (!Number.isFinite(Date.parse(value))) throw new Error('createdAt must be a valid date')
}
function score(value: unknown) {
  const result = object(value, 'score')
  text(result.schemaVersion, 'score.schemaVersion', 100)
  number(result.maxScore, 'maxScore', 1)
  number(result.score, 'score', 0, result.maxScore + 1e-6)
  for (const key of ['accuracy', 'averageAccuracy', 'form', 'timing', 'coverage']) number(result[key], key, 0, 1.000001)
  for (const key of ['combo', 'maxCombo', 'trackingMisses', 'processedOpportunities']) {
    number(result[key], key, 0, 1e6)
    if (!Number.isInteger(result[key])) throw new Error(`${key} must be an integer`)
  }
  number(result.timeSec, 'score time', 0, 1300)
  if (result.offsetMs !== null) number(result.offsetMs, 'offsetMs', -10_000, 10_000)
  text(result.label, 'judgment', 100)
}
function policy(value: unknown) {
  const config = object(value, 'historical policy')
  text(config.schemaVersion, 'policy.schemaVersion', 100)
  for (const key of ['timingToleranceMs', 'sampleHz', 'blockSize', 'processingDeadlineMs', 'maximumSampleGapMs', 'comboWindowSec']) number(config[key], key, 0.000001, 10_000)
  number(config.minimumCoverage, 'minimumCoverage', 0, 1)
}
function resultWithTrace(value: ObjectData) {
  text(value.implementationId, 'implementationId', 200)
  policy(value.policy); score(value.result)
  if (!Array.isArray(value.trace) || !value.trace.length || value.trace.length > ATTEMPT_LIMITS.trace) throw new Error('Score trace is empty or too large')
  for (const entry of value.trace) {
    const point = object(entry, 'trace point')
    number(point.songTimeSec, 'trace seconds', 0, 1300); score(point.result)
  }
  if (encodeAttemptData(value.trace.at(-1).result) !== encodeAttemptData(value.result)) throw new Error('Final trace point must match the saved result')
}
export function validateAttempt(value: unknown): asserts value is RecordedAttempt {
  const attempt = object(value, 'attempt')
  if (attempt.schemaVersion !== 'dance-attempt/1') throw new Error('Unsupported attempt schema; expected dance-attempt/1')
  id(attempt.id, 'attempt ID'); date(attempt.createdAt)
  if (!['solo', 'battle'].includes(String(attempt.mode))) throw new Error('Unsupported attempt mode')
  if (!['complete', 'limit-exceeded'].includes(String(attempt.recordingStatus))) throw new Error('Unsupported recording status')
  const reference = object(attempt.reference, 'reference'), chart = object(reference.chart, 'reference chart')
  if (chart.version !== 1 || chart.motionThumbnails !== undefined) throw new Error('Expected chart version 1 without thumbnail assets')
  text(chart.title, 'chart title'); number(chart.durationSec, 'chart duration', 0, 7200)
  number(chart.sampleRateHz, 'reference sampling rate', 0.001, 240)
  if (!Array.isArray(chart.samples) || !chart.samples.length || chart.samples.length > 18000) throw new Error('Reference requires 1–18,000 samples')
  for (const entry of chart.samples) {
    const sample = object(entry, 'reference sample')
    number(sample.t, 'reference seconds', 0, 7200)
    if (sample.sourceTimeSec !== undefined) number(sample.sourceTimeSec, 'source seconds', 0, 7200)
    if (sample.canonicalFrame !== undefined) validateFrame(sample.canonicalFrame)
    if (!Array.isArray(sample.landmarks) || sample.landmarks.length > 33) throw new Error('Invalid legacy landmark array')
    for (const point of sample.landmarks) if (!Array.isArray(point) || point.length !== 4 || point.some((item) => typeof item !== 'number')) throw new Error('Invalid legacy landmark tuple')
  }
  if (!Array.isArray(chart.segments) || chart.segments.length > 18000) throw new Error('Invalid reference segments')
  for (const entry of chart.segments) {
    const segment = object(entry, 'segment'); text(segment.id, 'segment ID', 100)
    number(segment.startSec, 'segment start', 0, 7200); number(segment.endSec, 'segment end', segment.startSec, 7200)
    number(segment.sampleCount, 'segment sampleCount', 0, 18000)
  }
  const options = object(reference.options, 'reference options')
  if (Object.keys(options).some((key) => !['timeline', 'durationSec', 'imageSize', 'reflectDance'].includes(key))) throw new Error('Unsupported reference option')
  if (options.timeline !== undefined && !['chart', 'source-video'].includes(String(options.timeline))) throw new Error('Invalid reference timeline')
  if (options.durationSec !== undefined) number(options.durationSec, 'reference duration', 0.001, 1200)
  else number(chart.durationSec, 'reference duration', 0.001, 1200)
  if (options.reflectDance !== undefined && typeof options.reflectDance !== 'boolean') throw new Error('reflectDance must be boolean')
  if (options.imageSize !== undefined) {
    const size = object(options.imageSize, 'image size')
    number(size.width, 'image width', 1, 32768); number(size.height, 'image height', 1, 32768)
  }
  if (!Array.isArray(attempt.events) || !attempt.events.length || attempt.events.length > ATTEMPT_LIMITS.events) throw new Error('Attempt event list is empty or too large')
  let observations = 0
  for (const [index, entry] of attempt.events.entries()) {
    const event = object(entry, 'event')
    if (event.kind === 'observation') {
      if (++observations > ATTEMPT_LIMITS.observations) throw new Error('Too many camera observations')
      const observation = object(event.observation, 'observation')
      number(observation.songTimeSec, 'capture song seconds', -30, 1300)
      number(observation.receivedAtSongTimeSec, 'delivery song seconds', 0, 1300)
      if (observation.frame !== null) validateFrame(observation.frame)
      if (typeof event.originallyAccepted !== 'boolean') throw new Error('Missing original observation acceptance')
    } else if (event.kind === 'advance' || event.kind === 'finish') {
      number(event.songTimeSec, 'song seconds', 0, 1300)
      if (event.kind === 'finish' && index !== attempt.events.length - 1) throw new Error('finish must be the last event')
    } else throw new Error('Unsupported attempt event')
  }
  if (attempt.recordingStatus === 'complete' && attempt.events.at(-1).kind !== 'finish') throw new Error('Complete recordings require a final finish event')
  resultWithTrace(object(attempt.original, 'original result'))
}
export function validateEvaluation(value: unknown): asserts value is AttemptEvaluation {
  const evaluation = object(value, 'evaluation')
  if (evaluation.schemaVersion !== 'dance-attempt-evaluation/1') throw new Error('Unsupported evaluation schema')
  id(evaluation.id, 'evaluation ID'); id(evaluation.attemptId, 'attempt ID'); date(evaluation.createdAt)
  text(evaluation.label, 'evaluation label', 200); resultWithTrace(evaluation)
}
export function parseAttempt(text: string): RecordedAttempt {
  const value = decodeAttemptData(text)
  validateAttempt(value)
  return value
}
