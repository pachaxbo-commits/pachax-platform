import { collection, getDocs, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import { gateway } from '../../../services/gateway'
import { getActiveTenant } from '../../../store/activeTenant'

export interface RetailProduct {
  id: string; tenantId: string; branchId: string; name: string; description: string; barcode: string; sku: string
  category: string; brand: string; soldBy: 'unit' | 'weight'; stockUnit: 'unit' | 'g'; priceMinor: number
  minStock: number; trackStock: boolean; active: boolean; createdAt: string; updatedAt: string
}
export interface RetailInventory { productId: string; tenantId: string; branchId: string; quantity: number; unit: 'unit' | 'g'; updatedAt: string }
export interface RetailSale { saleId: string; tenantId: string; branchId: string; shiftId?: string; cashboxId?: string; items: Array<{ productId: string; productNameSnapshot: string; soldBy?: 'unit'|'weight'; quantity: number; unit: string; unitPriceMinor?: number; subtotalMinor: number }>; totalMinor: number; payment: { method: string; cashMinor: number; qrMinor: number; changeMinor: number; receivedMinor?: number }; actorUid?: string; createdAt: string }
export interface RetailMovement { movementId: string; productId: string; type: string; quantityDelta: number; quantityAfter: number; unit: string; actorUid: string; createdAt: string; note?: string }
export interface RetailCashSession { shiftId: string; tenantId: string; branchId: string; cashboxId: string; status: 'open'|'closed'; openedBy: string; openedAt: string; openingFloatMinor: number; totalSalesMinor: number; cashSalesMinor: number; qrSalesMinor: number; cashOnlySalesMinor?: number; qrOnlySalesMinor?: number; mixedCashMinor?: number; mixedQrMinor?: number; cashReceivedMinor: number; changeMinor: number; manualInflowMinor: number; manualOutflowMinor: number; salesCount: number; cashSalesCount: number; qrSalesCount: number; mixedSalesCount: number; closedBy?: string; closedAt?: string; expectedCashMinor?: number; countedCashMinor?: number; differenceMinor?: number; observation?: string }
export interface RetailCashMovement { cashMovementId: string; tenantId: string; branchId: string; cashboxId: string; shiftId: string; direction: 'in'|'out'; amountMinor: number; category: string; description: string; actorUid: string; createdAt: string }
export interface RetailCashClosure extends Omit<RetailCashSession, 'status'> { expectedCashMinor: number; countedCashMinor: number; differenceMinor: number; closedBy: string; closedAt: string; observation: string }
export interface RetailCashboxState { branchId:string; cashboxId:string; activeSessionId:string|null }

const context = async () => {
  const active = getActiveTenant(), firebase = await getFirebaseContext()
  if (!active || active.businessType !== 'gelateria_weight_cafe' || !firebase || active.tenantId !== firebase.tenantId) throw new Error('Selecciona una empresa de Comercio válida.')
  return { active, firebase }
}
function listen<T>(name: string, branchId: string, onData: (rows: T[]) => void, onError?: (error: Error) => void, orderField = 'name', maxRows?: number): () => void {
  let stop: Unsubscribe | undefined, cancelled = false
  void context().then(({ active, firebase }) => {
    if (cancelled) return
    const col = collection(firebase.db, 'tenants', active.tenantId, name)
    stop = onSnapshot(query(col, where('branchId', '==', branchId), orderBy(orderField), ...(maxRows ? [limit(maxRows)] : [])), snap => onData(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as T))), error => onError?.(error))
  }).catch(error => onError?.(error instanceof Error ? error : new Error('No se pudo cargar la información.')))
  return () => { cancelled = true; stop?.() }
}
export const subscribeProducts = (branchId: string, onData: (rows: RetailProduct[]) => void, onError?: (error: Error) => void) => listen<RetailProduct>('retailProducts', branchId, onData, onError)
export const subscribeInventory = (branchId: string, onData: (rows: RetailInventory[]) => void, onError?: (error: Error) => void) => listen<RetailInventory>('retailInventory', branchId, onData, onError, 'updatedAt')
export const subscribeSales = (branchId: string, onData: (rows: RetailSale[]) => void, onError?: (error: Error) => void) => listen<RetailSale>('retailSales', branchId, onData, onError, 'createdAt', 200)
export const subscribeMovements = (branchId: string, onData: (rows: RetailMovement[]) => void, onError?: (error: Error) => void) => listen<RetailMovement>('retailInventoryMovements', branchId, onData, onError, 'createdAt')

