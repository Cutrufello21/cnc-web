/**
 * Offline delivery queue backed by IndexedDB.
 * Stores pending deliveries and photos when the device is offline,
 * then processes the queue when connectivity returns.
 */

const DB_NAME = 'cnc-offline'
const DB_VERSION = 1
const DELIVERY_STORE = 'deliveries'
const PHOTO_STORE = 'photos'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(DELIVERY_STORE)) {
        db.createObjectStore(DELIVERY_STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txStore(db, store, mode = 'readonly') {
  const tx = db.transaction(store, mode)
  return tx.objectStore(store)
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Returns true if the browser appears to be online */
export function isOnline() {
  return navigator.onLine
}

/**
 * Queue a delivery confirmation for later sync.
 * @param {{ orderId: string, deliveryDate: string, driverName: string, photoUrls: string[], barcode?: string }} data
 */
export async function queueDelivery(data) {
  const db = await openDB()
  const store = txStore(db, DELIVERY_STORE, 'readwrite')
  await reqToPromise(
    store.add({
      ...data,
      queuedAt: new Date().toISOString(),
    })
  )
  db.close()
  // Request background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    try { await reg.sync.register('delivery-sync') } catch { /* ignore */ }
  }
}

/**
 * Queue a photo blob for later upload.
 * @param {File|Blob} file
 * @param {string} deliveryDate
 * @param {string} orderId
 */
export async function queuePhoto(file, deliveryDate, orderId) {
  const db = await openDB()
  const store = txStore(db, PHOTO_STORE, 'readwrite')
  // Store as ArrayBuffer so it survives structured-clone
  const buffer = await file.arrayBuffer()
  await reqToPromise(
    store.add({
      buffer,
      fileName: file.name,
      type: file.type,
      deliveryDate,
      orderId,
      queuedAt: new Date().toISOString(),
    })
  )
  db.close()
}

/** Get all queued deliveries */
export async function getQueue() {
  const db = await openDB()
  const store = txStore(db, DELIVERY_STORE)
  const items = await reqToPromise(store.getAll())
  db.close()
  return items
}

/** Get all queued photos */
export async function getPhotoQueue() {
  const db = await openDB()
  const store = txStore(db, PHOTO_STORE)
  const items = await reqToPromise(store.getAll())
  db.close()
  return items
}

/**
 * Try to upload all queued photos and confirm queued deliveries.
 * Removes items from IndexedDB on success.
 * @returns {{ uploaded: number, delivered: number, errors: number }}
 */
export async function processQueue() {
  if (!isOnline()) return { uploaded: 0, delivered: 0, errors: 0 }

  const stats = { uploaded: 0, delivered: 0, errors: 0 }

  // 1. Upload queued photos first
  const db = await openDB()
  const photoStore = txStore(db, PHOTO_STORE)
  const photos = await reqToPromise(photoStore.getAll())
  db.close()

  for (const photo of photos) {
    try {
      const blob = new Blob([photo.buffer], { type: photo.type })
      const formData = new FormData()
      formData.append('file', blob, photo.fileName)
      formData.append('deliveryDate', photo.deliveryDate)
      formData.append('orderId', photo.orderId)
      const res = await fetch('/api/upload-photo', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      // Remove from store on success
      const db2 = await openDB()
      const s = txStore(db2, PHOTO_STORE, 'readwrite')
      await reqToPromise(s.delete(photo.id))
      db2.close()
      stats.uploaded++
    } catch {
      stats.errors++
    }
  }

  // 2. Confirm queued deliveries
  const db3 = await openDB()
  const delStore = txStore(db3, DELIVERY_STORE)
  const deliveries = await reqToPromise(delStore.getAll())
  db3.close()

  for (const d of deliveries) {
    try {
      const res = await fetch('/api/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: d.orderId,
          deliveryDate: d.deliveryDate,
          driverName: d.driverName,
          photoUrls: d.photoUrls || [],
          barcode: d.barcode || undefined,
        }),
      })
      if (!res.ok) throw new Error('Delivery confirmation failed')
      const db4 = await openDB()
      const s = txStore(db4, DELIVERY_STORE, 'readwrite')
      await reqToPromise(s.delete(d.id))
      db4.close()
      stats.delivered++
    } catch {
      stats.errors++
    }
  }

  return stats
}
