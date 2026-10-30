import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { exportBusinessReport } from '../../../core/reports/reportExport'
import { makeBusinessReport, type ReportSheet } from '../../../core/reports/reportTypes'
import type { BusinessDocumentContext } from '../../../core/businessIdentity'
import { authorizeBusinessReportCapability } from '../../../core/reports/reportAuthorization'
import { canUseReportCapability } from '../../../core/reports/reportCapabilities'
import { reportPeriodUtcRange } from '../../../core/reports/reportPeriod'
import { getActiveTenant } from '../../../store/activeTenant'
import { isDemoModeActive } from '../../../demo/core/demoContext'
import { printBusinessReport } from '../../../core/reports/businessReportPrintService'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubCashSummary, nightclubPaidTotal } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubReports({ data, companyName, tenantId, branchId, identity, tenantMode = false }: { data: NightclubDataset; companyName: string; tenantId: string; branchId: string; identity: BusinessDocumentContext; tenantMode?: boolean }) {
  const [range, setRange] = useState<'today' | '7' | '30' | 'all'>('all')
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [referenceTime] = useState(() => Date.now())
  const timeZone = getActiveTenant()?.tenant.configuration?.timezone || 'America/La_Paz'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(referenceTime)
  const accounts = useMemo(() => {
    if (range === 'all') return data.accounts
    const days = range === 'today' ? 1 : Number(range)
    const start = new Date(`${today}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - days + 1)
    const startDate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(start)
    const bounds = reportPeriodUtcRange({ startDate, endDate: today, timeZone })
    return data.accounts.filter(account => { const at = Date.parse(account.openedAt); return Number.isFinite(at) && at >= bounds.startInclusive.getTime() && at < bounds.endExclusive.getTime() })
  }, [data.accounts, range, today, timeZone])
  const closed = accounts.filter(account => account.status === 'closed')
  const total = accounts.reduce((sum, account) => sum + nightclubPaidTotal(account), 0)
  const rounds = accounts.flatMap(account => account.rounds.map(round => ({ account, round }))).filter(item => item.round.status !== 'cancelled')
  const lines = rounds.flatMap(({account,round}) => round.items.map(item => ({ account, round, item })))
  const detailed = canUseReportCapability(getActiveTenant()?.tenant, 'reports.detailed')
  const productTotals = [...new Set(lines.map(line => line.item.productId))].map(id => { const rows = lines.filter(line => line.item.productId === id); return { id, name: rows[0]?.item.name || id, units: rows.reduce((sum,row) => sum + row.item.quantity,0), revenue: rows.reduce((sum,row) => sum + row.item.lineTotal,0) } }).sort((a,b) => b.revenue-a.revenue)
  const byService = [...new Set(accounts.map(account => account.openedBy))].map(name => { const rows = accounts.filter(account => account.openedBy === name); return { name, accounts: rows.length, revenue: rows.reduce((sum,row) => sum + nightclubPaidTotal(row),0) } }).sort((a,b) => b.revenue-a.revenue)
  const cash = nightclubCashSummary({ ...data, accounts })
  const fullSheets: ReportSheet[] = [
    { name: 'Resumen', headers: ['Concepto','Valor'], rows: [['Ventas cobradas (Bs)',total],['Cuentas cerradas',closed.length],['Cobrado por ronda (Bs)',rounds.length ? total/rounds.length : 0],['Rondas',rounds.length],['Efectivo (Bs)',cash.cashSales],['QR (Bs)',cash.qrSales],['Tarjeta (Bs)',cash.cardSales]] },
    { name: 'Cuentas', headers: ['Apertura','Cuenta','Responsable','Estado','Consumido (Bs)','Pagado (Bs)'], rows: accounts.map(account => [new Date(account.openedAt).toLocaleString('es-BO'),nightclubAccountLabel(account,data),account.openedBy,account.status,account.subtotal,nightclubPaidTotal(account)]) },
    { name: 'Productos', headers: ['Producto','Unidades','Ingresos (Bs)'], rows: productTotals.map(item => [item.name,item.units,item.revenue]) },
    { name: 'Equipo', headers: ['Responsable','Cuentas','Ventas cobradas (Bs)'], rows: byService.map(item => [item.name,item.accounts,item.revenue]) },
    { name: 'Inventario', headers: ['Fecha','Artículo','Tipo','Movimiento','Anterior','Nuevo','Motivo'], rows: (data.inventoryMovements || []).map(item => [new Date(item.at).toLocaleString('es-BO'),data.inventory.find(stock => stock.id === item.inventoryId)?.name || item.inventoryId,item.type,item.quantity,item.previous,item.current,item.reason || '']) },
    { name: 'Caja', headers: ['Fondo','Efectivo','QR','Tarjeta','Entradas','Salidas','Esperado'], rows: [[data.shift?.openingFloat || 0,cash.cashSales,cash.qrSales,cash.cardSales,cash.cashIncome,cash.cashOutflow,cash.expectedCash]] },
  ]
  const sheets = detailed ? fullSheets : fullSheets.filter(sheet => ['Resumen', 'Caja'].includes(sheet.name))
  const closedCount = data.accounts.filter(account => account.status === 'closed').length
  const roundCount = data.accounts.reduce((sum, account) => sum + account.rounds.length, 0)
  const paymentCount = data.accounts.reduce((sum, account) => sum + (account.payments?.length || (account.payment ? 1 : 0)), 0)
  const historyIncomplete = closedCount >= 50 || roundCount >= 200 || paymentCount >= 200
  const canExport = canUseReportCapability(getActiveTenant()?.tenant, 'reports.export') && !historyIncomplete
  const startDate = range === 'all' ? (accounts.map(account => account.openedAt.slice(0, 10)).sort()[0] || today) : (() => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (range === 'today' ? 0 : Number(range) - 1)); return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) })()
  const runExport = async (kind: 'excel' | 'pdf') => {
    if (historyIncomplete) return
    setExporting(true)
    try {
      const active = getActiveTenant()
      if (active) await authorizeBusinessReportCapability(tenantId, branchId, 'reports.export')
      else if (tenantMode || !isDemoModeActive()) throw new Error('No se pudo validar la empresa antes de exportar.')
      const report = makeBusinessReport({ tenantId, branchId, businessType: active?.tenant.businessType || 'nightclub_lounge', generatedAt: new Date().toISOString(), period: { startDate, endDate: today, timeZone }, identity, completeness: 'complete', recordCount: accounts.length, warnings: [], sheets })
      await exportBusinessReport(report, kind)
    } finally { setExporting(false) }
  }
  const runPrint = async () => {
    const rowCount = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
    if (historyIncomplete) return
    if (rowCount > 500) { setExportNotice('Este informe supera 500 filas; descarga el PDF o Excel completo.'); return }
    setExporting(true); setExportNotice('')
    try {
      const active = getActiveTenant()
      if (active) await authorizeBusinessReportCapability(tenantId, branchId, 'reports.export')
      else if (tenantMode || !isDemoModeActive()) throw new Error('No se pudo validar la empresa antes de imprimir.')
      const report = makeBusinessReport({ tenantId, branchId, businessType: active?.tenant.businessType || 'nightclub_lounge', generatedAt: new Date().toISOString(), period: { startDate, endDate: today, timeZone }, identity, completeness: 'complete', recordCount: accounts.length, warnings: [], sheets })
      setExportNotice(await printBusinessReport(report))
    } catch (cause) { setExportNotice(cause instanceof Error ? cause.message : 'No se pudo imprimir el informe.') }
    finally { setExporting(false) }
  }
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-black">{companyName} · Reportes</h1><p className="text-sm text-slate-400">Indicadores derivados de cuentas, pagos, rondas e inventario · zona {timeZone}.</p></div><div className="flex gap-2"><button disabled={exporting || !canExport} onClick={() => void runExport('excel')} className="h-11 rounded-xl border border-slate-600 px-3 text-sm font-bold disabled:opacity-50"><Download className="mr-1 inline" size={15} />Excel</button><button disabled={exporting || !canExport} onClick={() => void runExport('pdf')} className="h-11 rounded-xl bg-amber-400 px-3 text-sm font-bold text-slate-950 disabled:opacity-50"><Download className="mr-1 inline" size={15} />PDF</button><button disabled={exporting || !canExport || sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 500} onClick={() => void runPrint()} className="h-11 rounded-xl border border-slate-600 px-3 text-sm font-bold disabled:opacity-50">Imprimir</button></div></header>{exportNotice && <p role="status" className="text-sm text-slate-300">{exportNotice}</p>}{historyIncomplete && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">El historial alcanza el límite de carga actual. No se exportan totales parciales; completa la paginación histórica para habilitar descargas.</p>}{!detailed && <p className="text-xs text-slate-400">El desglose de cuentas, productos, equipo e inventario no está incluido en las capacidades actuales.</p>}<div className="flex gap-2 overflow-x-auto">{([['today','Hoy'],['7','7 días'],['30','30 días'],['all','Todo']] as const).map(([id,label]) => <button key={id} onClick={() => setRange(id)} className={`h-10 shrink-0 rounded-full px-4 text-xs font-bold ${range === id ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>{label}</button>)}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Ventas cobradas" value={money(total)} /><Metric label="Cuentas" value={String(closed.length)} /><Metric label="Cobrado por ronda" value={money(rounds.length ? total/rounds.length : 0)} /><Metric label="Rondas" value={String(rounds.length)} /><Metric label="Efectivo" value={money(cash.cashSales)} /><Metric label="QR" value={money(cash.qrSales)} /><Metric label="Tarjeta" value={money(cash.cardSales)} /><Metric label="Stock crítico" value={String(data.inventory.filter(item => item.current <= item.minimum).length)} /></div>{detailed && <div className="grid gap-4 xl:grid-cols-2"><Table title="Productos con mayor salida" headers={['Producto','Unidades','Ingresos']} rows={productTotals.slice(0,8).map(item => [item.name,String(item.units),money(item.revenue)])} /><Table title="Ventas por responsable" headers={['Responsable','Cuentas','Ventas']} rows={byService.map(item => [item.name,String(item.accounts),money(item.revenue)])} /></div>}</div>
}

function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-xl border border-slate-700 bg-[#121b20] p-4"><span className="text-xs text-slate-400">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></div> }
function Table({title,headers,rows}:{title:string;headers:string[];rows:string[][]}) { return <section className="overflow-hidden rounded-xl border border-slate-700"><h2 className="bg-slate-900 px-4 py-3 font-bold">{title}</h2><div className="grid grid-cols-3 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-400">{headers.map(item => <span key={item}>{item}</span>)}</div>{rows.map((row,index) => <div key={index} className="grid grid-cols-3 border-t border-slate-800 px-4 py-3 text-sm">{row.map((cell,at) => <span key={at}>{cell}</span>)}</div>)}{!rows.length && <p className="p-4 text-sm text-slate-400">Sin datos para el rango.</p>}</section> }