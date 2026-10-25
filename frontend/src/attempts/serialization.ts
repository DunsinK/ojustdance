import { ATTEMPT_LIMITS } from './contracts.js'

/** JSON normally destroys NaN/Infinity, which are legitimate rejected source coordinates. */
export function encodeAttemptData(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === 'number' && !Number.isFinite(item)
    ? { $number: Number.isNaN(item) ? 'NaN' : item > 0 ? '+Infinity' : '-Infinity' } : item)
}
export function decodeAttemptData(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > ATTEMPT_LIMITS.bytes) throw new Error('Attempt file exceeds 128 MB')
  return JSON.parse(text, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 1 && '$number' in item) {
      if (item.$number === 'NaN') return NaN
      if (item.$number === '+Infinity') return Infinity
      if (item.$number === '-Infinity') return -Infinity
      throw new Error('Unsupported non-finite coordinate marker')
    }
    return item
  })
}
