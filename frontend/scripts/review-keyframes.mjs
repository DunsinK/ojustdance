/** Run after npm run test:keyframes. Reads only local canonical pose data. */
import { readFile, writeFile } from 'node:fs/promises'
import { selectMotionKeyframes, evaluateMotionSelection } from '../.keyframe-tests/keyframes/selectKeyframes.js'
import { buildSelectionReview } from '../.keyframe-tests/keyframes/selectionReview.js'
import { compareVisualTargets } from '../.keyframe-tests/keyframes/visualReview.js'

const [inputPath, outputPath, referencePath] = process.argv.slice(2)
if (!inputPath) {
  console.error('Usage: node scripts/review-keyframes.mjs <motion-selection-review.json> [output.json] [visual-targets.json]')
  process.exitCode = 1
} else {
  try {
    const input = JSON.parse(await readFile(inputPath, 'utf8'))
    if (input.schemaVersion !== 'motion-selection-review/1' || !Array.isArray(input.samples)) throw new Error('Expected a motion-selection-review/1 export from Map')
    const track = selectMotionKeyframes(input.samples)
    const review = buildSelectionReview(input.samples, track)
    const summary = (plan, metrics) => ({ algorithm: plan.algorithm, cues: plan.cues.length,
      meanMotionError: +metrics.meanMotionError.toFixed(4), maxMotionError: +metrics.maxMotionError.toFixed(4),
      coverageWithin018TorsoUnits: metrics.coverageFraction === null ? null : +metrics.coverageFraction.toFixed(4) })
    if (input.selection) console.log('Saved selection:', summary(input.selection, evaluateMotionSelection(input.samples, input.selection)))
    console.log('Current selector:', summary(track, review.diagnostics))
    console.log('Geometry coverage is a diagnostic, not a choreography-quality score.')
    if (referencePath) {
      const reference = JSON.parse(await readFile(referencePath, 'utf8'))
      if (input.selection) console.log('Saved visual comparison:', compareVisualTargets(input.selection, reference))
      console.log('Current visual comparison:', compareVisualTargets(track, reference))
    }
    if (outputPath) await writeFile(outputPath, JSON.stringify(review, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
