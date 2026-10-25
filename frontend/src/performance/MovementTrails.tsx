import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { SkeletonFrame } from '@ojustdance/skeleton'
import { useEffects } from './EffectsContext'

export function MovementTrails({ frame, mirrored }: { frame: RefObject<{ value: SkeletonFrame | null; at: number }>; mirrored: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null), { reduced, preferences } = useEffects()
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || reduced || preferences.intensity === 'low') return
    let raf = 0, previous = -1, lastDraw = 0
    const history: { x: number; y: number; at: number; name: string }[] = []
    const names = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'] as const
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - lastDraw < 33) return
      lastDraw = now
      const source = frame.current
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const size = source.value?.coordinates.imageSize
      if (source.value && size && source.at !== previous && now - source.at < 150) {
        previous = source.at
        for (const name of names) {
          const observation = source.value.observations[name], point = observation?.position
          if (!point || !observation.valid || (observation.visibility != null && observation.visibility < 0.5)
            || (observation.confidence != null && observation.confidence < 0.5) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
          const ratio = Math.min(canvas.width / size.width, canvas.height / size.height)
          history.push({ x: (canvas.width - size.width * ratio) / 2 + point.x * ratio,
            y: (canvas.height - size.height * ratio) / 2 + point.y * ratio, at: now, name })
        }
      }
      while (history.length && (now - history[0].at > 180 || history.length > 48)) history.shift()
      for (const name of names) {
        const points = history.filter((point) => point.name === name)
        if (points.length < 2) continue
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1], b = points[index]
          if (b.at - a.at > 100) continue
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(215,255,82,${(1 - (now - b.at) / 180) * 0.6})`; ctx.lineWidth = index * 1.2
          ctx.lineCap = 'round'; ctx.stroke()
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height) }
  }, [frame, preferences.intensity, reduced])
  return <canvas ref={ref} className={`movement-trails${mirrored ? ' mirrored' : ''}`} aria-hidden="true" />
}
