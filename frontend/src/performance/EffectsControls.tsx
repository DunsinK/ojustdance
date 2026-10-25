import { useEffects } from './EffectsContext'
export function EffectsControls() {
  const { preferences, reduced, update } = useEffects()
  return <div className="fx-controls" aria-label="Stage effects">
    <label><span>FX</span><select aria-label="Visual intensity" value={preferences.intensity}
      onChange={(event) => update({ intensity: event.target.value as typeof preferences.intensity })}>
      <option value="low">Low</option><option value="normal">Stage</option><option value="ultra">Ultra</option></select></label>
    <button type="button" aria-pressed={reduced} title="Reduce movement and disable trails" onClick={() => update({ reduced: !preferences.reduced })}>{reduced ? '◌ Reduced motion' : '✦ Full motion'}</button>
    <button type="button" aria-pressed={preferences.sound} onClick={() => update({ sound: !preferences.sound })}>{preferences.sound ? '♪ SFX on' : '♪ SFX off'}</button>
  </div>
}
