import { useState } from 'react'
import {
  FileText,
  FileDown,
  Printer,
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
  | 'union_dues'
  | 'worker_payments'
  | 'union_balance'

export function ParcelReportsView({ state }: ParcelReportsViewProps) {
  const isSyndicate = state.edition === 'sindicato'
  const [activeReport, setActiveReport] = useState<ReportType>('shipments')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isExporting, setIsExporting] = useState(false)

  // Reporte 1: Encomiendas
  const shipmentsFiltered = state.shipments.filter(s => {
    if (statusFilter === 'all') return true
    return s.status === statusFilter
  })

  // Reporte 6: Balance Integral Sindical
  const financialSummary = calculateFinancialSummary({
    movements: state.cashMovements,
    workerPayments: state.workerPayments,
    unionExpenses: state.unionExpenses,
    initialCash: state.activeShift?.initialCash || 0,
  })

  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
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

        const { url, filename } = await generateOperationalReportPdf({
          title: 'Reporte Operativo de Encomiendas',
          subtitle: `Filtro: ${statusFilter === 'all' ? 'Todas las encomiendas' : statusFilter.toUpperCase()}`,
          headers: ['Guía', 'Fecha', 'Origen', 'Destino', 'Remitente', 'Destinatario', 'Contenido', 'Estado', 'Cobro', 'Monto'],
          rows,
          summaryLines: [
            `Total Guías Listadas: ${shipmentsFiltered.length}`,
            `Importe Total Registrado: Bs. ${total.toFixed(2)}`,
          ],
        })
        downloadPdf(url, filename)
      } else if (activeReport === 'manifests') {
        const rows = state.manifests.map(m => [
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

        const { url, filename } = await generateOperationalReportPdf({
          title: 'Reporte de Manifiestos de Despacho',
          subtitle: 'Historial de salidas interdepartamentales',
          headers: ['N° Manifiesto', 'Fecha', 'Destino', 'Conductor / Responsable', 'Placa', 'Guías', 'Bultos', 'Peso', 'Estado'],
          rows,
          summaryLines: [`Total Manifiestos: ${state.manifests.length}`],
        })
        downloadPdf(url, filename)
      } else if (activeReport === 'cash') {
        const rows = state.cashMovements.map(m => [
          new Date(m.timestamp).toLocaleTimeString('es-BO'),
          m.type === 'income' ? 'INGRESO' : 'EGRESO',
          m.category.toUpperCase(),
          m.concept,
          m.paymentMethod.toUpperCase(),
          m.operatorName,
          `Bs. ${m.amount.toFixed(2)}`,
        ])

        const { url, filename } = await generateOperationalReportPdf({
          title: 'Reporte de Movimientos de Caja',
          subtitle: 'Ingresos y egresos de ventanilla',
          headers: ['Hora', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Operador', 'Importe'],
          rows,
          summaryLines: [
            `Efectivo Esperado en Gaveta: Bs. ${financialSummary.expectedCashInDrawer.toFixed(2)}`,
            `Total Cobros Digitales QR: Bs. ${financialSummary.totalQrIn.toFixed(2)}`,
          ],
        })
        downloadPdf(url, filename)
      } else if (activeReport === 'union_dues') {
        const rows = state.dues.map(d => [
          d.periodLabel,
          d.memberNumber,
          d.memberName,
          `Bs. ${d.amount.toFixed(2)}`,
          `Bs. ${d.paidAmount.toFixed(2)}`,
          `Bs. ${d.balance.toFixed(2)}`,
          d.status === 'paid' ? 'AL DÍA' : d.status === 'partial' ? 'PARCIAL' : 'PENDIENTE',
        ])

        const totalRec = state.dues.reduce((acc, d) => acc + d.paidAmount, 0)
        const totalDeb = state.dues.reduce((acc, d) => acc + d.balance, 0)

        const { url, filename } = await generateOperationalReportPdf({
          title: 'Reporte de Cuotas y Mensualidades Sindicales',
          subtitle: 'Estado de aportes por socio y recaudación',
          headers: ['Período', 'N° Socio', 'Nombre del Socio', 'Obligación', 'Abonado', 'Saldo', 'Estado'],
          rows,
          summaryLines: [
            `Total Recaudado por Aportes: Bs. ${totalRec.toFixed(2)}`,
            `Deuda Acumulada por Cobrar: Bs. ${totalDeb.toFixed(2)}`,
          ],
        })
        downloadPdf(url, filename)
      } else if (activeReport === 'worker_payments') {
        const rows = state.workerPayments.map(p => [
          new Date(p.date).toLocaleDateString('es-BO'),
          p.receiptNumber,
          p.workerName,
          p.type.toUpperCase(),
          p.periodOrConcept,
          p.paymentMethod.toUpperCase(),
          `Bs. ${p.amount.toFixed(2)}`,
        ])
        const total = state.workerPayments.reduce((acc, p) => acc + p.amount, 0)

        const { url, filename } = await generateOperationalReportPdf({
          title: 'Reporte de Pagos al Personal y Choferes',
          subtitle: 'Sueldos, anticipos y viáticos operativos',
          headers: ['Fecha', 'Comprobante', 'Trabajador', 'Tipo', 'Glosa / Concepto', 'Método', 'Importe'],
          rows,
          summaryLines: [`Total Desembolsado a Trabajadores: Bs. ${total.toFixed(2)}`],
        })
        downloadPdf(url, filename)
      } else if (activeReport === 'union_balance') {
        const rows = [
          ['Ingresos por Fletes Encomiendas (Origen)', `Bs. ${financialSummary.byCategory.shippingOriginIncome.toFixed(2)}`],
          ['Ingresos por Fletes Encomiendas (Destino COD)', `Bs. ${financialSummary.byCategory.shippingDestIncome.toFixed(2)}`],
          ['Ingresos por Cuotas y Mensualidades Socios', `Bs. ${financialSummary.byCategory.unionDuesIncome.toFixed(2)}`],
          ['Otros Ingresos Registrados', `Bs. ${financialSummary.byCategory.otherIncome.toFixed(2)}`],
          ['TOTAL INGRESOS BRUTOS DEL PERÍODO', `Bs. ${financialSummary.totalIncomeAllMethods.toFixed(2)}`],
          ['(-) Total Egresos a Trabajadores (Sueldos/Viajes)', `Bs. ${financialSummary.expenses.totalWorkerPayments.toFixed(2)}`],
          ['(-) Gastos Generales Sindicato (Luz, Alquiler, etc.)', `Bs. ${financialSummary.expenses.standaloneUnionExpenses.toFixed(2)}`],
          ['TOTAL EGRESOS OPERATIVOS DEL PERÍODO', `Bs. ${financialSummary.expenses.totalOperationalExpenses.toFixed(2)}`],
          ['RESULTADO OPERATIVO NETO', `Bs. ${financialSummary.netOperatingBalance.toFixed(2)}`],
        ]

        const { url, filename } = await generateOperationalReportPdf({
          title: 'Balance General Integral del Sindicato',
          subtitle: 'Consolidado económico de encomiendas y administración sindical',
          headers: ['Concepto Económico', 'Monto (Bs.)'],
          rows,
          summaryLines: [
            `Efectivo en Gaveta de Caja: Bs. ${financialSummary.expectedCashInDrawer.toFixed(2)}`,
            `Resultado Operativo Neto del Período: Bs. ${financialSummary.netOperatingBalance.toFixed(2)}`,
          ],
        })
        downloadPdf(url, filename)
      }
    } catch (err) {
      console.error('Error exportando reporte:', err)
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
            <h3 className="text-base font-black text-slate-900 tracking-tight">Centro de Reportes & Exportación PDF</h3>
            <p className="text-xs text-slate-500">Trazabilidad operativa, auditoría de caja y balances del sindicato</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-white text-xs flex items-center gap-2 shadow-xs transition"
          >
            <FileDown className="w-4 h-4" />
            <span>{isExporting ? 'Generando PDF…' : 'Descargar Reporte en PDF'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs flex items-center gap-1.5 transition"
            title="Imprimir pantalla"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* Selector de tipo de reporte */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveReport('shipments')}
          className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'shipments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Encomiendas ({state.shipments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveReport('manifests')}
          className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'manifests' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Manifiestos ({state.manifests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveReport('cash')}
          className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'cash' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Caja & Movimientos ({state.cashMovements.length})
        </button>

        {isSyndicate && (
          <>
            <button
              type="button"
              onClick={() => setActiveReport('union_dues')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'union_dues' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-amber-800'}`}
            >
              Cuotas Socios ({state.dues.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('worker_payments')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'worker_payments' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-amber-800'}`}
            >
              Pagos Personal ({state.workerPayments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('union_balance')}
              className={`px-3 py-1.5 rounded-xl transition ${activeReport === 'union_balance' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-900'}`}
            >
              Balance General
            </button>
          </>
        )}
      </div>

      {/* Vista previa viva del reporte activo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {activeReport === 'shipments' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Listado Detallado de Encomiendas Registradas
              </h4>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 text-[11px]">Filtrar por estado:</span>
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
                  {shipmentsFiltered.map(s => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === 'union_balance' && (
          <div className="p-6 space-y-6">
            <div className="border-b pb-4">
              <h4 className="text-base font-black text-slate-900">Estado de Resultados & Balance Operativo del Período</h4>
              <p className="text-xs text-slate-500">Separación clara entre flujo de caja y resultado económico sin duplicación</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl">
                <span className="text-xs font-bold text-teal-800 block">Total Ingresos Reconocidos</span>
                <span className="text-2xl font-black text-teal-950">Bs. {financialSummary.totalIncomeAllMethods.toFixed(2)}</span>
                <span className="text-[11px] text-teal-700 block mt-1">
                  (Fletes: Bs. {(financialSummary.byCategory.shippingOriginIncome + financialSummary.byCategory.shippingDestIncome).toFixed(2)} · Cuotas: Bs. {financialSummary.byCategory.unionDuesIncome.toFixed(2)})
                </span>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                <span className="text-xs font-bold text-red-800 block">Total Egresos Operativos</span>
                <span className="text-2xl font-black text-red-950">Bs. {financialSummary.expenses.totalOperationalExpenses.toFixed(2)}</span>
                <span className="text-[11px] text-red-700 block mt-1">
                  (Sueldos/Viajes: Bs. {financialSummary.expenses.totalWorkerPayments.toFixed(2)} · Gastos Grales: Bs. {financialSummary.expenses.standaloneUnionExpenses.toFixed(2)})
                </span>
              </div>

              <div className={`p-4 rounded-2xl border ${financialSummary.netOperatingBalance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <span className="text-xs font-bold text-slate-700 block">Resultado Operativo Neto</span>
                <span className={`text-2xl font-black ${financialSummary.netOperatingBalance >= 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                  Bs. {financialSummary.netOperatingBalance.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block mt-1">Superávit económico del ejercicio</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-slate-900 uppercase">Conciliación con Caja Física:</div>
              <div className="flex justify-between">
                <span>Efectivo Físico en Gaveta de Ventanilla:</span>
                <strong className="font-black text-slate-900">Bs. {financialSummary.expectedCashInDrawer.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Cobros Digitales / Bancarios QR (No están en gaveta física):</span>
                <strong className="font-bold text-teal-800">Bs. {financialSummary.totalQrIn.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        )}

        {(activeReport === 'manifests' || activeReport === 'cash' || activeReport === 'union_dues' || activeReport === 'worker_payments') && (
          <div className="p-6 text-center text-xs text-slate-500 space-y-3">
            <p>Los datos correspondientes a este reporte están listos para previsualización y descarga inmediata.</p>
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold inline-flex items-center gap-2"
            >
              <FileDown className="w-4 h-4 text-teal-400" />
              <span>Generar y Descargar Reporte en PDF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
