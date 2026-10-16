import type {
  NightclubAccount,
  NightclubCashMovement,
  NightclubCustomer,
  NightclubInventoryItem,
  NightclubInventoryMovement,
  NightclubPaymentDraft,
  NightclubProduct,
  NightclubReservation,
  NightclubRound,
  NightclubRoundDraft,
  NightclubServiceTarget,
  NightclubShift,
  NightclubStaff,
  NightclubTable,
  NightclubZone,
} from '../domain/nightclubAccounts.ts'
import type { ReservationDraft } from '../domain/nightclubFloor.ts'
import type {
  NightclubConsumptionDraft,
  NightclubLoungeSale,
  NightclubLoungeSaleDraft,
  NightclubPromoter,
  NightclubPromoterConsumption,
  NightclubPromoterEvent,
  NightclubSaleDraft,
  NightclubTicketSale,
} from '../domain/nightclubPromoters.ts'


export interface NightclubFloorSnapshot {
  zones: NightclubZone[]
  tables: NightclubTable[]
  reservations: NightclubReservation[]
}

export interface NightclubCatalogSnapshot {
  products: NightclubProduct[]
}

export interface NightclubInventorySnapshot {
  inventory: NightclubInventoryItem[]
  recentMovements: NightclubInventoryMovement[]
}

export type Unsubscribe = () => void

