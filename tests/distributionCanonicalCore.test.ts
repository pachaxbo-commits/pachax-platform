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
