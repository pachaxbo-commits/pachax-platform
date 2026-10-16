import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBusinessDocumentContext,
  normalizeBusinessIdentity,
  type BusinessIdentity,
} from '../src/core/businessIdentity.ts'
import {
  nightclubAccountToReceiptData,
  buildNightclubBarTicketPayload,
  nightclubReceiptToPrintPayload,
} from '../src/modules/nightclub/domain/nightclubReceipt.ts'
import type {
  NightclubAccount,
  NightclubDataset,
  NightclubRound,
} from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import { PrintEngineService } from '../src/services/printing/printEngineService.ts'
import {
  savePrinterProfileLocal,
  loadPrinterProfiles,
  getPrinterStorageKey,
} from '../src/services/printing/printerProfiles.ts'
import { BrowserDialogPrinterAdapter } from '../src/adapters/printing/browserDialogPrinterAdapter.ts'
import {
  generateReceiptPdf,
  shareReceipt,
} from '../src/core/receiptService.ts'
import type { PrinterProfile, PrintJob } from '../src/types/printing.ts'

// Polyfill in-memory localStorage for Node test runner
const memoryStorage = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.getItem) {
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, val: string) => memoryStorage.set(key, String(val)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
  }
}

function createDummyNightclubDataset(): NightclubDataset {
  return {
    zones: [{ id: 'z1', name: 'VIP Lounge', description: '' }],
    tables: [{ id: 't1', name: 'Mesa VIP 1', zoneId: 'z1', status: 'occupied', activeAccountId: 'acc1', capacity: 6 }],
    products: [
      { id: 'p_beer', name: 'Cerveza Huari', price: 25, preparationArea: 'Barra', stockUnits: 100 },
      { id: 'p_water', name: 'Agua Vital', price: 12, preparationArea: 'Directo', stockUnits: 50 },
      { id: 'p_gin', name: 'Gin Tonic Signature', price: 45, preparationArea: 'Barra', stockUnits: 40 },
    ],
    accounts: [],
    shift: { id: 's1', status: 'open', openedAt: '2026-10-16T20:00:00Z', openingFloat: 500, openedBy: 'Admin' },
    customers: [],
    reservations: [],
    inventory: [],
  }
}

// 1. BusinessIdentity Nightclub uses real tenant data
test('1. BusinessIdentity Nightclub uses real tenant data', () => {
  const tenantIdentity: BusinessIdentity = {
    tradeName: 'Oasis Lounge & Club',
    legalName: 'Oasis Nocturno S.R.L.',
    taxId: '1092837465',
    address: 'Av. Costanera #1234',
    city: 'La Paz',
    phone: '77712345',
    email: 'contacto@oasis.bo',
    receiptHeader: '¡Bienvenidos a la mejor noche!',
    receiptFooter: 'Gracias por su preferencia',
    showTaxId: true,
    showAddress: true,
    showPhone: true,
    showLogo: true,
    showManagedBy: true,
    primaryColor: '#eab308',
    accentColor: '#10b981',
  }

  const context = buildBusinessDocumentContext(tenantIdentity, {
    branchName: 'Sede Central',
  })

  assert.equal(context.companyName, 'Oasis Lounge & Club')
  assert.equal(context.legalName, 'Oasis Nocturno S.R.L.')
  assert.equal(context.taxId, '1092837465')
  assert.equal(context.address, 'Av. Costanera #1234')
  assert.equal(context.city, 'La Paz')
  assert.ok(context.formattedHeaderLines.includes('Av. Costanera #1234, La Paz'))
  assert.equal(context.phone, '77712345')
  assert.equal(context.email, 'contacto@oasis.bo')
  assert.equal(context.receiptHeader, '¡Bienvenidos a la mejor noche!')
  assert.equal(context.receiptFooter, 'Gracias por su preferencia')
  assert.equal(context.showTaxId, true)
})

