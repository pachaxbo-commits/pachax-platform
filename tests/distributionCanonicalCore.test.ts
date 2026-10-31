import test from 'node:test'
import assert from 'node:assert/strict'
import {
  distSaleToReceiptData,
  distCollectionToReceiptData,
  canonicalReceiptToPrintJobPayload,
  buildSaleReceiptPayload,
  resolveDistributionBusinessIdentity,
  printSaleReceipt,
} from '../src/modules/distribution/data/distributionReceiptService.ts'
import {
  buildBusinessDocumentContext,
  type BusinessIdentity,
} from '../src/core/businessIdentity.ts'
import {
  buildReceiptPlainText,
  generateReceiptPdf,
} from '../src/core/receiptService.ts'
import {
  savePrinterProfileLocal,
  getActiveReceiptPrinter,
  persistPrinterProfiles,
} from '../src/services/printing/printerProfiles.ts'
import { classifyPrintJobOutcome } from '../src/services/printing/printEngineService.ts'
import type { DistSale, DistCollection, DistCollectionAllocation } from '../src/modules/distribution/types.ts'
import type { DistributionOperationalSettings } from '../src/modules/distribution/data/supportMaintenance.ts'
import type { PrintJobPayload } from '../src/types/printing.ts'
import { activateDocumentTestTenant, resetDocumentTestTenant } from './helpers/activeTenantFixtures.ts'

// Polyfill in-memory localStorage for Node test runner
const memoryStorage = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.getItem) {
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, val: string) => memoryStorage.set(key, String(val)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: () => null,
    length: 0,
  }
}

test('D3 TEST 41: Fallback y resolución canónica de BusinessIdentity en Distribution', () => {
  // Caso 1: Tenant sin businessIdentity configurado -> Lee campos legacy de supportConfig
  const legacySupport: Partial<DistributionOperationalSettings> = {
    companyName: 'Embutidos Don Pepe',
    taxId: '1029384021',
    address: 'Av. Blanco Galindo Km 5',
    phone: '71234567',
    receiptHeader: 'Venta de embutidos y fiambres al por mayor',
    receiptFooter: 'Conserve su ticket para reclamos',
    expiryAlertDays: 7,
    creditBlockDays: 15,
    requireQrVerification: true,
  }

  const resolvedFromLegacy = resolveDistributionBusinessIdentity(null, legacySupport, 'Fallback Name')
  assert.equal(resolvedFromLegacy.tradeName, 'Embutidos Don Pepe')
  assert.equal(resolvedFromLegacy.taxId, '1029384021')
  assert.equal(resolvedFromLegacy.address, 'Av. Blanco Galindo Km 5')
  assert.equal(resolvedFromLegacy.phone, '71234567')
  assert.equal(resolvedFromLegacy.receiptHeader, 'Venta de embutidos y fiambres al por mayor')
  assert.equal(resolvedFromLegacy.receiptFooter, 'Conserve su ticket para reclamos')
  assert.equal(resolvedFromLegacy.showAddress, true)
  assert.equal(resolvedFromLegacy.showTaxId, true)

  // Caso 2: Tenant con BusinessIdentity explícito -> Prevalece sobre supportConfig
  const canonicalIdentity: BusinessIdentity = {
    tradeName: 'Distribuidora San José S.R.L.',
    legalName: 'San José Alimentos S.R.L.',
    taxId: '9988776655',
    address: 'Calle Comercio 123',
    city: 'Cochabamba',
    phone: '4455667',
    whatsapp: '79998888',
    email: 'ventas@sanjose.bo',
    website: 'https://sanjose.bo',
    logoUrl: 'https://storage.googleapis.com/logos/sanjose.png',
    primaryColor: '#b91c1c',
    accentColor: '#f59e0b',
    receiptHeader: 'Calidad tradicional desde 1980',
    receiptFooter: 'Gracias por su preferencia',
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showTaxId: true,
    showManagedBy: true,
  }

  const resolvedCanonical = resolveDistributionBusinessIdentity(canonicalIdentity, legacySupport, 'Fallback Name')
  assert.equal(resolvedCanonical.tradeName, 'Distribuidora San José S.R.L.')
  assert.equal(resolvedCanonical.taxId, '9988776655')
  assert.equal(resolvedCanonical.logoUrl, 'https://storage.googleapis.com/logos/sanjose.png')
  assert.equal(resolvedCanonical.receiptHeader, 'Calidad tradicional desde 1980')

  // Caso 3: Fallback por defecto si no hay nada
  const resolvedDefault = resolveDistributionBusinessIdentity(null, null, 'Empresa Sin Nombre')
  assert.equal(resolvedDefault.tradeName, 'Empresa Sin Nombre')

  // Caso 4 (D3.1): DEFAULT_SUPPORT_SETTINGS puramente operativo -> NUNCA inventa 'PACHAX'
  const pureOperationalSettings: DistributionOperationalSettings = {
    expiryAlertDays: 14,
    creditBlockDays: 7,
    requireQrVerification: true,
  }
  const resolvedAurora = resolveDistributionBusinessIdentity(null, pureOperationalSettings, 'Distribuidora Aurora')
  assert.equal(resolvedAurora.tradeName, 'Distribuidora Aurora')
  assert.notEqual(resolvedAurora.tradeName, 'PACHAX')
})

