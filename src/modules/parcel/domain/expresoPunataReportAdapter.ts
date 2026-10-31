import type { ParcelAppState } from '../types.ts'
import {
  makeBusinessReport,
  toDigitalReportDocument,
  type BusinessReportV1,
  type ReportSheet,
} from '../../../core/reports/reportTypes.ts'
import { buildBusinessDocumentContext } from '../../../core/businessIdentity.ts'
import { isInReportPeriod } from '../../../core/reports/reportPeriod.ts'
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
 * Strictly applies temporal filtering and audit completeness checks.
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

  // 1. Filtrado temporal estricto mediante el contrato canónico de periodos
  const filteredShipments = (state.shipments || []).filter(s =>
    isInReportPeriod(s.createdAt, period)
  )

  const filteredDues = (state.dues || []).filter(d => {
    if (d.period >= period.startDate.slice(0, 7) && d.period <= period.endDate.slice(0, 7)) {
      return true
    }
    return d.payments.some(p => !p.isReversed && isInReportPeriod(p.date, period))
  })

  const filteredExpenses = (state.unionExpenses || []).filter(e =>
    isInReportPeriod(e.date, period)
  )

  const filteredMovements = (state.cashMovements || []).filter(m =>
    isInReportPeriod(m.timestamp, period)
  )

  const filteredWorkerPayments = (state.workerPayments || []).filter(w =>
    isInReportPeriod(w.date, period)
  )

  // 2. Resumen Financiero con los datos filtrados por período
  const financialSummary = calculateFinancialSummary({
    movements: filteredMovements,
    workerPayments: filteredWorkerPayments,
    unionExpenses: filteredExpenses,
    initialCash: state.activeShift ? state.activeShift.initialCash : 0,
    dateRange: {
      startDate: period.startDate,
      endDate: period.endDate,
    },
  })
  const currentCash = state.activeShift

  const summaryRows: (string | number | null)[][] = [
    ['Total Ingresos Encomiendas Origen', financialSummary.byCategory.shippingOriginIncome],
    ['Total Ingresos Encomiendas Destino (COD)', financialSummary.byCategory.shippingDestIncome],
    ['Total Ingresos Aportes Sindicales', financialSummary.byCategory.unionDuesIncome],
    ['Total Otros Ingresos Extraordinarios', financialSummary.byCategory.otherIncome],
    ['Ingresos Totales Reconocidos', financialSummary.totalIncomeAllMethods],
    ['Total Gastos Operativos Sindicales', financialSummary.expenses.standaloneUnionExpenses],
    ['Total Liquidaciones a Choferes y Personal', financialSummary.expenses.totalWorkerPayments],
    ['Total Gastos Operativos Totales', financialSummary.expenses.totalOperationalExpenses],
    ['Resultado Operativo Neto del Período', financialSummary.netOperatingBalance],
    ['Efectivo Cobrado en Mano', financialSummary.totalCashIn],
    ['Efectivo Egresado de Caja', financialSummary.totalCashOut],
    ['Saldo Efectivo en Caja Activa', currentCash?.expectedCash ?? financialSummary.expectedCashInDrawer],
    ['Estado de Caja de Turno', currentCash?.status === 'open' ? 'ABIERTA' : 'CERRADA'],
  ]

  const summarySheet: ReportSheet = {
    name: 'Resumen Financiero',
    headers: ['Concepto', 'Monto (Bs.) / Estado'],
    rows: summaryRows,
  }

  // 3. Sheet: Encomiendas
  const parcelRows: (string | number | null)[][] = filteredShipments.map(s => [
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

  // 4. Sheet: Aportes Sindicales
  const dueRows: (string | number | null)[][] = filteredDues.map(d => [
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

  // 5. Sheet: Gastos Sindicales
  const expenseRows: (string | number | null)[][] = filteredExpenses.map(e => [
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

  // 6. Sheet: Padrón de Socios
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

  // 7. Auditoría de integridad de datos y advertencias
  const warnings: string[] = []
  const pendingMovements = (state.cashMovements || []).filter(m => m.shiftId === 'pending_reconciliation')
  if (pendingMovements.length > 0) {
    warnings.push(`Existen ${pendingMovements.length} movimientos de caja pendientes de asignación y conciliación a un turno activo.`)
  }
  if (state.activeShift && typeof state.activeShift.difference === 'number' && state.activeShift.difference !== 0) {
    warnings.push(`El turno de caja activo registra una discrepancia física no resuelta de Bs. ${state.activeShift.difference.toFixed(2)}.`)
  }

  // Si hay advertencias de integridad o datos pendientes, se marca como parcial
  const completeness = warnings.length > 0 ? 'partial' : 'complete'

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
    completeness,
    recordCount,
    warnings,
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
 * Throws if the report completeness is partial.
 */
export function toExpresoPunataDigitalReport(
  state: ParcelAppState,
  customPeriod?: ExpresoPunataReportPeriod
) {
  const report = toExpresoPunataBusinessReport(state, customPeriod)
  return toDigitalReportDocument(report)
}
