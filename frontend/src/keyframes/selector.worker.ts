import { selectMotionKeyframes } from './selectKeyframes.js'
import type { CanonicalMotionSample } from './contracts.js'
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<CanonicalMotionSample[]>) => void; postMessage: (message: unknown) => void }
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ plan: selectMotionKeyframes(data) }) }
  catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : 'Keyframe selection failed' }) }
}