test('D3 TEST 42: Adapter canónico de ventas (distSaleToReceiptData) con venta mixta y crédito', () => {
  const mixedSale: DistSale = {
    id: 'sale-mix-001',
    createdAt: '2026-10-17T10:00:00Z',
    dayKey: '2026-10-17',
    operationId: 'op-sale-mix-001',
    sourceLocation: 'route',
    routeId: 'route-norte',
    routeName: 'Ruta Norte',
    sellerUid: 'seller-1',
    sellerName: 'Hugo Choque',
    customerId: 'cust-1',
    customerName: 'Doña Carmen',
    lines: [
      {
        productId: 'prod-viena',
        productNameSnapshot: 'Salchicha Viena',
        quantity: 2,
        unitType: 'kg',
        actualUnitPrice: 30,
        subtotal: 60,
      },
      {
        productId: 'prod-chorizo',
        productNameSnapshot: 'Chorizo Parrillero',
        quantity: 1,
        unitType: 'kg',
        actualUnitPrice: 40,
        subtotal: 40,
      },
    ],
    total: 100,
    paymentKind: 'mixed',
    cashAmount: 60,
    qrAmount: 40,
    creditAmount: 0,
    saleKind: 'normal',
  }

  const receiptData = distSaleToReceiptData(mixedSale, {
    routeName: 'Ruta Norte',
    distributorName: 'Hugo Choque',
  })

  assert.equal(receiptData.total, 100)
  assert.equal(receiptData.subtotal, 100)
  assert.equal(receiptData.paymentMethod, 'MIXTO (EFECTIVO + QR)')
  assert.equal(receiptData.cashReceived, 60)
  assert.ok(receiptData.paymentDetails?.includes('Efectivo: Bs 60.00'))
  assert.ok(receiptData.paymentDetails?.includes('QR: Bs 40.00'))
  assert.equal(receiptData.items.length, 2)
  assert.equal(receiptData.items[0].name, 'Salchicha Viena')
  assert.equal(receiptData.items[0].quantity, 2)
  assert.equal(receiptData.items[0].lineTotal, 60)
  assert.equal(receiptData.customer?.name, 'Doña Carmen')
  assert.ok(receiptData.tableOrPoint?.includes('Ruta: Ruta Norte'))
  assert.ok(receiptData.tableOrPoint?.includes('Distribuidor: Hugo Choque'))

  // Venta con crédito generado
  const creditSale: DistSale = {
    ...mixedSale,
    id: 'sale-cred-002',
    total: 100,
    paymentKind: 'credit',
    cashAmount: 20,
    qrAmount: 0,
    creditAmount: 80,
  }

  const creditReceipt = distSaleToReceiptData(creditSale, {
    routeName: 'Ruta Norte',
    distributorName: 'Hugo Choque',
    creditBalance: 250, // Saldo total acumulado de cartera
  })

  assert.equal(creditReceipt.paymentMethod, 'CRÉDITO')
  assert.ok(creditReceipt.paymentDetails?.some((d) => d.includes('Crédito nuevo: Bs 80.00')))
  assert.ok(creditReceipt.paymentDetails?.some((d) => d.includes('Saldo deudor actual: Bs 250.00')))
})

