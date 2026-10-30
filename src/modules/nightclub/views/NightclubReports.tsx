import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { exportBusinessReport } from '../../../core/reports/reportExport'
import { makeBusinessReport, type ReportSheet } from '../../../core/reports/reportTypes'
import type { BusinessDocumentContext } from '../../../core/businessIdentity'
import { authorizeBusinessReportCapability } from '../../../core/reports/reportAuthorization'
import { canUseReportCapability } from '../../../core/reports/reportCapabilities'
import { canUseDocumentCapability } from '../../../core/documents/documentCapabilities'
import { reportPeriodUtcRange } from '../../../core/reports/reportPeriod'
import { getActiveTenant } from '../../../store/activeTenant'
import { printBusinessReport } from '../../../core/reports/businessReportPrintService'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubCashSummary } from '../domain/nightclubAccounts'
import { summarizeNightclubReportPayments } from '../domain/nightclubReportPayments'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateKey = (value: number, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)

export function NightclubReports({ data, companyName, tenantId, branchId, identity, tenantMode = false, isolatedDemo = false }: { data: NightclubDataset; companyName: string; tenantId: string; branchId: string; identity: BusinessDocumentContext; tenantMode?: boolean; isolatedDemo?: boolean }) {
  const [range, setRange] = useState<'today' | '7' | '30' | 'all'>('all')
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [referenceTime] = useState(() => Date.now())
  const timeZone = getActiveTenant()?.tenant.configuration?.timezone || 'America/La_Paz'
  const today = dateKey(referenceTime, timeZone)
  const startDate = range === 'all'
    ? data.accounts.flatMap(account => account.payments?.length ? account.payments : account.payment ? [account.payment] : []).map(payment => payment.paidAt).filter(value => Number.isFinite(Date.parse(value))).sort()[0]?.slice(0, 10) || today
    : (() => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (range === 'today' ? 0 : Number(range) - 1)); return dateKey(date.getTime(), timeZone) })()
  const bounds = useMemo(() => range === 'all' ? null : reportPeriodUtcRange({ startDate, endDate: today, timeZone }), [range, startDate, today, timeZone])
  const startInclusiveMs = bounds?.startInclusive.getTime() ?? 0
  const endExclusiveMs = bounds?.endExclusive.getTime() ?? Number.POSITIVE_INFINITY
  const paymentSummary = useMemo(() => summarizeNightclubReportPayments(data.accounts, startInclusiveMs, endExclusiveMs), [data.accounts, startInclusiveMs, endExclusiveMs])
  const accountIds = new Set(paymentSummary.accountIds)
  const accounts = data.accounts.filter(account => accountIds.has(account.id))
  const closedCount = data.accounts.filter(account => account.status === 'closed').length
  const roundCount = data.accounts.reduce((sum, account) => sum + account.rounds.length, 0)
  const paymentCount = data.accounts.reduce((sum, account) => sum + (account.payments?.length || (account.payment ? 1 : 0)), 0)
  const historyIncomplete = closedCount >= 50 || roundCount >= 200 || paymentCount >= 200 || paymentSummary.incomplete
  const canExport = canUseReportCapability(getActiveTenant()?.tenant, 'reports.export') && !historyIncomplete
  const canPrint = canUseDocumentCapability(getActiveTenant()?.tenant, 'printing.manual') && !historyIncomplete
  const detailed = canUseReportCapability(getActiveTenant()?.tenant, 'reports.detailed')
  const byOperator = [...new Set(paymentSummary.events.filter(event => event.kind === 'collection').map(event => event.paidBy))]
    .map(name => ({ name, amount: paymentSummary.events.filter(event => event.kind === 'collection' && event.paidBy === name).reduce((sum, event) => sum + event.amount, 0) }))
    .sort((a, b) => b.amount - a.amount)
  const rounds = accounts.flatMap(account => account.rounds.filter(round => round.status !== 'cancelled').map(round => ({ account, round })))
  const productTotals = [...new Set(rounds.flatMap(({ round }) => round.items.filter(item => item.status !== 'cancelled' && item.status !== 'returned').map(item => item.productId)))].map(id => {
    const rows = rounds.flatMap(({ round }) => round.items.filter(item => item.productId === id && item.status !== 'cancelled' && item.status !== 'returned'))
    return { id, name: rows[0]?.name || id, units: rows.reduce((sum, item) => sum + item.quantity, 0) }
  }).sort((a, b) => b.units - a.units)
  const cash = nightclubCashSummary(data)
  const paymentRows = paymentSummary.events.map(event => {
    const account = data.accounts.find(item => item.id === event.accountId)
    return [new Date(event.at).toLocaleString('es-BO', { timeZone }), account ? nightclubAccountLabel(account, data) : 'Cuenta', event.paidBy, event.kind === 'refund' ? 'Devolución' : event.method.toUpperCase(), event.amount]
  })
  const sheets: ReportSheet[] = [
    { name: 'Resumen', headers: ['Concepto', 'Valor'], rows: [
      ['Cobros brutos del período (Bs)', paymentSummary.grossCollections],
      ['Devoluciones registradas (Bs)', paymentSummary.refunds],
      ['Cobros netos del período (Bs)', paymentSummary.netCollections],
      ['Cuentas con cobros', paymentSummary.accountIds.length],
      ['Transacciones de cobro/devolución', paymentSummary.events.length],
      ['Cobros en efectivo (Bs)', paymentSummary.cashCollections],
      ['Cobros QR (Bs)', paymentSummary.qrCollections],
      ['Cobros con tarjeta (Bs)', paymentSummary.cardCollections],
    ] },
    { name: 'Cobros', headers: ['Fecha del movimiento', 'Cuenta', 'Responsable', 'Tipo / método', 'Importe neto (Bs)'], rows: paymentRows },
    { name: 'Caja - turno actual', headers: ['Fondo', 'Efectivo', 'QR', 'Tarjeta', 'Entradas', 'Salidas', 'Esperado'], rows: [[data.shift?.openingFloat || 0, cash.cashSales, cash.qrSales, cash.cardSales, cash.cashIncome, cash.cashOutflow, cash.expectedCash]] },
  ]
  if (detailed) sheets.push(
    { name: 'Productos - unidades', headers: ['Producto', 'Unidades registradas'], rows: productTotals.map(item => [item.name, item.units]) },
    { name: 'Equipo - cobros', headers: ['Responsable del cobro', 'Cobros brutos (Bs)'], rows: byOperator.map(item => [item.name, item.amount]) },
  )

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (historyIncomplete) return
    setExporting(true); setExportNotice('')
    try {
      const active = getActiveTenant()
      if (active) await authorizeBusinessReportCapability(tenantId, branchId, 'reports.export')
      else if (tenantMode || !isolatedDemo) throw new Error('No se pudo validar la empresa antes de exportar.')
      const report = makeBusinessReport({ tenantId, branchId, businessType: active?.tenant.businessType || 'nightclub_lounge', generatedAt: new Date().toISOString(), period: { startDate, endDate: today, timeZone }, identity, completeness: 'complete', recordCount: paymentSummary.events.length, warnings: ['Los cobros se agrupan por paidAt y las devoluciones por su fecha registrada. La hoja de Caja corresponde al turno actual, independiente del rango. El desglose de productos muestra unidades de las cuentas con cobros del período, sin atribuir importes parciales a productos.'], sheets })
      await exportBusinessReport(report, kind)
    } catch (cause) { setExportNotice(cause instanceof Error ? cause.message : 'No se pudo exportar el reporte.') }
    finally { setExporting(false) }
  }
  const runPrint = async () => {
    const rowCount = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
    if (historyIncomplete) return
    if (rowCount > 500) { setExportNotice('Este resumen supera 500 filas; descarga el PDF o Excel completo.'); return }
    setExporting(true); setExportNotice('')
    try {
      const active = getActiveTenant()
      if (active) await authorizeBusinessReportCapability(tenantId, branchId, 'printing.manual')
      else if (tenantMode || !isolatedDemo) throw new Error('No se pudo validar la empresa antes de imprimir.')
      const report = makeBusinessReport({ tenantId, branchId, businessType: active?.tenant.businessType || 'nightclub_lounge', generatedAt: new Date().toISOString(), period: { startDate, endDate: today, timeZone }, identity, completeness: 'complete', recordCount: paymentSummary.events.length, warnings: ['Impresión del resumen. Para todas las hojas, descarga PDF o Excel.'], sheets })
      setExportNotice(await printBusinessReport(report))
    } catch (cause) { setExportNotice(cause instanceof Error ? cause.message : 'No se pudo imprimir el resumen.') }
    finally { setExporting(false) }
  }
  const unavailable = 'No disponible: historial incompleto'
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-black">{companyName} · Reportes</h1><p className="text-sm text-slate-400">Cobros y devoluciones por fecha del movimiento · zona {timeZone}.</p></div><div className="flex gap-2"><button disabled={exporting || !canExport} onClick={() => void runExport('excel')} className="h-11 rounded-xl border border-slate-600 px-3 text-sm font-bold disabled:opacity-50"><Download className="mr-1 inline" size={15} />Excel</button><button disabled={exporting || !canExport} onClick={() => void runExport('pdf')} className="h-11 rounded-xl bg-amber-400 px-3 text-sm font-bold text-slate-950 disabled:opacity-50"><Download className="mr-1 inline" size={15} />PDF</button><button disabled={exporting || !canPrint || sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 500} onClick={() => void runPrint()} className="h-11 rounded-xl border border-slate-600 px-3 text-sm font-bold disabled:opacity-50">Imprimir resumen</button></div></header>{exportNotice && <p role="status" className="text-sm text-slate-300">{exportNotice}</p>}{!canExport && !historyIncomplete && <p className="text-xs text-slate-400">PDF y Excel requieren `reports.export`.</p>}{!canPrint && !historyIncomplete && <p className="text-xs text-slate-400">La impresión requiere la capacidad `printing.manual`.</p>}{historyIncomplete && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">El historial está incompleto o contiene cobros/devoluciones sin fecha verificable. Los totales se ocultan y las acciones de reporte quedan bloqueadas hasta completar la fuente histórica.</p>}<div className="flex gap-2 overflow-x-auto">{([['today','Hoy'],['7','7 días'],['30','30 días'],['all','Todo']] as const).map(([id,label]) => <button key={id} onClick={() => setRange(id)} className={`h-10 shrink-0 rounded-full px-4 text-xs font-bold ${range === id ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>{label}</button>)}</div>{historyIncomplete ? <p className="rounded-xl border border-amber-500/30 bg-slate-900 p-4 text-sm text-amber-100">Indicadores financieros: {unavailable}</p> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Cobros netos" value={money(paymentSummary.netCollections)} /><Metric label="Cuentas cobradas" value={String(paymentSummary.accountIds.length)} /><Metric label="Cobros efectivo / QR / tarjeta" value={`${money(paymentSummary.cashCollections)} / ${money(paymentSummary.qrCollections)} / ${money(paymentSummary.cardCollections)}`} /><Metric label="Devoluciones" value={money(paymentSummary.refunds)} /><Metric label="Caja del turno actual (no filtrada por fecha)" value={money(cash.expectedCash)} /><Metric label="Transacciones" value={String(paymentSummary.events.length)} /></div>{detailed && <div className="grid gap-4 xl:grid-cols-2"><Table title="Unidades registradas en cuentas con cobros del período" headers={['Producto','Unidades']} rows={productTotals.map(item => [item.name, String(item.units)])} /><Table title="Cobros brutos por responsable" headers={['Responsable','Cobros (Bs)']} rows={byOperator.map(item => [item.name, money(item.amount)])} /></div>}<Table title="Movimientos de cobro del período" headers={['Fecha','Cuenta','Responsable','Tipo / método','Importe neto']} rows={paymentRows.map(row => [String(row[0]), String(row[1]), String(row[2]), String(row[3]), money(Number(row[4]))])} /></>}</div>
}

function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-xl border border-slate-700 bg-[#121b20] p-4"><span className="text-xs text-slate-400">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></div> }
function Table({title,headers,rows}:{title:string;headers:string[];rows:string[][]}) { const grid = { gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }; return <section className="overflow-hidden rounded-xl border border-slate-700"><h2 className="bg-slate-900 px-4 py-3 font-bold">{title}</h2><div style={grid} className="grid bg-slate-950 px-4 py-2 text-xs font-bold text-slate-400">{headers.map(item => <span key={item}>{item}</span>)}</div>{rows.map((row,index) => <div key={index} style={grid} className="grid border-t border-slate-800 px-4 py-3 text-sm">{row.map((cell,at) => <span key={at}>{cell}</span>)}</div>)}{!rows.length && <p className="p-4 text-sm text-slate-400">Sin datos para el rango.</p>}</section> }
