import type { BusinessDocumentContext } from '../businessIdentity.ts'
import { toDigitalReportDocument, type BusinessReportV1, type ReportSheet } from './reportTypes.ts'
import { saveReport } from './reportFiles.ts'

export interface ReportExportContext {
  identity: BusinessDocumentContext
  description: string
  filename?: string
}

async function reportLogoDataUrl(url?: string): Promise<string | undefined> {
  if (!url || typeof window === 'undefined') return undefined
  try {
    if (url.startsWith('data:image/png;base64,') || url.startsWith('data:image/jpeg;base64,')) return url
    const parsed = new URL(url, window.location.href)
    if (parsed.origin !== window.location.origin || !/^https?:$/.test(parsed.protocol)) return undefined
    const response = await fetch(parsed, { credentials: 'omit', mode: 'same-origin' })
    if (!response.ok || !/^image\/(png|jpeg)$/.test(response.headers.get('content-type') || '')) return undefined
    const blob = await response.blob()
    if (blob.size > 1_000_000) return undefined
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
  } catch { return undefined }
}

function description(context: ReportExportContext): string {
  return [context.identity.branchName, ...(context.identity.formattedHeaderLines || []), context.description].filter(Boolean).join(' · ')
}

export async function exportReportExcel(sheets: ReportSheet[], context: ReportExportContext): Promise<void> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook(); workbook.creator = 'PACHAX'
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    worksheet.mergeCells(1, 1, 1, sheet.headers.length)
    worksheet.getCell(1, 1).value = context.identity.companyName
    worksheet.getCell(1, 1).font = { bold: true, size: 14 }
    worksheet.mergeCells(2, 1, 2, sheet.headers.length)
    worksheet.getCell(2, 1).value = description(context)
    worksheet.getCell(2, 1).alignment = { wrapText: true }
    worksheet.getRow(2).height = 36
    worksheet.getRow(4).values = sheet.headers
    worksheet.getRow(4).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    })
    worksheet.addRows(sheet.rows)
    worksheet.columns.forEach((column, index) => { column.width = /Producto|Motivo|Detalle/i.test(sheet.headers[index] || '') ? 36 : 23 })
    worksheet.views = [{ state: 'frozen', ySplit: 4 }]
    worksheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, worksheet.rowCount), column: sheet.headers.length } }
    for (let rowIndex = 5; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      worksheet.getRow(rowIndex).alignment = { vertical: 'top', wrapText: true }
      worksheet.getRow(rowIndex).eachCell((cell, columnIndex) => {
        if (typeof cell.value === 'number') cell.numFmt = sheet.headers[columnIndex - 1]?.includes('Bs') ? '#,##0.00' : '0.##'
      })
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  await saveReport(new Uint8Array(buffer), context.filename || 'Pachax-reportes.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

export async function exportReportPdf(sheets: ReportSheet[], context: ReportExportContext): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const pdf = new jsPDF({ orientation: 'landscape' })
  const logo = await reportLogoDataUrl(context.identity.logoUrl)
  const header = () => {
    pdf.setTextColor(30, 40, 50); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15)
    pdf.text(context.identity.companyName || 'PACHAX', 14, 15)
    if (logo) { try { pdf.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', 244, 9, 38, 15, undefined, 'FAST') } catch { /* Unsupported image encoding does not break the report. */ } }
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
    pdf.text(description(context), 14, 22, { maxWidth: 260 })
  }
  sheets.forEach((sheet, index) => {
    if (index) pdf.addPage()
    header(); pdf.setFontSize(11); pdf.text(sheet.name, 14, 35)
    autoTable(pdf, {
      head: [sheet.headers],
      body: sheet.rows.map(row => row.map((value, columnIndex) => value === null
        ? (/Costo/i.test(sheet.headers[columnIndex] || '') ? 'Sin costo registrado' : '') : String(value))),
      startY: 40, margin: { top: 32, bottom: 16 },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [31, 41, 55] },
      didDrawPage: () => { header(); pdf.setFontSize(8); pdf.text(`Página ${pdf.getNumberOfPages()}`, 270, 200) },
    })
  })
  await saveReport(new Uint8Array(pdf.output('arraybuffer')), context.filename || 'Pachax-reportes.pdf', 'application/pdf')
}

export async function exportBusinessReport(report: BusinessReportV1, format: 'pdf' | 'excel'): Promise<void> {
  const document = toDigitalReportDocument(report)
  const context = {
    identity: document.identity,
    description: `${report.period.startDate} – ${report.period.endDate} · ${report.period.timeZone} · ${new Date(report.generatedAt).toLocaleString('es-BO')}`,
    filename: `${report.businessType}-${report.period.startDate}-${report.period.endDate}.${format === 'pdf' ? 'pdf' : 'xlsx'}`,
  }
  if (format === 'pdf') return exportReportPdf(report.sheets, context)
  return exportReportExcel(report.sheets, context)
}
