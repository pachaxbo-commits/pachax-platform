import type { PrintJob, PrintJobStorage } from '../../types/printing'

const DB_NAME = 'PachaxFlow_Printing'
const DB_VERSION = 1
const STORE_JOBS = 'print_jobs'

export class IndexedDbPrintJobStorage implements PrintJobStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null
  public isDegradedMode = false

  private getDB(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise

    if (typeof window === 'undefined' || !window.indexedDB) {
      this.isDegradedMode = true
      return Promise.resolve(null)
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION)

        req.onupgradeneeded = (evt: any) => {
          const db = evt.target.result as IDBDatabase
          if (!db.objectStoreNames.contains(STORE_JOBS)) {
            const store = db.createObjectStore(STORE_JOBS, { keyPath: 'id' })
            store.createIndex('terminalId', 'terminalId', { unique: false })
            store.createIndex('status', 'status', { unique: false })
            store.createIndex('idempotencyKey', 'idempotencyKey', { unique: false })
          }
        }

        req.onsuccess = (evt: any) => {
          resolve(evt.target.result as IDBDatabase)
        }

        req.onerror = () => {
          this.isDegradedMode = true
          resolve(null)
        }
      } catch {
        this.isDegradedMode = true
        resolve(null)
      }
    })

    return this.dbPromise
  }

  // Memory fallback map for degraded mode if IndexedDB fails
  private memoryStore = new Map<string, PrintJob>()

  async save(job: PrintJob): Promise<void> {
    const db = await this.getDB()
    if (!db) {
      this.memoryStore.set(job.id, { ...job })
      return
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOBS, 'readwrite')
      const store = tx.objectStore(STORE_JOBS)
      const req = store.put(job)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async get(jobId: string): Promise<PrintJob | null> {
    const db = await this.getDB()
    if (!db) {
      return this.memoryStore.get(jobId) || null
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOBS, 'readonly')
      const store = tx.objectStore(STORE_JOBS)
      const req = store.get(jobId)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  }

  async listRecoverable(terminalId: string): Promise<PrintJob[]> {
    const db = await this.getDB()
    if (!db) {
      return Array.from(this.memoryStore.values()).filter(
        (j) => j.terminalId === terminalId && ['queued', 'connecting', 'transmitting', 'retrying', 'unknown'].includes(j.status)
      )
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOBS, 'readonly')
      const store = tx.objectStore(STORE_JOBS)
      const req = store.getAll()
      req.onsuccess = () => {
        const all: PrintJob[] = req.result || []
        const recoverable = all.filter(
          (j) => j.terminalId === terminalId && ['queued', 'connecting', 'transmitting', 'retrying', 'unknown'].includes(j.status)
        )
        resolve(recoverable)
      }
      req.onerror = () => reject(req.error)
    })
  }

  async update(jobId: string, changes: Partial<PrintJob>): Promise<void> {
    const existing = await this.get(jobId)
    if (!existing) return
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() }
    await this.save(updated)
  }

  async remove(jobId: string): Promise<void> {
    const db = await this.getDB()
    if (!db) {
      this.memoryStore.delete(jobId)
      return
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOBS, 'readwrite')
      const store = tx.objectStore(STORE_JOBS)
      const req = store.delete(jobId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async purgeCompletedOlderThan(cutoffIso: string): Promise<number> {
    const db = await this.getDB()
    if (!db) {
      let count = 0
      for (const [id, job] of this.memoryStore.entries()) {
        if (['transmitted', 'confirmed', 'resolved', 'failed', 'cancelled'].includes(job.status)) {
          if (job.queuedAtIso < cutoffIso) {
            this.memoryStore.delete(id)
            count++
          }
        }
      }
      return count
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JOBS, 'readwrite')
      const store = tx.objectStore(STORE_JOBS)
      const req = store.getAll()
      req.onsuccess = () => {
        const all: PrintJob[] = req.result || []
        let purgedCount = 0
        all.forEach((job) => {
          if (['transmitted', 'confirmed', 'resolved', 'failed', 'cancelled'].includes(job.status)) {
            if (job.queuedAtIso < cutoffIso) {
              store.delete(job.id)
              purgedCount++
            }
          }
        })
        resolve(purgedCount)
      }
      req.onerror = () => reject(req.error)
    })
  }
}

/** Stub interface implementation for Native Android SQLite */
export class NativeSqlitePrintJobStorage implements PrintJobStorage {
  async save(): Promise<void> {
    throw new Error('[NativeSqlitePrintJobStorage] Proximo lanzamiento en Etapa 4B.2')
  }
  async get(): Promise<PrintJob | null> {
    throw new Error('[NativeSqlitePrintJobStorage] Proximo lanzamiento en Etapa 4B.2')
  }
  async listRecoverable(): Promise<PrintJob[]> {
    throw new Error('[NativeSqlitePrintJobStorage] Proximo lanzamiento en Etapa 4B.2')
  }
  async update(): Promise<void> {
    throw new Error('[NativeSqlitePrintJobStorage] Proximo lanzamiento en Etapa 4B.2')
  }
  async remove(): Promise<void> {
    throw new Error('[NativeSqlitePrintJobStorage] Proximo lanzamiento en Etapa 4B.2')
  }
  async purgeCompletedOlderThan(): Promise<number> {
    throw new Error('[NativeSqlitePrintJobStorage] Proximo lanzamiento en Etapa 4B.2')
  }
}
