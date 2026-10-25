import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useEffects } from './EffectsContext'
import type { StageAudio } from './StageAudio'

export interface StageSignal { energy: number; combo: number; peakUntil: number }
export function ReactiveStage({ signal, audio, home = false }: { signal?: RefObject<StageSignal>; audio?: RefObject<StageAudio | null>; home?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null), { preferences, reduced } = useEffects()
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !context) return
    let width = 0, height = 0, raf = 0, last = 0, visible = true
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height
      const ratio = Math.min(devicePixelRatio || 1, preferences.intensity === 'ultra' ? 1.5 : 1)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }); resize.observe(canvas)
    const visibility = () => { visible = !document.hidden }; document.addEventListener('visibilitychange', visibility)
    const count = reduced ? 0 : preferences.intensity === 'low' ? 14 : preferences.intensity === 'ultra' ? 52 : 28
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible || now - last < (reduced ? 500 : preferences.intensity === 'ultra' ? 1000 / 40 : 1000 / 30)) return
      last = now
      const t = reduced ? 0 : now / 1000
      const music = audio?.current?.energy() ?? 0, movement = signal?.current.energy ?? 0
      const combo = signal?.current.combo ?? 0, peak = (signal?.current.peakUntil ?? 0) > now ? 1 : 0
      const energy = Math.min(1, music * 0.8 + movement * 0.2 + Math.min(combo, 10) * 0.02 + peak * 0.3)
      canvas.parentElement?.style.setProperty('--stage-energy', energy.toFixed(3))
      context.clearRect(0, 0, width, height)
      const centerX = width * (home ? 0.72 : 0.5), centerY = height * 0.53
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.65)
      glow.addColorStop(0, `rgba(255,81,72,${0.14 + energy * 0.16})`); glow.addColorStop(0.5, 'rgba(100,56,40,.06)'); glow.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = glow; context.fillRect(0, 0, width, height)
      context.save(); context.translate(centerX, centerY)
      for (let ring = 0; ring < 5; ring++) {
        const phase = (t * 0.11 + ring / 5) % 1
        context.beginPath(); context.ellipse(0, height * 0.24, width * (0.07 + phase * 0.4), height * (0.025 + phase * 0.11), -0.12, 0, Math.PI * 2)
        context.strokeStyle = `rgba(215,255,82,${(1 - phase) * (0.07 + energy * 0.25)})`; context.lineWidth = 1 + energy * 2; context.stroke()
      }
      for (let line = 0; line < 3; line++) {
        context.beginPath()
        for (let x = -width; x <= width; x += 14) {
          const y = Math.sin(x * 0.006 + t * (0.4 + line * 0.15)) * (30 + energy * 90) + Math.cos(x * 0.002 - t * 0.3) * height * 0.2
          if (x === -width) context.moveTo(x, y + line * 18); else context.lineTo(x, y + line * 18)
        }
        context.strokeStyle = line === 0 ? `rgba(215,255,82,${0.1 + energy * 0.18})` : `rgba(255,143,115,${0.12 + energy * 0.13})`
        context.lineWidth = 1 + energy * 2; context.stroke()
      }
      for (let index = 0; index < count; index++) {
        const phase = (t * (0.025 + index % 3 * 0.01) + index * 0.618) % 1
        const x = Math.sin(index * 127.1) * width * 0.58 + Math.sin(t * 0.3 + index) * 20
        const y = height * (0.6 - phase * 1.2)
        context.fillStyle = index % 3 ? `rgba(215,255,82,${Math.sin(phase * Math.PI) * 0.55})` : `rgba(255,142,114,${Math.sin(phase * Math.PI) * 0.6})`
        context.fillRect(x, y, index % 5 ? 2 : 4, index % 5 ? 2 : 12)
      }
      context.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); resize.disconnect(); document.removeEventListener('visibilitychange', visibility); context.clearRect(0, 0, width, height) }
  }, [audio, home, preferences.intensity, reduced, signal])
  return <canvas ref={ref} className="reactive-stage" aria-hidden="true" />
}
