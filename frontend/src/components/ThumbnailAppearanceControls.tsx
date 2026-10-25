import type { ThumbnailAppearance } from '../keyframes/contracts.js'

export function ThumbnailAppearanceControls({ appearance, onChange }: {
  appearance: ThumbnailAppearance
  onChange: (appearance: ThumbnailAppearance) => void
}) {
  return <div className="motion-thumbnail-controls" aria-label="Thumbnail appearance">
    <label><input type="checkbox" checked={appearance.background === 'removed'}
      onChange={(event) => onChange({ ...appearance, background: event.target.checked ? 'removed' : 'original' })} /> Remove background</label>
    <label><input type="checkbox" checked={appearance.centered}
      onChange={(event) => onChange({ ...appearance, centered: event.target.checked })} /> Center dancer</label>
  </div>
}
