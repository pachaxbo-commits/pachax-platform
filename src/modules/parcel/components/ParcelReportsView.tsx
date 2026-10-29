import { useState } from 'react'
import {
  FileText,
  FileDown,
  Printer,
  Calendar,
  X,
} from 'lucide-react'
import type {
  ParcelAppState,
} from '../types'
import { generateOperationalReportPdf } from '../domain/parcelDocuments'
import { calculateFinancialSummary } from '../domain/parcelEngine'

interface ParcelReportsViewProps {
  state: ParcelAppState
}

type ReportType =
  | 'shipments'
  | 'manifests'
  | 'cash'
  | 'members'
  | 'union_dues'
  | 'worker_payments'
  | 'union_expenses'
  | 'union_balance'

export function ParcelReportsView({ state }: ParcelReportsViewProps) {
  const isSyndicate = state.edition === 'sindicato'
  const [activeReport, setActiveReport] = useState<ReportType>('shipments')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)

  // Filtro de rango de fechas unificado
  const inDateRange = (isoString?: string) => {
    if (!isoString) return true
    const d = isoString.slice(0, 10)
    if (startDate && d < startDate) return false
    if (endDate && d > endDate) return false
    return true
  }

  // Colecciones filtradas congruentemente
  const shipmentsFiltered = state.shipments.filter(s => {
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    const matchesDate = inDateRange(s.createdAt)
    return matchesStatus && matchesDate
  })

  const manifestsFiltered = state.manifests.filter(m => inDateRange(m.createdAt))
  const cashMovementsFiltered = state.cashMovements.filter(m => inDateRange(m.timestamp))
  const membersFiltered = state.members
  const duesFiltered = state.dues.filter(d => inDateRange(d.dueDate) || d.payments.some(p => inDateRange(p.date)))
  const workerPaymentsFiltered = state.workerPayments.filter(p => inDateRange(p.date))
  const expensesFiltered = state.unionExpenses.filter(e => inDateRange(e.date))

  // Resumen Financiero y Resultado Operativo coherente con los filtros
  const financialSummary = calculateFinancialSummary({
    movements: cashMovementsFiltered,
    workerPayments: workerPaymentsFiltered,
    unionExpenses: expensesFiltered,
    initialCash: state.activeShift?.initialCash || 0,
    dateRange: startDate || endDate ? { startDate, endDate } : undefined,
  })

  const clearDates = () => {
    setStartDate('')
    setEndDate('')
  }

  // Generador unificado de datos para PDF e Impresión aislada
  const buildCurrentReportPdf = async () => {
    const dateSubtitle = startDate || endDate
      ? `Período: ${startDate || 'Inicio'} hasta ${endDate || 'Hoy'}`
      : 'Historial completo registrado'

    if (activeReport === 'shipments') {
      const rows = shipmentsFiltered.map(s => [
        s.trackingCode,
        new Date(s.createdAt).toLocaleDateString('es-BO'),
        s.originCity,
        s.destinationCity,
        s.sender.name,
        s.recipient.name,
        s.declaredSummary,
        s.status.toUpperCase(),
        s.paymentTiming === 'origin_paid' ? 'PAGADO ORIGEN' : 'COD DESTINO',
        `Bs. ${s.finalAmount.toFixed(2)}`,
      ])
      const total = shipmentsFiltered.reduce((acc, s) => acc + s.finalAmount, 0)
      return generateOperationalReportPdf({
        title: 'Reporte Operativo de Encomiendas',
        subtitle: `${dateSubtitle} · Filtro: ${statusFilter === 'all' ? 'Todas' : statusFilter.toUpperCase()}`,
        headers: ['Guía', 'Fecha', 'Origen', 'Destino', 'Remitente', 'Destinatario', 'Contenido', 'Estado', 'Cobro', 'Monto'],
        rows,
        summaryLines: [
          `Total Guías Listadas: ${shipmentsFiltered.length}`,
          `Importe Total Registrado: Bs. ${total.toFixed(2)}`,
        ],
      })
    }

    if (activeReport === 'manifests') {
      const rows = manifestsFiltered.map(m => [
        m.manifestNumber,
        new Date(m.createdAt).toLocaleDateString('es-BO'),
        m.destinationCity,
        m.driverOrResponsible,
        m.vehiclePlate || 'S/P',
        String(m.parcelIds.length),
        String(m.totalPackages),
        `${m.totalWeightKg} kg`,
        m.status.toUpperCase(),
      ])
      return generateOperationalReportPdf({
        title: 'Reporte de Manifiestos de Despacho',
        subtitle: dateSubtitle,
        headers: ['N° Manifiesto', 'Fecha', 'Destino', 'Conductor / Chofer', 'Placa', 'Guías', 'Bultos', 'Peso', 'Estado'],
        rows,
        summaryLines: [`Total Manifiestos: ${manifestsFiltered.length}`],
      })
    }

    if (activeReport === 'cash') {
      const rows = cashMovementsFiltered.map(m => [
        new Date(m.timestamp).toLocaleTimeString('es-BO'),
        m.type === 'income' ? 'INGRESO' : 'EGRESO',
        m.category.toUpperCase(),
        m.concept,
        m.paymentMethod.toUpperCase(),
        m.operatorName,
        `Bs. ${m.amount.toFixed(2)}`,
      ])
      return generateOperationalReportPdf({
        title: 'Reporte de Movimientos de Caja',
        subtitle: dateSubtitle,
        headers: ['Hora', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Operador', 'Importe'],
        rows,
        summaryLines: [
          `Efectivo Esperado en Gaveta: Bs. ${financialSummary.expectedCashInDrawer.toFixed(2)}`,
          `Total Cobros Digitales QR: Bs. ${financialSummary.totalQrIn.toFixed(2)}`,
          `Total Transferencias: Bs. ${financialSummary.totalTransferIn.toFixed(2)}`,
        ],
      })
    }

    if (activeReport === 'members') {
      const rows = membersFiltered.map(m => [
        m.memberNumber,
        m.fullName,
        m.ci,
        m.phone,
        m.category.toUpperCase(),
        m.vehiclePlate || 'S/P',
        `Bs. ${m.monthlyFee.toFixed(2)}`,
        m.status.toUpperCase(),
      ])
      return generateOperationalReportPdf({
        title: 'Directorio Oficial de Socios Afiliados',
        subtitle: `Total afiliados registrados: ${membersFiltered.length}`,
        headers: ['N° Socio', 'Nombre Completo', 'CI', 'Teléfono', 'Categoría', 'Placa', 'Cuota Pactada', 'Estado'],
        rows,
        summaryLines: [`Total Socios: ${membersFiltered.length}`],
      })
    }

    if (activeReport === 'union_dues') {
      const rows = duesFiltered.map(d => [
        d.periodLabel,
        d.memberNumber,
        d.memberName,
        `Bs. ${d.amount.toFixed(2)}`,
        `Bs. ${d.paidAmount.toFixed(2)}`,
        `Bs. ${d.balance.toFixed(2)}`,
        d.status === 'paid' ? 'AL DÍA' : d.status === 'partial' ? 'PARCIAL' : 'PENDIENTE',
      ])
      const totalRec = duesFiltered.reduce((acc, d) => acc + d.paidAmount, 0)
      const totalDeb = duesFiltered.reduce((acc, d) => acc + d.balance, 0)
      return generateOperationalReportPdf({
        title: 'Reporte de Cuotas y Mensualidades Sindicales',
        subtitle: dateSubtitle,
        headers: ['Período', 'N° Socio', 'Nombre del Socio', 'Obligación', 'Abonado', 'Saldo', 'Estado'],
        rows,
        summaryLines: [
          `Total Recaudado por Aportes: Bs. ${totalRec.toFixed(2)}`,
          `Deuda Acumulada por Cobrar: Bs. ${totalDeb.toFixed(2)}`,
        ],
      })
    }

    if (activeReport === 'worker_payments') {
      const rows = workerPaymentsFiltered.map(p => [
        new Date(p.date).toLocaleDateString('es-BO'),
        p.receiptNumber,
        p.workerName,
        p.type.toUpperCase(),
        p.periodOrConcept,
        p.paymentMethod.toUpperCase(),
        `Bs. ${p.amount.toFixed(2)}`,
      ])
      const total = workerPaymentsFiltered.reduce((acc, p) => acc + p.amount, 0)
      return generateOperationalReportPdf({
        title: 'Reporte de Pagos al Personal y Choferes',
        subtitle: dateSubtitle,
        headers: ['Fecha', 'Comprobante', 'Trabajador', 'Tipo', 'Glosa / Concepto', 'Método', 'Importe'],
        rows,
        summaryLines: [`Total Desembolsado a Trabajadores: Bs. ${total.toFixed(2)}`],
      })
    }

    if (activeReport === 'union_expenses') {
      const rows = expensesFiltered.map(e => [
        new Date(e.date).toLocaleDateString('es-BO'),
        e.receiptNumber,
        e.category.toUpperCase(),
        e.description,
        e.paymentMethod.toUpperCase(),
        e.invoiceOrVoucherNumber || 'S/N',
        `Bs. ${e.amount.toFixed(2)}`,
      ])
      const total = expensesFiltered.reduce((acc, e) => acc + e.amount, 0)
      return generateOperationalReportPdf({
        title: 'Reporte de Gastos Operativos del Sindicato',
        subtitle: dateSubtitle,
        headers: ['Fecha', 'Comprobante', 'Categoría', 'Descripción', 'Método', 'N° Factura', 'Importe'],
        rows,
        summaryLines: [`Total Gastos Operativos: Bs. ${total.toFixed(2)}`],
      })
    }

    // activeReport === 'union_balance' (Resultado Operativo)
    const rows = [
      ['Ingresos por Fletes Encomiendas (Origen)', `Bs. ${financialSummary.byCategory.shippingOriginIncome.toFixed(2)}`],
      ['Ingresos por Fletes Encomiendas (Destino COD)', `Bs. ${financialSummary.byCategory.shippingDestIncome.toFixed(2)}`],
      ['Ingresos por Cuotas y Mensualidades Socios', `Bs. ${financialSummary.byCategory.unionDuesIncome.toFixed(2)}`],
      ['Otros Ingresos Registrados', `Bs. ${financialSummary.byCategory.otherIncome.toFixed(2)}`],
      ['TOTAL INGRESOS BRUTOS DEL PERÍODO', `Bs. ${financialSummary.totalIncomeAllMethods.toFixed(2)}`],
      ['(-) Total Egresos a Trabajadores (Sueldos/Viajes)', `Bs. ${financialSummary.expenses.totalWorkerPayments.toFixed(2)}`],
      ['(-) Gastos Generales Sindicato (Alquiler, Servicios, etc.)', `Bs. ${financialSummary.expenses.standaloneUnionExpenses.toFixed(2)}`],
      ['TOTAL EGRESOS OPERATIVOS DEL PERÍODO', `Bs. ${financialSummary.expenses.totalOperationalExpenses.toFixed(2)}`],
      ['RESULTADO OPERATIVO NETO', `Bs. ${financialSummary.netOperatingBalance.toFixed(2)}`],
    ]

    return generateOperationalReportPdf({
      title: 'Resultado Operativo & Resumen Financiero',
      subtitle: `${dateSubtitle} · Ingresos cobrados vs Egresos del período`,
      headers: ['Concepto Operativo / Económico', 'Importe (Bs.)'],
      rows,
      summaryLines: [
        `Efectivo en Gaveta de Caja: Bs. ${financialSummary.expectedCashInDrawer.toFixed(2)}`,
        `Resultado Operativo Neto del Período: Bs. ${financialSummary.netOperatingBalance.toFixed(2)}`,
      ],
    })
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
      const doc = await buildCurrentReportPdf()
      if (doc) downloadPdf(doc.url, doc.filename)
    } catch (err) {
      console.error('Error exportando reporte:', err)
    } finally {
      setIsExporting(false)
    }
  }

  // Imprime ÚNICAMENTE el reporte seleccionado mediante iframe aislado
  const handlePrint = async () => {
    setIsExporting(true)
    try {
      const doc = await buildCurrentReportPdf()
      if (!doc) return

      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.src = doc.url
      document.body.appendChild(iframe)

      iframe.onload = () => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => {
          document.body.removeChild(iframe)
        }, 3000)
      }
    } catch (err) {
      console.error('Error imprimiendo reporte:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const downloadPdf = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Selector de reportes y exportación */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Centro de Reportes & Trazabilidad</h3>
            <p className="text-xs text-slate-500">Informes operativos, movimientos de caja y resultado financiero</p>
          </div>
        </div>

        {/* Filtros de Fecha */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
          <Calendar className="w-4 h-4 text-slate-500" />
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-slate-600">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-slate-600">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800"
            />
          </div>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={clearDates}
              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-200 transition"
              title="Limpiar fechas"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-white text-xs flex items-center gap-2 shadow-xs transition disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            <span>{isExporting ? 'Procesando…' : 'Descargar PDF'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isExporting}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 font-bold text-white text-xs flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
            title="Imprimir únicamente el reporte seleccionado"
          >
            <Printer className="w-4 h-4 text-teal-400" />
            <span className="hidden sm:inline">Imprimir Reporte</span>
          </button>
        </div>
      </div>

      {/* Selector de tipo de reporte */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveReport('shipments')}
          className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'shipments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Encomiendas ({shipmentsFiltered.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveReport('manifests')}
          className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'manifests' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Manifiestos ({manifestsFiltered.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveReport('cash')}
          className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'cash' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Caja & Movimientos ({cashMovementsFiltered.length})
        </button>

        {isSyndicate && (
          <>
            <button
              type="button"
              onClick={() => setActiveReport('members')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'members' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Socios ({membersFiltered.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('union_dues')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'union_dues' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-amber-900 hover:text-amber-950'}`}
            >
              Mensualidades ({duesFiltered.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('worker_payments')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'worker_payments' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-amber-900 hover:text-amber-950'}`}
            >
              Personal ({workerPaymentsFiltered.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('union_expenses')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'union_expenses' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-amber-900 hover:text-amber-950'}`}
            >
              Gastos ({expensesFiltered.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('union_balance')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'union_balance' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-950 hover:text-amber-900'}`}
            >
              Resultado Operativo
            </button>
          </>
        )}
      </div>

      {/* Vista viva del reporte activo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {/* REPORTE 1: ENCOMIENDAS */}
        {activeReport === 'shipments' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Listado Detallado de Encomiendas Registradas
              </h4>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 text-[11px]">Estado:</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg p-1 text-xs font-medium"
                >
                  <option value="all">Todos los estados</option>
                  <option value="received">Recibidas en origen</option>
                  <option value="dispatched">Despachadas</option>
                  <option value="in_transit">En tránsito</option>
                  <option value="ready_for_pickup">Listas para entrega</option>
                  <option value="delivered">Entregadas</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Guía</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Ruta</th>
                    <th className="py-2.5 px-3">Remitente</th>
                    <th className="py-2.5 px-3">Destinatario</th>
                    <th className="py-2.5 px-3">Contenido</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                    <th className="py-2.5 px-3 text-right">Cobro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shipmentsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        No hay encomiendas para el rango y filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    shipmentsFiltered.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{s.trackingCode}</td>
                        <td className="py-2 px-3 text-slate-500">{new Date(s.createdAt).toLocaleDateString('es-BO')}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700">{s.originCity} → {s.destinationCity}</td>
                        <td className="py-2 px-3 text-slate-800">{s.sender.name}</td>
                        <td className="py-2 px-3 text-slate-800">{s.recipient.name}</td>
                        <td className="py-2 px-3 text-slate-600 text-[11px] max-w-[180px] truncate">{s.declaredSummary}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-slate-900">Bs. {s.finalAmount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 2: MANIFIESTOS */}
        {activeReport === 'manifests' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Manifiestos de Despacho Interdepartamental
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Manifiesto</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Destino</th>
                    <th className="py-2.5 px-3">Conductor</th>
                    <th className="py-2.5 px-3">Placa</th>
                    <th className="py-2.5 px-3 text-center">Guías</th>
                    <th className="py-2.5 px-3 text-center">Bultos</th>
                    <th className="py-2.5 px-3 text-right">Peso Total</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {manifestsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400">
                        No hay manifiestos registrados en este período.
                      </td>
                    </tr>
                  ) : (
                    manifestsFiltered.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{m.manifestNumber}</td>
                        <td className="py-2 px-3 text-slate-500">{new Date(m.createdAt).toLocaleDateString('es-BO')}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700">{m.destinationCity}</td>
                        <td className="py-2 px-3 text-slate-800">{m.driverOrResponsible}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{m.vehiclePlate || 'S/P'}</td>
                        <td className="py-2 px-3 text-center font-bold text-slate-900">{m.parcelIds.length}</td>
                        <td className="py-2 px-3 text-center text-slate-700">{m.totalPackages}</td>
                        <td className="py-2 px-3 text-right font-medium text-slate-900">{m.totalWeightKg} kg</td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 3: CAJA & MOVIMIENTOS */}
        {activeReport === 'cash' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Auditoría de Movimientos y Flujo de Caja
              </h4>
              <div className="text-xs font-bold text-slate-700">
                Efectivo en Gaveta: <span className="text-teal-900 font-black">Bs. {financialSummary.expectedCashInDrawer.toFixed(2)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Fecha y Hora</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Concepto / Glosa</th>
                    <th className="py-2.5 px-3">Método</th>
                    <th className="py-2.5 px-3">Turno / Estado</th>
                    <th className="py-2.5 px-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashMovementsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No hay movimientos registrados en este período.
                      </td>
                    </tr>
                  ) : (
                    cashMovementsFiltered.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                          {new Date(m.timestamp).toLocaleDateString('es-BO')} {new Date(m.timestamp).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {m.type === 'income' ? 'INGRESO' : 'EGRESO'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700 uppercase font-semibold text-[11px]">{m.category}</td>
                        <td className="py-2 px-3 text-slate-800 max-w-[220px] truncate">{m.concept}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700 uppercase text-[11px]">{m.paymentMethod}</td>
                        <td className="py-2 px-3 text-[11px]">
                          {m.shiftId === 'pending_reconciliation' ? (
                            <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Sin turno (Conciliar)
                            </span>
                          ) : (
                            <span className="text-slate-500">Asignado</span>
                          )}
                        </td>
                        <td className={`py-2 px-3 text-right font-black ${m.type === 'income' ? 'text-emerald-900' : 'text-red-900'}`}>
                          {m.type === 'income' ? '+' : '-'} Bs. {m.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 4: SOCIOS */}
        {activeReport === 'members' && isSyndicate && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Directorio y Padrón de Socios Sindicales
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">N° Socio</th>
                    <th className="py-2.5 px-3">Nombre Completo</th>
                    <th className="py-2.5 px-3">CI</th>
                    <th className="py-2.5 px-3">Teléfono</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Placa Vehículo</th>
                    <th className="py-2.5 px-3 text-right">Cuota Mensual</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {membersFiltered.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{m.memberNumber}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{m.fullName}</td>
                      <td className="py-2 px-3 text-slate-600">{m.ci}</td>
                      <td className="py-2 px-3 text-slate-600">{m.phone}</td>
                      <td className="py-2 px-3 text-slate-700 capitalize">{m.category.replace('_', ' ')}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{m.vehiclePlate || 'S/P'}</td>
                      <td className="py-2 px-3 text-right font-black text-slate-900">Bs. {m.monthlyFee.toFixed(2)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${m.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 5: CUOTAS */}
        {activeReport === 'union_dues' && isSyndicate && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Recaudación y Deuda de Mensualidades Sindicales
              </h4>
              <div className="text-xs space-x-3">
                <span>Cobrado: <strong className="text-emerald-800">Bs. {duesFiltered.reduce((acc, d) => acc + d.paidAmount, 0).toFixed(2)}</strong></span>
                <span>Pendiente: <strong className="text-amber-800">Bs. {duesFiltered.reduce((acc, d) => acc + d.balance, 0).toFixed(2)}</strong></span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Período</th>
                    <th className="py-2.5 px-3">Socio</th>
                    <th className="py-2.5 px-3">Vencimiento</th>
                    <th className="py-2.5 px-3 text-right">Monto Cuota</th>
                    <th className="py-2.5 px-3 text-right">Abonado</th>
                    <th className="py-2.5 px-3 text-right">Saldo Deudor</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {duesFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No hay cuotas en este período.
                      </td>
                    </tr>
                  ) : (
                    duesFiltered.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-900">{d.periodLabel}</td>
                        <td className="py-2 px-3 text-slate-800">{d.memberName} ({d.memberNumber})</td>
                        <td className="py-2 px-3 text-slate-500">{d.dueDate}</td>
                        <td className="py-2 px-3 text-right font-medium text-slate-900">Bs. {d.amount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">Bs. {d.paidAmount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-black text-amber-900">Bs. {d.balance.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${d.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : d.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                            {d.status === 'paid' ? 'Al día' : d.status === 'partial' ? 'Parcial' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 6: PAGOS A TRABAJADORES */}
        {activeReport === 'worker_payments' && isSyndicate && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Egresos por Planilla, Anticipos y Viáticos de Personal
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Recibo</th>
                    <th className="py-2.5 px-3">Trabajador</th>
                    <th className="py-2.5 px-3">Concepto / Período</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Método</th>
                    <th className="py-2.5 px-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workerPaymentsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No hay pagos a personal registrados en este período.
                      </td>
                    </tr>
                  ) : (
                    workerPaymentsFiltered.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500">{new Date(p.date).toLocaleDateString('es-BO')}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{p.receiptNumber}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{p.workerName}</td>
                        <td className="py-2 px-3 text-slate-700">{p.periodOrConcept}</td>
                        <td className="py-2 px-3">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                            {p.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-600 uppercase">{p.paymentMethod}</td>
                        <td className="py-2 px-3 text-right font-black text-red-900">Bs. {p.amount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 7: GASTOS SINDICALES */}
        {activeReport === 'union_expenses' && isSyndicate && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Egresos Operativos y Mantenimiento del Sindicato
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Comprobante</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Descripción</th>
                    <th className="py-2.5 px-3">Método</th>
                    <th className="py-2.5 px-3">N° Factura</th>
                    <th className="py-2.5 px-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expensesFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No hay gastos operativos registrados en este período.
                      </td>
                    </tr>
                  ) : (
                    expensesFiltered.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500">{new Date(e.date).toLocaleDateString('es-BO')}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{e.receiptNumber}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800 uppercase text-[11px]">{e.category}</td>
                        <td className="py-2 px-3 text-slate-700">{e.description}</td>
                        <td className="py-2 px-3 font-medium text-slate-600 uppercase">{e.paymentMethod}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{e.invoiceOrVoucherNumber || 'S/N'}</td>
                        <td className="py-2 px-3 text-right font-black text-red-900">Bs. {e.amount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTE 8: RESULTADO OPERATIVO (RENOMBRADO DE BALANCE GENERAL) */}
        {activeReport === 'union_balance' && isSyndicate && (
          <div className="p-6 space-y-6">
            <div className="border-b pb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-black text-slate-900">Resultado Operativo & Resumen Financiero</h4>
                <p className="text-xs text-slate-500">
                  Consolidado de ingresos efectivamente cobrados vs egresos operativos del período sin duplicación
                </p>
              </div>
              <div className="text-xs text-slate-500">
                {startDate || endDate ? `Período: ${startDate || 'Inicio'} a ${endDate || 'Hoy'}` : 'Todo el período'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl">
                <span className="text-xs font-bold text-teal-800 block">Total Ingresos Cobrados</span>
                <span className="text-2xl font-black text-teal-950">Bs. {financialSummary.totalIncomeAllMethods.toFixed(2)}</span>
                <span className="text-[11px] text-teal-700 block mt-1">
                  (Fletes: Bs. {(financialSummary.byCategory.shippingOriginIncome + financialSummary.byCategory.shippingDestIncome).toFixed(2)} · Cuotas: Bs. {financialSummary.byCategory.unionDuesIncome.toFixed(2)})
                </span>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                <span className="text-xs font-bold text-red-800 block">Total Egresos Operativos</span>
                <span className="text-2xl font-black text-red-950">Bs. {financialSummary.expenses.totalOperationalExpenses.toFixed(2)}</span>
                <span className="text-[11px] text-red-700 block mt-1">
                  (Trabajadores: Bs. {financialSummary.expenses.totalWorkerPayments.toFixed(2)} · Gastos Grales: Bs. {financialSummary.expenses.standaloneUnionExpenses.toFixed(2)})
                </span>
              </div>

              <div className={`p-4 rounded-2xl border ${financialSummary.netOperatingBalance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <span className="text-xs font-bold text-slate-700 block">Resultado Operativo Neto</span>
                <span className={`text-2xl font-black ${financialSummary.netOperatingBalance >= 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                  Bs. {financialSummary.netOperatingBalance.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  {financialSummary.netOperatingBalance >= 0 ? 'Superávit operativo del período' : 'Déficit operativo del período'}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-slate-900 uppercase">Trazabilidad y Conciliación:</div>
              <div className="flex justify-between">
                <span>Efectivo Contable en Gaveta de Ventanilla:</span>
                <strong className="font-black text-slate-900">Bs. {financialSummary.expectedCashInDrawer.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Cobros Digitales / Bancarios QR (En cuenta bancaria):</span>
                <strong className="font-bold text-teal-800">Bs. {financialSummary.totalQrIn.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Cobros vía Transferencia Directa:</span>
                <strong className="font-bold text-teal-800">Bs. {financialSummary.totalTransferIn.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