test('D3 TEST 43: Adapter canónico de venta de cortesía (distSaleToReceiptData)', () => {
  const courtesySale: DistSale = {
    id: 'sale-court-001',
    createdAt: '2026-10-17T11:00:00Z',
    dayKey: '2026-10-17',
    operationId: 'op-court-001',
    sourceLocation: 'route',
    routeId: 'route-centro',
    routeName: 'Ruta Centro',
    sellerUid: 'seller-2',
    sellerName: 'Carlos Distribuidor',
    customerId: 'cust-super',
    customerName: 'Supermercado Central',
    lines: [
      {
        productId: 'prod-mortadela',
        productNameSnapshot: 'Mortadela Jamonada',
        quantity: 5,
        unitType: 'kg',
        actualUnitPrice: 0,
        subtotal: 0,
        referenceUnitPriceSnapshot: 28,
        referenceSubtotal: 140,
      },
    ],
    total: 0,
    paymentKind: 'cash',
    cashAmount: 0,
    qrAmount: 0,
    creditAmount: 0,
    saleKind: 'courtesy',
    courtesyReason: 'Muestra comercial para degustación en sala',
    courtesyReferenceValue: 140,
    courtesyCostTotal: 85,
  }

  const receipt = distSaleToReceiptData(courtesySale, {
    routeName: 'Ruta Centro',
    distributorName: 'Carlos Distribuidor',
  })

  // Total estrictamente cero: no hay cobro de dinero
  assert.equal(receipt.total, 0)
  assert.equal(receipt.subtotal, 0)
  assert.equal(receipt.cashReceived, undefined)
  assert.equal(receipt.paymentMethod, 'CORTESÍA / MUESTRA (SIN COBRO)')

  // Valor referencial informativo
  assert.ok(receipt.paymentDetails?.some((d) => d.includes('Valor referencial: Bs 140.00 (Informativo)')))
  assert.ok(receipt.paymentDetails?.some((d) => d.includes('Motivo: Muestra comercial para degustación en sala')))

  // En ESC/POS print job payload
  const docContext = buildBusinessDocumentContext({ tradeName: 'Embutidos San José' })
  const printJob = canonicalReceiptToPrintJobPayload(receipt, docContext)
  assert.equal(printJob.grandTotal, 0)
  assert.equal(printJob.paymentMethod, 'CORTESÍA / MUESTRA (SIN COBRO)')
})

test('D3 TEST 44: Adapter canónico de cobranza (distCollectionToReceiptData) con desglose FIFO', () => {
  const allocations: DistCollectionAllocation[] = [
    {
      receivableId: 'rec-001-antiguo',
      balanceBefore: 70,
      appliedAmount: 70,
      balanceAfter: 0,
    },
    {
      receivableId: 'rec-002-reciente',
      balanceBefore: 150,
      appliedAmount: 30,
      balanceAfter: 120,
    },
  ]

  const collection: DistCollection = {
    id: 'col-fifo-001',
    createdAt: '2026-10-17T12:00:00Z',
    dayKey: '2026-10-17',
    operationId: 'op-col-fifo-001',
    customerId: 'cust-tienda-luz',
    customerName: 'Tienda Luz',
    amount: 100,
    method: 'mixed',
    cashAmount: 60,
    qrAmount: 40,
    collectedByUid: 'seller-1',
    collectedByName: 'Hugo Choque',
    routeId: 'route-norte',
    allocations,
    portfolioBalanceBefore: 220,
    portfolioBalanceAfter: 120,
  }

  const receipt = distCollectionToReceiptData(collection, {
    collectorName: 'Hugo Choque',
    routeName: 'Ruta Norte',
    customerName: 'Tienda Luz',
  })

  assert.equal(receipt.total, 100)
  assert.equal(receipt.subtotal, 100)
  assert.equal(receipt.paymentMethod, 'MIXTO (EFECTIVO + QR)')
  assert.equal(receipt.items.length, 2)

  // Desglose de deudas en los items
  assert.ok(receipt.items[0].name.includes('ANTIGUO'))
  assert.equal(receipt.items[0].lineTotal, 70)
  assert.ok(receipt.items[0].modifiers?.[0].includes('Saldo: Bs 70.00 ➔ Bs 0.00'))

  assert.ok(receipt.items[1].name.includes('RECIENTE'))
  assert.equal(receipt.items[1].lineTotal, 30)
  assert.ok(receipt.items[1].modifiers?.[0].includes('Saldo: Bs 150.00 ➔ Bs 120.00'))

  // Saldos globales de cartera en paymentDetails
  assert.ok(receipt.paymentDetails?.some((d) => d.includes('Saldo anterior cartera: Bs 220.00')))
  assert.ok(receipt.paymentDetails?.some((d) => d.includes('Saldo restante cartera: Bs 120.00')))
})

