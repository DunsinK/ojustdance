import type { RecordedAttempt } from './contracts.js'
import { encodeAttemptData } from './serialization.js'

export function downloadAttempt(attempt: RecordedAttempt) {
  const blob = new Blob([encodeAttemptData(attempt)], { type: 'application/json' })
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `dance-attempt-${attempt.id}.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
