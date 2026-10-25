import { createContext, useContext } from 'react'

export interface EffectsPreferences {
  intensity: 'low' | 'normal' | 'ultra'
  reduced: boolean
  sound: boolean
  music: boolean
}
export const EffectsContext = createContext<{ preferences: EffectsPreferences; reduced: boolean; update: (patch: Partial<EffectsPreferences>) => void }>({
  preferences: { intensity: 'normal', reduced: false, sound: false, music: true }, reduced: false, update: () => {},
})
export const useEffects = () => useContext(EffectsContext)