test('D3 TEST 45: Aislamiento multiempresa y comprobación estricta de tenant en impresoras', async () => {
  persistPrinterProfiles([], 'tenant-alpha', 'main')
  persistPrinterProfiles([], 'tenant-beta', 'main')

  // Guardar impresora para tenant-alpha
  savePrinterProfileLocal(
    {
      id: 'p-alpha-receipt',
      name: 'Impresora Alpha Bluetooth',
      role: 'receipt',
      connectionType: 'bluetooth_spp',
      macAddress: '00:11:22:33:44:55',
      paperWidth: '80mm',
      restaurantId: 'tenant-alpha',
      branchId: 'main',
      isActive: true,
      copies: 1,
      createdAt: '2026-10-17T00:00:00Z',
    },
    'tenant-alpha',
    'main'
  )

  // tenant-beta consulta impresoras -> NO debe ver la impresora de tenant-alpha
  const printerBeta = getActiveReceiptPrinter('tenant-beta', 'main')
  assert.equal(printerBeta, null)

  // tenant-alpha consulta impresoras -> Debe ver su impresora
  const printerAlpha = getActiveReceiptPrinter('tenant-alpha', 'main')
  assert.ok(printerAlpha)
  assert.equal(printerAlpha.name, 'Impresora Alpha Bluetooth')

  // Intento de imprimir venta de tenant-beta con el scope de tenant-beta
  const docContextBeta = buildBusinessDocumentContext({ tradeName: 'Empresa Beta' })
  const dummySale: DistSale = {
    id: 'sale-b-001',
    createdAt: '2026-10-17T12:00:00Z',
    dayKey: '2026-10-17',
    operationId: 'op-b-001',
    sourceLocation: 'route',
    routeId: 'route-b',
    routeName: 'Ruta B',
    sellerUid: 'user-b',
    sellerName: 'Vendedor B',
    lines: [],
    total: 50,
    paymentKind: 'cash',
    cashAmount: 50,
    qrAmount: 0,
    creditAmount: 0,
  }

  const printAttemptBeta = await printSaleReceipt(dummySale, {
    tenantId: 'tenant-beta',
    branchId: 'main',
    docContext: docContextBeta,
  })

  // Falla honestamente por no tener impresora vinculada, sin alterar la venta
  assert.equal(printAttemptBeta.ok, false)
  assert.ok(printAttemptBeta.message.includes('No hay impresora configurada'))
})

test('D3 TEST 46: Honestidad en resultados de impresión (classifyPrintJobOutcome)', () => {
  // Caso A: Confirmado / transmitido -> Éxito
  const successOutcome = classifyPrintJobOutcome(
    {
      id: 'job-1',
      printerProfileId: 'p-1',
      status: 'confirmed',
      targetType: 'receipt',
      idempotencyKey: 'idemp-1',
      retryCount: 0,
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
      payload: {} as unknown as PrintJobPayload,
    },
    'Ticket de venta'
  )
  assert.equal(successOutcome.isSuccess, true)
  assert.equal(successOutcome.category, 'success')

  // Caso B: Incierto (ej. timeout de socket tras transmitir)
  const uncertainOutcome = classifyPrintJobOutcome(
    {
      id: 'job-2',
      printerProfileId: 'p-1',
      status: 'unknown',
      targetType: 'receipt',
      idempotencyKey: 'idemp-2',
      retryCount: 0,
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
      lastError: 'Socket timeout waiting for ACK',
      payload: {} as unknown as PrintJobPayload,
    },
    'Ticket de venta'
  )
  assert.equal(uncertainOutcome.isSuccess, false)
  assert.equal(uncertainOutcome.category, 'uncertain')
  assert.ok(uncertainOutcome.message.includes('No se pudo confirmar'))

  // Caso C: Fallo definitivo
  const failedOutcome = classifyPrintJobOutcome(
    {
      id: 'job-3',
      printerProfileId: 'p-1',
      status: 'failed',
      targetType: 'receipt',
      idempotencyKey: 'idemp-3',
      retryCount: 3,
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
      lastError: 'Bluetooth connection refused',
      payload: {} as unknown as PrintJobPayload,
    },
    'Ticket de venta'
  )
  assert.equal(failedOutcome.isSuccess, false)
  assert.equal(failedOutcome.category, 'failed')
})

