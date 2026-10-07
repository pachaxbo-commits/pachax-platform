import { useState } from 'react'
import { Wallet } from 'lucide-react'
import type { NightclubCashMovement, NightclubDataset, NightclubPaymentDraft } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubBalance, nightclubCashReconciliation, nightclubCashSummary, nightclubPaidTotal, nightclubProfitSummary } from '../domain/nightclubAccounts'
import { NightclubAccountPayment } from './NightclubAccountPayment'
const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const labels = { inventory_purchase: 'Compra de inventario', payroll: 'Pago al personal', services: 'Servicios', rent: 'Alquiler', maintenance: 'Mantenimiento', transport: 'Transporte', advertising: 'Publicidad', cleaning: 'Limpieza', security: 'Seguridad', administrative: 'Gasto administrativo', other: 'Otro gasto' } as const

export function NightclubCash({ data, onStartShift, onCloseShift, onCashMovement, onRecordPayment }: { data: NightclubDataset; onStartShift: (amount: number) => void; onCloseShift: (countedCash: number) => void; onCashMovement: (draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>) => boolean; onRecordPayment: (accountId: string, payment: NightclubPaymentDraft) => boolean }) {
  const [opening, setOpening] = useState('200'); const [counted, setCounted] = useState(''); const [type, setType] = useState<'income' | 'expense'>('expense'); const [category, setCategory] = useState<keyof typeof labels>('other'); const [method, setMethod] = useState<'cash' | 'qr' | 'card'>('cash'); const [amount, setAmount] = useState(''); const [description, setDescription] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const shift = data.shift; const cash = nightclubCashSummary(data); const profit = nightclubProfitSummary(data); const openAccounts = data.accounts.filter(account => nightclubBalance(account) > 0); const movements = (data.cashMovements || []).filter(item => item.shiftId === shift?.id).slice().reverse()
  const reconciliation = nightclubCashReconciliation(cash.expectedCash, counted)
  const submit = () => { if (onCashMovement({ type, method, amount: Number(amount), description, ...(type === 'expense' ? { category } : {}) })) { setAmount(''); setDescription('') } }
  if (!shift || shift.status === 'closed') return <div className="space-y-5"><header><h1 className="text-2xl font-black">Caja y turnos</h1><p className="text-sm text-slate-400">Cobros, resultado y arqueo de la noche.</p></header><section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="mb-3 text-sm">Inicia un turno para abrir cuentas y vender.</p><label className="block text-xs text-slate-400">Fondo inicial / cambio en caja<input type="number" min="0" value={opening} onChange={e => setOpening(e.target.value)} className="mt-1 block w-full rounded-xl bg-slate-950 p-3" /></label><button onClick={() => onStartShift(Number(opening))} className="mt-3 rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950">Iniciar turno</button></section></div>
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Caja y turnos</h1>
        <p className="text-sm text-slate-400">Cobros de cuentas, cierre de caja y resultado del negocio.</p>
      </header>
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="font-bold">Cuentas por cobrar</h2>
        <div className="mt-3 space-y-2">
          {data.accounts.filter(account => account.status === 'bill_requested' && nightclubBalance(account) > 0).map(account => (
            <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950 p-3">
              <div>
                <strong>{nightclubAccountLabel(account, data)}</strong>
                <p className="text-sm text-slate-400">Total {money(account.subtotal)} · Pagado {money(nightclubPaidTotal(account))} · Saldo {money(nightclubBalance(account))}</p>
              </div>
              <button onClick={() => setPayingId(account.id)} className="min-h-11 rounded-xl bg-emerald-400 px-4 font-bold text-slate-950">Registrar pago</button>
            </div>
          ))}
          {!data.accounts.some(account => account.status === 'bill_requested' && nightclubBalance(account) > 0) && (
            <p className="text-sm text-slate-400">No hay saldos solicitados.</p>
          )}
        </div>
      </section>
      <section className="flex justify-between gap-4 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-950 to-slate-900 p-5">
        <div>
          <span className="text-xs font-bold uppercase text-amber-200">Efectivo que debe haber ahora en caja</span>
          <strong className="mt-1 block text-3xl font-black">{money(cash.expectedCash)}</strong>
          <p className="mt-2 text-xs text-slate-300">Fondo inicial + ventas efectivo + entradas − salidas.</p>
        </div>
        <Wallet className="h-10 w-10 text-amber-300" />
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {[['VENTAS', profit.totalSales], ['GANANCIA BRUTA', profit.grossProfit], ['GASTOS', profit.totalExpenses], ['PAGADO POR QR', cash.qrSales], ['PAGADO CON TARJETA', cash.cardSales]].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <span className="text-xs font-bold text-slate-400">{label}</span>
            <strong className="mt-2 block text-xl">{money(Number(value))}</strong>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-400">Margen bruto: {profit.grossMargin.toFixed(2)}% · Margen neto: {profit.netMargin.toFixed(2)}%</p>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">Resultado del negocio</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <span>Ventas <b>{money(profit.totalSales)}</b></span>
          <span>Costo de ventas <b>−{money(profit.costOfSales)}</b></span>
          <span>Mermas y cortesías <b>−{money(profit.waste + profit.courtesies + profit.internal)}</b></span>
          <span>Gastos operativos <b>−{money(profit.expenses)}</b></span>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">Registrar movimiento</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <select value={type} onChange={e => setType(e.target.value as typeof type)} className="rounded-xl bg-slate-950 p-3">
            <option value="expense">Salida / gasto</option>
            <option value="income">Entrada</option>
          </select>
          {type === 'expense' && (
            <select value={category} onChange={e => setCategory(e.target.value as keyof typeof labels)} className="rounded-xl bg-slate-950 p-3">
              {Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          )}
          <input placeholder="Concepto" value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl bg-slate-950 p-3" />
          <input type="number" min="0.01" placeholder="Monto" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-xl bg-slate-950 p-3" />
          <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className="rounded-xl bg-slate-950 p-3">
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
            <option value="card">Tarjeta</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-slate-400">Compra de inventario afecta Caja, pero su costo se reconoce solamente cuando se vende.</p>
        <button onClick={submit} className="mt-3 rounded-xl bg-amber-400 px-4 py-2 font-bold text-slate-950">Guardar movimiento</button>
        <div className="mt-4 space-y-1 text-sm">
          {movements.map(item => (
            <p key={item.id} className="flex justify-between border-t border-slate-800 py-2">
              <span>{item.description} · {item.category ? labels[item.category] : item.method}</span>
              <b>{item.type === 'income' ? '+' : '−'}{money(item.amount)}</b>
            </p>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-bold">Arqueo y cierre</h2>
        <p className="mt-1 text-sm text-slate-400">{openAccounts.length ? `${openAccounts.length} cuenta(s) abiertas.` : 'Todas las cuentas están cerradas.'}</p>
        <div className="mt-3 flex gap-2">
          <input aria-label="Efectivo contado" type="number" min="0" step="0.01" placeholder="Efectivo contado" value={counted} onChange={e => setCounted(e.target.value)} className="rounded-xl bg-slate-950 p-3" />
          <button disabled={openAccounts.length > 0 || !reconciliation.canClose} onClick={() => onCloseShift(reconciliation.countedCash!)} className="rounded-xl bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Cerrar turno</button>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <p>Efectivo esperado: <b>{money(cash.expectedCash)}</b></p>
          <p>Efectivo contado: <b>{reconciliation.valid ? money(reconciliation.countedCash!) : '—'}</b></p>
          <p>Diferencia: <b>{reconciliation.valid ? money(reconciliation.difference!) : '—'}</b></p>
          <p role="status" className={reconciliation.canClose ? 'text-emerald-300' : reconciliation.valid ? 'text-amber-300' : 'text-slate-400'}>
            {!reconciliation.valid ? 'Ingresa un efectivo contado válido.' : reconciliation.difference! < 0 ? `Faltante: ${money(Math.abs(reconciliation.difference!))}. Corrige el arqueo antes de cerrar.` : reconciliation.difference! > 0 ? `Sobrante: ${money(reconciliation.difference!)}. El turno puede cerrarse.` : 'Caja cuadrada. El turno puede cerrarse.'}
          </p>
        </div>
      </section>
      {payingId && data.accounts.find(account => account.id === payingId && account.status === 'bill_requested') && (
        <NightclubAccountPayment
          account={data.accounts.find(account => account.id === payingId)!}
          onClose={() => setPayingId(null)}
          onPay={payment => onRecordPayment(payingId, payment)}
        />
      )}
    </div>
  )
}
