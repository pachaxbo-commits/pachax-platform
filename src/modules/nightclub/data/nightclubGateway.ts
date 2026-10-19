import { gateway } from '../../../services/gateway'
import type { NightclubRoundDraft, NightclubServiceTarget } from '../domain/nightclubAccounts'


export type NightclubOpenAccountCommand = { tenantId: string; branchId: string; operationId: string; target: NightclubServiceTarget }
export type NightclubPendingRoundCommand = { tenantId: string; branchId: string; operationId: string; accountId: string; items: NightclubRoundDraft[] }

/** Creates a pending bar account with the server-authoritative cashbox, location
 * and open shift. It does not create a payment or any inventory movement. */
export function openNightclubAccountThroughGateway(input: NightclubOpenAccountCommand) {
  return gateway<{ accountId: string }>('tenantGateway', {
    action: 'nightclubCommand', tenantId: input.tenantId, branchId: input.branchId,
    commandType: 'openAccount', operationId: input.operationId, payload: { target: input.target },
  })
}

/** Registers products as a pending round. Inventory consumption is deliberately
 * deferred to the later production operation that is authorized to consume it. */
export function createNightclubPendingRoundThroughGateway(input: NightclubPendingRoundCommand) {
  return gateway<{ accountId: string; roundId: string; total: number; status: 'pending' }>('tenantGateway', {
    action: 'nightclubCommand', tenantId: input.tenantId, branchId: input.branchId,
    commandType: 'createPendingRound', operationId: input.operationId,
    payload: { accountId: input.accountId, items: input.items },
  })
}
export type NightclubRefundLine = { itemId: string; quantity: number; returnToStock: boolean }
export type NightclubRefundCommand = {
  tenantId: string
  branchId: string
  operationId: string
  accountId: string
  roundId: string
  reason: string
  returnToStock: boolean
  items: NightclubRefundLine[]
}

export type NightclubWarehouseIntakeLine = {
  inventoryId: string
  quantity: number
  unit: 'unit' | 'ml' | 'l' | 'g' | 'kg'
  unitCost: number
  totalCost?: number
}

export type NightclubWarehouseIntakeCommand = {
  tenantId: string
  branchId: string
  operationId: string
  receipt: {
    lines: NightclubWarehouseIntakeLine[]
    supplier?: string
    reference?: string
    receivedDate?: string
    notes?: string
  }
}

export type NightclubCashboxSelectionCommand = {
  tenantId: string
  branchId: string
  operationId: string
  cashboxId: string
  confirmPending?: boolean
}

/** The server validates both the active branch and the caller's assigned
 * cashboxes. The browser only requests a selection and waits for Firestore's
 * operator-context listener before changing the visible work area. */
export function selectNightclubCashboxThroughGateway(input: NightclubCashboxSelectionCommand) {
  return gateway<{ cashboxId: string; locationId: string; activeShiftId: string | null }>('tenantGateway', {
    action: 'nightclubCommand',
    tenantId: input.tenantId,
    branchId: input.branchId,
    commandType: 'selectCashbox',
    operationId: input.operationId,
    payload: { cashboxId: input.cashboxId, confirmPending: input.confirmPending === true },
  })
}

/** The only production path for Nightclub refunds. Firestore balances and lots
 * are never changed from the browser; tenantGateway authorizes and executes the
 * command transactionally in Functions. */
export async function refundNightclubRoundThroughGateway(input: NightclubRefundCommand) {
  return gateway<{ accountId: string; roundId: string; status: string; amount: number; physicalStockRestored: boolean }>('tenantGateway', {
    action: 'nightclubCommand',
    tenantId: input.tenantId,
    branchId: input.branchId,
    commandType: 'refundRound',
    operationId: input.operationId,
    payload: {
      accountId: input.accountId,
      roundId: input.roundId,
      reason: input.reason,
      returnToStock: input.returnToStock,
      items: input.items,
    },
  })
}

/** Registers a purchase only in the general warehouse. The server normalizes
 * litres and kilograms, then atomically writes the balance, FIFO lot and audit
 * movement. Browser clients never update inventory documents directly. */
export async function receiveNightclubWarehouseIntakeThroughGateway(input: NightclubWarehouseIntakeCommand) {
  return gateway<{ locationId: 'warehouse-general'; receivedAt: string; totalCost: number; lines: Array<{ inventoryId: string; quantity: number; unit: 'unit' | 'ml' | 'g'; lotId: string; totalCost: number }> }>('tenantGateway', {
    action: 'nightclubCommand',
    tenantId: input.tenantId,
    branchId: input.branchId,
    commandType: 'receiveWarehouseIntake',
    operationId: input.operationId,
    payload: { receipt: input.receipt },
  })
}

export type NightclubTransferRequest = {
  tenantId: string
  branchId: string
  operationId: string
  lines: Array<{ inventoryId: string; quantity: number; unit: 'unit' | 'ml' | 'g' }>
}

export type NightclubPhysicalCount = {
  tenantId: string
  branchId: string
  operationId: string
  count: { locationId: string; reason: string; notes?: string; lines: Array<{ inventoryId: string; countedQuantity: number; unit: 'unit' | 'ml' | 'g'; expectedUpdatedAt?: string; unitCost?: number }> }
}

export function confirmNightclubPhysicalCountThroughGateway(input: NightclubPhysicalCount) {
  return gateway<{ countId: string; locationId: string; lines: Array<{ inventoryId: string; previous: number; countedQuantity: number; difference: number }> }>('tenantGateway', {
    action: 'nightclubCommand', tenantId: input.tenantId, branchId: input.branchId, commandType: 'confirmPhysicalCount', operationId: input.operationId, payload: { count: input.count },
  })
}

async function nightclubTransferCommand(input: { tenantId: string; branchId: string; operationId: string; commandType: 'requestTransfer' | 'dispatchTransfer' | 'receiveTransfer'; payload: Record<string, unknown> }) {
  return gateway<{ transferId: string; status?: 'requested' | 'in_transit' | 'received'; destinationLocationId?: string }>('tenantGateway', {
    action: 'nightclubCommand', tenantId: input.tenantId, branchId: input.branchId, commandType: input.commandType, operationId: input.operationId, payload: input.payload,
  })
}

/** Requests stock for the caller's authenticated cashbox. The browser never chooses the destination or FIFO lots. */
export function requestNightclubTransferThroughGateway(input: NightclubTransferRequest) {
  return nightclubTransferCommand({ ...input, commandType: 'requestTransfer', payload: { transfer: { mode: 'pending_receipt', lines: input.lines } } })
}

/** The warehouse dispatch assigns the oldest available lots server-side. */
export function dispatchNightclubTransferThroughGateway(input: Omit<NightclubTransferRequest, 'lines'> & { transferId: string }) {
  return nightclubTransferCommand({ ...input, commandType: 'dispatchTransfer', payload: { transferId: input.transferId } })
}

/** Receives only transfers whose destination matches the caller's active cashbox. */
export function receiveNightclubTransferThroughGateway(input: Omit<NightclubTransferRequest, 'lines'> & { transferId: string }) {
  return nightclubTransferCommand({ ...input, commandType: 'receiveTransfer', payload: { transferId: input.transferId } })
}
