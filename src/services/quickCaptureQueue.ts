/**
 * Offline queue for notes dictated from the car.
 *
 * Rural routes lose signal constantly, so a recording is written to the queue
 * first and uploaded whenever the connection comes back. Nothing is ever
 * dropped because the upload failed.
 *
 * Audio lives in IndexedDB (localStorage cannot hold blobs and would blow its
 * quota after two recordings).
 */

const DB_NAME = 'casmara-quick-capture'
const DB_VERSION = 1
const STORE = 'pending'

export interface PendingCapture {
  id: string
  blob: Blob
  mimeType: string
  lat: number | null
  lng: number | null
  visitDate: string
  createdAt: number
  attempts: number
  lastError?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB no disponible'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = run(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Error de almacenamiento'))
    tx.oncomplete = () => db.close()
  })
}

export async function enqueueCapture(entry: PendingCapture): Promise<void> {
  await withStore('readwrite', store => store.put(entry))
}

export async function listPendingCaptures(): Promise<PendingCapture[]> {
  const all = await withStore<PendingCapture[]>('readonly', store => store.getAll())
  return (all || []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeCapture(id: string): Promise<void> {
  await withStore('readwrite', store => store.delete(id))
}

export async function updateCapture(entry: PendingCapture): Promise<void> {
  await withStore('readwrite', store => store.put(entry))
}

export async function countPendingCaptures(): Promise<number> {
  try {
    const all = await listPendingCaptures()
    return all.length
  } catch {
    return 0
  }
}

/** Give up on a recording after this many failed uploads. */
export const MAX_UPLOAD_ATTEMPTS = 8

export function shouldRetry(entry: PendingCapture): boolean {
  return entry.attempts < MAX_UPLOAD_ATTEMPTS
}