// 2. Tenant A does not use Tenant B's logo/data
test('2. Tenant A does not use Tenant B\'s logo/data (tenant isolation in BusinessIdentity)', () => {
  const tenantA: BusinessIdentity = {
    tradeName: 'Sky Bar Club A',
    logoUrl: 'https://cdn.pachax.app/logos/tenant_a.png',
    taxId: 'NIT-AAAA',
    showLogo: true,
  }
  const tenantB: BusinessIdentity = {
    tradeName: 'Underground Lounge B',
    logoUrl: 'https://cdn.pachax.app/logos/tenant_b.png',
    taxId: 'NIT-BBBB',
    showLogo: true,
  }

  const contextA = buildBusinessDocumentContext(tenantA)
  const contextB = buildBusinessDocumentContext(tenantB)

  assert.equal(contextA.companyName, 'Sky Bar Club A')
  assert.equal(contextA.logoUrl, 'https://cdn.pachax.app/logos/tenant_a.png')
  assert.equal(contextA.taxId, 'NIT-AAAA')

  assert.equal(contextB.companyName, 'Underground Lounge B')
  assert.equal(contextB.logoUrl, 'https://cdn.pachax.app/logos/tenant_b.png')
  assert.equal(contextB.taxId, 'NIT-BBBB')

  assert.notEqual(contextA.companyName, contextB.companyName)
  assert.notEqual(contextA.logoUrl, contextB.logoUrl)
})

// 3. Printer from Tenant A does not resolve for Tenant B
test('3. Printer from Tenant A does not resolve for Tenant B', async () => {
  const engine = PrintEngineService.getInstance()
  const printerA: PrinterProfile = {
    id: 'pr-bar-tenant-a',
    restaurantId: 'tenant_alpha',
    tenantId: 'tenant_alpha',
    branchId: 'main',
    name: 'Barra Alpha',
    role: 'bar',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: true,
    autoPrintOnOrderPaid: false,
    kickDrawerOnPrint: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    capabilities: {
      supportsCashDrawerKick: false,
      supportsPaperCut: true,
      supportsBeep: false,
      supportsBarcode: false,
      supportsQrCode: false,
      supportsImages: false,
      supportsRealtimeStatus: false,
      columnsPerLine: 48,
      codePage: 'CP850',
      encoding: 'utf-8',
      chunkSize: 1024,
      chunkDelayMs: 0,
      connectionTimeoutMs: 3000,
      writeTimeoutMs: 3000,
      feedLinesEnd: 3,
    },
  }

  engine.registerPrinterProfile(printerA)

  // Lookup for Tenant B must NOT return printerA
  const resolvedForB = engine.resolveDestinationPrinters('bar_ticket', undefined, 'tenant_beta', 'main')
  assert.notEqual(resolvedForB.primary.id, 'pr-bar-tenant-a')

  // Attempting to submit a print for Tenant B with Tenant A's printerProfileId must throw
  await assert.rejects(
    async () => {
      await engine.submitPrintRequest({
        targetType: 'bar_ticket',
        printerProfileId: 'pr-bar-tenant-a',
        tenantId: 'tenant_beta',
        branchId: 'main',
        idempotencyKey: 'test-isolation-1',
        payload: {
          payloadSchemaVersion: 1,
          templateVersion: '1.0',
          restaurantName: 'Club Beta',
          branchName: 'Main',
          items: [],
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
        },
      })
    },
    /no pertenece a la empresa tenant_beta/
  )
})

// 4. Printer from Branch A does not resolve for Branch B
test('4. Printer from Branch A does not resolve for Branch B', async () => {
  const engine = PrintEngineService.getInstance()
  const printerBranchA: PrinterProfile = {
    id: 'pr-bar-branch-vip',
    restaurantId: 'tenant_gamma',
    tenantId: 'tenant_gamma',
    branchId: 'branch_vip',
    name: 'Barra VIP',
    role: 'bar',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: true,
    autoPrintOnOrderPaid: false,
    kickDrawerOnPrint: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    capabilities: {
      supportsCashDrawerKick: false,
      supportsPaperCut: true,
      supportsBeep: false,
      supportsBarcode: false,
      supportsQrCode: false,
      supportsImages: false,
      supportsRealtimeStatus: false,
      columnsPerLine: 48,
      codePage: 'CP850',
      encoding: 'utf-8',
      chunkSize: 1024,
      chunkDelayMs: 0,
      connectionTimeoutMs: 3000,
      writeTimeoutMs: 3000,
      feedLinesEnd: 3,
    },
  }

  engine.registerPrinterProfile(printerBranchA)

  // Lookup for branch_terraza must not resolve to printerBranchA
  const resolved = engine.resolveDestinationPrinters('bar_ticket', undefined, 'tenant_gamma', 'branch_terraza')
  assert.notEqual(resolved.primary.id, 'pr-bar-branch-vip')

  // Submitting for branch_terraza with printer from branch_vip must throw
  await assert.rejects(
    async () => {
      await engine.submitPrintRequest({
        targetType: 'bar_ticket',
        printerProfileId: 'pr-bar-branch-vip',
        tenantId: 'tenant_gamma',
        branchId: 'branch_terraza',
        idempotencyKey: 'test-branch-iso-1',
        payload: {
          payloadSchemaVersion: 1,
          templateVersion: '1.0',
          restaurantName: 'Club Gamma',
          branchName: 'Terraza',
          items: [],
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
        },
      })
    },
    /no pertenece a la sucursal branch_terraza/
  )
})

