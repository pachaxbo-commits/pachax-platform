import type { DistributionData } from '../../modules/distribution/state/useDistributionStore.ts'
import { createFullDistributionDataset, createEmptyDistributionDataset } from '../datasets/distribution/distributionDatasets.ts'
import type { DemoDatasetMode } from '../datasets/types.ts'
import { getDemoItem, setDemoItem, clearDemoState } from '../core/demoContext.ts'
import { centralBalanceId, round2, toDayKey } from '../../modules/distribution/domain/engine.ts'
import type {
  DistBalance,
  DistWarehouse,
  DistQrVerification,
  DistClosure,
  DistPhysicalReturnBreakdown,
  DistCollection,
  DistCustomer,
  DistDispatch,
  DistDispatchLine,
  DistDispatchAddition,
  DistExpense,
  DistProduct,
  DistReceivable,
  DistRoute,
  DistSale,
  DistStockMovement,
  DistLot,
  DistTransfer,
  DistClaim,
  DistCreditStatus,
  DistCreditOverride,
  DistCatalogSettings,
} from '../../modules/distribution/types.ts'
import type {
  CustomerInput,
  ConfirmDispatchInput,
  AddDispatchLoadInput,
  RegisterSaleInput,
  RegisterCollectionInput,
  RegisterExpenseInput,
  SaveClosureInput,
  DeclareRouteReturnPayload,
  DistributionRepositoryAdapter,
} from '../../modules/distribution/data/distributionRepository.ts'
import type { PendingOperation } from '../../modules/distribution/data/operationQueue.ts'
import type { SupportSettings } from '../../modules/distribution/data/supportMaintenance.ts'

const BUSINESS_TYPE = 'route_distribution'
const DATA_STORAGE_KEY = 'data'

type ListenerMap = {
  [K in keyof DistributionData]?: Set<(data: DistributionData[K]) => void>
}

export class DemoDistributionRepository implements DistributionRepositoryAdapter {
  private data: DistributionData
  private listeners: ListenerMap = {}
  private allListeners = new Set<(data: DistributionData) => void>()

  constructor(initialMode: DemoDatasetMode = 'full') {
    this.data = this.loadOrSeed(initialMode)
  }

