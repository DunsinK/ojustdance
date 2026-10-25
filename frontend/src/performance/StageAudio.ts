import type { PerformanceEvent } from './contracts.js'

/** One reference-audio path and a separate quiet SFX gain. Never read microphone audio. */
export class StageAudio {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaElementAudioSourceNode | null = null
  private element: HTMLMediaElement | null = null
  private bytes: Uint8Array<ArrayBuffer> | null = null
  private lastSoundAt = -Infinity
  private played = new Set<string>()
  async unlock() {
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') await this.context.resume() } catch { /* Visual gameplay never depends on audio permission. */ }
  }
  async connect(element: HTMLMediaElement) {
    await this.unlock()
    if (!this.context || this.element === element) return
    // Unclean cross-origin sources would become silent through Web Audio.
    const url = new URL(element.currentSrc || element.src, location.href)
    if (url.origin !== location.origin && url.protocol !== 'blob:' && element.crossOrigin !== 'anonymous') return
    try {
      const source = this.context.createMediaElementSource(element)
      const analyser = this.context.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.78
      source.connect(analyser); analyser.connect(this.context.destination)
      this.source = source; this.analyser = analyser; this.element = element; this.bytes = new Uint8Array(analyser.frequencyBinCount)
    } catch { /* A node already owned by another analyser keeps native playback. */ }
  }
  energy(): number {
    if (!this.analyser || !this.bytes || !this.element || this.element.paused || this.element.muted) return 0
    this.analyser.getByteFrequencyData(this.bytes)
    let sum = 0
    for (let index = 1; index < 25; index++) sum += this.bytes[index]
    return Math.min(1, sum / (24 * 255) * 2.5)
  }
  isAnalysing() { return !!this.analyser }
  play(event: PerformanceEvent) {
    if (!['moveJudged', 'comboMilestone', 'leadChanged', 'roundFinished'].includes(event.type)) return
    if (this.played.has(event.id)) return
    this.played.add(event.id)
    if (this.played.size > 1024) this.played.delete(this.played.values().next().value!)
    if (event.type === 'moveJudged' && ['MISS', 'TRACKING'].includes(event.grade)) return
    const note = event.type === 'moveJudged' ? event.grade === 'PERFECT' ? 880 : event.grade === 'GOOD' ? 660 : 440
      : event.type === 'comboMilestone' ? 1046 : event.type === 'leadChanged' ? 784 : event.type === 'roundFinished' ? 523 : 0
    const accent = event.type === 'comboMilestone' || event.type === 'roundFinished'
    if (note) this.tone(note, accent ? 0.3 : 0.12, accent)
  }
  tone(frequency: number, duration = 0.1, accent = false) {
    if (!this.context || this.context.state !== 'running' || (!accent && this.context.currentTime - this.lastSoundAt < 0.12)) return
    this.lastSoundAt = this.context.currentTime
    const oscillator = this.context.createOscillator(), gain = this.context.createGain(), start = this.context.currentTime + (accent ? 0.08 : 0)
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.25, start + duration)
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.045, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(start); oscillator.stop(start + duration + 0.02)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }
  dispose() { this.source?.disconnect(); this.analyser?.disconnect(); void this.context?.close().catch(() => {}); this.context = null }
}