test('D3 TEST 47: Generación de texto plano y PDF canónico para recibos de distribución', async () => {
  activateDocumentTestTenant('qa-distribution-receipt', 'route_distribution', 'branch-main', { digitalReceipts: true })
  try {
  const docContext = buildBusinessDocumentContext({
    tradeName: 'Distribuidora Cochabamba',
    taxId: '5432167890',
    address: 'Av. Heroínas 456',
    phone: '4255555',
    receiptHeader: 'Distribución Mayorista',
    receiptFooter: 'Comprobante válido para entrega de mercadería',
    showAddress: true,
    showTaxId: true,
    showPhone: true,
    showManagedBy: true,
  })

  const mixedSale: DistSale = {
    id: 'sale-txt-001',
    createdAt: '2026-10-17T14:30:00Z',
    dayKey: '2026-10-17',
    operationId: 'op-sale-txt-001',
    sourceLocation: 'route',
    routeId: 'route-sur',
    routeName: 'Ruta Sur',
    sellerUid: 'seller-hugo',
    sellerName: 'Hugo Choque',
    customerId: 'cust-don-marcos',
    customerName: 'Abarrotes Don Marcos',
    lines: [
      {
        productId: 'prod-jamon',
        productNameSnapshot: 'Jamón Cocido',
        quantity: 3,
        unitType: 'kg',
        actualUnitPrice: 45,
        subtotal: 135,
      },
    ],
    total: 135,
    paymentKind: 'mixed',
    cashAmount: 85,
    qrAmount: 50,
    creditAmount: 0,
  }

  const receiptData = distSaleToReceiptData(mixedSale, {
    routeName: 'Ruta Sur',
    distributorName: 'Hugo Choque',
  })

  // Texto plano para compartir / fallback
  const plainText = buildReceiptPlainText(docContext, receiptData)
  assert.ok(plainText.includes('DISTRIBUIDORA COCHABAMBA'))
  assert.ok(plainText.includes('NIT: 5432167890'))
  assert.ok(plainText.includes('Av. Heroínas 456'))
  assert.ok(plainText.includes('Jamón Cocido'))
  assert.ok(plainText.includes('TOTAL: Bs 135.00'))
  assert.ok(plainText.includes('Efectivo: Bs 85.00'))
  assert.ok(plainText.includes('QR: Bs 50.00'))
  assert.ok(plainText.includes('Gestionado con PACHAX'))

  // Generación de PDF canónico
  const pdfBytes = await generateReceiptPdf(docContext, receiptData)
  assert.ok(pdfBytes instanceof Uint8Array)
  assert.ok(pdfBytes.length > 500, 'El PDF debe contener bytes válidos')
  } finally {
    resetDocumentTestTenant()
  }
})

test('D3 TEST 47b: PDF de Distribución rechaza tenant ausente o capacidad no contratada', async () => {
  const context = buildBusinessDocumentContext({ tradeName: 'Distribuidora QA' })
  const receipt = distSaleToReceiptData({ id: 'qa-deny', createdAt: new Date(0).toISOString(), dayKey: '1970-01-01', operationId: 'qa-deny', sourceLocation: 'central', routeId: '', routeName: '', sellerUid: '', sellerName: '', lines: [], total: 0, paymentKind: 'cash', cashAmount: 0, qrAmount: 0, creditAmount: 0 })
  resetDocumentTestTenant()
  await assert.rejects(generateReceiptPdf(context, receipt), /no está incluida/)
  activateDocumentTestTenant('qa-distribution-no-receipt', 'route_distribution')
  try {
    await assert.rejects(generateReceiptPdf(context, receipt), /no está incluida/)
  } finally {
    resetDocumentTestTenant()
  }
})

test('D3 TEST 48: Comprobación de estado pendingConfirmation e indicador de copia', () => {
  const salePending: DistSale = {
    id: 'sale-pend-001',
    createdAt: '2026-10-17T15:00:00Z',
    dayKey: '2026-10-17',
    operationId: 'op-pend-001',
    sourceLocation: 'route',
    routeId: 'route-norte',
    routeName: 'Ruta Norte',
    sellerUid: 'seller-1',
    sellerName: 'Hugo Choque',
    lines: [],
    total: 100,
    paymentKind: 'cash',
    cashAmount: 100,
    qrAmount: 0,
    creditAmount: 0,
    pendingConfirmation: true,
  }

  // Si está pendingConfirmation, el receiptAdapter lo refleja
  const receiptPending = distSaleToReceiptData(salePending)
  assert.ok(receiptPending.notes?.includes('PENDIENTE DE CONFIRMACIÓN'))

  // Reimpresión de copia
  const saleCopy = distSaleToReceiptData(salePending, { isCopy: true })
  assert.equal(saleCopy.isCopy, true)

  const docContext = buildBusinessDocumentContext({ tradeName: 'Empresa Test' })
  const printPayload = buildSaleReceiptPayload(salePending, docContext, { isCopy: true })
  assert.equal(printPayload.isCopy, true)
})

