import { useRef, useState } from 'react'
import type { NightclubAccount, NightclubPaymentDraft } from '../domain/nightclubAccounts'
import { nightclubBalance, nightclubPaidTotal } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toFixed(2)}`

export function NightclubAccountPayment({ account, onClose, onPay }: { account: NightclubAccount; onClose: () => void; onPay: (payment: NightclubPaymentDraft) => boolean }) {
  const [method, setMethod] = useState<'cash' | 'qr' | 'card'>('cash')
  const [amount, setAmount] = useState('')
  const [received, setReceived] = useState('')
  const operation = useRef<string | null>(null)
  const busy = useRef(false)
  const balance = nightclubBalance(account)
  const value = Number(amount)
  const cashReceived = Number(received)
  const valid = Number.isFinite(value) && value > 0 && value <= balance && (method !== 'cash' || received.trim() !== '' && Number.isFinite(cashReceived) && cashReceived >= value)
  const pay = () => {
    if (!valid || busy.current) return
    busy.current = true
    const operationId = operation.current ||= crypto.randomUUID()
    const success = onPay({ method, amount: value, ...(method === 'cash' ? { received: cashReceived } : {}), operationId })
    busy.current = false
    if (success) onClose()
  }
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-label="Registrar pago de cuenta" className="w-full max-w-md space-y-4 rounded-2xl border border-emerald-400/30 bg-slate-900 p-5 text-slate-100"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Registrar pago</h2><button aria-label="Cerrar pago" onClick={onClose} className="min-h-10 px-3">×</button></div><div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-950 p-3 text-xs"><span>TOTAL<strong className="block text-base">{money(account.subtotal)}</strong></span><span>PAGADO<strong className="block text-base text-emerald-300">{money(nightclubPaidTotal(account))}</strong></span><span>SALDO<strong className="block text-base text-amber-300">{money(balance)}</strong></span></div><div role="group" aria-label="Método de pago" className="grid grid-cols-3 gap-2">{([['cash', 'Efectivo'], ['qr', 'QR'], ['card', 'Tarjeta']] as const).map(([id, label]) => <button key={id} aria-pressed={method === id} onClick={() => { setMethod(id); setReceived(''); operation.current = null }} className={`min-h-11 rounded-xl border text-sm font-bold ${method === id ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-600 bg-slate-950'}`}>{label}</button>)}</div><label className="block text-sm">Monto<input aria-label="Monto del pago" type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={event => { setAmount(event.target.value); operation.current = null }} className="mt-1 w-full rounded-xl bg-slate-950 p-3" /></label>{method === 'cash' && <label className="block text-sm">Recibido<input aria-label="Efectivo recibido" type="number" min="0" step="0.01" value={received} onChange={event => { setReceived(event.target.value); operation.current = null }} className="mt-1 w-full rounded-xl bg-slate-950 p-3" /><small className="text-slate-400">Cambio: {money(Math.max(0, cashReceived - (Number.isFinite(value) ? value : 0)))}</small></label>}<div className="flex gap-2"><button onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-600">Cancelar</button><button disabled={!valid} onClick={pay} className="min-h-11 flex-1 rounded-xl bg-emerald-400 font-black text-slate-950 disabled:opacity-40">Registrar pago</button></div><p className="text-xs text-slate-400">Simulación local; QR y Tarjeta no confirman una transacción bancaria externa.</p></section></div>
}
