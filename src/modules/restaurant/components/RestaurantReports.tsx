import { Calendar, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Order } from '../../../types'
import type { RestaurantShift } from '../views/RestaurantExperience'
import type { InventoryMovement } from '../domain/inventoryEngine'
import { calculateCashShiftSummary } from '../domain/cashEngine'
import type { BusinessDocumentContext } from '../../../core/businessIdentity'
import { localDateKey, isInReportPeriod } from '../../../core/reports/reportPeriod'
import { canUseReportCapability } from '../../../core/reports/reportCapabilities'
import { authorizeBusinessReportCapability } from '../../../core/reports/reportAuthorization'
import { makeBusinessReport, type ReportSheet } from '../../../core/reports/reportTypes'
import { exportBusinessReport } from '../../../core/reports/reportExport'
import { getActiveTenant } from '../../../store/activeTenant'
import { isDemoModeActive } from '../../../demo/core/demoContext'
import { printBusinessReport } from '../../../core/reports/businessReportPrintService'
import { reportSourceMayBeTruncated } from '../../../core/reports/reportCompleteness'
import { assertReportSourceComplete } from '../../../core/reports/reportCompleteness'
import { canUseDocumentCapability } from '../../../core/documents/documentCapabilities'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function RestaurantReports({ orders, shift, stockMovements = [], tenantId, branchId, identity }: {
  orders: Order[]; shift: RestaurantShift | null; stockMovements?: InventoryMovement[]
  tenantId: string; branchId: string; identity: BusinessDocumentContext
}) {
  const timeZone = getActiveTenant()?.tenant.configuration?.timezone || 'America/La_Paz'
  const [startDate, setStartDate] = useState(() => localDateKey(new Date(), timeZone))
  const [endDate, setEndDate] = useState(() => localDateKey(new Date(), timeZone))
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const period = useMemo(() => ({ startDate, endDate, timeZone }), [startDate, endDate, timeZone])
  const sales = useMemo(() => orders.filter(order => order.paymentStatus === 'paid' && order.status !== 'cancelled'
    && isInReportPeriod(order.paidAt || order.createdAt, period)), [orders, period])
  const reportSales = useMemo(() => sales.map(order => ({ ...order, shiftId: '__reports__' })), [sales])
  const summary = calculateCashShiftSummary(0, reportSales, '__reports__', [])
  const selectedMovements = useMemo(() => stockMovements.filter(item => isInReportPeriod(item.createdAt, period)), [stockMovements, period])
  const byProduct = new Map<string, { name: string; count: number; total: number }>()
  for (const order of sales) for (const item of order.items) {
    const key = item.productId || item.id, previous = byProduct.get(key)
    byProduct.set(key, { name: item.name, count: (previous?.count || 0) + item.quantity, total: (previous?.total || 0) + item.lineTotal })
  }
  const top = [...byProduct.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  const inventory = new Map<string, { name: string; sold: number; returned: number; other: number }>()
  for (const movement of selectedMovements) {
    const row = inventory.get(movement.productId) || { name: movement.productName || movement.productId, sold: 0, returned: 0, other: 0 }
    if (movement.type === 'sale' || movement.type === 'command_consumption') row.sold += -movement.quantityBase
    else if (movement.type === 'cancellation_return') row.returned += movement.quantityBase
    else if (['waste', 'loss', 'courtesy', 'internal_consumption'].includes(movement.type)) row.other += -movement.quantityBase
    inventory.set(movement.productId, row)
  }
  const paymentRows = [
    ['Efectivo', summary.cashSales], ['QR', summary.qrSales], ['Tarjeta', summary.cardSales],
  ] as const
  const sheets: ReportSheet[] = [
    { name: 'Resumen', headers: ['Concepto', 'Valor'], rows: [['Ventas pagadas (Bs)', summary.totalSales], ['Órdenes pagadas', sales.length], ...paymentRows.map(([label, value]) => [`Ventas ${label} (Bs)`, value] as (string | number)[])] },
    { name: 'Productos', headers: ['Producto', 'Unidades', 'Ventas (Bs)'], rows: top.map(item => [item.name, item.count, item.total]) },
    { name: 'Inventario', headers: ['Insumo', 'Consumo registrado', 'Devolución', 'Otras salidas'], rows: [...inventory.values()].map(row => [row.name, row.sold, row.returned, row.other]) },
  ]
  const capability = canUseReportCapability(getActiveTenant()?.tenant, 'reports.export')
  const printCapability = canUseDocumentCapability(getActiveTenant()?.tenant, 'printing.manual')
  const detailed = canUseReportCapability(getActiveTenant()?.tenant, 'reports.detailed')
  // Test the source snapshot before date filtering: an older period may have
  // zero matching rows while the latest-100 listener has omitted older records.
  const historyIncomplete = reportSourceMayBeTruncated(stockMovements.length, 100)
  const runExport = async (format: 'pdf' | 'excel') => {
    setExporting(true); setError('')
    try {
      if (startDate > endDate) throw new Error('La fecha inicial debe ser igual o anterior a la fecha final.')
      assertReportSourceComplete(stockMovements.length, 100, 'El historial de movimientos')
      const active = getActiveTenant()
      if (active) await authorizeBusinessReportCapability(tenantId, branchId, 'reports.export')
      else if (!isDemoModeActive()) throw new Error('La empresa activa debe cargarse antes de exportar.')
      const report = makeBusinessReport({ tenantId, branchId, businessType: active?.tenant.businessType || 'restaurant_pos', generatedAt: new Date().toISOString(), period, identity, completeness: 'complete', recordCount: sales.length + selectedMovements.length, warnings: shift ? [`El reporte incluye todas las ventas pagadas del rango, no solo el turno activo (${shift.openedAt.slice(0, 10)}).`] : [], sheets: detailed ? sheets : [sheets[0]] })
      await exportBusinessReport(report, format)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar el reporte.') }
    finally { setExporting(false) }
  }
  const runPrint = async () => {
    if (sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 500) { setError('El informe supera 500 filas para impresión; descarga el PDF o Excel completo.'); return }
    setExporting(true); setError('')
    try {
      assertReportSourceComplete(stockMovements.length, 100, 'El historial de movimientos')
      const active = getActiveTenant()
      if (active) await authorizeBusinessReportCapability(tenantId, branchId, 'printing.manual')
      else if (!isDemoModeActive()) throw new Error('La empresa activa debe cargarse antes de imprimir.')
      const report = makeBusinessReport({ tenantId, branchId, businessType: active?.tenant.businessType || 'restaurant_pos', generatedAt: new Date().toISOString(), period, identity, completeness: 'complete', recordCount: sales.length + selectedMovements.length, warnings: [], sheets: detailed ? sheets : [sheets[0]] })
      setError(await printBusinessReport(report))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo imprimir el reporte.') }
    finally { setExporting(false) }
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Reportes de Salón & Ventas</h1><p className="text-sm text-slate-500">Ventas cobradas e inventario registrado, por periodo en {timeZone}.</p></div><div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-xs"><Calendar size={16} /><label>Desde<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="ml-2 rounded border p-1" /></label><label>Hasta<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="ml-2 rounded border p-1" /></label></div></header>
    {historyIncomplete && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Se alcanzó el límite de movimientos cargados. La impresión y las exportaciones quedan bloqueadas para evitar presentar datos parciales.</p>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={exporting || !capability || historyIncomplete} onClick={() => void runExport('pdf')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"><Download size={15} />PDF</button><button type="button" disabled={exporting || !capability || historyIncomplete} onClick={() => void runExport('excel')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"><Download size={15} />Excel</button><button type="button" disabled={exporting || !printCapability || historyIncomplete || sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 500} onClick={() => void runPrint()} className="min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Imprimir resumen</button>{!capability && <span className="self-center text-xs text-slate-500">PDF y Excel no están incluidos en las capacidades vigentes.</span>}{!printCapability && <span className="self-center text-xs text-slate-500">Impresión manual no está incluida en las capacidades vigentes.</span>}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-3"><Card label="Total vendido" value={money(summary.totalSales)} /><Card label="Ventas efectivo" value={money(summary.cashSales)} /><Card label="Ventas QR / tarjeta" value={money(summary.qrSales + summary.cardSales)} /></div>
    {detailed ? <><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-bold">Productos más vendidos</h2>{top.length ? <div className="space-y-3">{top.map(item => <div key={item.name}><div className="flex justify-between gap-2 text-xs font-semibold"><span>{item.name}</span><span>{item.count} · {money(item.total)}</span></div></div>)}</div> : <p className="text-sm text-slate-500">Aún no hay ventas cobradas para este periodo.</p>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Consumo de inventario registrado</h2><p className="mb-3 text-xs text-slate-500">Las cantidades derivan de movimientos guardados y conservan la unidad base. No se estiman costos ni recetas ausentes.</p>{historyIncomplete ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">El historial cargado llegó al límite de 100 movimientos. No se muestran totales de inventario porque podrían estar incompletos; aún falta paginación histórica.</p> : inventory.size ? <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Insumo</th><th className="p-2 text-right">Venta/consumo</th><th className="p-2 text-right">Devolución</th><th className="p-2 text-right">Otras salidas</th></tr></thead><tbody>{[...inventory].map(([id, row]) => <tr key={id} className="border-b"><td className="p-2 font-semibold">{row.name}</td><td className="p-2 text-right">{row.sold}</td><td className="p-2 text-right">{row.returned}</td><td className="p-2 text-right">{row.other}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Aún no hay movimientos para este periodo.</p>}</section></> : <p className="text-xs text-slate-500">Desglose de productos e inventario no incluido en las capacidades actuales.</p>}
  </div>
}

function Card({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><strong className="mt-1 block text-2xl text-slate-900">{value}</strong></div> }
