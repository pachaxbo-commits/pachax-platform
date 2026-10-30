import type { BusinessReportV1 } from './reportTypes.ts'
import { toDigitalReportDocument } from './reportTypes.ts'
import { canUseReportCapability } from './reportCapabilities.ts'
import { getActiveTenant } from '../../store/activeTenant.ts'
import { isDemoModeActive } from '../../demo/core/demoContext.ts'
import { PrintEngineService } from '../../services/printing/printEngineService.ts'
import { getActiveReceiptPrinter, initializePrinting } from '../../services/printing/printerBootstrap.ts'
import type { PrinterProfile } from '../../types/printing.ts'

function defaultPrinter(tenantId: string, branchId: string): PrinterProfile {
  return {
    id: `browser-report:${tenantId}:${branchId}`, tenantId, restaurantId: tenantId, branchId,
    name: 'Diálogo de impresión del navegador', role: 'receipt', connectionType: 'browser_dialog', paperWidth: '80mm',
    copies: 1, autoPrintOnOrderCreated: false, autoPrintOnOrderPaid: false, kickDrawerOnPrint: false, isActive: true,
    createdAt: new Date().toISOString(), capabilities: {
      supportsCashDrawerKick: false, supportsPaperCut: false, supportsBeep: false, supportsBarcode: false,
      supportsQrCode: false, supportsImages: true, supportsRealtimeStatus: false, columnsPerLine: 48,
      codePage: 'UTF-8', encoding: 'utf-8', chunkSize: 1024, chunkDelayMs: 0,
      connectionTimeoutMs: 5000, writeTimeoutMs: 5000, feedLinesEnd: 0,
    },
  }
}

export async function printBusinessReport(report: BusinessReportV1): Promise<string> {
  if (report.completeness !== 'complete') throw new Error('Completa el historial del periodo antes de imprimir el reporte.')
  const active = getActiveTenant()
  if (!active && !isDemoModeActive()) throw new Error('La empresa activa debe cargarse antes de imprimir reportes.')
  if (active && (active.tenantId !== report.tenantId || active.branchId !== report.branchId || active.tenant.businessType !== report.businessType)) {
    throw new Error('El reporte no coincide con la empresa, sucursal o plantilla activa.')
  }
  if (!canUseReportCapability(active?.tenant, 'reports.export')) throw new Error('La exportación de reportes no está incluida en las capacidades de esta empresa.')
  const document = toDigitalReportDocument(report)
  const rowCount = document.payload.sheets.reduce((total, sheet) => total + sheet.rows.length, 0)
  if (rowCount > 500) throw new Error('El reporte supera 500 filas para impresión. Descarga el PDF o Excel completo.')
  initializePrinting(document.tenantId, document.branchId)
  const printer = getActiveReceiptPrinter(document.tenantId, document.branchId) || defaultPrinter(document.tenantId, document.branchId)
  const engine = PrintEngineService.getInstance()
  if (printer.connectionType === 'browser_dialog') engine.registerPrinterProfile(printer)
  const sheet = document.payload.sheets[0]
  const job = await engine.submitPrintRequest({
    targetType: 'cash_report', tenantId: document.tenantId, branchId: document.branchId,
    printerProfileId: printer.id,
    idempotencyKey: `business-report:${document.tenantId}:${document.branchId}:${document.sourceId}`,
    payload: {
      payloadSchemaVersion: 1, templateVersion: 'reports-v1', restaurantName: document.identity.companyName,
      branchName: document.identity.branchName || 'Sucursal principal', branchAddress: document.identity.address,
      branchPhone: document.identity.phone, logoUrl: document.identity.logoUrl,
      headerDetails: document.identity.formattedHeaderLines, displayNumber: document.sourceId,
      items: [], subtotal: 0, discountTotal: 0, taxTotal: 0, deliveryFee: 0, grandTotal: 0,
      isCopy: false, copies: 1, createdIso: document.createdAt,
      report: { title: sheet.name, description: `${document.payload.period.startDate} – ${document.payload.period.endDate} · ${document.payload.period.timeZone}`, headers: sheet.headers, rows: sheet.rows.map(row => row.map(value => value === null ? '' : String(value))) },
    },
  })
  return job.status === 'transmitted' || job.status === 'confirmed' ? 'Se abrió el diálogo o dispositivo de impresión.' : `Reporte preparado. Estado de impresión: ${job.status}.`
}
