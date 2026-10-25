import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { PerformanceEvent } from './contracts'
import { useEffects } from './EffectsContext'

export function StageCelebration({ judgment, banner }: {
  judgment: Extract<PerformanceEvent, { type: 'moveJudged' }> | null
  banner: { id: string; text: string } | null
}) {
  const { reduced, preferences } = useEffects()
  const particles = reduced ? 0 : preferences.intensity === 'ultra' ? 24 : preferences.intensity === 'low' ? 6 : 14
  return <div className="stage-celebrations" aria-live="polite" aria-atomic="true">
    <AnimatePresence>
      {judgment && <motion.div key={judgment.id} className={`stage-judgment judgment-${judgment.grade.toLowerCase()}`}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: judgment.grade === 'PERFECT' ? 1.9 : 0.65, rotate: -7, y: 20 }}
        animate={{ opacity: 1, scale: 1, rotate: -5, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -24 }}
        transition={{ type: 'spring', stiffness: 330, damping: 23 }}>
        <span className="judgment-kicker">{judgment.grade === 'TRACKING' ? 'MORE VISIBLE POINTS NEEDED' : 'REFERENCE PHASE COMPLETE'}</span>
        <strong>{judgment.grade === 'TRACKING' ? 'FIND YOUR FRAME' : judgment.grade}</strong>
        {judgment.points > 0 && <span className="judgment-points">+{judgment.points.toLocaleString()}</span>}
        {!['MISS', 'TRACKING'].includes(judgment.grade) && <div className="judgment-particles" aria-hidden="true">
          {Array.from({ length: particles }, (_, index) => <i key={index} style={{ '--angle': `${index / particles * 360}deg`, '--distance': `${80 + index % 4 * 28}px`, '--delay': `${index % 3 * 0.035}s` } as CSSProperties} />)}
        </div>}
      </motion.div>}
    </AnimatePresence>
    <AnimatePresence>{banner && <motion.div className="stage-banner" key={banner.id}
      initial={{ opacity: 0, y: reduced ? 0 : -40, scale: reduced ? 1 : 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduced ? 0 : -20 }}><span>✦</span>{banner.text}<span>✦</span></motion.div>}</AnimatePresence>
  </div>
}
