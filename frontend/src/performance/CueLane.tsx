import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ChartSample } from '../pose/types'
import type { ReferenceCue } from './contracts'
import { CuePose } from './CuePose'
import { useEffects } from './EffectsContext'

export function CueLane({ cues, samples, timeSec, clock, leadInSec, aspect, mirrored }: {
  cues: readonly ReferenceCue[]; samples: readonly ChartSample[]; timeSec: number; clock: RefObject<number>; leadInSec: number; aspect: number; mirrored: boolean
}) {
  const ref = useRef<HTMLDivElement>(null), { reduced } = useEffects()
  const visible = cues.filter((cue) => cue.endSec >= timeSec - 0.5 && cue.startSec <= timeSec + leadInSec + 1).slice(0, 8)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const lane = ref.current
      if (lane) {
        const width = lane.clientWidth, marker = Math.max(76, width * 0.18), travel = Math.max(100, width - marker - 80)
        lane.style.setProperty('--hit-x', `${marker}px`)
        let upcomingIndex = 0
        for (const card of lane.querySelectorAll<HTMLElement>('[data-cue-start]')) {
          const start = Number(card.dataset.cueStart), end = Number(card.dataset.cueEnd), now = clock.current
          const active = now >= start && now < end
          const offset = active ? 0 : reduced ? start > now ? ++upcomingIndex * 110 : -120 : (start - now) / leadInSec * travel
          card.style.transform = `translate3d(${marker + offset - card.offsetWidth / 2}px,0,0) scale(${active && !reduced ? 1.08 : 1})`
          card.classList.toggle('is-active', active)
          card.style.opacity = now > end ? '0' : '1'
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw(); return () => cancelAnimationFrame(raf)
  }, [clock, leadInSec, reduced])
  return <section className="cue-deck" aria-label="Upcoming reference poses">
    <div className="cue-deck-heading"><span><i /> FOLLOW THE REFERENCE</span><span>ARRIVE AT THE GLOW ↙</span></div>
    <div className="cue-lane" ref={ref}>
      <div className="cue-hit-zone" aria-hidden="true"><span>NOW</span><i /><b /></div>
      <div className="cue-lane-line" aria-hidden="true" />
      {visible.map((cue) => <div className="cue-token" key={cue.id} data-cue-start={cue.startSec} data-cue-end={cue.endSec}
        aria-label={`${cue.label}, ${cue.startSec.toFixed(1)} seconds`}>
        <span>{cue.label}</span><CuePose cue={cue} samples={samples} aspect={aspect} mirrored={mirrored} /><small>{cue.startSec.toFixed(1)}s</small>
      </div>)}
      {!cues.length && <p className="cue-empty">Waiting for reference poses</p>}
    </div>
  </section>
}
