import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { exportExcel, exportPdf } from '../../distribution/data/reportExports'
import type { ReportSheet } from '../../distribution/data/reportExports'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubCashSummary, nightclubPaidTotal } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubReports({ data, companyName }: { data: NightclubDataset; companyName: string }) {
  const [range, setRange] = useState<'today' | '7' | '30' | 'all'>('all')
  const [exporting, setExporting] = useState(false)
  const [referenceTime] = useState(() => Date.now())
  const accounts = useMemo(() => {
    if (range === 'all') return data.accounts
    const days = range === 'today' ? 1 : Number(range)
    const since = referenceTime - days * 86400000
    return data.accounts.filter(account => new Date(account.openedAt).getTime() >= since)
  }, [data.accounts, range, referenceTime])
  const closed = accounts.filter(account => account.status === 'closed')
  const total = closed.reduce((sum, account) => sum + nightclubPaidTotal(account), 0)
  const rounds = accounts.flatMap(account => account.rounds.map(round => ({ account, round }))).filter(item => item.round.status !== 'cancelled')
  const lines = rounds.flatMap(({account,round}) => round.items.map(item => ({ account, round, item })))
  const productTotals = [...new Set(lines.map(line => line.item.productId))].map(id => { const rows = lines.filter(line => line.item.productId === id); return { id, name: rows[0]?.item.name || id, units: rows.reduce((sum,row) => sum + row.item.quantity,0), revenue: rows.reduce((sum,row) => sum + row.item.lineTotal,0) } }).sort((a,b) => b.revenue-a.revenue)
  const byService = [...new Set(accounts.map(account => account.openedBy))].map(name => { const rows = accounts.filter(account => account.openedBy === name); return { name, accounts: rows.length, revenue: rows.reduce((sum,row) => sum + nightclubPaidTotal(row),0) } }).sort((a,b) => b.revenue-a.revenue)
  const cash = nightclubCashSummary({ ...data, accounts })
  const sheets: ReportSheet[] = [
    { name: 'Resumen', headers: ['Concepto','Valor'], rows: [['Ventas cobradas (Bs)',total],['Cuentas cerradas',closed.length],['Ticket promedio (Bs)',closed.length ? total/closed.length : 0],['Rondas',rounds.length],['Efectivo (Bs)',cash.cashSales],['QR (Bs)',cash.qrSales],['Tarjeta (Bs)',cash.cardSales]] },
    { name: 'Cuentas', headers: ['Apertura','Cuenta','Responsable','Estado','Consumido (Bs)','Pagado (Bs)'], rows: accounts.map(account => [new Date(account.openedAt).toLocaleString('es-BO'),nightclubAccountLabel(account,data),account.openedBy,account.status,account.subtotal,nightclubPaidTotal(account)]) },
    { name: 'Productos', headers: ['Producto','Unidades','Ingresos (Bs)'], rows: productTotals.map(item => [item.name,item.units,item.revenue]) },
    { name: 'Equipo', headers: ['Responsable','Cuentas','Ventas cobradas (Bs)'], rows: byService.map(item => [item.name,item.accounts,item.revenue]) },
    { name: 'Inventario', headers: ['Fecha','Artículo','Tipo','Movimiento','Anterior','Nuevo','Motivo'], rows: (data.inventoryMovements || []).map(item => [new Date(item.at).toLocaleString('es-BO'),data.inventory.find(stock => stock.id === item.inventoryId)?.name || item.inventoryId,item.type,item.quantity,item.previous,item.current,item.reason || '']) },
    { name: 'Caja', headers: ['Fondo','Efectivo','QR','Tarjeta','Entradas','Salidas','Esperado'], rows: [[data.shift?.openingFloat || 0,cash.cashSales,cash.qrSales,cash.cardSales,cash.cashIncome,cash.cashOutflow,cash.expectedCash]] },
  ]
  const description = `${companyName} · ${range === 'today' ? 'Hoy' : range === '7' ? 'Últimos 7 días' : range === '30' ? 'Últimos 30 días' : 'Todo el historial'} · generado ${new Date().toLocaleString('es-BO')}`
  const runExport = async (kind: 'excel' | 'pdf') => { setExporting(true); try { if (kind === 'excel') await exportExcel(sheets,description); else await exportPdf(sheets,description,'Pachax-nightclub-reportes.pdf') } finally { setExporting(false) } }
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-black">Reportes</h1><p className="text-sm text-slate-400">Indicadores derivados de cuentas, pagos, rondas e inventario.</p></div><div className="flex gap-2"><button disabled={exporting} onClick={() => void runExport('excel')} className="h-11 rounded-xl border border-slate-600 px-3 text-sm font-bold"><Download className="mr-1 inline" size={15} />Excel</button><button disabled={exporting} onClick={() => void runExport('pdf')} className="h-11 rounded-xl bg-amber-400 px-3 text-sm font-bold text-slate-950"><Download className="mr-1 inline" size={15} />PDF</button></div></header><div className="flex gap-2 overflow-x-auto">{([['today','Hoy'],['7','7 días'],['30','30 días'],['all','Todo']] as const).map(([id,label]) => <button key={id} onClick={() => setRange(id)} className={`h-10 shrink-0 rounded-full px-4 text-xs font-bold ${range === id ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>{label}</button>)}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Ventas cobradas" value={money(total)} /><Metric label="Cuentas" value={String(closed.length)} /><Metric label="Ticket promedio" value={money(closed.length ? total/closed.length : 0)} /><Metric label="Rondas" value={String(rounds.length)} /><Metric label="Efectivo" value={money(cash.cashSales)} /><Metric label="QR" value={money(cash.qrSales)} /><Metric label="Tarjeta" value={money(cash.cardSales)} /><Metric label="Stock crítico" value={String(data.inventory.filter(item => item.current <= item.minimum).length)} /></div><div className="grid gap-4 xl:grid-cols-2"><Table title="Productos con mayor salida" headers={['Producto','Unidades','Ingresos']} rows={productTotals.slice(0,8).map(item => [item.name,String(item.units),money(item.revenue)])} /><Table title="Ventas por responsable" headers={['Responsable','Cuentas','Ventas']} rows={byService.map(item => [item.name,String(item.accounts),money(item.revenue)])} /></div></div>
}

function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-xl border border-slate-700 bg-[#121b20] p-4"><span className="text-xs text-slate-400">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></div> }
function Table({title,headers,rows}:{title:string;headers:string[];rows:string[][]}) { return <section className="overflow-hidden rounded-xl border border-slate-700"><h2 className="bg-slate-900 px-4 py-3 font-bold">{title}</h2><div className="grid grid-cols-3 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-400">{headers.map(item => <span key={item}>{item}</span>)}</div>{rows.map((row,index) => <div key={index} className="grid grid-cols-3 border-t border-slate-800 px-4 py-3 text-sm">{row.map((cell,at) => <span key={at}>{cell}</span>)}</div>)}{!rows.length && <p className="p-4 text-sm text-slate-400">Sin datos para el rango.</p>}</section> }
