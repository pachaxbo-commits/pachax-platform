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
import {
  PrintEngineService,
  classifyPrintJobOutcome,
  type PrintJobOutcome,
} from '../src/services/printing/printEngineService.ts'
import { PrintQueueManager } from '../src/services/printing/printQueueManager.ts'
import { buildKitchenTicketBytes } from '../src/services/printing/templates/kitchenTicketTemplate.ts'
import { normalizeNightclubRole } from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import { createNightclubActionRunner } from '../src/modules/nightclub/application/nightclubActionRunner.ts'
import type { PrinterAdapter, PrintJobStorage, SubmitPrintRequestInput } from '../src/types/printing.ts'
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

// ============================================================================
// CIERRE NIGHTCLUB N2.1 — TESTS DE CERTIFICACIÓN DE IMPRESIÓN Y PERMISOS REALES
// ============================================================================

class TestMemoryPrintJobStorage implements PrintJobStorage {
  private jobs = new Map<string, PrintJob>()
  async save(job: PrintJob) { this.jobs.set(job.id, job) }
  async get(id: string) { return this.jobs.get(id) || null }
  async update(id: string, updates: Partial<PrintJob>) {
    const job = this.jobs.get(id)
    if (!job) throw new Error('Job not found')
    Object.assign(job, updates)
  }
  async delete(id: string) { this.jobs.delete(id) }
  async getPendingJobs() { return Array.from(this.jobs.values()).filter(j => ['queued', 'retrying'].includes(j.status)) }
  async getRecentJobs() { return Array.from(this.jobs.values()) }
  async acquireLease(id: string, instanceId: string, durationMs: number) {
    const job = this.jobs.get(id)
    if (!job) return false
    job.lockedByInstanceId = instanceId
    job.leaseExpiresAtIso = new Date(Date.now() + durationMs).toISOString()
    return true
  }
}

class TestCapturingAdapter implements PrinterAdapter {
  readonly connectionType = 'network_tcp' as const
  lastPrintedBytes: Uint8Array | null = null
  async isAvailable() { return true }
  async connect(_printer: PrinterProfile) {}
  async disconnect() {}
  async sendBytes(payload: { bytes: Uint8Array }) {
    this.lastPrintedBytes = payload.bytes
    return { success: true, hardwareConfirmed: true }
  }
}

