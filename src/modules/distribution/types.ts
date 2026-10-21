/**
 * Modelo de datos de distribucion movil (businessType: 'mobile_distribution').
 *
 * Todo documento vive bajo restaurants/{tenantId}/dist*  y lleva
 * tenantId + branchId para respetar el multitenancy existente.
 */

/** kg = granel por peso, unit = pieza suelta, package = paquete/sachet cerrado */
export type UnitType = 'kg' | 'unit' | 'package'

export type PaymentKind = 'cash' | 'qr' | 'credit' | 'mixed'

export type SourceLocation = 'route' | 'centralWarehouse'

export type StockLocationKind = 'central' | 'route'

export type StockMovementType =
  | 'intake' // ingreso a almacen central
  | 'dispatch' // salida a ruta
  | 'dispatch_addition' // aumento de carga sobre despacho abierto
  | 'sale' // venta (descuenta ruta o central)
  | 'courtesy' // salida de muestra comercial / atencion sin cobro
  | 'return' // retorno fisico de ruta a central
  | 'adjustment' // ajuste manual de almacen
  | 'shortage' // faltante detectado en conciliacion
  | 'overage' // sobrante detectado en conciliacion

export interface DistBaseDoc {
  pendingConfirmation?: boolean
  id: string
  tenantId: string
  branchId: string
  createdAt: string
  createdBy: string
  /** Clave de dia local YYYY-MM-DD, usada para consultas por rango */
  dayKey: string
  schemaVersion: number
}

export interface DistProduct {
  deleted?: boolean
  deletedAt?: string
  deletedBy?: string
  id: string
  name: string
  /** Fotografía optimizada opcional para catálogo y selección operativa. */
  photoDataUrl?: string
  /** Presentacion o categoria comercial: "Al vacio", "Granel", ... */
  category: string
  presentation?: string
  unitType: UnitType
  productionCost?: number
  minimumStock?: number
  referencePrice: number
  /** Peso aproximado por paquete/unidad. NO se usa para convertir reportes. */
  approximateWeightKg?: number
  active: boolean
  sortOrder: number
  tenantId: string
  createdAt: string
  updatedAt?: string
}

export interface DistRoute {
  id: string
  name: string
  /** 'route' = ruta de distribuidor, 'direct' = venta directa / impulsacion */
  kind: 'route' | 'direct'
  active: boolean
  tenantId: string
  createdAt: string
}

export interface DistCustomer {
  photoDataUrl?: string
  addressReference?: string
  customerCode?: string
  identityNumber?: string
  id: string
  name: string
  phone?: string
  address?: string
  routeId?: string
  notes?: string
  active: boolean
  tenantId: string
  createdAt: string
  createdBy: string
  updatedAt?: string
}

/** Saldo cacheado por ubicacion. Se mantiene con increment() atomico. */
export interface DistBalance {
  availableQuantity?: number
  warehouseId?: string
  id: string
  locationKind: StockLocationKind
  /** routeId cuando locationKind === 'route' */
  routeId?: string
  productId: string
  productName: string
  unitType: UnitType
  quantity: number
  tenantId: string
  updatedAt: string
}

/** Ledger auditable e inmutable. El id es el operationId (idempotencia). */
export interface DistStockMovement extends DistBaseDoc {
  responsibleName?: string
  responsibleRole?: 'admin' | 'warehouse' | 'distributor'
  lotCode?: string
  lossCost?: number | null
  type: StockMovementType
  productId: string
  productName: string
  unitType: UnitType
  /** Cantidad positiva siempre; el signo lo dan centralDelta / routeDelta */
  quantity: number
  centralDelta: number
  routeDelta: number
  fromLocation?: string
  toLocation?: string
  routeId?: string
  lotId?: string
  /** Documento que origino el movimiento (dispatchId, saleId, closureId) */
  refType?: 'dispatch' | 'sale' | 'closure' | 'manual'
  refId?: string
  note?: string
}

export interface DistDispatchLine {
  productId: string
  productName: string
  unitType: UnitType
  quantity: number
  normalQuantity?: number
  dispatchMerma?: number
  physicalQuantity?: number
  allocationsRequested?: { lotId: string; quantity: number }[]
  allocations?: { lotId: string; lotCode: string; expiresOn: string; quantity: number; productionCost: number | null }[]
  dispatchMermaAllocations?: { lotId: string; lotCode: string; expiresOn: string; quantity: number; productionCost: number | null }[]
  lotCode?: string
  manufacturedOn?: string
  expiresOn?: string
  lotId?: string
}

