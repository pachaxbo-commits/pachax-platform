/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test executes outside browser TypeScript project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKitchenTicketHtml,
  buildReceiptHtml,
  BrowserDialogPrinterAdapter,
} from '../../../../adapters/printing/browserDialogPrinterAdapter.ts'
import {
  loadPrinterProfiles,
  savePrinterProfileLocal as savePrinterProfile,
  deletePrinterProfileLocal as deletePrinterProfile,
  getActiveKitchenPrinter,
  getActiveReceiptPrinter,
} from '../../../../services/printing/printerProfiles.ts'
import type { PrintJobPayload, PrinterProfile, PrinterCapability } from '../../../../types/printing.ts'

// Mock de localStorage en memoria para pruebas de aislamiento y perfiles
function setupMockLocalStorage() {
  const store = new Map<string, string>()
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  }
  globalThis.localStorage = mockStorage
  return mockStorage
}

test('buildKitchenTicketHtml genera comanda térmica limpia sin precios ni datos de cobro', () => {
  const payload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: 'Pizzería Napolitana',
    branchName: 'Sucursal Centro',
    displayNumber: '1042',
    tableInfo: 'Mesa 4',
    customerName: 'Juan Pérez',
    fulfillmentType: 'table',
    items: [
      {
        name: 'Pizza Margherita',
        basePrice: 65,
        quantity: 2,
        lineTotal: 130,
        modifiersText: ['Masa delgada', 'Extra albahaca'],
        note: 'Bien dorada',
      },
      {
        name: 'Coca Cola 2L',
        basePrice: 18,
        quantity: 1,
        lineTotal: 18,
      },
    ],
    subtotal: 148,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: 148,
    isCopy: false,
    copies: 1,
    createdIso: '2026-10-15T19:30:00Z',
  }

  const html = buildKitchenTicketHtml(payload, '80mm')

  // Datos esenciales de comanda presentes
  assert.match(html, /COMANDA.*#1042/)
  assert.match(html, /Pizzería Napolitana/)
  assert.match(html, /Mesa 4/)
  assert.match(html, /2x/)
  assert.match(html, /Pizza Margherita/)
  assert.match(html, /\[!\] Masa delgada/)
  assert.match(html, /\[!\] Extra albahaca/)
  assert.match(html, /OBS: Bien dorada/)
  assert.match(html, /1x/)
  assert.match(html, /Coca Cola 2L/)

  // NUNCA debe contener importes de precios en comanda de cocina
  assert.doesNotMatch(html, /130/)
  assert.doesNotMatch(html, /148/)
  assert.doesNotMatch(html, /Bs/)
  assert.doesNotMatch(html, /TOTAL/i)
  assert.doesNotMatch(html, /REIMPRESI[OÓ]N/)
})

test('buildKitchenTicketHtml añade encabezado visible de *** REIMPRESIÓN / COPIA *** cuando isCopy es true', () => {
  const payload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: 'Hamburguesería PACHAX',
    branchName: 'Principal',
    displayNumber: '0055',
    tableInfo: 'Mesa 1',
    fulfillmentType: 'table',
    items: [{ name: 'Hamburguesa Triple', basePrice: 45, quantity: 1, lineTotal: 45 }],
    subtotal: 45,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: 45,
    isCopy: true,
    copies: 1,
    createdIso: '2026-10-15T20:00:00Z',
  }

  const html = buildKitchenTicketHtml(payload, '58mm')
  assert.match(html, /\*\*\* REIMPRESIÓN \/ COPIA \*\*\*/)
  assert.match(html, /size: 58mm auto/)
})

test('buildReceiptHtml incluye detalles financieros, desglose y medio de pago', () => {
  const payload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: 'Café Del Sol',
    branchName: 'Sucursal Prado',
    displayNumber: 'REC-901',
    tableInfo: 'Mesa 8',
    customerName: 'Mariana Flores',
    items: [
      { name: 'Capuccino Grande', basePrice: 22, quantity: 2, lineTotal: 44 },
      { name: 'Cheesecake Frutos Rojos', basePrice: 28, quantity: 1, lineTotal: 28 },
    ],
    subtotal: 72,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: 72,
    paymentMethod: 'QR',
    footerMessage: '¡Gracias por su compra!',
    isCopy: false,
    copies: 1,
    createdIso: '2026-10-15T20:15:00Z',
  }

  const html = buildReceiptHtml(payload, '80mm')
  assert.match(html, /Café Del Sol/)
  assert.match(html, /TICKET:.*REC-901/)
  assert.match(html, /Capuccino Grande/)
  assert.match(html, /72\.00 Bs/)
  assert.match(html, /PAGO.*QR/)
  assert.match(html, /¡Gracias por su compra!/)
})

