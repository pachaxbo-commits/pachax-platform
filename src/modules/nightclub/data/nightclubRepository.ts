import type {
  NightclubAccount,
  NightclubCashMovement,
  NightclubCashbox,
  NightclubCommission,
  NightclubCommissionPayment,
  NightclubCommissionPaymentDraft,
  NightclubCourtesy,
  NightclubCourtesyDraft,
  NightclubCustomer,
  NightclubCustomerIncident,
  NightclubCustomerStatus,
  NightclubInventoryBalance,
  NightclubInventoryItem,
  NightclubInventoryLot,
  NightclubInventoryMovement,
  NightclubLocation,
  NightclubMember,
  NightclubOpenBottle,
  NightclubOperatorContext,
  NightclubPaymentDraft,
  NightclubProduct,
  NightclubReservation,
  NightclubRound,
  NightclubRoundDraft,
  NightclubServiceTarget,
  NightclubShift,
  NightclubStaff,
  NightclubTable,
  NightclubTransfer,
  NightclubZone,
} from '../domain/nightclubAccounts'
import type { NightclubFinancialReadScope } from './nightclubFinancialSubscriptions'
import type { ReservationDraft } from '../domain/nightclubFloor'
import type {
  NightclubConsumptionDraft,
  NightclubLoungeSale,
  NightclubLoungeSaleDraft,
  NightclubPromoter,
  NightclubPromoterConsumption,
  NightclubPromoterEvent,
  NightclubSaleDraft,
  NightclubTicketSale,
} from '../domain/nightclubPromoters'

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

export interface NightclubLocationInventorySnapshot {
  balances: NightclubInventoryBalance[]
  lots: NightclubInventoryLot[]
}

export type Unsubscribe = () => void