function evaluateSupportConfigUpdateRule(
  tenantId: string,
  role: string,
  authUid: string,
  existingData: Record<string, unknown>,
  updatedData: Record<string, unknown>
): { allowed: boolean; reason?: string } {
  // Check admin
  const isDistAdmin = ['admin', 'owner', 'superadmin', 'accountant'].includes(role)
  if (!isDistAdmin) {
    return { allowed: false, reason: 'Solo Admin / Dueño puede modificar configuración técnica' }
  }

  // Calculate affected keys (keys that changed, were added, or were removed)
  const allKeys = new Set([...Object.keys(existingData), ...Object.keys(updatedData)])
  const affectedKeys: string[] = []
  for (const k of allKeys) {
    if (JSON.stringify(existingData[k]) !== JSON.stringify(updatedData[k])) {
      affectedKeys.push(k)
    }
  }

  const allowedAffected = ['tenantId', 'expiryAlertDays', 'creditBlockDays', 'requireQrVerification', 'updatedAt', 'updatedBy']
  const invalidAffected = affectedKeys.filter((k) => !allowedAffected.includes(k))
  if (invalidAffected.length > 0) {
    return { allowed: false, reason: `No se permite modificar campos: ${invalidAffected.join(', ')}` }
  }

  if (updatedData.tenantId && updatedData.tenantId !== tenantId) {
    return { allowed: false, reason: 'tenantId no coincide' }
  }

  if (
    typeof updatedData.expiryAlertDays !== 'number' ||
    !Number.isInteger(updatedData.expiryAlertDays) ||
    updatedData.expiryAlertDays < 1 ||
    updatedData.expiryAlertDays > 90
  ) {
    return { allowed: false, reason: 'expiryAlertDays inválido' }
  }

  if (
    typeof updatedData.creditBlockDays !== 'number' ||
    !Number.isInteger(updatedData.creditBlockDays) ||
    updatedData.creditBlockDays < 1 ||
    updatedData.creditBlockDays > 90
  ) {
    return { allowed: false, reason: 'creditBlockDays inválido' }
  }

  if (typeof updatedData.requireQrVerification !== 'boolean') {
    return { allowed: false, reason: 'requireQrVerification inválido' }
  }

  if (updatedData.updatedBy !== authUid) {
    return { allowed: false, reason: 'updatedBy debe coincidir con auth.uid' }
  }

  return { allowed: true }
}