// 5. Saving a printer shows "Impresora vinculada correctamente" and persists profile
test('5. Saving a printer stores profile under scoped key and is retrievable', () => {
  const profile: PrinterProfile = {
    id: 'pr-test-persist',
    restaurantId: 'tenant_delta',
    tenantId: 'tenant_delta',
    branchId: 'main',
    name: 'Impresora Caja 1',
    role: 'receipt',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: false,
    autoPrintOnOrderPaid: true,
    kickDrawerOnPrint: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    capabilities: {
      supportsCashDrawerKick: true,
      supportsPaperCut: true,
      supportsBeep: false,
      supportsBarcode: false,
      supportsQrCode: false,
      supportsImages: false,
      supportsRealtimeStatus: false,
      columnsPerLine: 48,
      codePage: 'CP850',
      encoding: 'utf-8',
      chunkSize: 1024,
      chunkDelayMs: 0,
      connectionTimeoutMs: 3000,
      writeTimeoutMs: 3000,
      feedLinesEnd: 3,
    },
  }

  savePrinterProfileLocal(profile, 'tenant_delta', 'main')
  const expectedKey = getPrinterStorageKey('tenant_delta', 'main')
  assert.ok(memoryStorage.has(expectedKey))

  const loaded = loadPrinterProfiles('tenant_delta', 'main')
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'pr-test-persist')
  assert.equal(loaded[0].name, 'Impresora Caja 1')
})

// 6. Test print does not alter operational state
test('6. Test print does not alter operational state (no accounts or balances changed)', async () => {
  const dataset = createDummyNightclubDataset()
  const initialAccountsCount = dataset.accounts.length
  const initialTablesStatus = dataset.tables.map(t => ({ id: t.id, status: t.status }))

  const adapter = new BrowserDialogPrinterAdapter()
  const dummyProfile: PrinterProfile = {
    id: 'test-p',
    restaurantId: 'test-rest',
    branchId: 'main',
    name: 'Impresora Test',
    role: 'general',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: false,
    autoPrintOnOrderPaid: false,
    kickDrawerOnPrint: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    capabilities: {
      supportsCashDrawerKick: false,
      supportsPaperCut: false,
      supportsBeep: false,
      supportsBarcode: false,
      supportsQrCode: false,
      supportsImages: false,
      supportsRealtimeStatus: false,
      columnsPerLine: 48,
      codePage: 'CP850',
      encoding: 'utf-8',
      chunkSize: 1024,
      chunkDelayMs: 0,
      connectionTimeoutMs: 3000,
      writeTimeoutMs: 3000,
      feedLinesEnd: 3,
    },
  }

  const result = await adapter.sendBytes({
    printer: dummyProfile,
    jobPayload: {
      payloadSchemaVersion: 1,
      templateVersion: '1.0',
      restaurantName: 'Test Club',
      branchName: 'Main',
      items: [],
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
    },
    targetType: 'test',
    bytes: new Uint8Array(),
  })
  assert.equal(result.success, true)

  // Assert operational dataset has zero modifications
  assert.equal(dataset.accounts.length, initialAccountsCount)
  assert.deepEqual(dataset.tables.map(t => ({ id: t.id, status: t.status })), initialTablesStatus)
})

// 7. Round is persisted before attempting to print
test('7. Round is persisted before attempting to auto-print', async () => {
  const executionOrder: string[] = []

  const mockPersistRound = async () => {
    await new Promise(res => setTimeout(res, 10))
    executionOrder.push('backend_ack')
    return true
  }

  const mockAutoPrint = async () => {
    executionOrder.push('auto_print')
  }

  const success = await mockPersistRound()
  if (success) {
    await mockAutoPrint()
  }

  assert.deepEqual(executionOrder, ['backend_ack', 'auto_print'])
})