/** Query-oriented production boundary. No listener downloads a whole club dataset. */
export interface NightclubRepository {
  subscribeFloor(listener: (value: NightclubFloorSnapshot) => void): Unsubscribe
  subscribeOpenAccounts(listener: (value: NightclubAccount[]) => void): Unsubscribe
  subscribeActiveBarRounds(listener: (value: NightclubRound[]) => void): Unsubscribe
  subscribeActiveShift(listener: (value: NightclubShift | null) => void): Unsubscribe
  subscribeCatalog(listener: (value: NightclubCatalogSnapshot) => void): Unsubscribe
  subscribeInventory(listener: (value: NightclubInventorySnapshot) => void): Unsubscribe
  subscribeCashMovements(shiftId: string, listener: (value: NightclubCashMovement[]) => void): Unsubscribe
  getCustomers(query: string, limit: number): Promise<NightclubCustomer[]>
  getStaff(): Promise<NightclubStaff[]>
  getCashMovements(shiftId: string): Promise<NightclubCashMovement[]>
  openAccount(input: { operationId: string; target: NightclubServiceTarget }): Promise<{ accountId: string }>
  addRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[]; customerId?: string | null; serviceStaffId?: string }): Promise<{ roundId: string; accountId: string; total: number; status: string }>
  settleRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[]; payment: NightclubPaymentDraft }): Promise<{ roundId: string; paymentId: string; total: number }>
  advanceRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void>
  deliverRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void>
  requestBill(input: { operationId: string; accountId: string }): Promise<{ accountId: string; status: string }>
  reopenBill(input: { operationId: string; accountId: string }): Promise<{ accountId: string; status: string }>
  recordPayment(input: { operationId: string; accountId: string; amount: number; method: string; cashAmount?: number; qrAmount?: number; cardAmount?: number; received?: number }): Promise<{ paymentId: string; balance: number }>
  finishOccupancy(input: { operationId: string; accountId: string }): Promise<void>
  refundRound(input: { operationId: string; accountId: string; roundId: string; reason: string }): Promise<void>
  cancelRound(input: { operationId: string; roundId: string; reason: string }): Promise<void>
  recordInventoryMovement(input: { operationId: string; inventoryId: string; quantity: number; type: NightclubInventoryMovement['type']; reason: string }): Promise<void>
  openShift(input: { operationId: string; openingFloat: number }): Promise<{ shiftId: string }>
  closeShift(input: { operationId: string; shiftId: string; countedCash: number }): Promise<void>
  saveZone(input: { operationId: string; zone: { id?: string; name: string; sortOrder?: number } }): Promise<void>
  deleteZone(input: { operationId: string; id: string }): Promise<void>
  saveTable(input: { operationId: string; table: { id?: string; name: string; zoneId: string; capacity?: number; status?: string } }): Promise<void>
  deleteTable(input: { operationId: string; id: string }): Promise<void>
  saveProduct(input: { operationId: string; product: NightclubProduct }): Promise<void>
  saveInventory(input: { operationId: string; item: NightclubInventoryItem }): Promise<void>
  saveCustomer(input: { operationId: string; customer: NightclubCustomer }): Promise<void>
  getRoundById?(roundId: string): Promise<NightclubRound | null>
  subscribeReservations?(listener: (value: NightclubReservation[]) => void): Unsubscribe
  subscribePromoters?(listener: (value: NightclubPromoter[]) => void): Unsubscribe
  subscribePromoterEvents?(listener: (value: NightclubPromoterEvent[]) => void): Unsubscribe
  subscribePromoterTicketSales?(listener: (value: NightclubTicketSale[]) => void): Unsubscribe
  subscribePromoterLoungeSales?(listener: (value: NightclubLoungeSale[]) => void): Unsubscribe
  subscribePromoterConsumptions?(listener: (value: NightclubPromoterConsumption[]) => void): Unsubscribe
  saveReservation?(input: { operationId: string; reservation: ReservationDraft }): Promise<{ reservationId: string }>
  cancelReservation?(input: { operationId: string; id: string }): Promise<void>
  arriveReservation?(input: { operationId: string; id: string }): Promise<{ reservationId: string; accountId: string }>
  savePromoter?(input: { operationId: string; promoter: NightclubPromoter }): Promise<{ promoterId: string }>
  deletePromoter?(input: { operationId: string; id: string }): Promise<void>
  savePromoterEvent?(input: { operationId: string; event: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'> }): Promise<{ eventId: string }>
  saveTicketSale?(input: { operationId: string; sale: NightclubSaleDraft }): Promise<{ saleId: string; total: number }>
  saveLoungeSale?(input: { operationId: string; sale: NightclubLoungeSaleDraft }): Promise<{ saleId: string }>
  markLoungePaid?(input: { operationId: string; saleId: string }): Promise<void>
  savePromoterConsumption?(input: { operationId: string; consumption: NightclubConsumptionDraft }): Promise<{ consumptionId: string }>
}

export const nightclubTenantPaths = (tenantId: string) => ({
  root: `tenants/${tenantId}`,
  zones: `tenants/${tenantId}/nightclubZones`,
  tables: `tenants/${tenantId}/nightclubTables`,
  reservations: `tenants/${tenantId}/nightclubReservations`,
  accounts: `tenants/${tenantId}/nightclubAccounts`,
  rounds: `tenants/${tenantId}/nightclubRounds`,
  payments: `tenants/${tenantId}/nightclubPayments`,
  products: `tenants/${tenantId}/nightclubProducts`,
  inventory: `tenants/${tenantId}/nightclubInventory`,
  inventoryMovements: `tenants/${tenantId}/nightclubInventoryMovements`,
  customers: `tenants/${tenantId}/nightclubCustomers`,
  staff: `tenants/${tenantId}/members`,
  shifts: `tenants/${tenantId}/nightclubShifts`,
  cashMovements: `tenants/${tenantId}/nightclubCashMovements`,
  operations: `tenants/${tenantId}/nightclubOperations`,
  audit: `tenants/${tenantId}/nightclubAudit`,
  promoters: `tenants/${tenantId}/nightclubPromoters`,
  promoterEvents: `tenants/${tenantId}/nightclubPromoterEvents`,
  promoterTicketSales: `tenants/${tenantId}/nightclubPromoterTicketSales`,
  promoterLoungeSales: `tenants/${tenantId}/nightclubPromoterLoungeSales`,
  promoterConsumptions: `tenants/${tenantId}/nightclubPromoterConsumptions`,
})