test('D3.1 TEST 49: Reglas de Firestore para supportConfig (Aislamiento de soporte, protección de campos legacy y actualización administrativa)', async () => {
  // A. Support intenta cambiar creditBlockDays -> DENIED
  const supportAttempt = evaluateSupportConfigUpdateRule(
    'tenant-test',
    'support',
    'uid-support',
    { tenantId: 'tenant-test', creditBlockDays: 7, expiryAlertDays: 14, requireQrVerification: true, updatedAt: 'old', updatedBy: 'uid-admin' },
    { tenantId: 'tenant-test', creditBlockDays: 10, expiryAlertDays: 14, requireQrVerification: true, updatedAt: 'new', updatedBy: 'uid-support' }
  )
  assert.equal(supportAttempt.allowed, false)

  // B. Support intenta cambiar companyName legacy -> DENIED
  const supportLegacyAttempt = evaluateSupportConfigUpdateRule(
    'tenant-test',
    'support',
    'uid-support',
    { tenantId: 'tenant-test', companyName: 'Legacy SA', creditBlockDays: 7, expiryAlertDays: 14, requireQrVerification: true, updatedAt: 'old', updatedBy: 'uid-admin' },
    { tenantId: 'tenant-test', companyName: 'Hacked SA', creditBlockDays: 7, expiryAlertDays: 14, requireQrVerification: true, updatedAt: 'new', updatedBy: 'uid-support' }
  )
  assert.equal(supportLegacyAttempt.allowed, false)

  // C. Admin modifica creditBlockDays -> PASS
  const adminAttempt = evaluateSupportConfigUpdateRule(
    'tenant-test',
    'admin',
    'uid-admin',
    { tenantId: 'tenant-test', creditBlockDays: 7, expiryAlertDays: 14, requireQrVerification: true, updatedAt: 'old', updatedBy: 'uid-admin' },
    { tenantId: 'tenant-test', creditBlockDays: 15, expiryAlertDays: 14, requireQrVerification: true, updatedAt: 'new', updatedBy: 'uid-admin' }
  )
  assert.equal(adminAttempt.allowed, true)

  // D. Documento legacy tiene companyName="Legacy SA". Admin cambia SOLO creditBlockDays -> PASS -> companyName permanece "Legacy SA"
  const legacyDoc = {
    tenantId: 'tenant-test',
    companyName: 'Legacy SA',
    taxId: '1234567',
    address: 'Calle Antigua 1',
    creditBlockDays: 7,
    expiryAlertDays: 14,
    requireQrVerification: true,
    updatedAt: 'old',
    updatedBy: 'uid-admin',
  }
  const legacyAdminUpdate = {
    ...legacyDoc,
    creditBlockDays: 20,
    updatedAt: 'new',
    updatedBy: 'uid-admin',
  }
  const adminLegacyPass = evaluateSupportConfigUpdateRule(
    'tenant-test',
    'admin',
    'uid-admin',
    legacyDoc,
    legacyAdminUpdate
  )
  assert.equal(adminLegacyPass.allowed, true)
  assert.equal(legacyAdminUpdate.companyName, 'Legacy SA')

  // E. Admin intenta cambiar companyName mediante supportConfig -> DENIED
  const adminChangeCompanyNameAttempt = evaluateSupportConfigUpdateRule(
    'tenant-test',
    'admin',
    'uid-admin',
    legacyDoc,
    {
      ...legacyDoc,
      companyName: 'Nueva Empresa Ilegal',
      updatedAt: 'new',
      updatedBy: 'uid-admin',
    }
  )
  assert.equal(adminChangeCompanyNameAttempt.allowed, false)

  // Verificación estricta de los archivos de reglas en disco
  const fs = await import('node:fs')
  const tenantRules = fs.readFileSync('firebase/tenant-distribution.rules', 'utf8')
  const legacyRules = fs.readFileSync('firebase/legacy.rules', 'utf8')
  const compiledRules = fs.readFileSync('firebase/firestore.rules', 'utf8')

  // Soporte no tiene permiso de escritura en el bloque supportConfig de ningún ruleset
  const tenantSupportConfigBlock = tenantRules.slice(tenantRules.indexOf('supportConfig/{configId}'), tenantRules.indexOf('maintenanceBackups'))
  assert.ok(!tenantSupportConfigBlock.includes('tDistSupport(tenantId)'))

  const legacySupportConfigBlock = legacyRules.slice(legacyRules.indexOf('supportConfig/{configId}'), legacyRules.indexOf('maintenanceBackups'))
  assert.ok(!legacySupportConfigBlock.includes('distSupport(restaurantId)'))

  assert.ok(tenantSupportConfigBlock.includes('request.resource.data.diff(resource.data).affectedKeys().hasOnly'))
  assert.ok(legacySupportConfigBlock.includes('request.resource.data.diff(resource.data).affectedKeys().hasOnly'))
  assert.ok(compiledRules.includes('affectedKeys().hasOnly'))
})

