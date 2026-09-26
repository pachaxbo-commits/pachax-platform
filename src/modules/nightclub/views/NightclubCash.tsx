import { useState } from 'react'
import { Wallet } from 'lucide-react'
import type { NightclubDataset, NightclubCashMovement } from '../domain/nightclubAccounts'
import { nightclubBalance, nightclubCashSummary } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function printCash(dataset: NightclubDataset) {
  const shift = dataset.shift
  if (!shift) return
  const summary = nightclubCashSummary(dataset)
  const rows = (dataset.cashMovements || []).filter(item => item.shiftId === shift.id)
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
  const receipt = `<html><head><title>Arqueo de caja</title><style>body{font:13px Arial;max-width:320px;margin:16px auto}h1{font-size:18px}p{display:flex;justify-content:space-between;border-bottom:1px dashed #ccc;padding:5px 0}small{color:#555}@media print{body{margin:0}}</style></head><body><h1>Movimiento de caja</h1><small>Turno ${escape(shift.id)}<br>Apertura: ${escape(new Date(shift.openedAt).toLocaleString('es-BO'))}<br>Cajero: ${escape(shift.openedBy)}</small><p>Fondo inicial <b>${money(shift.openingFloat)}</b></p><p>Ventas efectivo <b>${money(summary.cashSales)}</b></p><p>Ventas QR <b>${money(summary.qrSales)}</b></p><p>Ventas tarjeta <b>${money(summary.cardSales)}</b></p><p>Entradas efectivo <b>${money(summary.cashIncome)}</b></p><p>Salidas efectivo <b>${money(summary.cashOutflow)}</b></p><p>Efectivo esperado <b>${money(summary.expectedCash)}</b></p>${shift.countedCash === undefined ? '' : `<p>Efectivo contado <b>${money(shift.countedCash)}</b></p><p>Diferencia <b>${money(shift.difference || 0)}</b></p>`}<h2>Movimientos</h2>${rows.map(row => `<p>${escape(row.description)} (${escape(row.method)}) <b>${row.type === 'income' ? '+' : '−'}${money(row.amount)}</b></p>`).join('') || '<small>Sin movimientos manuales</small>'}<script>window.print()</script></body></html>`
  const windowRef = window.open('', '_blank', 'width=400,height=700')
  if (windowRef) { windowRef.document.write(receipt); windowRef.document.close() }
}

