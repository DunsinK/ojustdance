import type { PerformanceEvent } from './contracts.js'

/** One presentation bus per mounted round. Stable result IDs are never celebrated twice. */
export class PerformanceEvents {
  private seen = new Set<string>()
  private listeners = new Set<(event: PerformanceEvent) => void>()
  subscribe(listener: (event: PerformanceEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  publish(events: readonly PerformanceEvent[]) {
    for (const event of events) {
      if (event.type !== 'moveProgress') {
        if (this.seen.has(event.id)) continue
        this.seen.add(event.id)
        if (this.seen.size > 8192) this.seen.delete(this.seen.values().next().value!)
      }
      this.listeners.forEach((listener) => listener(event))
    }
  }
}
