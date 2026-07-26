/**
 * IndexedDB isolado para fotos de OS pendentes de envio.
 * Blobs NUNCA vão para localStorage.
 */

export const OFFLINE_PHOTOS_DB_NAME = 'boxgestor_offline_photos_v1'
export const OFFLINE_PHOTOS_DB_VERSION = 1
export const STORE_PENDING_PHOTOS = 'pending_photos'
export const STORE_PHOTO_BLOBS = 'photo_blobs'

export type OfflinePhotoStatus = 'pending' | 'failed' | 'cancelled'

export interface OfflinePendingPhotoMeta {
  local_photo_id: string
  office_id: string
  local_os_id: string
  service_order_id?: string | null
  os_numero?: number | null
  checklist_item_id?: string | null
  photo_context: 'os' | 'checklist'
  photo_type: string
  caption: string | null
  include_in_pdf: boolean
  file_name: string
  content_type: string
  size_bytes: number
  blob_key: string
  status: OfflinePhotoStatus
  tentativas: number
  erro: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
  created_by_name?: string | null
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste aparelho.'))
      return
    }

    const req = indexedDB.open(OFFLINE_PHOTOS_DB_NAME, OFFLINE_PHOTOS_DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PENDING_PHOTOS)) {
        const store = db.createObjectStore(STORE_PENDING_PHOTOS, {
          keyPath: 'local_photo_id',
        })
        store.createIndex('by_office_os', ['office_id', 'local_os_id'], { unique: false })
        store.createIndex('by_status', 'status', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_BLOBS)) {
        db.createObjectStore(STORE_PHOTO_BLOBS, { keyPath: 'blob_key' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir IndexedDB de fotos.'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Falha na transação IndexedDB.'))
    tx.onabort = () => reject(tx.error ?? new Error('Transação IndexedDB abortada.'))
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Falha na operação IndexedDB.'))
  })
}

export async function putPendingPhotoMeta(
  meta: OfflinePendingPhotoMeta
): Promise<void> {
  const db = await abrirDb()
  try {
    const tx = db.transaction(STORE_PENDING_PHOTOS, 'readwrite')
    tx.objectStore(STORE_PENDING_PHOTOS).put(meta)
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function putPhotoBlob(blobKey: string, blob: Blob): Promise<void> {
  const db = await abrirDb()
  try {
    const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite')
    tx.objectStore(STORE_PHOTO_BLOBS).put({ blob_key: blobKey, blob })
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function getPendingPhotoMeta(
  localPhotoId: string
): Promise<OfflinePendingPhotoMeta | null> {
  const db = await abrirDb()
  try {
    const tx = db.transaction(STORE_PENDING_PHOTOS, 'readonly')
    const row = await reqToPromise(
      tx.objectStore(STORE_PENDING_PHOTOS).get(localPhotoId)
    )
    await txDone(tx)
    return (row as OfflinePendingPhotoMeta | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function getPhotoBlob(blobKey: string): Promise<Blob | null> {
  const db = await abrirDb()
  try {
    const tx = db.transaction(STORE_PHOTO_BLOBS, 'readonly')
    const row = await reqToPromise(tx.objectStore(STORE_PHOTO_BLOBS).get(blobKey))
    await txDone(tx)
    const blob = (row as { blob_key: string; blob: Blob } | undefined)?.blob
    return blob instanceof Blob ? blob : null
  } finally {
    db.close()
  }
}

export async function listPendingPhotosByOs(
  officeId: string,
  localOsId: string
): Promise<OfflinePendingPhotoMeta[]> {
  const office = officeId.trim()
  const osId = localOsId.trim()
  if (!office || !osId) return []

  const db = await abrirDb()
  try {
    const tx = db.transaction(STORE_PENDING_PHOTOS, 'readonly')
    const store = tx.objectStore(STORE_PENDING_PHOTOS)
    // getAll no store + filtro: mais confiável que compound index em alguns mobile browsers
    const rows = await reqToPromise(store.getAll())
    await txDone(tx)
    const lista = (rows as OfflinePendingPhotoMeta[]) ?? []
    return lista
      .filter(
        (m) =>
          m.office_id?.trim() === office &&
          m.local_os_id?.trim() === osId &&
          (m.status === 'pending' || m.status === 'failed')
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  } finally {
    db.close()
  }
}

/** Remove metadado + blob (cancelamento local; não toca Storage). */
export async function deletePendingPhotoCompleto(
  localPhotoId: string
): Promise<boolean> {
  const id = localPhotoId.trim()
  if (!id) return false

  const db = await abrirDb()
  try {
    const txRead = db.transaction(STORE_PENDING_PHOTOS, 'readonly')
    const meta = (await reqToPromise(
      txRead.objectStore(STORE_PENDING_PHOTOS).get(id)
    )) as OfflinePendingPhotoMeta | undefined
    await txDone(txRead)

    if (!meta) return false

    const tx = db.transaction(
      [STORE_PENDING_PHOTOS, STORE_PHOTO_BLOBS],
      'readwrite'
    )
    tx.objectStore(STORE_PENDING_PHOTOS).delete(id)
    if (meta.blob_key) {
      tx.objectStore(STORE_PHOTO_BLOBS).delete(meta.blob_key)
    }
    await txDone(tx)
    return true
  } finally {
    db.close()
  }
}