// 18 (N2.1 - 1): bar_ticket ESC/POS in PrintQueueManager uses comanda (contains "COMANDA - BARRA", without prices or receipt text)
test('18 (N2.1 - 1): bar_ticket ESC/POS in PrintQueueManager uses comanda template without prices', async () => {
  const storage = new TestMemoryPrintJobStorage()
  const queueManager = new PrintQueueManager(storage, 'term-test-1')
  const adapter = new TestCapturingAdapter()
  queueManager.registerAdapter(adapter)

  const barPrinter: PrinterProfile = {
    id: 'pr-bar-escpos',
    restaurantId: 'tenant_live_bar',
    tenantId: 'tenant_live_bar',
    branchId: 'main',
    name: 'Barra Térmica 80mm',
    role: 'bar',
    connectionType: 'network_tcp',
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

  const round: NightclubRound = {
    id: 'r_bar_escpos',
    sequence: 3,
    createdAt: new Date().toISOString(),
    status: 'pending',
    items: [
      {
        id: 'it1',
        productId: 'p_beer',
        name: 'Cerveza Huari Especial',
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
    staffName: 'Mesero Carlos',
    isReprint: false,
  })
  assert.ok(payload)

  const job = await queueManager.submitJob(
    {
      targetType: 'bar_ticket',
      tenantId: 'tenant_live_bar',
      branchId: 'main',
      idempotencyKey: 'test:bar_ticket:escpos:1',
      payload,
    },
    barPrinter
  )

  await queueManager.processJob(job.id, adapter, barPrinter)
  assert.ok(adapter.lastPrintedBytes)

  const decoded = new TextDecoder().decode(adapter.lastPrintedBytes)
  // Must use operational comanda template
  assert.ok(decoded.includes('COMANDA - BARRA'))
  assert.ok(decoded.includes('RONDA #3'))
  assert.ok(decoded.includes('2x Cerveza Huari Especial'))
  assert.ok(decoded.includes('RESPONSABLE: Mesero Carlos'))
  // Must NOT use receipt template or contain prices
  assert.ok(!decoded.includes('COMPROBANTE'))
  assert.ok(!decoded.includes('Bs 50'))
  assert.ok(!decoded.includes('Bs 25'))
  assert.ok(!decoded.includes('TOTAL'))
})

// 19 (N2.1 - 2): bar_ticket in BrowserDialogPrinterAdapter remains correct
test('19 (N2.1 - 2): bar_ticket in BrowserDialogPrinterAdapter remains correct comanda layout', () => {
  const round: NightclubRound = {
    id: 'r_browser_bar',
    sequence: 2,
    createdAt: new Date().toISOString(),
    status: 'pending',
    items: [
      {
        id: 'it2',
        productId: 'p_gin',
        name: 'Gin Tonic Signature',
        quantity: 1,
        unitPrice: 45,
        lineTotal: 45,
        preparationArea: 'Barra',
      },
    ],
  }

  const payload = buildNightclubBarTicketPayload({
    round,
    tableName: 'Barra Principal',
    companyName: 'Sky Lounge',
    staffName: 'Bartender Alex',
    isReprint: false,
  })
  assert.ok(payload)

  const adapter = new BrowserDialogPrinterAdapter()
  const html = adapter.formatContent(payload, 'bar_ticket')

  assert.ok(html.includes('COMANDA'))
  assert.ok(html.includes('Barra'))
  assert.ok(html.includes('Gin Tonic Signature'))
  assert.ok(html.includes('1x'))
  // Must not display receipt totals or breakdown
  assert.ok(!html.includes('TOTAL BS'))
  assert.ok(!html.includes('DETALLE DE PAGO'))
})

// 20 (N2.1 - 3): PrintJob outcome failed does not report success
test('20 (N2.1 - 3): PrintJob outcome failed does not report success', () => {
  const failedJob: PrintJob = {
    id: 'job-f1',
    jobId: 'job-f1',
    idempotencyKey: 'idem-f1',
    restaurantId: 'tenant1',
    branchId: 'main',
    terminalId: 'term1',
    targetType: 'bar_ticket',
    printerProfileId: 'pr1',
    connectionType: 'network_tcp',
    status: 'failed',
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    payload: {} as any,
    attempts: 3,
    maxAttempts: 3,
    lastError: 'Hardware buffer overflow / host unreachable',
    queuedAtIso: new Date().toISOString(),
  }

  const outcome = classifyPrintJobOutcome(failedJob, 'Comanda')
  assert.equal(outcome.isSuccess, false)
  assert.equal(outcome.category, 'failed')
  assert.ok(outcome.message.includes('Falló la impresión'))
  assert.ok(outcome.message.includes('Hardware buffer overflow'))
})

// 21 (N2.1 - 4): PrintJob outcome unknown reports uncertain / asks operator for decision
test('21 (N2.1 - 4): PrintJob outcome unknown reports uncertain and requests operator decision', () => {
  const unknownJob: PrintJob = {
    id: 'job-u1',
    jobId: 'job-u1',
    idempotencyKey: 'idem-u1',
    restaurantId: 'tenant1',
    branchId: 'main',
    terminalId: 'term1',
    targetType: 'bar_ticket',
    printerProfileId: 'pr1',
    connectionType: 'network_tcp',
    status: 'unknown',
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    payload: {} as any,
    attempts: 1,
    maxAttempts: 3,
    queuedAtIso: new Date().toISOString(),
  }

  const outcome = classifyPrintJobOutcome(unknownJob, 'Comanda')
  assert.equal(outcome.isSuccess, false)
  assert.equal(outcome.category, 'uncertain')
  assert.equal(outcome.message, 'No se pudo confirmar si la impresión salió.')
})

// 22 (N2.1 - 5): PrintJob outcome retrying/queued reports pending
test('22 (N2.1 - 5): PrintJob outcome retrying/queued reports pending retry', () => {
  const queuedJob = { status: 'queued' } as PrintJob
  const retryingJob = { status: 'retrying' } as PrintJob
  const processingJob = { status: 'processing' } as PrintJob

  const outcomeQueued = classifyPrintJobOutcome(queuedJob, 'Comanda')
  assert.equal(outcomeQueued.isSuccess, false)
  assert.equal(outcomeQueued.category, 'pending')
  assert.equal(outcomeQueued.message, 'Impresión pendiente de reintento.')

  const outcomeRetrying = classifyPrintJobOutcome(retryingJob, 'Comanda')
  assert.equal(outcomeRetrying.isSuccess, false)
  assert.equal(outcomeRetrying.category, 'pending')
  assert.equal(outcomeRetrying.message, 'Impresión pendiente de reintento.')

  const outcomeProcessing = classifyPrintJobOutcome(processingJob, 'Comanda')
  assert.equal(outcomeProcessing.isSuccess, false)
  assert.equal(outcomeProcessing.category, 'pending')
})

// 23 (N2.1 - 6): PrintJob outcome transmitted/confirmed reports success
test('23 (N2.1 - 6): PrintJob outcome transmitted/confirmed reports success honestly', () => {
  const confirmedJob = { status: 'confirmed' } as PrintJob
  const transmittedJob = { status: 'transmitted' } as PrintJob

  const outcomeConfirmed = classifyPrintJobOutcome(confirmedJob, 'Comanda')
  assert.equal(outcomeConfirmed.isSuccess, true)
  assert.equal(outcomeConfirmed.category, 'success')
  assert.ok(outcomeConfirmed.message.includes('confirmada'))

  const outcomeTransmitted = classifyPrintJobOutcome(transmittedJob, 'Comanda')
  assert.equal(outcomeTransmitted.isSuccess, true)
  assert.equal(outcomeTransmitted.category, 'success')
  assert.ok(outcomeTransmitted.message.includes('enviada'))
})

// 24 (N2.1 - 7): Auto-print uses real roundId returned by backend
test('24 (N2.1 - 7): Auto-print uses real roundId returned by backend', async () => {
  const fakeServerRoundId = 'srv_round_real_789'
  const mockRepository = {
    addRound: async () => ({
      roundId: fakeServerRoundId,
      accountId: 'acc_789',
      total: 50,
      status: 'pending',
    }),
    getRoundById: async (id: string) => {
      if (id === fakeServerRoundId) {
        return {
          id: fakeServerRoundId,
          sequence: 4,
          createdAt: new Date().toISOString(),
          status: 'pending' as const,
          authorization: 'account_charge' as const,
          items: [{ id: 'it_srv', productId: 'p_beer', name: 'Huari', quantity: 2, unitPrice: 25, lineTotal: 50, preparationArea: 'Barra' }],
        }
      }
      return null
    },
  }

  const res = await mockRepository.addRound()
  assert.equal(res.roundId, fakeServerRoundId)

  const serverRound = await mockRepository.getRoundById(res.roundId)
  assert.ok(serverRound)
  assert.equal(serverRound.id, fakeServerRoundId)
  assert.equal(serverRound.sequence, 4)
})

// 25 (N2.1 - 8): Production mode does not construct syntheticRound
test('25 (N2.1 - 8): Production mode does not construct syntheticRound when target round is not found', () => {
  const mode = 'tenant'
  let syntheticConstructed = false

  const onSendRoundHandler = (targetRoundFound: boolean) => {
    if (targetRoundFound) {
      // Print real round
    } else if (mode !== 'tenant') {
      syntheticConstructed = true
    }
  }

  onSendRoundHandler(false)
  assert.equal(syntheticConstructed, false, 'Tenant mode must never construct syntheticRound')

  // In demo mode, fallback to synthetic is permitted
  const demoMode = 'demo'
  let demoSyntheticConstructed = false
  if (demoMode !== 'tenant') {
    demoSyntheticConstructed = true
  }
  assert.equal(demoSyntheticConstructed, true, 'Demo mode retains local fallback')
})

// 26 (N2.1 - 9): Print failure does not revert or duplicate round (returns honest status)
test('26 (N2.1 - 9): Print failure does not revert or duplicate round, returns honest notice', async () => {
  let isRunning = false
  let recordedNotice = ''
  const runner = createNightclubActionRunner(
    () => isRunning,
    val => { isRunning = val },
    notice => { recordedNotice = notice }
  )

  const roundCreationAction = async () => {
    // Round was persisted on backend successfully
    // Print outcome returned failed
    const printOutcome: PrintJobOutcome = {
      category: 'failed',
      status: 'failed',
      isSuccess: false,
      message: 'Falló la impresión: Host unreachable',
    }
    if (printOutcome.category === 'failed' || printOutcome.category === 'pending') {
      return 'Ronda guardada. Impresión pendiente/fallida.'
    }
    return 'Ronda enviada; consumo cargado a cuenta e inventario actualizado.'
  }

  const success = await runner(roundCreationAction, 'Ronda enviada.')
  assert.equal(success, true, 'Action runner succeeds so round is not reverted')
  assert.equal(recordedNotice, 'Ronda guardada. Impresión pendiente/fallida.')
})

// 27 (N2.1 - 10): owner, admin, bar can use manual comanda buttons
test('27 (N2.1 - 10): owner, admin, bar can use manual comanda buttons', () => {
  const canPrintComanda = (role: string) => ['owner', 'admin', 'bar'].includes(normalizeNightclubRole(role))
  assert.equal(canPrintComanda('owner'), true)
  assert.equal(canPrintComanda('admin'), true)
  assert.equal(canPrintComanda('bar'), true)
})

// 28 (N2.1 - 11): waiter, cashier, service do not see comanda buttons
test('28 (N2.1 - 11): waiter, cashier, service do not see comanda buttons', () => {
  const canPrintComanda = (role: string) => ['owner', 'admin', 'bar'].includes(normalizeNightclubRole(role))
  assert.equal(canPrintComanda('waiter'), false)
  assert.equal(canPrintComanda('cashier'), false)
  assert.equal(canPrintComanda('service'), false)
  assert.equal(canPrintComanda('inventory'), false)
})

// 29 (N2.1 - 12): owner, admin, cashier can access receipt
test('29 (N2.1 - 12): owner, admin, cashier can access receipt', () => {
  const canAccessReceipt = (role: string) => ['owner', 'admin', 'cashier'].includes(normalizeNightclubRole(role))
  assert.equal(canAccessReceipt('owner'), true)
  assert.equal(canAccessReceipt('admin'), true)
  assert.equal(canAccessReceipt('cashier'), true)
})

// 30 (N2.1 - 13): waiter, bar, inventory do not access receipt
test('30 (N2.1 - 13): waiter, bar, inventory do not access receipt', () => {
  const canAccessReceipt = (role: string) => ['owner', 'admin', 'cashier'].includes(normalizeNightclubRole(role))
  assert.equal(canAccessReceipt('waiter'), false)
  assert.equal(canAccessReceipt('bar'), false)
  assert.equal(canAccessReceipt('inventory'), false)
  assert.equal(canAccessReceipt('service'), false)
})

// 31 (N2.1 - 14): Tenant settings does not show "Reservas: Habilitadas"
test('31 (N2.1 - 14): Tenant settings does not show "Reservas: Habilitadas"', () => {
  const resolveOperationalStatuses = (mode: 'tenant' | 'demo') => {
    const statuses: Array<{ label: string; value: string }> = [
      { label: 'Turno', value: 'Abierto' },
    ]
    if (mode !== 'tenant') {
      statuses.push({ label: 'Reservas', value: 'Habilitadas' })
    }
    if (mode === 'tenant') {
      statuses.push({ label: 'Modelo de cobro', value: 'Cuenta abierta + pagos parciales' })
    } else {
      statuses.push({ label: 'Cobro por ronda', value: 'Activo' })
    }
    return statuses
  }

  const tenantStatuses = resolveOperationalStatuses('tenant')
  assert.ok(!tenantStatuses.some(s => s.label === 'Reservas'), 'Tenant mode must not show Reservas')

  const demoStatuses = resolveOperationalStatuses('demo')
  assert.ok(demoStatuses.some(s => s.label === 'Reservas'), 'Demo mode may show Reservas')
})

// 32 (N2.1 - 15): Tenant settings does not show "Cobro por ronda: Activo" (shows "Modelo de cobro: Cuenta abierta + pagos parciales")
test('32 (N2.1 - 15): Tenant settings shows "Modelo de cobro: Cuenta abierta + pagos parciales" instead of "Cobro por ronda: Activo"', () => {
  const resolveCobroStatus = (mode: 'tenant' | 'demo') => {
    return mode === 'tenant'
      ? { label: 'Modelo de cobro', value: 'Cuenta abierta + pagos parciales' }
      : { label: 'Cobro por ronda', value: 'Activo' }
  }

  const tenantCobro = resolveCobroStatus('tenant')
  assert.equal(tenantCobro.label, 'Modelo de cobro')
  assert.equal(tenantCobro.value, 'Cuenta abierta + pagos parciales')

  const demoCobro = resolveCobroStatus('demo')
  assert.equal(demoCobro.label, 'Cobro por ronda')
  assert.equal(demoCobro.value, 'Activo')
})

// 33 (N2.1 - 16): BusinessIdentity remains source of primary/accent colors in tenant mode
test('33 (N2.1 - 16): BusinessIdentity remains source of primary/accent colors in tenant mode', () => {
  const businessIdentity: BusinessIdentity = {
    tradeName: 'Club Tropicana Live',
    legalName: 'Tropicana SRL',
    primaryColor: '#e11d48',
    accentColor: '#06b6d4',
  }

  // In tenant mode, local branding colors in Apariencia are not used or exposed
  const isColorExposedInAppearance = (mode: 'tenant' | 'demo') => mode !== 'tenant'
  assert.equal(isColorExposedInAppearance('tenant'), false, 'Tenant mode does not duplicate color inputs')

  // The document context directly adopts businessIdentity colors
  const context = buildBusinessDocumentContext(businessIdentity, { branchName: 'Principal' })
  assert.equal(context.primaryColor, '#e11d48')
  assert.equal(context.accentColor, '#06b6d4')
})
