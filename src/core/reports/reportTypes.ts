import type { BusinessDocumentContext } from '../businessIdentity.ts'
import { makeBusinessDocument, type BusinessDocument } from '../documents/documentTypes.ts'

export type ReportCell = string | number | null

export interface ReportSheet {
  name: string
  headers: string[]
  rows: ReportCell[][]
}

export interface ReportPeriodV1 {
  startDate: string
  endDate: string
  timeZone: string
}

export interface BusinessReportV1 {
  schemaVersion: 1
  tenantId: string
  branchId: string
  businessType: string
  generatedAt: string
  period: ReportPeriodV1
  identity: BusinessDocumentContext
  completeness: 'complete' | 'partial' | 'unknown'
  recordCount: number
  warnings: string[]
  sheets: ReportSheet[]
}

export function makeBusinessReport(input: Omit<BusinessReportV1, 'schemaVersion'>): BusinessReportV1 {
  if (!input.tenantId.trim() || !input.branchId.trim() || !input.businessType.trim()) {
    throw new Error('El reporte requiere empresa, sucursal y plantilla.')
  }
  if (!Number.isFinite(Date.parse(input.generatedAt))) throw new Error('La fecha del reporte no es válida.')
  if (!Number.isSafeInteger(input.recordCount) || input.recordCount < 0) throw new Error('El conteo del reporte no es válido.')
  if (!input.sheets.length || input.sheets.some(sheet => !sheet.name.trim() || !sheet.headers.length
    || sheet.rows.some(row => row.length !== sheet.headers.length))) {
    throw new Error('Las columnas y filas del reporte están incompletas.')
  }
  return { ...input, schemaVersion: 1 }
}

export function toDigitalReportDocument(report: BusinessReportV1): BusinessDocument<BusinessReportV1> {
  if (report.completeness !== 'complete') throw new Error('Completa todas las páginas del reporte antes de exportarlo o imprimirlo.')
  return makeBusinessDocument({
    kind: 'digital_report', tenantId: report.tenantId, branchId: report.branchId,
    sourceId: `report-${report.generatedAt}-${report.period.startDate}-${report.period.endDate}`,
    createdAt: report.generatedAt, identity: report.identity, payload: report,
  })
}
