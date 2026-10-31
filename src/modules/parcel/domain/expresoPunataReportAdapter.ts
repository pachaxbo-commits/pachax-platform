import type { ParcelAppState } from '../types.ts'
import {
  makeBusinessReport,
  toDigitalReportDocument,
  type BusinessReportV1,
  type ReportSheet,
} from '../../../core/reports/reportTypes.ts'
import { buildBusinessDocumentContext } from '../../../core/businessIdentity.ts'
import { EXPRESO_PUNATA_COMPANY } from './expresoPunataConfig.ts'
import { calculateFinancialSummary } from './parcelEngine.ts'

export interface ExpresoPunataReportPeriod {
  startDate: string
  endDate: string
  timeZone?: string
}

/**
 * Adapts Expreso Punata's operational state to the platform's canonical BusinessReportV1.
 * Fully compliant with Codex's Reports Core V1 (PR #14).
 */
export function toExpresoPunataBusinessReport(
  state: ParcelAppState,
  customPeriod?: ExpresoPunataReportPeriod
): BusinessReportV1 {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const period = {
    startDate: customPeriod?.startDate || todayStr,
    endDate: customPeriod?.endDate || todayStr,
    timeZone: customPeriod?.timeZone || 'America/La_Paz',
  }

  const company = state.companyInfo || EXPRESO_PUNATA_COMPANY
  const tradeName = company.tradeName || company.name || EXPRESO_PUNATA_COMPANY.tradeName || EXPRESO_PUNATA_COMPANY.name
  const currentBranch = state.branches.find(b => b.id === state.currentBranchId) || state.branches[0]

  const identity = buildBusinessDocumentContext({
    tradeName,
    legalName: company.legalName || EXPRESO_PUNATA_COMPANY.legalName,
    logoUrl: company.logoUrl || EXPRESO_PUNATA_COMPANY.logoUrl,
    phone: company.phone || EXPRESO_PUNATA_COMPANY.phone,
    address: company.address || EXPRESO_PUNATA_COMPANY.address,
    city: company.city || EXPRESO_PUNATA_COMPANY.city,
    taxId: company.taxId || EXPRESO_PUNATA_COMPANY.taxId,
    primaryColor: '#064e3b',
    accentColor: '#facc15',
    receiptHeader: company.slogan || EXPRESO_PUNATA_COMPANY.slogan,
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showTaxId: true,
    showManagedBy: true,
  }, {
    branchName: currentBranch ? currentBranch.name : 'Agencia Punata Central',
    companyName: tradeName,
  })

  // 1. Resumen Financiero
  const financialSummary = calculateFinancialSummary({
    movements: state.cashMovements || [],
    workerPayments: state.workerPayments || [],
    unionExpenses: state.unionExpenses || [],
    initialCash: state.activeShift ? state.activeShift.initialCash : 0,
  })
  const currentCash = state.activeShift

  const summaryRows: (string | number | null)[][] = [
    ['Total Ingresos Encomiendas Origen', financialSummary.byCategory.shippingOriginIncome],
    ['Total Ingresos Encomiendas Destino (COD)', financialSummary.byCategory.shippingDestIncome],
    ['Total Ingresos Aportes Sindicales', financialSummary.byCategory.unionDuesIncome],
    ['Total Gastos Operativos Sindicales', financialSummary.expenses.standaloneUnionExpenses],
    ['Total Liquidaciones a Choferes y Personal', financialSummary.expenses.totalWorkerPayments],
    ['Total Gastos Operativos Totales', financialSummary.expenses.totalOperationalExpenses],
    ['Resultado Operativo Neto del Período', financialSummary.netOperatingBalance],
    ['Saldo Efectivo en Caja Activa', currentCash?.expectedCash ?? financialSummary.expectedCashInDrawer],
    ['Estado de Caja de Turno', currentCash?.status === 'open' ? 'ABIERTA' : 'CERRADA'],
  ]

  const summarySheet: ReportSheet = {
    name: 'Resumen Financiero',
    headers: ['Concepto', 'Monto (Bs.) / Estado'],
    rows: summaryRows,
  }

  // 2. Sheet: Encomiendas
  const shipments = state.shipments || []
  const parcelRows: (string | number | null)[][] = shipments.map(s => [
    s.trackingCode,
    s.createdAt.slice(0, 16).replace('T', ' '),
    s.sender.name,
    s.recipient.name,
    s.originCity,
    s.destinationCity,
    s.finalAmount,
    s.paymentStatus === 'paid' ? 'PAGADO' : 'POR COBRAR',
    s.status.toUpperCase(),
  ])

  const parcelsSheet: ReportSheet = {
    name: 'Encomiendas',
    headers: [
      'Código de Guía',
      'Fecha/Hora',
      'Remitente',
      'Destinatario',
      'Origen',
      'Destino',
      'Total (Bs.)',
      'Pago',
      'Estado',
    ],
    rows: parcelRows,
  }

  // 3. Sheet: Aportes Sindicales
  const dues = state.dues || []
  const dueRows: (string | number | null)[][] = dues.map(d => [
    d.payments[0]?.receiptNumber || d.id,
    d.memberName,
    d.memberNumber,
    d.periodLabel || d.period,
    d.amount,
    d.paidAmount,
    d.balance,
    d.status.toUpperCase(),
  ])

  const duesSheet: ReportSheet = {
    name: 'Aportes Sindicales',
    headers: [
      'N° Recibo / Folio',
      'Socio',
      'Código Socio',
      'Periodo',
      'Cuota Total (Bs.)',
      'Pagado (Bs.)',
      'Saldo (Bs.)',
      'Estado',
    ],
    rows: dueRows,
  }

  // 4. Sheet: Gastos Sindicales
  const unionExpenses = state.unionExpenses || []
  const expenseRows: (string | number | null)[][] = unionExpenses.map(e => [
    e.receiptNumber || e.invoiceOrVoucherNumber || e.id,
    e.category.toUpperCase(),
    e.description,
    e.amount,
    e.registeredBy,
    e.date.slice(0, 10),
    e.paymentMethod.toUpperCase(),
  ])

  const expensesSheet: ReportSheet = {
    name: 'Gastos Sindicales',
    headers: [
      'Comprobante',
      'Categoría',
      'Descripción / Detalle',
      'Monto (Bs.)',
      'Registrado Por',
      'Fecha',
      'Medio',
    ],
    rows: expenseRows,
  }

  // 5. Sheet: Padrón de Socios
  const members = state.members || []
  const socioRows: (string | number | null)[][] = members.map(m => [
    m.memberNumber,
    m.fullName,
    m.phone,
    (m.category || 'socio').toUpperCase(),
    m.vehiclePlate || 'S/P',
    m.ci,
    m.status === 'active' ? 'ACTIVO' : m.status === 'honorary' ? 'HONORARIO' : 'INACTIVO',
  ])

  const sociosSheet: ReportSheet = {
    name: 'Padrón de Socios',
    headers: [
      'Código',
      'Nombres y Apellidos',
      'Teléfono',
      'Categoría',
      'Placa',
      'CI',
      'Estado',
    ],
    rows: socioRows,
  }

  const recordCount =
    summaryRows.length +
    parcelRows.length +
    dueRows.length +
    expenseRows.length +
    socioRows.length

  return makeBusinessReport({
    tenantId: 'demo-expreso-punata-tenant',
    branchId: currentBranch ? currentBranch.id : 'branch-punata',
    businessType: 'parcel_punata_sindicato',
    generatedAt: now.toISOString(),
    period,
    identity,
    completeness: 'complete',
    recordCount,
    warnings: [],
    sheets: [
      summarySheet,
      parcelsSheet,
      duesSheet,
      expensesSheet,
      sociosSheet,
    ],
  })
}

/**
 * Returns a digital report document ready for printing or export.
 */
export function toExpresoPunataDigitalReport(
  state: ParcelAppState,
  customPeriod?: ExpresoPunataReportPeriod
) {
  const report = toExpresoPunataBusinessReport(state, customPeriod)
  return toDigitalReportDocument(report)
}
