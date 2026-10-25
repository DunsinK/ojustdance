import type { CanonicalMotionSample, MotionThumbnails, ThumbnailAppearance } from './contracts.js'
import { DEFAULT_THUMBNAIL_APPEARANCE } from './contracts.js'
import { selectMotionKeyframes } from './selectKeyframes.js'
import { captureThumbnailAssets } from './thumbnailAssets.js'
import { abortError, checkAbort } from './media.js'

async function selectOffThread(samples: CanonicalMotionSample[], signal: AbortSignal): Promise<MotionThumbnails> {
  checkAbort(signal)
  if (typeof Worker === 'undefined') return selectMotionKeyframes(samples)
  const worker = new Worker(new URL('./selector.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, result?: MotionThumbnails) => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel); worker.terminate()
      if (error) reject(error); else resolve(result!)
    }
    const cancel = () => finish(abortError())
    const timer = setTimeout(() => finish(new Error('Motion selection timed out. Try a shorter video.')), 30000)
    signal.addEventListener('abort', cancel, { once: true })
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : undefined, data.plan)
    worker.onerror = () => finish(new Error('Motion worker could not start. Reload the page and retry.'))
    worker.postMessage(samples)
  })
}
export async function prepareMotionThumbnails(sourceUrl: string, samples: CanonicalMotionSample[], signal: AbortSignal, onProgress: (message: string) => void, appearance: ThumbnailAppearance = DEFAULT_THUMBNAIL_APPEARANCE): Promise<MotionThumbnails> {
  onProgress('Finding significant movements…')
  const plan = await selectOffThread(samples, signal)
  checkAbort(signal)
  onProgress(appearance.background === 'removed' || appearance.centered ? 'Loading local person-mask model…' : 'Capturing reference frames…')
  return captureThumbnailAssets(sourceUrl, plan, signal, (completed, total) => onProgress(`Preparing ${appearance.background === 'removed' ? 'person cutouts' : 'motion thumbnails'} ${completed}/${total}…`), { appearance, samples })
}
