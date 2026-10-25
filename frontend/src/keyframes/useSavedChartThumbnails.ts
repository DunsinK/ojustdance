import { useCallback, useEffect, useState } from 'react'
import type { ChartDocument } from '../pose/types.js'
import { analyzeVideoFile } from '../pose/analyzeVideo.js'
import { createPoseLandmarker } from '../pose/createPoseLandmarker.js'
import { canonicalMotionSamples } from './chartSamples.js'
import { loadThumbnailVideo, releaseVideo, checkAbort } from './media.js'
import { prepareMotionThumbnails } from './prepare.js'
import { captureThumbnailAssets } from './thumbnailAssets.js'
import { readThumbnailCache, writeThumbnailCache } from './cache.js'
import { CURRENT_SELECTION_ALGORITHM, CURRENT_THUMBNAIL_ASSETS, DEFAULT_THUMBNAIL_APPEARANCE, isCurrentThumbnailTrack, matchesThumbnailAppearance } from './contracts.js'
import type { MotionThumbnails, ThumbnailAppearance } from './contracts.js'

/** Existing cue timestamps can be restyled without repeating pose-track extraction or selection. */
export function useSavedChartThumbnails(chart: ChartDocument, sourceUrl: string | null,
  appearance: ThumbnailAppearance = DEFAULT_THUMBNAIL_APPEARANCE, enabled = true) {
  const key = `${CURRENT_SELECTION_ALGORITHM}:${CURRENT_THUMBNAIL_ASSETS}:${appearance.version}:${appearance.background}:${appearance.centered}:${sourceUrl}:${chart.recordedAt}:${chart.durationSec}:${JSON.stringify(chart.segments)}`
  const [revision, setRevision] = useState(0)
  const embeddedMatches = revision === 0 && Boolean(chart.motionThumbnails && isCurrentThumbnailTrack(chart.motionThumbnails) && matchesThumbnailAppearance(chart.motionThumbnails, appearance))
  const retry = useCallback(() => setRevision((value) => value + 1), [])
  const [result, setResult] = useState<{ key: string; plan: MotionThumbnails | null; message: string; error: string | null } | null>(null)
  useEffect(() => {
    if (!enabled || embeddedMatches || !sourceUrl) return
    const controller = new AbortController()
    const { signal } = controller
    const progress = (message: string) => { if (!signal.aborted) setResult({ key, plan: null, message, error: null }) }
    void (async () => {
      try {
        const cached = revision === 0 ? await readThumbnailCache(key) : null
        checkAbort(signal)
        if (cached && isCurrentThumbnailTrack(cached) && matchesThumbnailAppearance(cached, appearance)) { setResult({ key, plan: cached, message: '', error: null }); return }
        let plan: MotionThumbnails
        let samples = canonicalMotionSamples([{ id: 'saved-chart', startSec: 0, endSec: chart.durationSec, samples: chart.samples }])
        if (chart.motionThumbnails?.algorithm === CURRENT_SELECTION_ALGORITHM && !chart.motionThumbnails.preparation?.skippedCueCount) {
          progress('Preparing centered person thumbnails from saved reference frames…')
          plan = await captureThumbnailAssets(sourceUrl, chart.motionThumbnails, signal,
            (done, total) => progress(`Preparing thumbnail appearance ${done}/${total}…`), { appearance, ...(samples.length ? { samples } : {}) })
        } else {
          if (!samples.length) {
            progress('Preparing this older chart’s motion thumbnails locally…')
            const video = await loadThumbnailVideo(sourceUrl, signal)
            let landmarker: Awaited<ReturnType<typeof createPoseLandmarker>> | null = null
            try {
              landmarker = await createPoseLandmarker(chart.model)
              checkAbort(signal)
              const observations = await analyzeVideoFile({ video, landmarker, sampleHz: 15, signal, durationSec: chart.durationSec,
                onProgress: ({ t, duration }) => progress(`Analyzing older reference video: ${Math.round(t / duration * 100)}%`) })
              samples = canonicalMotionSamples([{ id: 'original-video', startSec: 0, endSec: chart.durationSec, samples: observations }])
            } finally { landmarker?.close(); releaseVideo(video) }
          }
          checkAbort(signal)
          plan = await prepareMotionThumbnails(sourceUrl, samples, signal, progress, appearance)
        }
        checkAbort(signal)
        await writeThumbnailCache(key, plan)
        if (!signal.aborted) setResult({ key, plan, message: '', error: null })
      } catch (error) {
        if (!signal.aborted) setResult({ key, plan: null, message: '', error: error instanceof Error ? error.message : 'Thumbnail preparation failed' })
      }
    })()
    return () => controller.abort()
  }, [chart, sourceUrl, key, revision, appearance, embeddedMatches, enabled])
  if (!enabled) return { plan: null, loading: false, message: '', error: null, retry }
  if (!sourceUrl) return { plan: null, loading: false, message: '', error: 'This chart has no original video for thumbnails.', retry }
  if (embeddedMatches) return { plan: chart.motionThumbnails!, loading: false, message: '', error: null, retry }
  const current = result?.key === key ? result : null
  return { plan: current?.plan ?? null, loading: !current?.plan && !current?.error, message: current?.message ?? 'Loading motion thumbnails…', error: current?.error ?? null, retry }
}