function subscribeCashRows<T>(collectionName: string, branchId: string, field: string, count: number, onData: (rows: T[]) => void, onError?: (error: Error) => void) {
  let stop: Unsubscribe | undefined, cancelled = false
  void context().then(({active,firebase}) => {
    if (cancelled) return
    const col = collection(firebase.db,'tenants',active.tenantId,collectionName)
    stop = onSnapshot(query(col,where('branchId','==',branchId),orderBy(field,'desc'),limit(count)),snap=>onData(snap.docs.map(item=>({...item.data(),id:item.id} as T))),error=>onError?.(error))
  }).catch(error=>onError?.(error instanceof Error?error:new Error('No se pudo cargar la información de caja.')))
  return ()=>{cancelled=true;stop?.()}
}
export const subscribeOpenRetailCashSession = (branchId:string,onData:(session:RetailCashSession|null)=>void,onError?:(error:Error)=>void) => {
  let stop:Unsubscribe|undefined,cancelled=false
  void context().then(({active,firebase})=>{if(cancelled)return;const col=collection(firebase.db,'tenants',active.tenantId,'retailCashSessions');stop=onSnapshot(query(col,where('branchId','==',branchId),where('status','==','open'),limit(1)),snap=>onData(snap.empty?null:{...snap.docs[0].data(),shiftId:snap.docs[0].id} as RetailCashSession),error=>onError?.(error))}).catch(error=>onError?.(error instanceof Error?error:new Error('No se pudo cargar la jornada de caja.')))
  return ()=>{cancelled=true;stop?.()}
}
export const subscribeRetailCashboxState = (branchId:string,onData:(state:RetailCashboxState|null)=>void,onError?:(error:Error)=>void) => {
  let stop:Unsubscribe|undefined,cancelled=false
  void context().then(({active,firebase})=>{if(cancelled)return;const col=collection(firebase.db,'tenants',active.tenantId,'retailCashboxStates');stop=onSnapshot(query(col,where('branchId','==',branchId),where('cashboxId','==','default'),limit(1)),snap=>onData(snap.empty?null:snap.docs[0].data() as RetailCashboxState),error=>onError?.(error))}).catch(error=>onError?.(error instanceof Error?error:new Error('No se pudo verificar el estado de caja.')))
  return ()=>{cancelled=true;stop?.()}
}
export const subscribeRetailCashSessions = (branchId:string,onData:(rows:RetailCashSession[])=>void,onError?:(error:Error)=>void) => subscribeCashRows<RetailCashSession>('retailCashSessions',branchId,'openedAt',50,onData,onError)
export const subscribeRetailCashMovements = (branchId:string,onData:(rows:RetailCashMovement[])=>void,onError?:(error:Error)=>void) => subscribeCashRows<RetailCashMovement>('retailCashMovements',branchId,'createdAt',100,onData,onError)
export const subscribeRetailCashClosures = (branchId:string,onData:(rows:RetailCashClosure[])=>void,onError?:(error:Error)=>void) => subscribeCashRows<RetailCashClosure>('retailCashClosures',branchId,'closedAt',50,onData,onError)

export async function getRetailSalesRange(branchId:string,startISO:string,endExclusiveISO:string,maxRows=500) {
  const {active,firebase}=await context(),col=collection(firebase.db,'tenants',active.tenantId,'retailSales')
  const result=await getDocs(query(col,where('branchId','==',branchId),where('createdAt','>=',startISO),where('createdAt','<',endExclusiveISO),orderBy('createdAt','desc'),limit(maxRows)))
  return {rows:result.docs.map(item=>({...item.data(),saleId:item.id} as RetailSale)),reachedLimit:result.size===maxRows}
}
export async function getRetailCashClosuresRange(branchId:string,startISO:string,endExclusiveISO:string,maxRows=500) {
  const {active,firebase}=await context(),col=collection(firebase.db,'tenants',active.tenantId,'retailCashClosures')
  const result=await getDocs(query(col,where('branchId','==',branchId),where('closedAt','>=',startISO),where('closedAt','<',endExclusiveISO),orderBy('closedAt','desc'),limit(maxRows)))
  return {rows:result.docs.map(item=>({...item.data(),shiftId:item.id} as RetailCashClosure)),reachedLimit:result.size===maxRows}
}
export async function getRetailCashMovementsRange(branchId:string,startISO:string,endExclusiveISO:string,maxRows=500) {
  const {active,firebase}=await context(),col=collection(firebase.db,'tenants',active.tenantId,'retailCashMovements')
  const result=await getDocs(query(col,where('branchId','==',branchId),where('createdAt','>=',startISO),where('createdAt','<',endExclusiveISO),orderBy('createdAt','desc'),limit(maxRows)))
  return {rows:result.docs.map(item=>({...item.data(),cashMovementId:item.id} as RetailCashMovement)),reachedLimit:result.size===maxRows}
}

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
export const openRetailCashSession = (openingFloatMinor:number) => retailCommand<{shiftId:string;cashboxId:string;status:'open';openingFloatMinor:number}>('openCashSession',{openingFloatMinor})
export const recordRetailCashMovement = (payload:{shiftId:string;direction:'in'|'out';amountMinor:number;category:'change_float'|'expense'|'withdrawal'|'correction';description:string}) => retailCommand<{cashMovementId:string;shiftId:string;direction:'in'|'out';amountMinor:number}>('recordCashMovement',payload)
export const closeRetailCashSession = (payload:{shiftId:string;countedCashMinor:number;observation?:string}) => retailCommand<{shiftId:string;status:'closed';totalSalesMinor:number;expectedCashMinor:number;countedCashMinor:number;differenceMinor:number;closedAt:string}>('closeCashSession',payload)
