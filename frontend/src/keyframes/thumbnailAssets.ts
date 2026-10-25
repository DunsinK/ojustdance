import type { CanonicalMotionSample, MotionThumbnails, ThumbnailAppearance, ThumbnailImage, ThumbnailIssueReason } from './contracts.js'
import { CURRENT_THUMBNAIL_ASSETS, DEFAULT_THUMBNAIL_APPEARANCE, frameId, MINIMUM_TARGET_SPACING_SEC, THUMBNAIL_LIMITS } from './contracts.js'
import { checkAbort, loadThumbnailVideo, releaseVideo, seekVideo } from './media.js'
import { validateMotionThumbnails } from './validation.js'
import { createPersonSegmenter, PersonNotFoundError } from './personSegmentation.js'
import type { PersonSegmenter, SegmentedPerson } from './personSegmentation.js'
import { applyPersonAlpha, centeredTransforms } from './personMatte.js'
import type { PersonFraming } from './personMatte.js'
import { observationFraming } from './observationFraming.js'

// Raw frames are used for sharpness only. Appearance-specific results never reuse old JPEGs.
const images = new Map<string, { image: ThumbnailImage; sharpness: number }>()
const preparedTracks = new Map<string, MotionThumbnails>()
export interface ThumbnailCaptureOptions {
  appearance?: ThumbnailAppearance
  samples?: readonly CanonicalMotionSample[]
  segmenterFactory?: (signal?: AbortSignal) => Promise<PersonSegmenter>
}
function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = width; element.height = height
  return element
}
function contextFor(image: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = image.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas thumbnail rendering is unavailable')
  return context
}
function sharpness(context: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = context.getImageData(0, 0, width, height)
  const gray = (index: number) => (data[index] + data[index + 1] + data[index + 2]) / 3
  let total = 0, count = 0
  for (let y = 1; y < height - 1; y += 2) for (let x = 1; x < width - 1; x += 2) {
    const index = (y * width + x) * 4
    const laplacian = gray(index - 4) + gray(index + 4) + gray(index - width * 4) + gray(index + width * 4) - 4 * gray(index)
    total += laplacian * laplacian; count++
  }
  return count ? total / count : 0
}
function encodeThumbnail(image: HTMLCanvasElement, transparent: boolean): string {
  const mime = transparent ? 'image/webp' : 'image/jpeg'
  const supported = transparent ? /^data:image\/(webp|png);base64,/ : /^data:image\/jpeg;base64,/
  let encoded = image.toDataURL(mime, 0.94)
  if (transparent && !supported.test(encoded)) encoded = image.toDataURL('image/png')
  if (!supported.test(encoded)) throw new Error('This browser cannot encode the requested thumbnail format')
  // Preserve resolution and a high quality floor instead of silently falling back to blurry images.
  if (encoded.length > THUMBNAIL_LIMITS.encodedImageChars) encoded = image.toDataURL(mime, 0.90)
  if (!supported.test(encoded) || encoded.length > THUMBNAIL_LIMITS.encodedImageChars) throw new Error('High-quality thumbnail exceeds the image cache budget')
  return encoded
}

