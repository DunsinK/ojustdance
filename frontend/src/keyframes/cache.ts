import type { MotionThumbnails } from './contracts.js'
import { validateMotionThumbnails } from './validation.js'

const memory = new Map<string, MotionThumbnails>()
async function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try { request = indexedDB.open('ojustdance-motion-thumbnails', 1) } catch { resolve(null); return }
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('tracks', { keyPath: 'key' })
      store.createIndex('savedAt', 'savedAt')
    }
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
    request.onsuccess = () => resolve(request.result)
  })
}
export async function readThumbnailCache(key: string): Promise<MotionThumbnails | null> {
  if (memory.has(key)) return memory.get(key)!
  const db = await database()
  if (!db) return null
  try { return await new Promise((resolve) => {
    const request = db.transaction('tracks').objectStore('tracks').get(key)
    request.onsuccess = () => {
      db.close()
      try { if (request.result) { validateMotionThumbnails(request.result.track); resolve(request.result.track); return } } catch { /* Regenerate incompatible old cache records. */ }
      resolve(null)
    }
    request.onerror = () => { db.close(); resolve(null) }
  }) } catch { db.close(); return null }
}
export async function writeThumbnailCache(key: string, track: MotionThumbnails): Promise<void> {
  validateMotionThumbnails(track)
  memory.set(key, track)
  if (memory.size > 5) memory.delete(memory.keys().next().value!)
  const db = await database()
  if (!db) return
  try { await new Promise<void>((resolve) => {
    const transaction = db.transaction('tracks', 'readwrite')
    const store = transaction.objectStore('tracks')
    store.put({ key, savedAt: Date.now(), track })
    const request = store.index('savedAt').openCursor(null, 'prev')
    let count = 0
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) { if (++count > 8) cursor.delete(); cursor.continue() }
    }
    transaction.oncomplete = transaction.onerror = transaction.onabort = () => { db.close(); resolve() }
  }) } catch { db.close() /* Memory fallback already retains the prepared result. */ }
}
