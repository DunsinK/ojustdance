/** Pixel-space geometry used only for framing video thumbnails, never skeleton reconstruction. */
export interface Point2D { x: number; y: number }
export interface PersonMask { width: number; height: number; values: Float32Array }
export interface PersonFraming {
  center: Point2D
  centerMethod: 'hip-midpoint' | 'torso-average' | 'mask-centroid'
  bounds: { left: number; top: number; right: number; bottom: number }
}
export interface BodyAnchors {
  hips?: [Point2D, Point2D]
  torso: Point2D[]
}
export interface FramingTransform { scale: number; offsetX: number; offsetY: number }

function validPoint(point: Point2D): boolean { return Number.isFinite(point.x) && Number.isFinite(point.y) }
function checkMask(mask: PersonMask): void {
  if (!Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1 || mask.width > 2048 || mask.height > 2048 || mask.values.length !== mask.width * mask.height) throw new Error('Invalid person mask dimensions')
}
function probability(value: number): number { return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0 }

/** Read foreground bounds; ignore isolated mask speckles rather than shrinking the dancer around noise. */
export function personFraming(mask: PersonMask, imageWidth: number, imageHeight: number, anchors: BodyAnchors): PersonFraming {
  checkMask(mask)
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) throw new Error('Invalid source image size')
  const { width, height, values } = mask
  const visited = new Uint8Array(values.length)
  const pending = new Int32Array(values.length)
  const components: { count: number; left: number; top: number; right: number; bottom: number; sumX: number; sumY: number }[] = []
  for (let seed = 0; seed < values.length; seed++) {
    if (visited[seed] || probability(values[seed]) < 0.5) continue
    let head = 0, tail = 1
    pending[0] = seed; visited[seed] = 1
    const component = { count: 0, left: width, top: height, right: 0, bottom: 0, sumX: 0, sumY: 0 }
    while (head < tail) {
      const index = pending[head++], x = index % width, y = Math.floor(index / width)
      component.count++; component.sumX += x + 0.5; component.sumY += y + 0.5
      component.left = Math.min(component.left, x); component.right = Math.max(component.right, x + 1)
      component.top = Math.min(component.top, y); component.bottom = Math.max(component.bottom, y + 1)
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor >= 0 && !visited[neighbor] && probability(values[neighbor]) >= 0.5) { visited[neighbor] = 1; pending[tail++] = neighbor }
      }
    }
    components.push(component)
  }
  components.sort((a, b) => b.count - a.count)
  if (!components.length || components[0].count < Math.max(4, values.length * 0.001)) throw new Error('No reliable person mask was found')
  // Retain substantial detached limbs too; discard tiny independent noise islands.
  const substantial = components.filter((component) => component.count >= Math.max(2, components[0].count * 0.015))
  const left = Math.min(...substantial.map((c) => c.left)), right = Math.max(...substantial.map((c) => c.right))
  const top = Math.min(...substantial.map((c) => c.top)), bottom = Math.max(...substantial.map((c) => c.bottom))
  const largest = components[0]
  let center = { x: largest.sumX / largest.count * imageWidth / width, y: largest.sumY / largest.count * imageHeight / height }
  let centerMethod: PersonFraming['centerMethod'] = 'mask-centroid'
  const torso = anchors.torso.filter(validPoint)
  if (anchors.hips?.every(validPoint)) {
    center = { x: (anchors.hips[0].x + anchors.hips[1].x) / 2, y: (anchors.hips[0].y + anchors.hips[1].y) / 2 }
    centerMethod = 'hip-midpoint'
  } else if (torso.length >= 2) {
    center = { x: torso.reduce((sum, point) => sum + point.x, 0) / torso.length, y: torso.reduce((sum, point) => sum + point.y, 0) / torso.length }
    centerMethod = 'torso-average'
  }
  const bounds = { left: left * imageWidth / width, top: top * imageHeight / height, right: right * imageWidth / width, bottom: bottom * imageHeight / height }
  // A core point outside the silhouette is not a useful framing anchor.
  if (center.x < bounds.left || center.x > bounds.right || center.y < bounds.top || center.y > bounds.bottom) {
    center = { x: largest.sumX / largest.count * imageWidth / width, y: largest.sumY / largest.count * imageHeight / height }
    centerMethod = 'mask-centroid'
  }
  return { center, centerMethod, bounds }
}