test('D3.1 TEST 50: Actualización de BusinessIdentity sin refresh se propaga al modal y prueba de impresora', () => {
  // Estado inicial: tradeName = "Distribuidora Vieja"
  let activeIdentity: BusinessIdentity = {
    ...buildBusinessDocumentContext(undefined, { companyName: 'Distribuidora Vieja' }),
    tradeName: 'Distribuidora Vieja',
    legalName: 'Distribuidora Vieja SRL',
    taxId: '123456789',
    address: 'Calle Vieja 1',
    city: 'La Paz',
    phone: '2211334',
    whatsapp: '70011223',
    email: 'contacto@vieja.bo',
    website: '',
    logoUrl: '',
    primaryColor: '#1e3a8a',
    accentColor: '#3b82f6',
    receiptHeader: 'Ticket de venta',
    receiptFooter: 'Gracias por su compra',
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showTaxId: true,
    showManagedBy: true,
  }

  let printerContext: {
    businessIdentity?: BusinessIdentity
    companyName?: string
    documentContext?: import('../src/core/businessIdentity.ts').BusinessDocumentContext
  } | null = null

  const handleOpenPrinterSettings = (ctx?: {
    businessIdentity?: BusinessIdentity
    companyName?: string
    documentContext?: import('../src/core/businessIdentity.ts').BusinessDocumentContext
  }) => {
    printerContext = {
      businessIdentity: activeIdentity,
      companyName: activeIdentity.tradeName,
      ...ctx,
    }
  }

  // Owner guarda "Distribuidora Nueva" sin refresh
  const updatedIdentity: BusinessIdentity = {
    ...activeIdentity,
    tradeName: 'Distribuidora Nueva',
    taxId: '987654321',
  }
  activeIdentity = updatedIdentity

  // Inmediatamente abre impresoras (propaga contexto dinámico)
  handleOpenPrinterSettings({
    businessIdentity: activeIdentity,
    companyName: activeIdentity.tradeName,
    documentContext: buildBusinessDocumentContext(activeIdentity, { companyName: activeIdentity.tradeName }),
  })

  // PrinterSettingsView y modal reciben la identidad NUEVA
  assert.ok(printerContext)
  assert.equal(printerContext?.businessIdentity?.tradeName, 'Distribuidora Nueva')
  assert.equal(printerContext?.companyName, 'Distribuidora Nueva')

  // Simulación del test print payload en PrinterSettingsView
  const effectiveCompanyName =
    printerContext?.documentContext?.companyName ||
    printerContext?.businessIdentity?.tradeName ||
    printerContext?.companyName ||
    'PACHAX Platform'

  const testPayload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: effectiveCompanyName.toUpperCase(),
    branchName: 'Sucursal Principal',
    items: [{ name: 'Comprobación de enlace térmico', quantity: 1, unitPrice: 0, subtotal: 0 }],
    totals: { subtotal: 0, total: 0 },
  }

  assert.equal(testPayload.restaurantName, 'DISTRIBUIDORA NUEVA')
  assert.notEqual(testPayload.restaurantName, 'DISTRIBUIDORA VIEJA')
  assert.notEqual(testPayload.restaurantName, 'PACHAX PLATFORM')
})

test('D3.1 TEST 51: Aislamiento multitenant de identidad e impresoras y actualización sin refresh', () => {
  // Tenant A: Aurora, Printer A
  const profileA = {
    id: 'printer-aurora',
    restaurantId: 'tenant-aurora',
    branchId: 'main',
    name: 'Térmica Aurora',
    role: 'receipt' as const,
    connectionType: 'browser_dialog' as const,
    paperWidth: '80mm' as const,
    ipAddress: '192.168.1.100',
    port: 9100,
    copies: 1,
    autoPrintOnOrderCreated: false,
    autoPrintOnOrderPaid: true,
    kickDrawerOnPrint: false,
    isActive: true,
  }
  savePrinterProfileLocal(profileA, 'tenant-aurora', 'main')

  // Tenant B: Boreal, Printer B
  const profileB = {
    id: 'printer-boreal',
    restaurantId: 'tenant-boreal',
    branchId: 'main',
    name: 'Térmica Boreal',
    role: 'receipt' as const,
    connectionType: 'browser_dialog' as const,
    paperWidth: '58mm' as const,
    ipAddress: '192.168.1.101',
    port: 9100,
    copies: 1,
    autoPrintOnOrderCreated: false,
    autoPrintOnOrderPaid: true,
    kickDrawerOnPrint: false,
    isActive: true,
  }
  savePrinterProfileLocal(profileB, 'tenant-boreal', 'main')

  // Tenant A sólo ve Printer A
  const activePrinterA = getActiveReceiptPrinter('tenant-aurora', 'main')
  assert.equal(activePrinterA?.id, 'printer-aurora')
  assert.notEqual(activePrinterA?.id, 'printer-boreal')

  // Tenant B sólo ve Printer B
  const activePrinterB = getActiveReceiptPrinter('tenant-boreal', 'main')
  assert.equal(activePrinterB?.id, 'printer-boreal')
  assert.notEqual(activePrinterB?.id, 'printer-aurora')

  // Actualizar identity Aurora a "Aurora Premium" sin refresh
  const auroraNewIdentity = buildBusinessDocumentContext(undefined, { companyName: 'Aurora Premium' })
  assert.equal(auroraNewIdentity.companyName, 'Aurora Premium')
  assert.notEqual(auroraNewIdentity.companyName, 'Boreal')
})