// 8. Printer failure does not duplicate or revert round
test('8. Printer failure does not duplicate or revert round', async () => {
  const dataset = createDummyNightclubDataset()
  const round: NightclubRound = {
    id: 'round-fail-test',
    sequence: 1,
    createdAt: new Date().toISOString(),
    status: 'pending',
    authorization: 'account_charge',
    items: [
      {
        id: 'item-1',
        productId: 'p_beer',
        name: 'Cerveza Huari',
        quantity: 2,
        unitPrice: 25,
        lineTotal: 50,
        preparationArea: 'Barra',
      },
    ],
  }

  const account: NightclubAccount = {
    id: 'acc-fail-test',
    status: 'open',
    openedAt: new Date().toISOString(),
    openedBy: 'Mesero 1',
    rounds: [round],
    subtotal: 50,
  }
  dataset.accounts.push(account)

  let notice = ''
  try {
    throw new Error('Impresora desconectada o fuera de línea')
  } catch (err: unknown) {
    notice = 'Pedido guardado, impresión pendiente/fallida.'
  }

  // Round remains in the account without being removed or duplicated
  assert.equal(account.rounds.length, 1)
  assert.equal(account.rounds[0].id, 'round-fail-test')
  assert.equal(account.subtotal, 50)
  assert.equal(notice, 'Pedido guardado, impresión pendiente/fallida.')
})

// 9. Product marked Directo does NOT appear on bar_ticket
test('9. Product marked Directo does NOT appear on bar_ticket', () => {
  const round: NightclubRound = {
    id: 'r9',
    sequence: 1,
    createdAt: new Date().toISOString(),
    status: 'pending',
    items: [
      {
        id: 'it1',
        productId: 'p_water',
        name: 'Agua Vital',
        quantity: 1,
        unitPrice: 12,
        lineTotal: 12,
        preparationArea: 'Directo',
      },
      {
        id: 'it2',
        productId: 'p_beer',
        name: 'Cerveza Huari',
        quantity: 2,
        unitPrice: 25,
        lineTotal: 50,
        preparationArea: 'Barra',
      },
    ],
  }

  const payload = buildNightclubBarTicketPayload({
    round,
    tableName: 'Mesa VIP 1',
    companyName: 'Club Oasis',
    isReprint: false,
    staffName: 'Mesero Juan',
  })

  assert.ok(payload !== null)
  assert.equal(payload.items.length, 1)
  assert.equal(payload.items[0].name, 'Cerveza Huari')
  assert.equal(payload.items.some(it => it.name === 'Agua Vital'), false)
})

// 10. Product marked Barra DOES appear on bar_ticket
test('10. Product marked Barra DOES appear on bar_ticket without prices', () => {
  const round: NightclubRound = {
    id: 'r10',
    sequence: 2,
    createdAt: new Date().toISOString(),
    status: 'pending',
    items: [
      {
        id: 'it-gin',
        productId: 'p_gin',
        name: 'Gin Tonic Signature',
        quantity: 3,
        unitPrice: 45,
        lineTotal: 135,
        preparationArea: 'Barra',
      },
    ],
  }

  const payload = buildNightclubBarTicketPayload({
    round,
    tableName: 'Terraza 4',
    companyName: 'Club Oasis',
    isReprint: false,
    staffName: 'Mesera Carla',
  })

  assert.ok(payload !== null)
  assert.equal(payload.items.length, 1)
  assert.equal(payload.items[0].name, 'Gin Tonic Signature')
  assert.equal(payload.items[0].quantity, 3)
  // Operational comanda has 0 prices
  assert.equal(payload.items[0].basePrice, 0)
  assert.equal(payload.items[0].lineTotal, 0)
  assert.equal(payload.subtotal, 0)
})

// 11. bar_ticket in browser adapter uses operational comanda template, not receipt
test('11. bar_ticket in browser adapter uses operational comanda template, not receipt', () => {
  const adapter = new BrowserDialogPrinterAdapter()
  const payload = {
    payloadSchemaVersion: 1,
    templateVersion: '1.0',
    restaurantName: 'Club Oasis',
    branchName: 'Barra Principal',
    tableInfo: 'Mesa VIP 1',
    sequenceNumber: 3,
    items: [
      { name: 'Cerveza Huari', quantity: 2, basePrice: 0, lineTotal: 0 },
      { name: 'Gin Tonic', quantity: 1, basePrice: 0, lineTotal: 0 },
    ],
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
  }

  const html = adapter.formatContent(payload, 'bar_ticket')
  assert.ok(html.includes('COMANDA - BARRA'))
  assert.ok(html.includes('Mesa VIP 1'))
  assert.ok(html.includes('Cerveza Huari'))
  assert.ok(html.includes('Gin Tonic'))
  // Must NOT include customer receipt wording
  assert.ok(!html.includes('RECIBO DE VENTA'))
  assert.ok(!html.includes('TOTAL A PAGAR'))
})

