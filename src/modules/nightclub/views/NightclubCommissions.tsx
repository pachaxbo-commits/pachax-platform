import { useMemo, useState } from 'react'
import type { NightclubCommissionPaymentDraft, NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubCommissionSummary } from '../domain/nightclubCommissions'

const money = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubCommissions({ data, canPay, onPay }: { data: NightclubDataset; canPay: boolean; onPay: (draft: NightclubCommissionPaymentDraft) => void }) {
  const [staffId, setStaffId] = useState('')
  const [method, setMethod] = useState<NightclubCommissionPaymentDraft['method']>('cash')
  const [amount, setAmount] = useState('')
  const staff = (data.staff || []).filter(person => person.role === 'service' && person.active)
  const summary = useMemo(() => nightclubCommissionSummary(data, staffId || undefined), [data, staffId])
  const settle = () => {
    const value = Number(amount)
    if (!staffId || !Number.isFinite(value) || value <= 0) return
    onPay({ staffId, amount: value, method, operationId: crypto.randomUUID() })
    setAmount('')
  }
  return <section className="rounded-2xl border border-white/10 bg-[#0d1720] p-4"><header><h2 className="font-bold">Comisiones de Servicio</h2><p className="mt-1 text-sm text-slate-400">Se generan al entregar productos pagados y se conservan aunque cambie la configuración del producto.</p></header><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Generadas" value={money(summary.generated)} /><Metric label="Pagadas" value={money(summary.paid)} /><Metric label="Saldo pendiente" value={money(summary.pending)} /></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><select aria-label="Trabajador de servicio" value={staffId} onChange={event => setStaffId(event.target.value)} className="rounded-xl bg-slate-950 p-3"><option value="">Todos los trabajadores</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{canPay && <><select aria-label="Método de pago de comisión" value={method} onChange={event => setMethod(event.target.value as typeof method)} className="rounded-xl bg-slate-950 p-3"><option value="cash">Efectivo</option><option value="qr">QR</option><option value="card">Tarjeta</option><option value="other">Otro</option></select><input aria-label="Monto de comisión a pagar" type="number" min="0" placeholder="Monto" value={amount} onChange={event => setAmount(event.target.value)} className="rounded-xl bg-slate-950 p-3" /><button disabled={!staffId || !amount} onClick={settle} className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">Pagar comisión</button></>}</div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Servicio</th><th className="p-2">Producto</th><th className="p-2">Venta</th><th className="p-2">Comisión</th><th className="p-2">Estado</th></tr></thead><tbody>{summary.rows.map(row => <tr key={row.id} className="border-t border-white/10"><td className="p-2">{row.staffName}</td><td className="p-2">{row.productName} × {row.quantity}</td><td className="p-2">{money(row.saleAmount)}</td><td className="p-2">{money(row.amount)}</td><td className="p-2">{row.status === 'pending' ? 'Pendiente de entrega' : row.status === 'earned' ? 'Ganada' : row.status === 'paid' ? 'Pagada' : 'Anulada'}</td></tr>)}{!summary.rows.length && <tr><td colSpan={5} className="p-4 text-slate-400">Todavía no hay comisiones para mostrar.</td></tr>}</tbody></table></div></section>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-950 p-3"><span className="text-xs text-slate-400">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div> }
