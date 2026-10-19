import type { NightclubAccount, NightclubCashMovement, NightclubCashbox, NightclubCustomer, NightclubInventoryBalance, NightclubInventoryItem, NightclubInventoryLot, NightclubInventoryMovement, NightclubOperatorContext, NightclubPaymentDraft, NightclubProduct, NightclubReservation, NightclubRound, NightclubRoundDraft, NightclubServiceTarget, NightclubShift, NightclubStaff, NightclubTable, NightclubTransfer, NightclubZone } from '../domain/nightclubAccounts'
export interface NightclubFloorSnapshot { zones: NightclubZone[]; tables: NightclubTable[]; reservations: NightclubReservation[] }
export interface NightclubCatalogSnapshot { products: NightclubProduct[] }
export interface NightclubInventorySnapshot { inventory: NightclubInventoryItem[]; recentMovements: NightclubInventoryMovement[] }
export interface NightclubLocationInventorySnapshot { balances: NightclubInventoryBalance[]; lots: NightclubInventoryLot[] }
export type Unsubscribe = () => void
/** Query-oriented production boundary. No listener downloads a whole club dataset. */
export interface NightclubRepository {
  subscribeFloor(listener: (value: NightclubFloorSnapshot) => void): Unsubscribe
  subscribeOpenAccounts(listener: (value: NightclubAccount[]) => void): Unsubscribe
  subscribeActiveBarRounds(listener: (value: NightclubRound[]) => void): Unsubscribe
  subscribeActiveShift(listener: (value: NightclubShift | null) => void): Unsubscribe
  subscribeCatalog(listener: (value: NightclubCatalogSnapshot) => void): Unsubscribe
  subscribeInventory(listener: (value: NightclubInventorySnapshot) => void): Unsubscribe
  subscribeOperatorContext(listener: (value: NightclubOperatorContext | null) => void): Unsubscribe
  subscribeCashboxes(listener: (value: NightclubCashbox[]) => void): Unsubscribe
  subscribeLocationInventory(locationId: string, listener: (value: NightclubLocationInventorySnapshot) => void): Unsubscribe
  getCustomers(query: string, limit: number): Promise<NightclubCustomer[]>
  getStaff(): Promise<NightclubStaff[]>
  getCashMovements(shiftId: string): Promise<NightclubCashMovement[]>
  openAccount(input: { operationId: string; target: NightclubServiceTarget }): Promise<{ accountId: string }>
  settleRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[]; payment: NightclubPaymentDraft }): Promise<{ roundId: string; paymentId: string; total: number }>
  advanceRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void>
  deliverRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void>
  refundRound(input: { operationId: string; accountId: string; roundId: string; reason: string; returnToStock?: boolean; items?: Array<{ itemId: string; quantity: number; returnToStock: boolean }> }): Promise<void>
  finishOccupancy(input: { operationId: string; accountId: string }): Promise<void>
  recordInventoryMovement(input: { operationId: string; inventoryId: string; quantity: number; type: NightclubInventoryMovement['type']; reason: string }): Promise<void>
  openShift(input: { operationId: string; openingFloat: number }): Promise<{ shiftId: string }>
  closeShift(input: { operationId: string; shiftId: string; countedCash: number }): Promise<void>
  saveProduct(input: { operationId: string; product: NightclubProduct }): Promise<void>
  saveCustomer(input: { operationId: string; customer: NightclubCustomer }): Promise<void>
  selectCashbox(input: { operationId: string; cashboxId: string; confirmPending?: boolean }): Promise<{ locationId: string; activeShiftId?: string }>
  openCashboxShift(input: { operationId: string; cashboxId: string; openingFloat: number }): Promise<{ shiftId: string }>
  closeCashboxShift(input: { operationId: string; cashboxId: string; countedCash: number }): Promise<void>
  requestTransfer(input: { operationId: string; transfer: Omit<NightclubTransfer, 'id' | 'status' | 'createdAt'> }): Promise<{ transferId: string }>
  dispatchTransfer(input: { operationId: string; transferId: string }): Promise<void>
  receiveTransfer(input: { operationId: string; transferId: string }): Promise<void>
}
export const nightclubTenantPaths = (tenantId: string) => ({ root: `tenants/${tenantId}`, zones: `tenants/${tenantId}/nightclubZones`, tables: `tenants/${tenantId}/nightclubTables`, reservations: `tenants/${tenantId}/nightclubReservations`, accounts: `tenants/${tenantId}/nightclubAccounts`, rounds: `tenants/${tenantId}/nightclubRounds`, payments: `tenants/${tenantId}/nightclubPayments`, products: `tenants/${tenantId}/nightclubProducts`, inventory: `tenants/${tenantId}/nightclubInventory`, inventoryBalances: `tenants/${tenantId}/nightclubInventoryBalances`, inventoryLots: `tenants/${tenantId}/nightclubInventoryLots`, openBottles: `tenants/${tenantId}/nightclubOpenBottles`, inventoryMovements: `tenants/${tenantId}/nightclubInventoryMovements`, locations: `tenants/${tenantId}/nightclubLocations`, cashboxes: `tenants/${tenantId}/nightclubCashboxes`, operatorContexts: `tenants/${tenantId}/nightclubOperatorContexts`, transfers: `tenants/${tenantId}/nightclubTransfers`, customers: `tenants/${tenantId}/nightclubCustomers`, staff: `tenants/${tenantId}/members`, shifts: `tenants/${tenantId}/nightclubShifts`, cashMovements: `tenants/${tenantId}/nightclubCashMovements`, operations: `tenants/${tenantId}/nightclubOperations`, audit: `tenants/${tenantId}/nightclubAudit` })
