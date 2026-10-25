import { evaluateMotionSelection } from './selectKeyframes.js';
/** Reproducible local diagnostic input. Images and temporary media URLs are excluded. */
export function buildSelectionReview(samples, track) {
    return {
        schemaVersion: 'motion-selection-review/1',
        samples,
        selection: { ...track, frames: {} },
        diagnostics: evaluateMotionSelection(samples, track),
    };
}