export function NightclubCash({ data, onStartShift, onCloseShift, onCashMovement }: {
  data: NightclubDataset
  onStartShift: (amount: number) => void
  onCloseShift: (countedCash: number) => void
  onCashMovement: (draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>) => boolean
}) {
  const [opening, setOpening] = useState('200')
  const [counted, setCounted] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [method, setMethod] = useState<'cash' | 'qr' | 'card'>('cash')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const shift = data.shift
  const summary = nightclubCashSummary(data)
  const openAccounts = data.accounts.filter(item => nightclubBalance(item) > 0)
  const movements = (data.cashMovements || []).filter(item => item.shiftId === shift?.id).slice().reverse()
  const submitMovement = () => {
    if (onCashMovement({ type, method, amount: Number(amount), description })) { setAmount(''); setDescription('') }
  }
  return <div className="space-y-5"><header><h1 className="text-2xl font-black">Caja y turnos</h1><p className="text-sm text-slate-400">Cobros, movimientos y arqueo de la noche.</p></header>
    {!shift || shift.status === 'closed' ? <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="mb-3 text-sm">Inicia un turno para abrir cuentas y vender.</p><label className="block text-xs text-slate-400">Fondo inicial / cambio en caja<input aria-label="Fondo inicial" type="number" min="0" value={opening} onChange={event => setOpening(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label><button onClick={() => onStartShift(Number(opening))} className="mt-3 rounded-xl bg-amber-400 px-5 py-3 font-bold text-white">Iniciar turno</button></section> : <>
      <p className="text-xs text-slate-400">Abierto {new Date(shift.openedAt).toLocaleString('es-BO')} · {shift.openedBy}</p>
      <section aria-label="Efectivo esperado en caja" className="flex items-center justify-between gap-4 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-950 to-slate-900 p-5"><div><span className="text-xs font-bold uppercase tracking-wide text-amber-200">Efectivo que debe haber ahora en caja</span><strong className="mt-1 block text-3xl font-black text-white sm:text-4xl">{money(summary.expectedCash)}</strong><p className="mt-2 text-xs text-slate-300">Fondo inicial + ventas en efectivo + entradas en efectivo − salidas en efectivo</p><p className="mt-1 text-xs text-slate-400">QR y tarjeta no se suman al dinero físico.</p></div><Wallet aria-hidden="true" className="hidden h-10 w-10 shrink-0 text-amber-300 sm:block" /></section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Fondo inicial', shift.openingFloat], ['Ventas efectivo', summary.cashSales], ['Ventas QR', summary.qrSales], ['Ventas tarjeta', summary.cardSales], ['Entradas efectivo', summary.cashIncome], ['Salidas efectivo', summary.cashOutflow], ['Total vendido', summary.totalSales]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs text-slate-400">{label}</span><strong className="mt-2 block text-xl">{money(Number(value))}</strong></div>)}</div>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-bold">Registrar movimiento</h2><div className="mt-3 grid gap-2 sm:grid-cols-4"><select aria-label="Tipo de movimiento" value={type} onChange={event => setType(event.target.value as typeof type)} className="rounded-xl bg-slate-950 p-3"><option value="expense">Salida / gasto</option><option value="income">Entrada</option></select><input aria-label="Concepto" placeholder="Concepto" value={description} onChange={event => setDescription(event.target.value)} className="rounded-xl bg-slate-950 p-3" /><input aria-label="Monto" type="number" min="0.01" step="0.01" placeholder="Monto" value={amount} onChange={event => setAmount(event.target.value)} className="rounded-xl bg-slate-950 p-3" /><select aria-label="Método del movimiento" value={method} onChange={event => setMethod(event.target.value as typeof method)} className="rounded-xl bg-slate-950 p-3"><option value="cash">Efectivo</option><option value="qr">QR</option><option value="card">Tarjeta</option></select></div><button onClick={submitMovement} className="mt-3 rounded-xl bg-amber-400 px-4 py-2 font-bold">Guardar movimiento</button><div className="mt-4 space-y-1 text-sm">{movements.map(item => <p key={item.id} className="flex justify-between border-t border-slate-800 py-2"><span>{item.description} · {item.method}</span><b>{item.type === 'income' ? '+' : '−'}{money(item.amount)}</b></p>)}{!movements.length && <p className="text-slate-400">Sin movimientos manuales.</p>}</div></section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-bold">Arqueo y cierre</h2><p className="mt-1 text-sm text-slate-400">{openAccounts.length ? `${openAccounts.length} cuenta(s) abiertas. Debes cobrarlas antes del cierre.` : 'Todas las cuentas están cerradas.'}</p><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Efectivo contado" type="number" min="0" placeholder="Efectivo contado" value={counted} onChange={event => setCounted(event.target.value)} className="rounded-xl bg-slate-950 p-3" /><button onClick={() => printCash(data)} className="rounded-xl border border-slate-700 px-4 py-2 font-bold">Imprimir movimiento del día</button><button disabled={openAccounts.length > 0 || counted === ''} onClick={() => onCloseShift(Number(counted))} className="rounded-xl bg-amber-400 px-4 py-2 font-bold disabled:opacity-40">Cerrar turno</button></div>{counted !== '' && <p className="mt-2 text-sm">Diferencia: {money(Number(counted) - summary.expectedCash)}</p>}</section>
    </>}
    {shift?.status === 'closed' && <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400"><p>Último cierre: {shift.closedAt ? new Date(shift.closedAt).toLocaleString('es-BO') : '—'} · Diferencia {money(shift.difference || 0)}</p><button onClick={() => printCash(data)} className="rounded-xl border border-slate-700 px-4 py-2 font-bold text-slate-100">Imprimir último arqueo</button></div>}
  </div>
}
