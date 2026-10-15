import { useMemo, useRef, useState } from 'react'
import type { NightclubCommissionPaymentDraft, NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubCommissionSummary } from '../domain/nightclubCommissions'

const money = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inputClass = 'min-h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-slate-100'

export function NightclubCommissions({ data, canPay, viewerStaffId, onPay }: { data: NightclubDataset; canPay: boolean; viewerStaffId?: string; onPay: (draft: NightclubCommissionPaymentDraft) => boolean | void }) {
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<'all' | 'pending' | 'paid'>('all')
  const [method, setMethod] = useState<NightclubCommissionPaymentDraft['method']>('cash')
  const [amount, setAmount] = useState('')
  const operation = useRef<string | null>(null)
  const staffId = viewerStaffId || selectedStaffId
  const waiters = (data.staff || []).filter(person => person.role === 'waiter').sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  const summary = useMemo(() => nightclubCommissionSummary(data, { staffId: staffId || undefined, from: from || undefined, to: to || undefined, status }), [data, staffId, from, to, status])
  const payableRows = summary.rows.filter(entry => entry.staffId === selectedStaffId && entry.status === 'earned' && entry.paidAmount < entry.amount)
  const payableBalance = payableRows.reduce((sum, entry) => sum + entry.amount - entry.paidAmount, 0)
  const payments = (data.commissionPayments || []).filter(payment => (!staffId || payment.staffId === staffId) && (!from || payment.at.slice(0, 10) >= from) && (!to || payment.at.slice(0, 10) <= to)).sort((a, b) => b.at.localeCompare(a.at))
  const settle = () => {
    const value = Number(amount)
    if (!canPay || !selectedStaffId || !payableRows.length || !Number.isFinite(value) || value <= 0 || value > payableBalance + 0.001) return
    const operationId = operation.current ||= crypto.randomUUID()
    if (onPay({ staffId: selectedStaffId, amount: value, method, operationId, commissionIds: payableRows.map(entry => entry.id) }) !== false) { setAmount(''); operation.current = null }
  }
  return <section className="rounded-2xl border border-white/10 bg-[#0d1720] p-4">
    <header><h2 className="font-bold">Comisiones de Meseros</h2><p className="mt-1 text-sm text-slate-400">Ventas pagadas con comisión configurada por producto. La preparación y entrega no cambian al mesero vendedor.</p></header>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Generadas" value={money(summary.generated)} /><Metric label="Pagadas" value={money(summary.paid)} /><Metric label="Saldo pendiente" value={money(summary.pending)} /></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      {viewerStaffId ? <p className="self-center text-sm text-slate-300">Mis comisiones</p> : <select aria-label="Filtrar por mesero" value={selectedStaffId} onChange={event => { setSelectedStaffId(event.target.value); operation.current = null }} className={inputClass}><option value="">Todos los meseros</option>{waiters.map(person => <option key={person.id} value={person.id}>{person.name}{person.active ? '' : ' (inactivo)'}</option>)}</select>}
      <label className="text-xs text-slate-400">Desde<input aria-label="Comisiones desde" type="date" value={from} onChange={event => setFrom(event.target.value)} className={inputClass + ' mt-1 w-full'} /></label>
      <label className="text-xs text-slate-400">Hasta<input aria-label="Comisiones hasta" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} className={inputClass + ' mt-1 w-full'} /></label>
      <select aria-label="Estado de comisión" value={status} onChange={event => setStatus(event.target.value as typeof status)} className={inputClass}><option value="all">Todos los estados</option><option value="pending">Pendientes de pago</option><option value="paid">Pagadas</option></select>
    </div>
    {canPay && <div className="mt-3 flex flex-wrap gap-2"><select aria-label="Método de pago de comisión" value={method} onChange={event => { setMethod(event.target.value as typeof method); operation.current = null }} className={inputClass}><option value="cash">Efectivo</option><option value="qr">QR</option><option value="card">Tarjeta</option><option value="other">Otro</option></select><input aria-label="Monto de comisión a pagar" type="number" min="0.01" step="0.01" placeholder="Monto parcial o total" value={amount} onChange={event => { setAmount(event.target.value); operation.current = null }} className={inputClass} /><button disabled={!selectedStaffId || !payableRows.length || !amount || Number(amount) <= 0 || Number(amount) > payableBalance + 0.001} onClick={settle} className="min-h-10 rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-40">Registrar pago</button></div>}
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Mesero</th><th className="p-2">Fecha</th><th className="p-2">Producto</th><th className="p-2">Venta</th><th className="p-2">Comisión</th><th className="p-2">Pagado</th><th className="p-2">Estado</th></tr></thead><tbody>{summary.rows.map(row => <tr key={row.id} className="border-t border-white/10"><td className="p-2">{row.staffName}</td><td className="p-2">{(row.earnedAt || row.createdAt).slice(0, 10)}</td><td className="p-2">{row.productName} × {row.quantity}</td><td className="p-2">{money(row.saleAmount)}</td><td className="p-2">{money(row.amount)}</td><td className="p-2">{money(row.paidAmount)}</td><td className="p-2">{row.status === 'paid' ? 'Pagada' : row.status === 'void' ? 'Anulada' : row.status === 'pending' ? 'Histórica pendiente' : 'Pendiente de pago'}</td></tr>)}{!summary.rows.length && <tr><td colSpan={7} className="p-4 text-slate-400">No hay comisiones para estos filtros.</td></tr>}</tbody></table></div>
    <h3 className="mt-5 font-semibold">Historial de pagos</h3><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Fecha</th><th className="p-2">Mesero</th><th className="p-2">Monto</th><th className="p-2">Método</th><th className="p-2">Registró</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id} className="border-t border-white/10"><td className="p-2">{new Date(payment.at).toLocaleString('es-BO')}</td><td className="p-2">{data.staff?.find(person => person.id === payment.staffId)?.name || payment.staffId}</td><td className="p-2">{money(payment.amount)}</td><td className="p-2">{payment.method.toUpperCase()}</td><td className="p-2">{payment.actor}</td></tr>)}{!payments.length && <tr><td colSpan={5} className="p-4 text-slate-400">Todavía no hay pagos registrados.</td></tr>}</tbody></table></div>
  </section>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-950 p-3"><span className="text-xs text-slate-400">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div> }