/** Query-oriented production boundary. No listener downloads a whole club dataset. */
export interface NightclubRepository {
  subscribeFloor(listener: (value: NightclubFloorSnapshot) => void): Unsubscribe
  subscribeOpenAccounts(listener: (value: NightclubAccount[]) => void): Unsubscribe
  subscribeOperationalAccounts?(listener: (value: NightclubAccount[]) => void, onError?: (err: Error) => void, options?: { includeRounds?: boolean; includePayments?: boolean; financialReadScope?: NightclubFinancialReadScope }): Unsubscribe
  subscribeActiveBarRounds(listener: (value: NightclubRound[]) => void, financialReadScope?: NightclubFinancialReadScope): Unsubscribe
  subscribeActiveShift(listener: (value: NightclubShift | null) => void, onError?: (err: Error) => void, financialReadScope?: NightclubFinancialReadScope): Unsubscribe
  subscribeCatalog(listener: (value: NightclubCatalogSnapshot) => void): Unsubscribe
  subscribeInventory(listener: (value: NightclubInventorySnapshot) => void): Unsubscribe
  subscribeOperatorContext?(listener: (value: NightclubOperatorContext | null) => void): Unsubscribe
  subscribeOperatorContext?(uid: string, listener: (value: NightclubOperatorContext | null) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeCashboxes?(listener: (value: NightclubCashbox[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeLocations?(listener: (value: NightclubLocation[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeLocationInventory?(locationId: string, listener: (value: NightclubLocationInventorySnapshot) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeInventoryBalances?(listener: (value: NightclubInventoryBalance[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeInventoryLots?(listener: (value: NightclubInventoryLot[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeOpenBottles?(listener: (value: NightclubOpenBottle[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeTransfers?(listener: (value: NightclubTransfer[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeCashboxShifts?(listener: (value: NightclubShift[]) => void, onError?: (err: Error) => void, financialReadScope?: NightclubFinancialReadScope): Unsubscribe
  getCustomers(query?: string, limit?: number): Promise<NightclubCustomer[]>
  getStaff(): Promise<NightclubStaff[]>
  getCashMovements(shiftId: string, financialReadScope?: NightclubFinancialReadScope): Promise<NightclubCashMovement[]>
  openAccount(input: { operationId: string; target: NightclubServiceTarget }): Promise<{ accountId: string }>
  addRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[]; customerId?: string | null; serviceStaffId?: string }): Promise<{ roundId: string; accountId: string; total: number; status: string }>
  settleRound(input: { operationId: string; accountId: string; items: NightclubRoundDraft[]; payment: NightclubPaymentDraft }): Promise<{ roundId: string; paymentId: string; total: number }>
  advanceRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void>
  deliverRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void>
  requestBill(input: { operationId: string; accountId: string }): Promise<{ accountId: string; status: string }>
  reopenBill(input: { operationId: string; accountId: string }): Promise<{ accountId: string; status: string }>
  recordPayment(input: { operationId: string; accountId: string; amount: number; method: string; cashAmount?: number; qrAmount?: number; cardAmount?: number; received?: number }): Promise<{ paymentId: string; balance: number }>
  finishOccupancy(input: { operationId: string; accountId: string }): Promise<void>
  refundRound(input: { operationId: string; accountId: string; roundId: string; reason: string; returnToStock?: boolean; items?: Array<{ itemId: string; quantity: number; returnToStock: boolean }> }): Promise<void>
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
  selectCashbox?(input: { operationId: string; cashboxId: string; confirmPending?: boolean }): Promise<{ cashboxId?: string; locationId: string; activeShiftId?: string | null }>
  initializeNightclubInfrastructure?(input: { operationId: string }): Promise<{ status: 'initialized' | 'already_initialized'; warehouseId: string; cashboxId: string }>
  createNightclubCashbox?(input: { operationId: string; name: string }): Promise<{ status: 'created'; cashboxId: string; locationId: string; name: string }>
  openCashboxShift?(input: { operationId: string; cashboxId: string; openingFloat: number }): Promise<{ shiftId: string; cashboxId?: string }>
  closeCashboxShift?(input: { operationId: string; cashboxId: string; shiftId?: string; countedCash: number }): Promise<void>
  receiveWarehouseIntake?(input: { operationId: string; receipt: any }): Promise<any>
  confirmPhysicalCount?(input: { operationId: string; count: any }): Promise<any>
  requestTransfer?(input: { operationId: string; transfer: { lines: Array<{ inventoryId: string; quantity: number; unit: 'unit' | 'ml' | 'g' }> } }): Promise<{ transferId: string; destinationLocationId?: string }>
  dispatchTransfer?(input: { operationId: string; transferId: string }): Promise<{ transferId: string; status?: string } | void>
  receiveTransfer?(input: { operationId: string; transferId: string }): Promise<{ transferId: string; status?: string } | void>
  getRoundById?(roundId: string): Promise<NightclubRound | null>
  subscribeReservations?(listener: (value: NightclubReservation[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribePromoters?(listener: (value: NightclubPromoter[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribePromoterEvents?(listener: (value: NightclubPromoterEvent[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribePromoterTicketSales?(listener: (value: NightclubTicketSale[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribePromoterLoungeSales?(listener: (value: NightclubLoungeSale[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribePromoterConsumptions?(listener: (value: NightclubPromoterConsumption[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeMembers?(listener: (value: NightclubMember[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeCourtesies?(listener: (value: NightclubCourtesy[]) => void, onError?: (err: Error) => void): Unsubscribe
  subscribeCommissions?(listener: (value: NightclubCommission[]) => void, onError?: (err: Error) => void, financialReadScope?: NightclubFinancialReadScope): Unsubscribe
  subscribeCommissionPayments?(listener: (value: NightclubCommissionPayment[]) => void, onError?: (err: Error) => void, financialReadScope?: NightclubFinancialReadScope): Unsubscribe
  subscribeCustomerIncidents?(listener: (value: NightclubCustomerIncident[]) => void, onError?: (err: Error) => void): Unsubscribe
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
  recordCashMovement?(input: { operationId: string; type: 'income' | 'expense'; method: 'cash' | 'qr' | 'card'; amount: number; description: string; category?: string; notes?: string }): Promise<{ movementId: string }>
  saveBottleInventory?(input: { operationId: string; draft: any }): Promise<any>
  openBottle?(input: { operationId: string; inventoryId: string }): Promise<any>
  bottleExit?(input: { operationId: string; inventoryId: string; millilitres: number; exitType: string; reason: string }): Promise<any>
  saveMember?(input: { operationId: string; member: NightclubMember }): Promise<any>
  registerCourtesy?(input: { operationId: string; draft: NightclubCourtesyDraft }): Promise<any>
  cancelCourtesy?(input: { operationId: string; courtesyId: string }): Promise<any>
  payCommissions?(input: { operationId: string; draft: NightclubCommissionPaymentDraft }): Promise<any>
  setCustomerStatus?(input: { operationId: string; customerId: string; status: NightclubCustomerStatus }): Promise<any>
  saveCustomerIncident?(input: { operationId: string; incident: any }): Promise<any>
  deleteCustomerIncident?(input: { operationId: string; incidentId: string }): Promise<any>
  assignCustomer?(input: { operationId: string; accountId: string; customerId: string | null }): Promise<any>
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
  inventoryBalances: `tenants/${tenantId}/nightclubInventoryBalances`,
  inventoryLots: `tenants/${tenantId}/nightclubInventoryLots`,
  openBottles: `tenants/${tenantId}/nightclubOpenBottles`,
  inventoryMovements: `tenants/${tenantId}/nightclubInventoryMovements`,
  locations: `tenants/${tenantId}/nightclubLocations`,
  cashboxes: `tenants/${tenantId}/nightclubCashboxes`,
  operatorContexts: `tenants/${tenantId}/nightclubOperatorContexts`,
  transfers: `tenants/${tenantId}/nightclubTransfers`,
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
  members: `tenants/${tenantId}/nightclubMembers`,
  courtesies: `tenants/${tenantId}/nightclubCourtesies`,
  commissions: `tenants/${tenantId}/nightclubCommissions`,
  commissionPayments: `tenants/${tenantId}/nightclubCommissionPayments`,
  customerIncidents: `tenants/${tenantId}/nightclubCustomerIncidents`,
})
