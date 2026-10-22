import { collection, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import { gateway } from '../../../services/gateway'
import { getActiveTenant } from '../../../store/activeTenant'

export interface RetailProduct {
  id: string; tenantId: string; branchId: string; name: string; description: string; barcode: string; sku: string
  category: string; brand: string; soldBy: 'unit' | 'weight'; stockUnit: 'unit' | 'g'; priceMinor: number
  minStock: number; trackStock: boolean; active: boolean; createdAt: string; updatedAt: string
}
export interface RetailInventory { productId: string; tenantId: string; branchId: string; quantity: number; unit: 'unit' | 'g'; updatedAt: string }
export interface RetailSale { saleId: string; tenantId: string; branchId: string; items: Array<{ productId: string; productNameSnapshot: string; soldBy?: 'unit'|'weight'; quantity: number; unit: string; unitPriceMinor?: number; subtotalMinor: number }>; totalMinor: number; payment: { method: string; cashMinor: number; qrMinor: number; changeMinor: number; receivedMinor?: number }; createdAt: string }
export interface RetailMovement { movementId: string; productId: string; type: string; quantityDelta: number; quantityAfter: number; unit: string; actorUid: string; createdAt: string; note?: string }

const context = async () => {
  const active = getActiveTenant(), firebase = await getFirebaseContext()
  if (!active || active.businessType !== 'gelateria_weight_cafe' || !firebase || active.tenantId !== firebase.tenantId) throw new Error('Selecciona una empresa de Comercio válida.')
  return { active, firebase }
}
function listen<T>(name: string, branchId: string, onData: (rows: T[]) => void, onError?: (error: Error) => void, orderField = 'name'): () => void {
  let stop: Unsubscribe | undefined, cancelled = false
  void context().then(({ active, firebase }) => {
    if (cancelled) return
    const col = collection(firebase.db, 'tenants', active.tenantId, name)
    stop = onSnapshot(query(col, where('branchId', '==', branchId), orderBy(orderField)), snap => onData(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as T))), error => onError?.(error))
  }).catch(error => onError?.(error instanceof Error ? error : new Error('No se pudo cargar la información.')))
  return () => { cancelled = true; stop?.() }
}
export const subscribeProducts = (branchId: string, onData: (rows: RetailProduct[]) => void, onError?: (error: Error) => void) => listen<RetailProduct>('retailProducts', branchId, onData, onError)
export const subscribeInventory = (branchId: string, onData: (rows: RetailInventory[]) => void, onError?: (error: Error) => void) => listen<RetailInventory>('retailInventory', branchId, onData, onError, 'updatedAt')
export const subscribeSales = (branchId: string, onData: (rows: RetailSale[]) => void, onError?: (error: Error) => void) => listen<RetailSale>('retailSales', branchId, onData, onError, 'createdAt')
export const subscribeMovements = (branchId: string, onData: (rows: RetailMovement[]) => void, onError?: (error: Error) => void) => listen<RetailMovement>('retailInventoryMovements', branchId, onData, onError, 'createdAt')

export async function retailCommand<T>(commandType: string, payload: Record<string, unknown>, operationId: string = crypto.randomUUID()): Promise<T> {
  const { active } = await context()
  return gateway<T>('tenantGateway', { action: 'retailCommand', commandType, tenantId: active.tenantId, branchId: active.branchId, operationId, payload })
}

export type SaveRetailProduct = Omit<RetailProduct, 'id' | 'tenantId' | 'branchId' | 'createdAt' | 'updatedAt'> & { id?: string; costMinor?: number; initialStock: number }
export const saveRetailProduct = (product: SaveRetailProduct) => retailCommand<{ productId: string; created: boolean }>('saveProduct', { product })
export const importRetailProducts = (products: SaveRetailProduct[], mode: 'create_new'|'update_existing') => retailCommand<{ created: number; updated: number; skipped: number }>('importProducts', { products, mode })
export const archiveRetailProduct = (productId: string) => retailCommand('archiveProduct', { productId })
export const recordRetailMovement = (payload: { productId: string; quantity: number; movementType: 'intake' | 'adjustment' | 'count'; direction?: 'increase' | 'decrease'; note?: string }) => retailCommand('recordInventoryMovement', payload)
export const createRetailSale = (payload: { items: Array<{ productId: string; quantity: number }>; payment: { method: 'cash' | 'qr' | 'mixed'; cashMinor: number; qrMinor: number; receivedMinor: number } }, operationId?: string) => retailCommand<{ saleId: string; totalMinor: number; changeMinor: number }>('createSale', payload, operationId)