  private loadOrSeed(mode: DemoDatasetMode): DistributionData {
    const raw = getDemoItem(BUSINESS_TYPE, DATA_STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DistributionData
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.customers)) {
          if (!parsed.catalogSettings) parsed.catalogSettings = { id: 'catalog', tenantId: 'preview-distribution', industryProfile: 'mixed', categories: [{ id: 'general', name: 'General', active: true }, { id: 'other', name: 'Otros', active: true }], updatedAt: new Date().toISOString() }
          return parsed
        }
      } catch {
        // Fallback to seed on parse error
      }
    }
    const seed = mode === 'empty' ? createEmptyDistributionDataset().data : createFullDistributionDataset().data
    this.persist(seed)
    return seed
  }

  private persist(newData: DistributionData): void {
    this.data = newData
    setDemoItem(BUSINESS_TYPE, DATA_STORAGE_KEY, JSON.stringify(newData))
  }

  public reset(mode: DemoDatasetMode = 'full'): void {
    clearDemoState(BUSINESS_TYPE)
    this.data = this.loadOrSeed(mode)
    this.notifyAll()
  }

  public getData(): DistributionData {
    return this.data
  }

  public subscribeAll(cb: (data: DistributionData) => void): () => void {
    this.allListeners.add(cb)
    cb(this.data)
    return () => {
      this.allListeners.delete(cb)
    }
  }

  private notify<K extends keyof DistributionData>(key: K): void {
    const set = this.listeners[key]
    if (set) {
      const val = this.data[key]
      set.forEach(cb => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cb as any)(val)
        } catch (e) {
          console.error('Error in demo listener', e)
        }
      })
    }
    this.allListeners.forEach(cb => {
      try {
        cb(this.data)
      } catch (e) {
        console.error('Error in demo allListener', e)
      }
    })
  }

  private notifyAll(): void {
    (Object.keys(this.data) as Array<keyof DistributionData>).forEach(k => this.notify(k))
  }

  private addListener<K extends keyof DistributionData>(key: K, cb: (data: DistributionData[K]) => void): () => void {
    if (!this.listeners[key]) {
      ;(this.listeners as any)[key] = new Set()
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.listeners[key]!.add(cb as any)
    try {
      cb(this.data[key])
    } catch {
      // Ignore
    }
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.listeners[key]?.delete(cb as any)
    }
  }

  // --- REPOSITORY IMPLEMENTATION ---

  warehouseBalanceId(warehouseId: string, productId: string): string {
    return warehouseId === 'central' ? centralBalanceId(productId) : `warehouse__${warehouseId}__${productId}`
  }

  subscribeWarehouses(onData: (rows: DistWarehouse[]) => void): () => void {
    return this.addListener('warehouses', onData)
  }

  subscribeQrVerifications(routeId: string | null, onData: (rows: DistQrVerification[]) => void): () => void {
    const filterFn = (all: DistQrVerification[]) => {
      onData(routeId ? all.filter(q => q.routeId === routeId) : all)
    }
    return this.addListener('qrVerifications', filterFn)
  }

  async createWarehouse(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Ingresa el nombre del almacen.')
    const id = `wh_${Date.now()}`
    const updated = [...this.data.warehouses, { id, name: trimmed, active: true, tenantId: 'preview-distribution' }]
    this.persist({ ...this.data, warehouses: updated })
    this.notify('warehouses')
  }

  async transferWarehouseStock(from: string, to: string, line: DistDispatchLine, note: string, operationId: string): Promise<void> {
    const fromId = this.warehouseBalanceId(from, line.productId)
    const toId = this.warehouseBalanceId(to, line.productId)

    const updatedBalances = this.data.balances.map(b => {
      if (b.id === fromId) {
        const qty = round2(b.quantity - line.quantity)
        return { ...b, quantity: qty, availableQuantity: qty }
      }
      if (b.id === toId) {
        const qty = round2(b.quantity + line.quantity)
        return { ...b, quantity: qty, availableQuantity: qty }
      }
      return b
    })

    const transfer: DistTransfer = {
      id: operationId || `tr_${Date.now()}`,
      fromWarehouseId: from,
      toWarehouseId: to,
      line,
      note,
      createdAt: new Date().toISOString(),
      createdBy: 'demo-user',
    }

    this.persist({
      ...this.data,
      balances: updatedBalances,
      transfers: [transfer, ...this.data.transfers],
    })
    this.notify('balances')
    this.notify('transfers')
  }

  async verifyQr(sourceType: 'sale' | 'collection' | 'claim', sourceId: string, reference: string): Promise<void> {
    const verification: DistQrVerification = {
      id: `${sourceType}_${sourceId}`,
      sourceType,
      sourceId,
      reference,
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'demo-user',
      tenantId: 'preview-distribution',
      routeId: 'route-norte',
      amount: 100,
    }
    const updated = [verification, ...this.data.qrVerifications]
    this.persist({ ...this.data, qrVerifications: updated })
    this.notify('qrVerifications')
  }

  async declareRouteReturn(
    dispatch: DistDispatch,
    payloadOrQuantities: DeclareRouteReturnPayload | Record<string, number | DistPhysicalReturnBreakdown>,
    _declaredReturnMermas?: Record<string, number>,
    _declaredReturnNonSellables?: Record<string, number>,
    _declaredReturnNonSellableReasons?: Record<string, string>,
  ): Promise<void> {
    const dispatchId = typeof payloadOrQuantities === 'object' && 'dispatchId' in payloadOrQuantities
      ? payloadOrQuantities.dispatchId
      : dispatch.id
    const now = new Date().toISOString()
    const updatedDispatches = this.data.openDispatches.map(d => {
      if (d.id === dispatchId) {
        return { ...d, returnDeclaredAt: now }
      }
      return d
    })
    this.persist({ ...this.data, openDispatches: updatedDispatches })
    this.notify('openDispatches')
  }

  subscribeProducts(onData: (rows: DistProduct[]) => void): () => void {
    return this.addListener('products', onData)
  }

  subscribeCatalogSettings(onData: (settings: DistCatalogSettings) => void): () => void {
    return this.addListener('catalogSettings', onData)
  }

  async saveCatalogSettings(settings: Pick<DistCatalogSettings, 'industryProfile' | 'categories'>): Promise<void> {
    const next = { ...this.data.catalogSettings, ...settings, updatedAt: new Date().toISOString() }
    this.persist({ ...this.data, catalogSettings: next })
    this.notify('catalogSettings')
  }

  subscribeRoutes(onData: (rows: DistRoute[]) => void): () => void {
    return this.addListener('routes', onData)
  }

  subscribeCustomers(onData: (rows: DistCustomer[]) => void): () => void {
    return this.addListener('customers', onData)
  }

  subscribeBalances(onData: (rows: DistBalance[]) => void): () => void {
    return this.addListener('balances', onData)
  }

  subscribeOpenDispatches(routeId: string | null, onData: (rows: DistDispatch[]) => void, _onError?: (error: Error) => void, distributorUid?: string): () => void {
    const filterFn = (all: DistDispatch[]) => {
      onData(all.filter(d => (!routeId || d.routeId === routeId) && (!distributorUid || d.distributorUid === distributorUid) && d.status === 'open'))
    }
    return this.addListener('openDispatches', filterFn)
  }

  subscribeSales(dayKeys: string[], routeId: string | null, onData: (rows: DistSale[]) => void, _onError?: (error: Error) => void, distributorUid?: string): () => void {
    const filterFn = (all: DistSale[]) => {
      onData(all.filter(s => (!routeId || s.routeId === routeId) && (!dayKeys.length || dayKeys.includes(s.dayKey || '')) && (!distributorUid || s.sellerUid === distributorUid)))
    }
    return this.addListener('sales', filterFn)
  }

  subscribeCollections(dayKeys: string[], routeId: string | null, onData: (rows: DistCollection[]) => void, _onError?: (error: Error) => void, distributorUid?: string): () => void {
    const filterFn = (all: DistCollection[]) => {
      onData(all.filter(c => (!routeId || c.routeId === routeId) && (!dayKeys.length || dayKeys.includes(c.dayKey || '')) && (!distributorUid || c.collectedByUid === distributorUid)))
    }
    return this.addListener('collections', filterFn)
  }

  subscribeExpenses(dayKeys: string[], routeId: string | null, onData: (rows: DistExpense[]) => void, _onError?: (error: Error) => void, distributorUid?: string): () => void {
    const filterFn = (all: DistExpense[]) => {
      onData(all.filter(e => (!routeId || e.routeId === routeId) && (!dayKeys.length || dayKeys.includes(e.dayKey || '')) && (!distributorUid || e.registeredByUid === distributorUid) && !e.voided))
    }
    return this.addListener('expenses', filterFn)
  }

  subscribeReceivables(routeId: string | null, onData: (rows: DistReceivable[]) => void, _onError?: (error: Error) => void, _distributorUid?: string): () => void {
    const filterFn = (all: DistReceivable[]) => {
      onData(routeId ? all.filter(r => r.routeId === routeId) : all)
    }
    return this.addListener('receivables', filterFn)
  }

  subscribeClosures(dayKeys: string[], routeId: string | null, onData: (rows: DistClosure[]) => void, _onError?: (error: Error) => void, _distributorUid?: string): () => void {
    const filterFn = (all: DistClosure[]) => {
      onData(all.filter(c => (!routeId || c.routeId === routeId) && (!dayKeys.length || dayKeys.includes(c.dayKey || ''))))
    }
    return this.addListener('closures', filterFn)
  }

  async saveProduct(product: Omit<DistProduct, 'tenantId' | 'createdAt'> & { createdAt?: string }): Promise<void> {
    const now = new Date().toISOString()
    const fullProd: DistProduct = {
      ...product,
      tenantId: 'preview-distribution',
      createdAt: product.createdAt || now,
    }
    const exists = this.data.products.some(p => p.id === fullProd.id)
    const updatedProducts = exists
      ? this.data.products.map(p => (p.id === fullProd.id ? fullProd : p))
      : [...this.data.products, fullProd]

    const centralId = centralBalanceId(fullProd.id)
    const hasBalance = this.data.balances.some(b => b.id === centralId)
    const updatedBalances = hasBalance
      ? this.data.balances
      : [
          ...this.data.balances,
          {
            id: centralId,
            productId: fullProd.id,
            productName: fullProd.name,
            unitType: fullProd.unitType,
            locationKind: 'central' as const,
            warehouseId: 'central',
            quantity: 0,
            availableQuantity: 0,
            updatedAt: now,
            tenantId: 'preview-distribution',
          },
        ]

    this.persist({ ...this.data, products: updatedProducts, balances: updatedBalances })
    this.notify('products')
    this.notify('balances')
  }

  async saveRoute(route: Omit<DistRoute, 'tenantId' | 'createdAt'> & { createdAt?: string }): Promise<void> {
    const fullRoute: DistRoute = {
      ...route,
      tenantId: 'preview-distribution',
      createdAt: route.createdAt || new Date().toISOString(),
    }
    const exists = this.data.routes.some(r => r.id === fullRoute.id)
    const updated = exists
      ? this.data.routes.map(r => (r.id === fullRoute.id ? fullRoute : r))
      : [...this.data.routes, fullRoute]
    this.persist({ ...this.data, routes: updated })
    this.notify('routes')
  }

  async saveCustomer(input: CustomerInput): Promise<DistCustomer> {
    const trimmed = input.name.trim()
    if (trimmed.length < 2 || trimmed.length > 100) {
      throw new Error('El nombre comercial debe tener entre 2 y 100 caracteres.')
    }
    const now = new Date().toISOString()
    const id = input.id || `c_${Date.now()}`
    const customer: DistCustomer = {
      id,
      name: trimmed,
      phone: input.phone?.trim() || '',
      address: input.address?.trim() || '',
      addressReference: input.addressReference?.trim() || '',
      identityNumber: input.identityNumber?.trim() || '',
      customerCode: input.customerCode || input.identityNumber?.trim() || 'CLI-DEMO',
      routeId: input.routeId || '',
      notes: input.notes?.trim() || '',
      active: input.active !== false,
      photoDataUrl: input.photoDataUrl || '',
      createdAt: now,
      tenantId: 'preview-distribution',
      createdBy: 'demo-user',
    }

    const exists = this.data.customers.some(c => c.id === id)
    const updated = exists
      ? this.data.customers.map(c => (c.id === id ? customer : c))
      : [...this.data.customers, customer]

    this.persist({ ...this.data, customers: updated })
    this.notify('customers')
    return customer
  }

  async registerIntake(lines: DistDispatchLine[], note: string, operationId = `intake_${Date.now()}`): Promise<string> {
    const now = new Date().toISOString()
    const updatedBalances = [...this.data.balances]
    const newMovements: DistStockMovement[] = []

    for (const line of lines) {
      const cId = centralBalanceId(line.productId)
      const idx = updatedBalances.findIndex(b => b.id === cId)
      if (idx >= 0) {
        const newQty = round2(updatedBalances[idx].quantity + line.quantity)
        updatedBalances[idx] = {
          ...updatedBalances[idx],
          quantity: newQty,
          availableQuantity: newQty,
          updatedAt: now,
        }
      } else {
        updatedBalances.push({
          id: cId,
          productId: line.productId,
          productName: line.productName,
          unitType: line.unitType,
          quantity: line.quantity,
          availableQuantity: line.quantity,
          locationKind: 'central',
          warehouseId: 'central',
          updatedAt: now,
          tenantId: 'preview-distribution',
        })
      }

      newMovements.push({
        id: `${operationId}_${line.productId}`,
        type: 'intake',
        productId: line.productId,
        productName: line.productName,
        unitType: line.unitType,
        quantity: line.quantity,
        centralDelta: line.quantity,
        routeDelta: 0,
        refType: 'manual',
        refId: operationId,
        note: note || 'Ingreso demo',
        createdAt: now,
        createdBy: 'demo_user',
        branchId: 'main',
        dayKey: toDayKey(new Date()),
        schemaVersion: 1,
        tenantId: 'preview-distribution',
      })
    }

    this.persist({
      ...this.data,
      balances: updatedBalances,
      movements: [...newMovements, ...this.data.movements],
    })
    this.notify('balances')
    this.notify('movements')
    return operationId
  }

  async registerAdjustment(line: DistDispatchLine, note: string, operationId = `adj_${Date.now()}`, warehouseId = 'central'): Promise<string> {
    const now = new Date().toISOString()
    const updatedBalances = [...this.data.balances]

    const bId = this.warehouseBalanceId(warehouseId, line.productId)
    const idx = updatedBalances.findIndex(b => b.id === bId)
    if (idx >= 0) {
      const newQty = round2(updatedBalances[idx].quantity + line.quantity)
      updatedBalances[idx] = {
        ...updatedBalances[idx],
        quantity: newQty,
        availableQuantity: newQty,
        updatedAt: now,
      }
    }

    const movement: DistStockMovement = {
      id: operationId,
      type: 'adjustment',
      productId: line.productId,
      productName: line.productName,
      unitType: line.unitType,
      quantity: Math.abs(line.quantity),
      centralDelta: line.quantity,
      routeDelta: 0,
      refType: 'manual',
      refId: operationId,
      note,
      createdAt: now,
      createdBy: 'demo_user',
      branchId: 'main',
      dayKey: toDayKey(new Date()),
      schemaVersion: 1,
      tenantId: 'preview-distribution',
    }

    this.persist({
      ...this.data,
      balances: updatedBalances,
      movements: [movement, ...this.data.movements],
    })
    this.notify('balances')
    this.notify('movements')
    return operationId
  }

  async confirmDispatch(input: ConfirmDispatchInput): Promise<string> {
    const id = input.operationId || `disp_${Date.now()}`
    const now = new Date().toISOString()
    const dispatch: DistDispatch = {
      id,
      routeId: input.routeId,
      routeName: input.routeName,
      distributorUid: input.distributorUid,
      distributorName: input.distributorName,
      lines: input.lines,
      additions: [],
      status: 'open',
      observation: input.observation,
      warehouseId: input.warehouseId || 'central',
      createdAt: now,
      createdBy: input.distributorUid,
      branchId: 'main',
      dayKey: toDayKey(new Date()),
      schemaVersion: 1,
      tenantId: 'preview-distribution',
    }

    const updatedBalances = [...this.data.balances]
    for (const line of input.lines) {
      const cId = centralBalanceId(line.productId)
      const cIdx = updatedBalances.findIndex(b => b.id === cId)
      if (cIdx >= 0) {
        const newQty = round2(updatedBalances[cIdx].quantity - line.quantity)
        updatedBalances[cIdx] = {
          ...updatedBalances[cIdx],
          quantity: newQty,
          availableQuantity: newQty,
          updatedAt: now,
        }
      }
      const rId = `route__${input.routeId}__${line.productId}`
      const rIdx = updatedBalances.findIndex(b => b.id === rId)
      if (rIdx >= 0) {
        const newQty = round2(updatedBalances[rIdx].quantity + line.quantity)
        updatedBalances[rIdx] = {
          ...updatedBalances[rIdx],
          quantity: newQty,
          availableQuantity: newQty,
          updatedAt: now,
        }
      } else {
        updatedBalances.push({
          id: rId,
          productId: line.productId,
          productName: line.productName,
          unitType: line.unitType,
          quantity: line.quantity,
          availableQuantity: line.quantity,
          locationKind: 'route',
          routeId: input.routeId,
          updatedAt: now,
          tenantId: 'preview-distribution',
        })
      }
    }

    this.persist({
      ...this.data,
      openDispatches: [...this.data.openDispatches, dispatch],
      balances: updatedBalances,
    })
    this.notify('openDispatches')
    this.notify('balances')
    return id
  }

  async addDispatchLoad(input: AddDispatchLoadInput): Promise<string> {
    const now = new Date().toISOString()
    const dispatch = this.data.openDispatches.find(d => d.id === input.dispatch.id)
    if (!dispatch) throw new Error('Despacho no encontrado.')

    const addition: DistDispatchAddition = {
      id: input.operationId || `add_${Date.now()}`,
      quantityByProduct: input.lines,
      createdAt: now,
      createdBy: 'demo-user',
      createdByName: input.registeredByName,
      note: input.note,
    }

    const updatedLines = [...dispatch.lines]
    for (const line of input.lines) {
      const idx = updatedLines.findIndex(l => l.productId === line.productId)
      if (idx >= 0) {
        updatedLines[idx] = {
          ...updatedLines[idx],
          quantity: round2(updatedLines[idx].quantity + line.quantity),
        }
      } else {
        updatedLines.push(line)
      }
    }

    const updatedDispatch: DistDispatch = {
      ...dispatch,
      lines: updatedLines,
      additions: [...(dispatch.additions || []), addition],
    }

    const updatedBalances = [...this.data.balances]
    for (const line of input.lines) {
      const cId = centralBalanceId(line.productId)
      const cIdx = updatedBalances.findIndex(b => b.id === cId)
      if (cIdx >= 0) {
        const newQty = round2(updatedBalances[cIdx].quantity - line.quantity)
        updatedBalances[cIdx] = {
          ...updatedBalances[cIdx],
          quantity: newQty,
          availableQuantity: newQty,
          updatedAt: now,
        }
      }
      const rId = `route__${dispatch.routeId}__${line.productId}`
      const rIdx = updatedBalances.findIndex(b => b.id === rId)
      if (rIdx >= 0) {
        const newQty = round2(updatedBalances[rIdx].quantity + line.quantity)
        updatedBalances[rIdx] = {
          ...updatedBalances[rIdx],
          quantity: newQty,
          availableQuantity: newQty,
          updatedAt: now,
        }
      }
    }

    this.persist({
      ...this.data,
      openDispatches: this.data.openDispatches.map(d => (d.id === input.dispatch.id ? updatedDispatch : d)),
      balances: updatedBalances,
    })
    this.notify('openDispatches')
    this.notify('balances')
    return dispatch.id
  }

  async registerSale(input: RegisterSaleInput): Promise<DistSale> {
    const now = new Date().toISOString()
    const id = input.operationId || `sale_${Date.now()}`
    const total = input.total !== undefined ? round2(input.total) : round2(input.lines.reduce((s, l) => s + l.subtotal, 0))
    const dayKey = toDayKey(new Date())

    const sale: DistSale = {
      id,
      operationId: id,
      sellerUid: input.sellerUid,
      sellerName: input.sellerName,
      sourceLocation: input.sourceLocation,
      routeId: input.routeId,
      routeName: input.routeName,
      customerId: input.customerId,
      customerName: input.customerName,
      customerCode: input.customerCode,
      lines: input.lines,
      total,
      paymentKind: input.paymentKind,
      cashAmount: input.cashAmount || 0,
      qrAmount: input.qrAmount || 0,
      creditAmount: input.creditAmount || 0,
      note: input.note,
      saleKind: input.saleKind,
      courtesyReason: input.courtesyReason,
      dayKey,
      createdAt: now,
      createdBy: input.sellerUid,
      branchId: 'main',
      schemaVersion: 1,
      tenantId: 'preview-distribution',
    }

    const updatedBalances = [...this.data.balances]
    for (const line of input.lines) {
      const bId = input.routeId
        ? `route__${input.routeId}__${line.productId}`
        : centralBalanceId(line.productId)
      const bIdx = updatedBalances.findIndex(b => b.id === bId)
      if (bIdx >= 0) {
        const newQty = round2(updatedBalances[bIdx].quantity - line.quantity)
        updatedBalances[bIdx] = {
          ...updatedBalances[bIdx],
          quantity: newQty,
          availableQuantity: newQty,
          updatedAt: now,
        }
      }
    }

    const updatedReceivables = [...this.data.receivables]
    if (sale.creditAmount > 0) {
      const rec: DistReceivable = {
        id: `rec_${id}`,
        customerId: input.customerId || '',
        customerName: input.customerName || 'Cliente Demo',
        customerCode: input.customerCode || '',
        saleId: id,
        routeId: input.routeId || '',
        distributorUid: input.sellerUid,
        distributorName: input.sellerName,
        originalAmount: sale.creditAmount,
        paidAmount: 0,
        balance: sale.creditAmount,
        status: 'OPEN',
        createdAt: now,
        createdBy: input.sellerUid,
        branchId: 'main',
        dayKey: sale.dayKey,
        schemaVersion: 1,
        tenantId: 'preview-distribution',
      }
      updatedReceivables.push(rec)
    }

    this.persist({
      ...this.data,
      sales: [sale, ...this.data.sales],
      balances: updatedBalances,
      receivables: updatedReceivables,
    })
    this.notify('sales')
    this.notify('balances')
    if (sale.creditAmount > 0) this.notify('receivables')
    return sale
  }

  async registerCollection(input: RegisterCollectionInput): Promise<DistCollection> {
    const now = new Date().toISOString()
    const id = input.operationId || `col_${Date.now()}`
    const dayKey = toDayKey(new Date())

    const collection: DistCollection = {
      id,
      operationId: id,
      customerId: input.customerId || input.receivable?.customerId || '',
      customerName: input.customerName || input.receivable?.customerName || '',
      customerCode: input.customerCode || input.receivable?.customerCode || '',
      receivableId: input.receivableId || input.receivable?.id,
      amount: input.amount,
      method: input.method,
      cashAmount: input.cashAmount || 0,
      qrAmount: input.qrAmount || 0,
      collectedByUid: input.collectedByUid,
      collectedByName: input.collectedByName,
      routeId: input.routeId,
      note: input.note,
      dayKey,
      createdAt: now,
      createdBy: input.collectedByUid,
      branchId: 'main',
      schemaVersion: 1,
      tenantId: 'preview-distribution',
    }

    let updatedReceivables = this.data.receivables
    const recId = input.receivableId || input.receivable?.id
    if (recId) {
      updatedReceivables = this.data.receivables.map(r => {
        if (r.id === recId) {
          const newBalance = round2(r.balance - input.amount)
          return {
            ...r,
            balance: Math.max(0, newBalance),
            paidAmount: round2(r.paidAmount + input.amount),
            status: newBalance <= 0 ? 'PAID' : 'PARTIAL',
          }
        }
        return r
      })
    }

    this.persist({
      ...this.data,
      collections: [collection, ...this.data.collections],
      receivables: updatedReceivables,
    })
    this.notify('collections')
    if (recId) this.notify('receivables')
    return collection
  }

  async registerExpense(input: RegisterExpenseInput): Promise<DistExpense> {
    const now = new Date().toISOString()
    const id = input.operationId || `exp_${Date.now()}`
    const expense: DistExpense = {
      id,
      operationId: id,
      amount: input.amount,
      concept: input.concept,
      routeId: input.routeId,
      routeName: input.routeName,
      registeredByUid: input.registeredByUid,
      registeredByName: input.registeredByName,
      note: input.note,
      dayKey: toDayKey(new Date()),
      createdAt: now,
      createdBy: input.registeredByUid,
      branchId: 'main',
      schemaVersion: 1,
      tenantId: 'preview-distribution',
    }

    this.persist({
      ...this.data,
      expenses: [expense, ...this.data.expenses],
    })
    this.notify('expenses')
    return expense
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const updated = this.data.expenses.filter(e => e.id !== expenseId)
    this.persist({ ...this.data, expenses: updated })
    this.notify('expenses')
  }

  async deleteProduct(productId: string): Promise<void> {
    const updated = this.data.products.filter(p => p.id !== productId)
    this.persist({ ...this.data, products: updated })
    this.notify('products')
  }

  async saveClosure(input: SaveClosureInput): Promise<string> {
    const closure = input.closure
    const id = closure.id || `close_${Date.now()}`
    const updatedClosures = this.data.closures.some(c => c.id === id)
      ? this.data.closures.map(c => (c.id === id ? { ...closure, id } : c))
      : [{ ...closure, id }, ...this.data.closures]

    let updatedBalances = [...this.data.balances]
    if (input.applyStockReturn && Array.isArray(closure.products)) {
      for (const p of closure.products) {
        const returned = p.actualReturn || 0
        if (returned > 0) {
          const cId = centralBalanceId(p.productId)
          const cIdx = updatedBalances.findIndex(b => b.id === cId)
          if (cIdx >= 0) {
            const newQty = round2(updatedBalances[cIdx].quantity + returned)
            updatedBalances[cIdx] = {
              ...updatedBalances[cIdx],
              quantity: newQty,
              availableQuantity: newQty,
            }
          }
        }
        const rId = `route__${closure.routeId}__${p.productId}`
        const rIdx = updatedBalances.findIndex(b => b.id === rId)
        if (rIdx >= 0) {
          updatedBalances[rIdx] = {
            ...updatedBalances[rIdx],
            quantity: 0,
            availableQuantity: 0,
          }
        }
      }
    }

    const updatedDispatches = this.data.openDispatches.map(d => {
      if (d.id === closure.dispatchId) {
        return {
          ...d,
          status: 'closed' as const,
          closedAt: new Date().toISOString(),
          closureId: id,
        }
      }
      return d
    })

    this.persist({
      ...this.data,
      closures: updatedClosures,
      balances: updatedBalances,
      openDispatches: updatedDispatches,
    })
    this.notify('closures')
    this.notify('openDispatches')
    if (input.applyStockReturn) this.notify('balances')
    return id
  }

  async reopenClosure(closure: DistClosure, reason?: string): Promise<void> {
    const now = new Date().toISOString()
    const updatedClosures = this.data.closures.map(c => {
      if (c.id === closure.id) {
        return {
          ...c,
          status: 'reopened' as const,
          reopenedAt: now,
          reopenedBy: 'demo-user',
          note: reason || c.note,
        }
      }
      return c
    })
    const updatedDispatches = this.data.openDispatches.map(d => {
      if (d.id === closure.dispatchId) {
        return { ...d, status: 'open' as const }
      }
      return d
    })
    this.persist({
      ...this.data,
      closures: updatedClosures,
      openDispatches: updatedDispatches,
    })
    this.notify('closures')
    this.notify('openDispatches')
  }

  subscribeSupportSettings(onData: (settings: SupportSettings) => void): () => void {
    return this.addListener('supportSettings', onData)
  }

  subscribeLots(onData: (rows: DistLot[]) => void): () => void {
    return this.addListener('lots', onData)
  }

  subscribeOperations(onData: (rows: PendingOperation[]) => void): () => void {
    return this.addListener('operations', onData)
  }

  subscribeMovements(onData: (rows: DistStockMovement[]) => void): () => void {
    return this.addListener('movements', onData)
  }

  subscribeTransfers(onData: (rows: DistTransfer[]) => void): () => void {
    return this.addListener('transfers', onData)
  }

  subscribeClaims(routeId: string | null, onData: (rows: DistClaim[]) => void): () => void {
    const filterFn = (all: DistClaim[]) => {
      onData(routeId ? all.filter(c => c.routeId === routeId) : all)
    }
    return this.addListener('claims', filterFn)
  }

  subscribeCreditStatus(onData: (rows: DistCreditStatus[]) => void): () => void {
    return this.addListener('creditStatus', onData)
  }

  subscribeCreditOverrides(onData: (rows: DistCreditOverride[]) => void): () => void {
    return this.addListener('creditOverrides', onData)
  }

  async submitCreditOverride(input: { customerId?: string; reason?: string; days?: number; validUntil?: string; revoke?: boolean; overrideId?: string }): Promise<void> {
    const override: DistCreditOverride = {
      id: input.overrideId || `ovr_${Date.now()}`,
      customerId: input.customerId || '',
      reason: input.reason || '',
      validUntil: input.validUntil || new Date(Date.now() + (input.days || 7) * 86400000).toISOString(),
      active: !input.revoke,
      revokedAt: input.revoke ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
      createdBy: 'demo_user',
      branchId: 'main',
      dayKey: toDayKey(new Date()),
      schemaVersion: 1,
      tenantId: 'preview-distribution',
    }
    this.persist({ ...this.data, creditOverrides: [override, ...this.data.creditOverrides] })
    this.notify('creditOverrides')
  }

  async registerClaim(payload: Record<string, unknown>, operationId: string): Promise<void> {
    const claim: DistClaim = {
      id: operationId || `claim_${Date.now()}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(payload as any),
      createdAt: new Date().toISOString(),
    }
    this.persist({ ...this.data, claims: [claim, ...this.data.claims] })
    this.notify('claims')
  }

  async getCustomerStatementHistory(customerId: string) {
    return {
      receivables: this.data.receivables.filter(row => row.customerId === customerId),
      collections: this.data.collections.filter(row => row.customerId === customerId),
      claims: this.data.claims.filter(row => row.customerId === customerId),
      sales: this.data.sales.filter(row => row.customerId === customerId),
      complete: true as const,
    }
  }
}