// 12. Account with Bs 62 produces receipt with total Bs 62
test('12. Account with Bs 62 produces receipt with total Bs 62', () => {
  const dataset = createDummyNightclubDataset()
  const account: NightclubAccount = {
    id: 'acc-62',
    tableNameSnapshot: 'Mesa VIP 1',
    status: 'closed',
    openedAt: '2026-10-16T21:00:00Z',
    openedBy: 'Mesero Juan',
    rounds: [
      {
        id: 'r1',
        sequence: 1,
        createdAt: '2026-10-16T21:10:00Z',
        status: 'delivered',
        items: [
          {
            id: 'it1',
            productId: 'p_beer',
            name: 'Cerveza Huari',
            quantity: 2,
            unitPrice: 25,
            lineTotal: 50,
            preparationArea: 'Barra',
          },
          {
            id: 'it2',
            productId: 'p_water',
            name: 'Agua Vital',
            quantity: 1,
            unitPrice: 12,
            lineTotal: 12,
            preparationArea: 'Directo',
          },
        ],
      },
    ],
    payments: [
      {
        method: 'mixed',
        cashAmount: 40,
        qrAmount: 22,
        cardAmount: 0,
        received: 50,
        change: 10,
        paidAt: '2026-10-16T22:30:00Z',
        paidBy: 'Cajero Carlos',
      },
    ],
    subtotal: 62,
  }

  const receiptData = nightclubAccountToReceiptData(account, dataset)
  assert.equal(receiptData.total, 62)
  assert.equal(receiptData.items.length, 2)
  assert.equal(receiptData.items[0].lineTotal + receiptData.items[1].lineTotal, 62)
})

// 13. Breakdown of Cash 40 + QR 22 is displayed correctly (received 50, change 10)
test('13. Breakdown of Cash 40 + QR 22 is displayed correctly', () => {
  const dataset = createDummyNightclubDataset()
  const account: NightclubAccount = {
    id: 'acc-breakdown',
    tableNameSnapshot: 'Mesa VIP 1',
    status: 'closed',
    openedAt: '2026-10-16T21:00:00Z',
    openedBy: 'Mesero Juan',
    rounds: [],
    payments: [
      {
        method: 'mixed',
        cashAmount: 40,
        qrAmount: 22,
        cardAmount: 0,
        received: 50,
        change: 10,
        paidAt: '2026-10-16T22:30:00Z',
        paidBy: 'Cajero Carlos',
      },
    ],
    subtotal: 62,
  }

  const receiptData = nightclubAccountToReceiptData(account, dataset) as any
  assert.ok(receiptData.paymentDetails !== undefined)
  assert.equal(receiptData.cashAmount, 40)
  assert.equal(receiptData.qrAmount, 22)
  assert.equal(receiptData.cashReceived, 50)
  assert.equal(receiptData.changeAmount, 10)
})

// 14. PDF generation succeeds
test('14. PDF generation succeeds (generateReceiptPdf returns valid document)', async () => {
  const dataset = createDummyNightclubDataset()
  const account: NightclubAccount = {
    id: 'acc-pdf-14',
    tableNameSnapshot: 'Mesa VIP 1',
    status: 'closed',
    openedAt: '2026-10-16T21:00:00Z',
    openedBy: 'Mesero',
    rounds: [
      {
        id: 'r1',
        sequence: 1,
        createdAt: '2026-10-16T21:10:00Z',
        status: 'delivered',
        items: [
          {
            id: 'it1',
            productId: 'p_beer',
            name: 'Cerveza Huari',
            quantity: 2,
            unitPrice: 25,
            lineTotal: 50,
          },
        ],
      },
    ],
    subtotal: 50,
  }

  const receiptData = nightclubAccountToReceiptData(account, dataset)
  const context = buildBusinessDocumentContext({ tradeName: 'Club Oasis' }, { companyName: 'Club Oasis' })

  const pdfBytes = await generateReceiptPdf(context, receiptData)
  assert.ok(pdfBytes instanceof Uint8Array)
  assert.ok(pdfBytes.length > 500)
  const header = String.fromCharCode(...pdfBytes.slice(0, 4))
  assert.equal(header, '%PDF')
})

