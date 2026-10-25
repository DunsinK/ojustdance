import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { EffectsContext } from './EffectsContext'
import type { EffectsPreferences } from './EffectsContext'
import { ReducedMotionContext } from '../ui/Motion'

function initial(): EffectsPreferences {
  const defaults: EffectsPreferences = { intensity: 'normal', reduced: false, sound: false, music: true }
  try {
    const saved = JSON.parse(localStorage.getItem('ojustdance-effects/1') ?? 'null')
    return saved && ['low', 'normal', 'ultra'].includes(saved.intensity)
      ? { intensity: saved.intensity, reduced: saved.reduced === true, sound: saved.sound === true, music: saved.music !== false } : defaults
  } catch { return defaults }
}
export function EffectsProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(initial)
  const systemReduced = useReducedMotion(), reduced = preferences.reduced || !!systemReduced
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { try { localStorage.setItem('ojustdance-effects/1', JSON.stringify(preferences)) } catch { /* Session preference still works. */ } }, [preferences])
  return <EffectsContext.Provider value={{ preferences, reduced, update: (patch) => setPreferences((value) => ({ ...value, ...patch })) }}>
    <ReducedMotionContext.Provider value={reduced}>
      <div className={`performance-root fx-${preferences.intensity}${reduced ? ' fx-reduced' : ''}`}>{children}</div>
    </ReducedMotionContext.Provider>
  </EffectsContext.Provider>
}
