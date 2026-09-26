import type {
  NightclubAccount,
  NightclubCustomer,
  NightclubInventoryItem,
  NightclubInventoryMovement,
  NightclubPaymentDraft,
  NightclubProduct,
  NightclubRound,
  NightclubRoundDraft,
  NightclubServiceTarget,
  NightclubTable,
  NightclubZone,
} from '../domain/nightclubAccounts'

export interface NightclubSnapshot {
  zones: NightclubZone[]
  tables: NightclubTable[]
  accounts: NightclubAccount[]
  products: NightclubProduct[]
  inventory: NightclubInventoryItem[]
  customers: NightclubCustomer[]
}

export interface NightclubRepository {
  subscribe(listener: (snapshot: NightclubSnapshot) => void): () => void
  openAccount(input: { operationId: string; target: NightclubServiceTarget }): Promise<{ accountId: string }>
  addRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[] }): Promise<{ roundId: string }>
  updateRoundStatus(input: { operationId: string; accountId: string; roundId: string; status: NightclubRound['status'] }): Promise<void>
  cancelRound(input: { operationId: string; accountId: string; roundId: string; reason: string }): Promise<void>
  requestBill(input: { operationId: string; accountId: string }): Promise<void>
  reopenBill(input: { operationId: string; accountId: string; reason: string }): Promise<void>
  recordPayment(input: { operationId: string; accountId: string; payment: NightclubPaymentDraft }): Promise<void>
  recordInventoryMovement(input: { operationId: string; inventoryId: string; quantity: number; type: NightclubInventoryMovement['type']; reason: string }): Promise<void>
  saveProduct(input: { operationId: string; product: NightclubProduct }): Promise<void>
  saveCustomer(input: { operationId: string; customer: NightclubCustomer }): Promise<void>
}

/**
 * Colecciones productivas previstas, siempre debajo del tenant activo.
 * Los comandos sensibles se ejecutan mediante Functions; el cliente no escribe
 * cuentas, rondas, pagos, inventario ni auditoría directamente.
 */
export const nightclubTenantPaths = (tenantId: string) => ({
  root: `tenants/${tenantId}`,
  zones: `tenants/${tenantId}/nightclubZones`,
  tables: `tenants/${tenantId}/nightclubTables`,
  accounts: `tenants/${tenantId}/nightclubAccounts`,
  products: `tenants/${tenantId}/nightclubProducts`,
  inventory: `tenants/${tenantId}/nightclubInventory`,
  inventoryMovements: `tenants/${tenantId}/nightclubInventoryMovements`,
  customers: `tenants/${tenantId}/nightclubCustomers`,
  shifts: `tenants/${tenantId}/nightclubShifts`,
  audit: `tenants/${tenantId}/nightclubAudit`,
})
