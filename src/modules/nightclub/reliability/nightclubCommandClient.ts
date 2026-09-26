import type { NightclubCommandType, NightclubOutboxOperation, NightclubOutboxStore } from './nightclubOutbox.ts'
import { createNightclubOperation } from './nightclubOutbox.ts'

export interface NightclubCommandIdentity { tenantId: string; branchId: string; actorUid: string }
export type NightclubGatewayCall = (payload: Record<string, unknown>) => Promise<unknown>

/** Application boundary: the caller receives acceptance only after the command is durable locally. */
export class NightclubCommandClient {
  private readonly store: NightclubOutboxStore
  private readonly identity: NightclubCommandIdentity
  private readonly createId: () => string

  constructor(store: NightclubOutboxStore, identity: NightclubCommandIdentity, createId = () => crypto.randomUUID()) {
    this.store = store
    this.identity = identity
    this.createId = createId
  }

  async submit<T>(type: NightclubCommandType, payload: T): Promise<NightclubOutboxOperation<T>> {
    const operation = createNightclubOperation({ operationId: this.createId(), ...this.identity, type, payload })
    await this.store.put(operation)
    return operation
  }
}

export function createNightclubGatewayTransport(call: NightclubGatewayCall) {
  return {
    async send(operation: NightclubOutboxOperation) {
      try {
        await call({ action: 'nightclubCommand', tenantId: operation.tenantId, branchId: operation.branchId, operationId: operation.operationId, commandType: operation.type, payload: operation.payload })
        return { status: 'confirmed' as const }
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
        if (/(aborted|already-exists|failed-precondition|not-found|permission-denied)/.test(code)) return { status: 'conflict' as const, message: error instanceof Error ? error.message : 'Conflicto operacional' }
        throw error
      }
    },
  }
}