test('aislamiento tenant A/B en almacenamiento de impresoras', () => {
  setupMockLocalStorage()

  const profileTenantA: PrinterProfile = {
    id: 'printer-kitchen-a',
    restaurantId: 'tenant-alfa',
    branchId: 'main',
    name: 'Cocina Alfa',
    role: 'kitchen',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: false,
    autoPrintOnOrderPaid: false,
    kickDrawerOnPrint: false,
    capabilities: {
      supportsCashDrawerKick: false,
      supportsPaperCut: false,
      supportsBeep: false,
      supportsBarcode: false,
      supportsQrCode: false,
      supportsImages: false,
      supportsRealtimeStatus: false,
      columnsPerLine: 48,
      codePage: 'CP437',
      encoding: 'utf-8',
      chunkSize: 1024,
      chunkDelayMs: 20,
      connectionTimeoutMs: 5000,
      writeTimeoutMs: 5000,
    },
    isActive: true,
    createdAt: new Date().toISOString(),
  }

  const profileTenantB: PrinterProfile = {
    ...profileTenantA,
    id: 'printer-kitchen-b',
    restaurantId: 'tenant-beta',
    name: 'Cocina Beta',
  }

  // Guardar en tenant-alfa
  savePrinterProfile(profileTenantA, 'tenant-alfa', 'main')

  // Guardar en tenant-beta
  savePrinterProfile(profileTenantB, 'tenant-beta', 'main')

  // Consulta tenant-alfa
  const alfaPrinters = loadPrinterProfiles('tenant-alfa', 'main')
  assert.equal(alfaPrinters.length, 1)
  assert.equal(alfaPrinters[0].name, 'Cocina Alfa')

  // Consulta tenant-beta
  const betaPrinters = loadPrinterProfiles('tenant-beta', 'main')
  assert.equal(betaPrinters.length, 1)
  assert.equal(betaPrinters[0].name, 'Cocina Beta')

  // Ninguna impresora de Alfa aparece en Beta ni viceversa
  assert.ok(!alfaPrinters.some((p) => p.name === 'Cocina Beta'))
  assert.ok(!betaPrinters.some((p) => p.name === 'Cocina Alfa'))
  assert.deepEqual(loadPrinterProfiles('tenant-alfa', 'main').map(printer => printer.id), ['printer-kitchen-a'], 'Los perfiles del mismo navegador sobreviven a una nueva lectura')

  const branchPrinter = { ...profileTenantA, id: 'printer-kitchen-branch-a', branchId: 'branch-a', name: 'Cocina Sucursal A' }
  savePrinterProfile(branchPrinter, 'tenant-alfa', 'branch-a')
  assert.deepEqual(loadPrinterProfiles('tenant-alfa', 'branch-a').map(printer => printer.id), ['printer-kitchen-branch-a'])
  assert.deepEqual(loadPrinterProfiles('tenant-alfa', 'branch-b'), [])
  assert.deepEqual(loadPrinterProfiles('tenant-alfa', 'branch-a').map(printer => printer.id), ['printer-kitchen-branch-a'], 'Perfil permanece disponible tras una nueva lectura del almacenamiento')

  // Eliminar en Alfa no afecta a Beta
  deletePrinterProfile('printer-kitchen-a', 'tenant-alfa', 'main')
  assert.equal(loadPrinterProfiles('tenant-alfa', 'main').length, 0)
  assert.equal(loadPrinterProfiles('tenant-beta', 'main').length, 1)
})

const mockCapabilities: PrinterCapability = {
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
  chunkDelayMs: 20,
  connectionTimeoutMs: 5000,
  writeTimeoutMs: 5000,
  feedLinesEnd: 3,
}

test('resolución de impresora activa por rol con fallback a general', () => {
  setupMockLocalStorage()

  const kitchenPrinter: PrinterProfile = {
    id: 'p-kitchen',
    restaurantId: 'tenant-test',
    branchId: 'main',
    name: 'Comandera Térmica',
    role: 'kitchen',
    connectionType: 'browser_dialog',
    paperWidth: '80mm',
    copies: 1,
    autoPrintOnOrderCreated: false,
    autoPrintOnOrderPaid: false,
    kickDrawerOnPrint: false,
    capabilities: mockCapabilities,
    isActive: true,
    createdAt: new Date().toISOString(),
  }

  const receiptPrinter: PrinterProfile = {
    ...kitchenPrinter,
    id: 'p-receipt',
    name: 'Caja Recibos',
    role: 'receipt',
  }

  savePrinterProfile(kitchenPrinter, 'tenant-test', 'main')
  savePrinterProfile(receiptPrinter, 'tenant-test', 'main')

  const activeKitchen = getActiveKitchenPrinter('tenant-test', 'main')
  assert.equal(activeKitchen?.id, 'p-kitchen')

  const activeReceipt = getActiveReceiptPrinter('tenant-test', 'main')
  assert.equal(activeReceipt?.id, 'p-receipt')
})

test('BrowserDialogPrinterAdapter ejecuta impresión con éxito en entorno de pruebas', async () => {
  const adapter = new BrowserDialogPrinterAdapter()
  assert.equal(adapter.connectionType, 'browser_dialog')
  assert.equal(await adapter.isAvailable(), true)

  const payload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: 'Test Rest',
    branchName: 'Main',
    items: [{ name: 'Test item', basePrice: 10, quantity: 1, lineTotal: 10 }],
    subtotal: 10,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: 10,
    isCopy: false,
    copies: 1,
    createdIso: new Date().toISOString(),
  }

  const result = await adapter.sendBytes({
    jobId: 'job-1',
    bytes: new Uint8Array([1, 2, 3]),
    printer: {
      id: 'pr-1',
      restaurantId: 'test',
      branchId: 'main',
      name: 'Printer',
      role: 'kitchen',
      connectionType: 'browser_dialog',
      paperWidth: '80mm',
      copies: 1,
      autoPrintOnOrderCreated: false,
      autoPrintOnOrderPaid: false,
      kickDrawerOnPrint: false,
      capabilities: mockCapabilities,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    jobPayload: payload,
    targetType: 'kitchen_ticket',
  })

  assert.equal(result.success, true)
})