export async function captureThumbnailAssets(sourceUrl: string, plan: MotionThumbnails, signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void, options: ThumbnailCaptureOptions = {}): Promise<MotionThumbnails> {
  validateMotionThumbnails(plan, false)
  checkAbort(signal)
  const appearance = options.appearance ?? DEFAULT_THUMBNAIL_APPEARANCE
  const result = structuredClone(plan)
  result.frames = {}; result.appearance = { ...appearance }; result.assetVersion = CURRENT_THUMBNAIL_ASSETS
  // Old pair tracks can be restyled too; keep only their representative still.
  const pendingCues = result.cues.map((cue) => ({ ...cue, presentation: 'pose' as const, frameIds: [frameId(cue.thumbnailTimeSec)] }))
  result.cues = []
  result.preparation = { schemaVersion: 'thumbnail-preparation/1', requestedCueCount: pendingCues.length, skippedCueCount: 0, fallbackCueCount: 0, recoveredCueCount: 0, issues: [] }
  if (!pendingCues.length) return result
  const cacheKey = `${CURRENT_THUMBNAIL_ASSETS}:${sourceUrl}:${JSON.stringify(appearance)}:${JSON.stringify(plan.cues)}`
  const cachedTrack = options.segmenterFactory ? undefined : preparedTracks.get(cacheKey)
  if (cachedTrack) return cachedTrack

  const video = await loadThumbnailVideo(sourceUrl, signal)
  let segmenter: PersonSegmenter | null = null
  try {
    const aspect = video.videoWidth / video.videoHeight
    const width = Math.max(1, Math.min(THUMBNAIL_LIMITS.imageWidth, Math.round(THUMBNAIL_LIMITS.imageHeight * aspect)))
    const height = Math.max(1, Math.round(width / aspect))
    const rawCanvas = canvas(width, height), rawContext = contextFor(rawCanvas)
    result.sourceWidth = video.videoWidth; result.sourceHeight = video.videoHeight

    async function captureRaw(seconds: number) {
      checkAbort(signal)
      const key = `${CURRENT_THUMBNAIL_ASSETS}:${sourceUrl}:${frameId(seconds)}`
      const cached = images.get(key)
      if (cached) return cached
      await seekVideo(video, seconds, signal)
      rawContext.drawImage(video, 0, 0, width, height)
      let dataUrl: string
      try { dataUrl = encodeThumbnail(rawCanvas, false) }
      catch (error) {
        if (error instanceof DOMException && error.name === 'SecurityError') throw new Error('Thumbnail capture was blocked by video CORS. Use an uploaded file or a video host allowing canvas access.', { cause: error })
        throw error
      }
      if (dataUrl.length > THUMBNAIL_LIMITS.encodedImageChars) throw new Error('Encoded thumbnail exceeds its cache budget')
      const value = { image: { sourceTimeSec: seconds, width, height, dataUrl }, sharpness: sharpness(rawContext, width, height) }
      images.set(key, value)
      if (images.size > 96) images.delete(images.keys().next().value!)
      return value
    }

    const needsPerson = appearance.background === 'removed' || appearance.centered
    const propagateCancellation = (error: unknown) => {
      checkAbort(signal)
      if (error instanceof Error && error.name === 'AbortError') throw error
    }
    let modelUnavailable = false
    if (needsPerson) {
      try { segmenter = await (options.segmenterFactory ?? createPersonSegmenter)(signal) }
      catch (error) { propagateCancellation(error); modelUnavailable = true }
    }
    const report = result.preparation!
    const analysisScale = Math.min(1, 512 / video.videoWidth, 512 / video.videoHeight)
    const analysisImage = canvas(Math.max(1, Math.round(video.videoWidth * analysisScale)), Math.max(1, Math.round(video.videoHeight * analysisScale)))
    const analysisContext = contextFor(analysisImage)

    function measuredFraming(seconds: number): PersonFraming | null {
      const sample = options.samples?.reduce<CanonicalMotionSample | null>((closest, sample) =>
        !closest || Math.abs(sample.sourceTimeSec - seconds) < Math.abs(closest.sourceTimeSec - seconds) ? sample : closest, null)
      return sample && Math.abs(sample.sourceTimeSec - seconds) <= 0.08
        ? observationFraming(sample.frame, video.videoWidth, video.videoHeight) : null
    }
    async function capturePerson(seconds: number): Promise<SegmentedPerson> {
      checkAbort(signal)
      await seekVideo(video, seconds, signal)
      analysisContext.drawImage(video, 0, 0, analysisImage.width, analysisImage.height)
      const person = segmenter!.segment(analysisImage)
      checkAbort(signal)
      const sx = video.videoWidth / analysisImage.width, sy = video.videoHeight / analysisImage.height
      const { center, bounds, centerMethod } = person.framing
      return { mask: person.mask, framing: { center: { x: center.x * sx, y: center.y * sy }, centerMethod,
        bounds: { left: bounds.left * sx, right: bounds.right * sx, top: bounds.top * sy, bottom: bounds.bottom * sy } } }
    }
    async function renderPerson(seconds: number, framing: PersonFraming | null, person?: SegmentedPerson): Promise<ThumbnailImage> {
      await seekVideo(video, seconds, signal)
      const centered = appearance.centered && framing !== null
      const outputWidth = centered ? THUMBNAIL_LIMITS.centeredWidth : width
      const outputHeight = centered ? THUMBNAIL_LIMITS.centeredHeight : height
      const transform = centered ? centeredTransforms([framing!], outputWidth, outputHeight, 24)[0]
        : { scale: outputWidth / video.videoWidth, offsetX: 0, offsetY: 0 }
      const output = canvas(outputWidth, outputHeight), context = contextFor(output)
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
      context.setTransform(transform.scale, 0, 0, transform.scale, transform.offsetX, transform.offsetY)
      context.drawImage(video, 0, 0)
      const removed = appearance.background === 'removed' && person !== undefined
      if (removed) {
        const pixels = context.getImageData(0, 0, outputWidth, outputHeight)
        applyPersonAlpha(pixels.data, outputWidth, outputHeight, person!.mask, { width: video.videoWidth, height: video.videoHeight, transform })
        context.putImageData(pixels, 0, 0)
      }
      return { sourceTimeSec: seconds, width: outputWidth, height: outputHeight,
        dataUrl: encodeThumbnail(output, removed), background: removed ? 'removed' : 'original', centered,
        ...(centered ? { centerMethod: framing!.centerMethod } : {}) }
    }
    let encodedChars = 0
    for (let index = 0; index < pendingCues.length; index++) {
      checkAbort(signal)
      const cue = pendingCues[index]
      const requestedTime = cue.thumbnailTimeSec
      let reason: ThumbnailIssueReason = 'person-unavailable'
      let image: ThumbnailImage | null = null
      let usedFallback = false, encounteredFailure = false
      const candidates: { seconds: number; score: number; reference: PersonFraming | null }[] = []
      const times = [...new Set([requestedTime, ...cue.candidateTimesSec])].slice(0, 3)
      for (const seconds of times) {
        const previousTime = result.cues.at(-1)?.thumbnailTimeSec ?? -Infinity
        const nextTime = pendingCues[index + 1]?.thumbnailTimeSec ?? Infinity
        if (seconds - previousTime < MINIMUM_TARGET_SPACING_SEC - 1e-6 || nextTime - seconds < MINIMUM_TARGET_SPACING_SEC - 1e-6) continue
        const reference = measuredFraming(seconds)
        // A missing/off-screen body is a normal gap, not a failed preparation.
        if (options.samples && !reference) { encounteredFailure = true; continue }
        try {
          const raw = await captureRaw(seconds)
          candidates.push({ seconds, reference, score: Math.log1p(raw.sharpness) - Math.abs(seconds - requestedTime) * 3 })
        } catch (error) { propagateCancellation(error); encounteredFailure = true; reason = 'frame-unavailable' }
      }
      candidates.sort((a, b) => b.score - a.score || Math.abs(a.seconds - requestedTime) - Math.abs(b.seconds - requestedTime))
      let fallback: typeof candidates[number] | null = null
      for (const candidate of candidates) {
        try {
          if (!needsPerson) {
            image = { ...(await captureRaw(candidate.seconds)).image, background: 'original', centered: false }
          } else if (segmenter) {
            const person = await capturePerson(candidate.seconds)
            image = await renderPerson(candidate.seconds, person.framing, person)
          } else {
            fallback ??= candidate
          }
          if (image) break
        } catch (error) {
          propagateCancellation(error)
          encounteredFailure = true
          reason = error instanceof PersonNotFoundError ? 'person-unavailable' : 'segmentation-unavailable'
          // A valid measured pose can still supply a centered original-video crop.
          // With no pose evidence, do not substitute an empty background image.
          if (candidate.reference) fallback ??= candidate
        }
      }
      if (!image && fallback && (fallback.reference || modelUnavailable)) {
        try { image = await renderPerson(fallback.seconds, fallback.reference); usedFallback = true }
        catch (error) { propagateCancellation(error); reason = 'frame-unavailable' }
      }
      if (image && encodedChars + image.dataUrl.length > THUMBNAIL_LIMITS.metadataChars) { image = null; reason = 'image-budget' }
      if (image) {
        const id = frameId(image.sourceTimeSec)
        result.frames[id] = image
        result.cues.push({ ...cue, thumbnailTimeSec: image.sourceTimeSec, frameIds: [id] })
        encodedChars += image.dataUrl.length
        if (usedFallback) {
          report.fallbackCueCount++
          report.issues.push({ cueId: cue.id, sourceTimeSec: image.sourceTimeSec, outcome: 'fallback', reason: 'segmentation-unavailable' })
        } else if (encounteredFailure) {
          report.recoveredCueCount++
          report.issues.push({ cueId: cue.id, sourceTimeSec: image.sourceTimeSec, outcome: 'recovered', reason: 'neighbor-frame' })
        }
      } else {
        report.skippedCueCount++
        report.issues.push({ cueId: cue.id, sourceTimeSec: requestedTime, outcome: 'skipped', reason })
      }
      onProgress?.(index + 1, pendingCues.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    validateMotionThumbnails(result)
    if (!options.segmenterFactory && report.skippedCueCount === 0 && report.fallbackCueCount === 0) {
      preparedTracks.set(cacheKey, result)
      if (preparedTracks.size > 3) preparedTracks.delete(preparedTracks.keys().next().value!)
    }
    return result
  } finally { segmenter?.close(); releaseVideo(video) }
}