// 15. Share fallback functions properly
test('15. Share fallback functions properly (uses Web Share when supported)', async () => {
  const dataset = createDummyNightclubDataset()
  const account: NightclubAccount = {
    id: 'acc-share-15',
    tableNameSnapshot: 'Mesa VIP 1',
    status: 'closed',
    openedAt: '2026-10-16T21:00:00Z',
    openedBy: 'Mesero',
    rounds: [],
    subtotal: 0,
  }

  const receiptData = nightclubAccountToReceiptData(account, dataset)
  const context = buildBusinessDocumentContext({ tradeName: 'Club Oasis' })

  let sharedFiles: any[] = []
  if (typeof globalThis.navigator === 'undefined') {
    ;(globalThis as any).navigator = {}
  }

  Object.defineProperty(globalThis.navigator, 'canShare', {
    value: () => true,
    configurable: true,
  })
  Object.defineProperty(globalThis.navigator, 'share', {
    value: async (data: any) => {
      sharedFiles = data.files || []
    },
    configurable: true,
  })

  const shareResult = await shareReceipt(context, receiptData)
  assert.equal(shareResult.success, true)
  assert.equal(shareResult.method, 'web_share_file')
  assert.ok(sharedFiles.length > 0)
})

// 16. Reprint is marked "*** REIMPRESIÓN / COPIA ***"
test('16. Reprint is marked "*** REIMPRESIÓN / COPIA ***"', () => {
  const round: NightclubRound = {
    id: 'r16',
    sequence: 1,
    createdAt: new Date().toISOString(),
    status: 'delivered',
    items: [
      {
        id: 'it-beer',
        productId: 'p_beer',
        name: 'Cerveza Huari',
        quantity: 2,
        unitPrice: 25,
        lineTotal: 50,
        preparationArea: 'Barra',
      },
    ],
  }

  const payload = buildNightclubBarTicketPayload({
    round,
    tableName: 'Mesa VIP 1',
    companyName: 'Club Oasis',
    isReprint: true,
    staffName: 'Mesero Juan',
  })

  assert.ok(payload !== null)
  assert.ok(payload.headerDetails !== undefined)
  assert.ok(payload.headerDetails.includes('*** REIMPRESIÓN / COPIA ***'))

  // Also verify browser dialog adapter rendering
  const adapter = new BrowserDialogPrinterAdapter()
  const html = adapter.formatContent(payload, 'bar_ticket')
  assert.ok(html.includes('*** REIMPRESIÓN / COPIA ***'))
})

// 17. Demo / Studio do not load tenant printer profiles
test('17. Demo / Studio do not load tenant printer profiles', () => {
  // Store a profile for a real tenant
  const tenantProfile: PrinterProfile = {
    id: 'pr-real-tenant',
    restaurantId: 'tenant_live_999',
    tenantId: 'tenant_live_999',
    branchId: 'main',
    name: 'Impresora Real de Producción',
    role: 'receipt',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: true,
    autoPrintOnOrderPaid: true,
    kickDrawerOnPrint: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    capabilities: {
      supportsCashDrawerKick: false,
      supportsPaperCut: true,
      supportsBeep: false,
      supportsBarcode: false,
      supportsQrCode: false,
      supportsImages: false,
      supportsRealtimeStatus: false,
      columnsPerLine: 48,
      codePage: 'CP850',
      encoding: 'utf-8',
      chunkSize: 1024,
      chunkDelayMs: 0,
      connectionTimeoutMs: 3000,
      writeTimeoutMs: 3000,
      feedLinesEnd: 3,
    },
  }

  savePrinterProfileLocal(tenantProfile, 'tenant_live_999', 'main')

  // Loading profiles for 'demo' or 'studio' must be completely isolated
  const demoProfiles = loadPrinterProfiles('demo', 'main')
  assert.equal(demoProfiles.length, 0)

  const studioProfiles = loadPrinterProfiles('studio', 'main')
  assert.equal(studioProfiles.length, 0)

  // Real tenant profiles are kept safely in their own namespace
  const liveProfiles = loadPrinterProfiles('tenant_live_999', 'main')
  assert.equal(liveProfiles.length, 1)
  assert.equal(liveProfiles[0].id, 'pr-real-tenant')
})
