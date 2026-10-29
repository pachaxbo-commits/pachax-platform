import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import { gateway } from '../../../services/gateway'

export interface RetailTenantProduct {
  id: string
  name: string
  category: string
  sku: string
  soldBy: 'unit' | 'weight'
  priceMinor: number
  stockBase: number
  stockUnit: 'unit' | 'g'
  minStock: number
  active: boolean
}

export interface RetailTenantShift {
  id: string
  status: 'open' | 'closed'
  openingFloatMinor: number
  cashSalesMinor: number
  cashInMinor: number
  cashOutMinor: number
  salesCount: number
  expectedCashMinor?: number
  countedCashMinor?: number
  differenceMinor?: number
  openedAt: string
}

export interface RetailTenantSale {
  id: string
  totalMinor: number
  cashMinor: number
  qrMinor: number
  changeMinor: number
  method: 'cash' | 'qr' | 'mixed'
  createdAt: string
  lines: Array<{ name: string; quantity: number; unit: string; lineTotalMinor: number }>
}

export interface RetailTenantState {
  products: RetailTenantProduct[]
  activeShift: RetailTenantShift | null
  recentSales: RetailTenantSale[]
  historyLimit: number
  historyComplete: boolean
}

export type RetailCommandResult = Record<string, unknown>

export interface RetailTenantMember {
  id: string
  displayName: string
  email: string
  roleId: string
  status: 'active' | 'disabled'
}

export function subscribeRetailMembers(
  tenantId: string,
  onNext: (members: RetailTenantMember[]) => void,
  onError: (error: Error) => void,
): () => void {
  let active = true
  let unsubscribe: Unsubscribe | undefined
  void getFirebaseContext().then(context => {
    if (!active || !context) return
    unsubscribe = onSnapshot(collection(context.db, 'tenants', tenantId, 'members'), snapshot => {
      if (active) onNext(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as RetailTenantMember)))
    }, error => { if (active) onError(error) })
  }).catch(error => { if (active) onError(error instanceof Error ? error : new Error('No se pudo cargar el equipo.')) })
  return () => { active = false; unsubscribe?.() }
}

export function createRetailMember(
  tenantId: string,
  branchId: string,
  operationId: string,
  input: { displayName: string; email: string; roleId: 'admin' | 'cashier' | 'sales' | 'inventory'; password: string },
): Promise<{ uid: string }> {
  return gateway('tenantGateway', { action: 'createMember', tenantId, operationId, ...input, branchIds: [branchId] })
}

export function updateRetailMember(
  tenantId: string,
  uid: string,
  input: { displayName: string; roleId: 'admin' | 'cashier' | 'sales' | 'inventory'; active: boolean },
): Promise<{ changed: boolean }> {
  return gateway('tenantGateway', { action: 'updateMember', tenantId, uid, ...input })
}

export function disableRetailMember(tenantId: string, uid: string): Promise<{ changed: boolean; deleted: boolean }> {
  return gateway('tenantGateway', { action: 'deleteMember', tenantId, uid })
}

export async function loadRetailState(tenantId: string, branchId: string): Promise<RetailTenantState> {
  return gateway<RetailTenantState>('tenantGateway', {
    action: 'retailCommand', commandType: 'load', tenantId, branchId,
  })
}

export async function runRetailCommand<T extends RetailCommandResult>(
  tenantId: string,
  branchId: string,
  commandType: 'saveProduct' | 'adjustStock' | 'openShift' | 'recordSale' | 'recordCashMovement' | 'closeShift',
  operationId: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return gateway<T>('tenantGateway', {
    action: 'retailCommand', tenantId, branchId, commandType, operationId, payload,
  })
}
