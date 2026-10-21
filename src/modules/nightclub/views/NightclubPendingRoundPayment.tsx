import { useRef, useState } from 'react'
import type { NightclubAccount, NightclubPaymentDraft, NightclubRound } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubPendingRoundPayment({ account, round, onClose, onPay }: {
  account: NightclubAccount
  round: NightclubRound
  onClose: () => void
  onPay: (payment: NightclubPaymentDraft) => boolean | Promise<boolean>
}) {
  const total = round.total ?? round.items.reduce((sum, item) => sum + item.lineTotal, 0)
  const [method, setMethod] = useState<'cash' | 'qr' | 'card'>('cash')
  const [received, setReceived] = useState(String(total))
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const operationId = useRef<string | null>(null)
  const cashReceived = Number(received)
  const valid = Number.isFinite(total) && total > 0 && (method !== 'cash' || Number.isFinite(cashReceived) && cashReceived >= total) && (method === 'cash' || confirmed)

  const pay = async () => {
    if (!valid || busy) return
    operationId.current ||= crypto.randomUUID()
    setAttempted(true)
    setBusy(true)
    setError('')
    try {
      const ok = await onPay({ method, amount: total, ...(method === 'cash' ? { received: cashReceived } : { confirmed: true }), operationId: operationId.current })
      if (ok) onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo registrar el pago. Puedes reintentar esta misma operación.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="pending-round-payment-title" className="w-full max-w-md space-y-4 rounded-2xl border border-emerald-400/30 bg-slate-900 p-5 text-slate-100">
    <div className="flex justify-between gap-3"><div><h2 id="pending-round-payment-title" className="text-xl font-black">Cobrar ronda #{round.sequence}</h2><p className="mt-1 text-sm text-slate-400">{account.tableNameSnapshot || account.customerDisplayName || 'Cuenta abierta'}</p></div><button type="button" aria-label="Cerrar" onClick={onClose} className="min-h-10 min-w-10 rounded-lg border border-slate-700">×</button></div>
    <p className="rounded-xl bg-slate-950 p-3 text-sm">Importe de esta ronda: <strong className="text-lg">{money(total)}</strong></p>
    <div className="grid grid-cols-3 gap-2">{([['cash', 'Efectivo'], ['qr', 'QR'], ['card', 'Tarjeta']] as const).map(([value, label]) => <button type="button" key={value} disabled={attempted} onClick={() => { setMethod(value); setConfirmed(false) }} className={`min-h-11 rounded-xl border px-2 font-semibold ${method === value ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-600'} disabled:opacity-60`}>{label}</button>)}</div>
    {method === 'cash' ? <label className="block text-sm">Efectivo recibido<input aria-label="Efectivo recibido" type="number" min={total} step="0.01" disabled={attempted} value={received} onChange={event => setReceived(event.target.value)} className="mt-1 w-full rounded-xl bg-slate-950 p-3" /><small className="text-slate-400">Cambio: {money(Math.max(0, cashReceived - total))}</small></label> : <label className="flex items-start gap-2 rounded-xl border border-slate-700 p-3 text-sm"><input type="checkbox" checked={confirmed} disabled={attempted} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo que el pago por {method === 'qr' ? 'QR' : 'tarjeta'} fue recibido.</span></label>}
    {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-600 p-3">Cancelar</button><button type="button" disabled={!valid || busy} onClick={() => void pay()} className="min-h-11 flex-1 rounded-xl bg-emerald-300 p-3 font-bold text-slate-950 disabled:opacity-40">{busy ? 'Registrando…' : attempted ? 'Reintentar pago' : 'Registrar pago'}</button></div>
    <p className="text-xs text-slate-400">El pago queda asociado a la caja, turno y cuenta originales. El inventario se consume una sola vez al confirmarlo.</p>
  </section></div>
}