/** Same scale for both start/end images; each source core maps exactly to the output center. */
export function centeredTransforms(people: readonly PersonFraming[], width: number, height: number, padding = 8): FramingTransform[] {
  if (!people.length || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(padding) || width <= padding * 2 || height <= padding * 2 || padding < 0) throw new Error('Invalid centered thumbnail dimensions')
  let extentX = 1, extentY = 1
  for (const person of people) {
    const { center, bounds } = person
    if (!validPoint(center) || !Object.values(bounds).every(Number.isFinite) || bounds.right <= bounds.left || bounds.bottom <= bounds.top
      || center.x < bounds.left || center.x > bounds.right || center.y < bounds.top || center.y > bounds.bottom) throw new Error('Invalid person framing geometry')
    extentX = Math.max(extentX, person.center.x - person.bounds.left, person.bounds.right - person.center.x)
    extentY = Math.max(extentY, person.center.y - person.bounds.top, person.bounds.bottom - person.center.y)
  }
  const scale = Math.min((width / 2 - padding) / extentX, (height / 2 - padding) / extentY)
  return people.map((person) => ({ scale, offsetX: width / 2 - person.center.x * scale, offsetY: height / 2 - person.center.y * scale }))
}

/** Bilinear mask sampling preserves soft edges when the model and image sizes differ. */
export function maskAlphaAt(mask: PersonMask, x: number, y: number, imageWidth: number, imageHeight: number): number {
  const mx = Math.max(0, Math.min(mask.width - 1, (x + 0.5) / imageWidth * mask.width - 0.5))
  const my = Math.max(0, Math.min(mask.height - 1, (y + 0.5) / imageHeight * mask.height - 0.5))
  const x0 = Math.floor(mx), y0 = Math.floor(my), x1 = Math.min(mask.width - 1, x0 + 1), y1 = Math.min(mask.height - 1, y0 + 1)
  const fx = mx - x0, fy = my - y0
  const upper = probability(mask.values[y0 * mask.width + x0]) * (1 - fx) + probability(mask.values[y0 * mask.width + x1]) * fx
  const lower = probability(mask.values[y1 * mask.width + x0]) * (1 - fx) + probability(mask.values[y1 * mask.width + x1]) * fx
  const confidence = upper * (1 - fy) + lower * fy
  // Smooth confidence ramp: remove uncertain background without jagged binary edges.
  const t = Math.max(0, Math.min(1, (confidence - 0.2) / 0.6))
  return t * t * (3 - 2 * t)
}
/** Optional source transform samples the small mask onto pixels drawn from the original video. */
export function applyPersonAlpha(pixels: Uint8ClampedArray, width: number, height: number, mask: PersonMask,
  source?: { width: number; height: number; transform: FramingTransform }): void {
  checkMask(mask)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4) throw new Error('RGBA buffer does not match image dimensions')
  if (source && (!Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0
    || !Object.values(source.transform).every(Number.isFinite) || source.transform.scale <= 0)) throw new Error('Invalid source-to-thumbnail transform')
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = (y * width + x) * 4 + 3
    const sourceX = source ? (x + 0.5 - source.transform.offsetX) / source.transform.scale - 0.5 : x
    const sourceY = source ? (y + 0.5 - source.transform.offsetY) / source.transform.scale - 0.5 : y
    pixels[alpha] = Math.round(pixels[alpha] * maskAlphaAt(mask, sourceX, sourceY, source?.width ?? width, source?.height ?? height))
  }
}
