import type { BusinessDocumentContext } from '../../core/businessIdentity.ts'
import { canonicalReceiptToPrintJobPayload, type CanonicalReceiptData } from '../../core/receiptService.ts'
import { makeBusinessDocument, type BusinessDocumentKind } from '../../core/documents/documentTypes.ts'
import { getActiveTenant } from '../../store/activeTenant.ts'
import { isDemoModeActive } from '../../demo/core/demoContext.ts'
import { PrintEngineService } from './printEngineService.ts'
// Keep the import path recognizable by the demo-only build guard so public demos
// resolve the isolated printer adapter instead of Firebase-backed printer config.
import { getActiveReceiptPrinter, initializePrinting } from '../../services/printing/printerBootstrap.ts'
import type { PrinterProfile } from '../../types/printing.ts'

function browserDialogProfile(tenantId: string, branchId: string): PrinterProfile {
  return {
    id: `browser-dialog:${tenantId}:${branchId}`, restaurantId: tenantId, tenantId, branchId,
    name: 'Diálogo de impresión del navegador', role: 'receipt', connectionType: 'browser_dialog', paperWidth: '80mm',
    copies: 1, autoPrintOnOrderCreated: false, autoPrintOnOrderPaid: false, kickDrawerOnPrint: false, isActive: true,
    createdAt: new Date().toISOString(), capabilities: { supportsCashDrawerKick: false, supportsPaperCut: false,
      supportsBeep: false, supportsBarcode: false, supportsQrCode: false, supportsImages: true,
      supportsRealtimeStatus: false, columnsPerLine: 48, codePage: 'UTF-8', encoding: 'utf-8', chunkSize: 1024,
      chunkDelayMs: 0, connectionTimeoutMs: 5000, writeTimeoutMs: 5000, feedLinesEnd: 0 },
  }
}

/** Uses the single printer engine, choosing a configured device or the browser print dialog. */
export async function printBusinessReceipt(input: {
  tenantId: string
  branchId: string
  sourceId: string
  receipt: CanonicalReceiptData
  identity: BusinessDocumentContext
  kind?: BusinessDocumentKind
  isCopy?: boolean
}): Promise<string> {
  const active = getActiveTenant()
  if (!active && !isDemoModeActive()) {
    throw new Error('La empresa y sucursal activa deben cargarse antes de preparar documentos.')
  }
  if (active && (active.tenantId !== input.tenantId || active.branchId !== input.branchId)) {
    throw new Error('El documento no coincide con la empresa o sucursal activa.')
  }
  if (input.isCopy && input.receipt.documentStatus !== 'payment_confirmed') {
    throw new Error('Solo se puede reimprimir como copia un pago confirmado.')
  }
  const document = makeBusinessDocument({
    kind: input.kind || 'customer_receipt',
    tenantId: input.tenantId,
    branchId: input.branchId,
    sourceId: input.sourceId,
    createdAt: input.receipt.dateIso,
    identity: input.identity,
    payload: input.receipt,
  })
  initializePrinting(input.tenantId, input.branchId)
  const engine = PrintEngineService.getInstance()
  const printer = getActiveReceiptPrinter(input.tenantId, input.branchId) || browserDialogProfile(input.tenantId, input.branchId)
  if (printer.connectionType === 'browser_dialog') engine.registerPrinterProfile(printer)
  const job = await engine.submitPrintRequest({
    targetType: 'receipt',
    tenantId: input.tenantId,
    branchId: input.branchId,
    printerProfileId: printer.id,
    idempotencyKey: `document:${input.tenantId}:${input.branchId}:${input.sourceId}:${input.isCopy ? `copy:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}` : 'original'}`,
    payload: canonicalReceiptToPrintJobPayload({
      ...document.payload,
      isCopy: input.isCopy === true,
      reprintReason: input.isCopy ? 'Copia de documento confirmado' : undefined,
    }, document.identity),
  })
  return job.status === 'transmitted' || job.status === 'confirmed'
    ? 'Se abrió el diálogo o dispositivo de impresión.'
    : `Documento preparado. Estado de impresión: ${job.status}.`
}