export interface DistDispatchAddition {
  id: string
  quantityByProduct: DistDispatchLine[]
  createdAt: string
  createdBy: string
  createdByName: string
  note?: string
}

export type DispatchStatus = 'open' | 'closed'

export interface DistDispatch extends DistBaseDoc {
  warehouseId?: string
  routeId: string
  routeName: string
  distributorUid: string
  distributorName: string
  status: DispatchStatus
  lines: DistDispatchLine[]
  additions: DistDispatchAddition[]
  observation?: string
  closedAt?: string
  closureId?: string
}

export interface DistSaleLine {
  costTotal?: number | null
  allocations?: { lotId: string; lotCode: string; expiresOn: string; quantity: number; productionCost: number | null }[]
  productId: string
  productNameSnapshot: string
  quantity: number
  unitType: UnitType
  /** Precio realmente aplicado, congelado historicamente */
  actualUnitPrice: number
  subtotal: number
  referenceUnitPriceSnapshot?: number
  referenceSubtotal?: number
}

export interface DistSale extends DistBaseDoc {
  pendingConfirmation?: boolean
  customerCode?: string
  /** Igual a id. Explicito para trazabilidad de operaciones offline. */
  operationId: string
  sourceLocation: SourceLocation
  routeId: string
  routeName: string
  sellerUid: string
  sellerName: string
  dispatchId?: string
  customerId?: string
  customerName?: string
  lines: DistSaleLine[]
  total: number
  paymentKind: PaymentKind
  cashAmount: number
  qrAmount: number
  creditAmount: number
  note?: string
  saleKind?: 'normal' | 'courtesy'
  courtesyReason?: string
  courtesyReferenceValue?: number
  courtesyCostTotal?: number | null
  creditOverrideId?: string
  creditOverrideReason?: string
  creditOverrideValidUntil?: string
}

export type ReceivableStatus = 'OPEN' | 'PARTIAL' | 'PAID'

export interface DistReceivable extends DistBaseDoc {
  creditedAmount?: number
  saleLines?: DistSaleLine[]
  customerCode?: string
  saleId: string
  customerId: string
  customerName: string
  routeId: string
  distributorUid: string
  distributorName: string
  originalAmount: number
  paidAmount: number
  balance: number
  status: ReceivableStatus
  note?: string
}

export interface DistCollectionAllocation {
  receivableId: string
  saleId?: string
  originRouteId?: string
  balanceBefore?: number
  appliedAmount: number
  balanceAfter?: number
}

export interface DistCollection extends DistBaseDoc {
  collectionOrigin?: 'route' | 'administration'
  saleLines?: DistSaleLine[]
  customerCode?: string
  operationId: string
  receivableId?: string
  allocations?: DistCollectionAllocation[]
  portfolioBalanceBefore?: number
  portfolioBalanceAfter?: number
  customerId: string
  customerName: string
  routeId: string
  originRouteId?: string
  collectedByUid: string
  collectedByName: string
  amount: number
  method: 'cash' | 'qr' | 'mixed'
  cashAmount?: number
  qrAmount?: number
  note?: string
}

export interface DistExpense extends DistBaseDoc {
  expenseOrigin?: 'route' | 'administration'
  voided?: boolean
  voidedAt?: string
  voidedBy?: string
  voidedByName?: string
  operationId: string
  concept: string
  amount: number
  routeId: string
  routeName: string
  registeredByUid: string
  registeredByName: string
  note?: string
}

export interface DistPhysicalReturnBreakdown {
  productId?: string
  normalReturn: number
  recoverableMerma: number
  nonSellableReturn: number
  nonSellableReason?: string
  totalPhysicalReturn?: number
}

export interface DistClosureProductRow {
  productId: string
  productName: string
  unitType: UnitType
  initialDispatch: number
  additions: number
  totalLoaded: number
  sold: number
  expectedReturn: number
  actualReturn: number
  variance: number

