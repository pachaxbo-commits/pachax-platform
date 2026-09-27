import type { NightclubAccount, NightclubCashMovement, NightclubCustomer, NightclubInventoryItem, NightclubInventoryMovement, NightclubPaymentDraft, NightclubProduct, NightclubReservation, NightclubRound, NightclubRoundDraft, NightclubServiceTarget, NightclubShift, NightclubStaff, NightclubTable, NightclubZone } from '../domain/nightclubAccounts'
export interface NightclubFloorSnapshot { zones: NightclubZone[]; tables: NightclubTable[]; reservations: NightclubReservation[] }
export interface NightclubCatalogSnapshot { products: NightclubProduct[] }
export interface NightclubInventorySnapshot { inventory: NightclubInventoryItem[]; recentMovements: NightclubInventoryMovement[] }
export type Unsubscribe = () => void
/** Query-oriented production boundary. No listener downloads a whole club dataset. */
export interface NightclubRepository {
  subscribeFloor(listener: (value: NightclubFloorSnapshot) => void): Unsubscribe
  subscribeOpenAccounts(listener: (value: NightclubAccount[]) => void): Unsubscribe
  subscribeActiveBarRounds(listener: (value: NightclubRound[]) => void): Unsubscribe
  subscribeActiveShift(listener: (value: NightclubShift | null) => void): Unsubscribe
  subscribeCatalog(listener: (value: NightclubCatalogSnapshot) => void): Unsubscribe
  subscribeInventory(listener: (value: NightclubInventorySnapshot) => void): Unsubscribe
  getCustomers(query: string, limit: number): Promise<NightclubCustomer[]>
  getStaff(): Promise<NightclubStaff[]>
  getCashMovements(shiftId: string): Promise<NightclubCashMovement[]>
  openAccount(input: { operationId: string; target: NightclubServiceTarget }): Promise<{ accountId: string }>
  addRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[] }): Promise<{ roundId: string }>
  updateRoundStatus(input: { operationId: string; accountId: string; roundId: string; status: NightclubRound['status'] }): Promise<void>
  cancelRound(input: { operationId: string; accountId: string; roundId: string; reason: string }): Promise<void>
  requestBill(input: { operationId: string; accountId: string }): Promise<void>
  reopenBill(input: { operationId: string; accountId: string; reason: string }): Promise<void>
  recordPayment(input: { operationId: string; accountId: string; payment: NightclubPaymentDraft }): Promise<void>
  recordInventoryMovement(input: { operationId: string; inventoryId: string; quantity: number; type: NightclubInventoryMovement['type']; reason: string }): Promise<void>
  openShift(input: { operationId: string; openingFloat: number }): Promise<{ shiftId: string }>
  closeShift(input: { operationId: string; shiftId: string; countedCash: number }): Promise<void>
  saveProduct(input: { operationId: string; product: NightclubProduct }): Promise<void>
  saveCustomer(input: { operationId: string; customer: NightclubCustomer }): Promise<void>
}
export const nightclubTenantPaths = (tenantId: string) => ({ root: `tenants/${tenantId}`, zones: `tenants/${tenantId}/nightclubZones`, tables: `tenants/${tenantId}/nightclubTables`, reservations: `tenants/${tenantId}/nightclubReservations`, accounts: `tenants/${tenantId}/nightclubAccounts`, rounds: `tenants/${tenantId}/nightclubRounds`, payments: `tenants/${tenantId}/nightclubPayments`, products: `tenants/${tenantId}/nightclubProducts`, inventory: `tenants/${tenantId}/nightclubInventory`, inventoryMovements: `tenants/${tenantId}/nightclubInventoryMovements`, customers: `tenants/${tenantId}/nightclubCustomers`, staff: `tenants/${tenantId}/members`, shifts: `tenants/${tenantId}/nightclubShifts`, cashMovements: `tenants/${tenantId}/nightclubCashMovements`, operations: `tenants/${tenantId}/nightclubOperations`, audit: `tenants/${tenantId}/nightclubAudit` })
