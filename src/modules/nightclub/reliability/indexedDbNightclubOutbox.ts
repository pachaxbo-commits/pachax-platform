import type { NightclubOperationStatus, NightclubOutboxOperation, NightclubOutboxStore } from './nightclubOutbox'
const result = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error) })
export class IndexedDbNightclubOutboxStore implements NightclubOutboxStore {
  private database?: Promise<IDBDatabase>
  private readonly databaseName: string
  constructor(databaseName = 'pachax-nightclub-operations-v1') { this.databaseName = databaseName }
  private open() { return this.database ||= new Promise((resolve, reject) => { const call = indexedDB.open(this.databaseName, 1); call.onupgradeneeded = () => { const store = call.result.createObjectStore('outbox', { keyPath: 'operationId' }); store.createIndex('status', 'status'); store.createIndex('createdAt', 'createdAt') }; call.onsuccess = () => resolve(call.result); call.onerror = () => reject(call.error) }) }
  private async store(mode: IDBTransactionMode) { return (await this.open()).transaction('outbox', mode).objectStore('outbox') }
  async put(row: NightclubOutboxOperation) { await result((await this.store('readwrite')).put(row)) }
  async get(id: string) { return (await result((await this.store('readonly')).get(id)) as NightclubOutboxOperation | undefined) || null }
  async list(statuses: NightclubOperationStatus[]) { const rows = await result((await this.store('readonly')).getAll()) as NightclubOutboxOperation[]; return rows.filter(row => statuses.includes(row.status)).sort((a,b) => a.createdAt.localeCompare(b.createdAt)) }
  async patch(id: string, patch: Partial<NightclubOutboxOperation>) { const current = await this.get(id); if (!current) throw new Error('Operación local no encontrada.'); await this.put({ ...current, ...patch }) }
}