  initialNormalDispatch?: number
  initialDispatchMerma?: number
  initialPhysicalDispatch?: number
  additionsNormal?: number
  additionsMerma?: number
  additionsPhysical?: number
  totalLoadedPhysical?: number
  declared?: {
    normal: number
    recoverableMerma: number
    nonSellable: number
    nonSellableReason?: string
    totalPhysical: number
  }
  warehouse?: {
    normal: number
    recoverableMerma: number
    nonSellable: number
    nonSellableReason?: string
    totalPhysical: number
  }
  returnMerma?: number
  returnWaste?: number
  returnWasteReason?: string
  shortage?: number
  overage?: number
  declarationVariance?: number
  lossCost?: number | null
}

export type ClosureStatus = 'draft' | 'warehouse_done' | 'closed' | 'reopened'

export interface DistClosure extends DistBaseDoc {
  closeType?: 'route' | 'administrative'
  responsibleUid?: string
  responsibleName?: string
  creditSales?: number
  expensesTotal?: number
  totalSales?: number
  totalCollections?: number
  salesCount?: number
  collectionsCount?: number
  expensesCount?: number
  claimsCount?: number
  claimCashIn?: number
  claimCashOut?: number
  claimQrIn?: number
  claimQrOut?: number
  declaredCash?: number
  warehouseId?: string
  declaredReturns?: Record<string, number>
  declaredReturnMermas?: Record<string, number>
  declaredReturnNonSellables?: Record<string, number>
  declaredReturnNonSellableReasons?: Record<string, string>
  declaredBreakdown?: Record<string, DistPhysicalReturnBreakdown>
  warehouseBreakdown?: Record<string, DistPhysicalReturnBreakdown>
  reversedStockMovementIds?: string[]
  reopenHistory?: {
    reopenedAt: string
    reopenedBy: string
    reason: string
    preserveFinancialSnapshot?: boolean
    warehouseClosedBy?: string
    warehouseClosedAt?: string
    products?: DistClosureProductRow[]
  }[]
  warehouseReopenedAt?: string
  returnDeclaredBy?: string
  returnDeclaredAt?: string
  dispatchId: string
  routeId: string
  routeName: string
  distributorUid: string
  distributorName: string
  status: ClosureStatus
  products: DistClosureProductRow[]
  cashSales: number
  qrSales: number
  creditGenerated: number
  cashCollections: number
  qrCollections: number
  cashExpenses: number
  expectedCash: number
  physicalCashDeclared: number
  cashDifference: number
  warehouseClosedBy?: string
  warehouseClosedAt?: string
  closedBy?: string
  closedAt?: string
  reopenedBy?: string
  reopenedAt?: string
  note?: string
}

export interface DistWarehouse {
  id: string
  name: string
  active: boolean
  tenantId: string
}

export interface DistQrVerification {
  id: string
  tenantId: string
  routeId: string
  sourceType: 'sale' | 'collection' | 'claim'
  sourceId: string
  amount: number
  verifiedBy: string
  verifiedAt: string
  reference: string
}

export interface DistLot {
 id: string; tenantId: string; productId: string; productName: string; unitType: UnitType;
 lotCode: string; manufacturedOn: string; expiresOn: string; productionCost: number | null;
 quantities: Record<string, number>; quarantined?: boolean; legacy?: boolean; createdAt: string; createdBy: string;
}
export interface DistTransfer { id: string; fromWarehouseId: string; toWarehouseId: string; line: DistDispatchLine; createdAt: string; createdBy: string; responsibleName?: string; note?: string }
export interface DistClaim { id: string; kind: 'exchange'|'return'; saleId: string; customerId: string; customerName: string; productId: string; productName: string; quantity: number; unitType: UnitType; reason: string; routeId: string; createdAt: string; dayKey: string; revenueDelta: number; additionalCost: number | null; debtReduction: number; cashIn: number; cashOut: number; qrIn: number; qrOut: number; method?: 'cash' | 'qr' | 'none'; replacement: {productId: string;productName:string;quantity:number;unitType:UnitType;total:number} | null }
export interface DistCreditStatus {
  id: string
  oldestPendingAt: string | null
  overduePendingAt?: string | null
  creditBlockDays?: number
  blocked?: boolean
  activeOverrideId?: string | null
  overrideValidUntil?: string | null
  overrideReason?: string | null
  checkedAt: string
}

export interface DistCreditOverride extends DistBaseDoc {
  customerId: string
  customerName?: string
  reason: string
  validFrom?: string
  validUntil: string
  createdByName?: string
  revokedAt?: string
  revokedBy?: string
  revokedByName?: string
  active: boolean
}
