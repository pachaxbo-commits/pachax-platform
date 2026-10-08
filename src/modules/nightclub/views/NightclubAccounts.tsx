import { useState } from 'react'
import type { NightclubAccount, NightclubDataset, NightclubPaymentDraft } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubAccountTableId, nightclubBalance, nightclubPaidTotal } from '../domain/nightclubAccounts'
import { NightclubRefundDialog } from './NightclubRefundDialog'
import { NightclubAccountPayment } from './NightclubAccountPayment'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubAccounts({ data, canDeliver, canRefund, canPay, onGoToPOS, onDeliverRound, onFinishAccount, onRefundRound, onRequestBill, onReopenBill, onRecordPayment }: {
  data: NightclubDataset
  canDeliver: boolean
  canRefund: boolean
  canPay: boolean
  onGoToPOS: (account: NightclubAccount) => void
  onDeliverRound: (accountId: string, roundId: string) => void
  onFinishAccount: (accountId: string) => void
  onRefundRound: (accountId: string, roundId: string, reason: string) => void
  onRequestBill: (accountId: string) => void
  onReopenBill: (accountId: string) => void
  onRecordPayment: (accountId: string, payment: NightclubPaymentDraft) => boolean
}) {
  const [search, setSearch] = useState('')
  const [refundTarget, setRefundTarget] = useState<{ accountId: string; roundId: string } | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const accounts = data.accounts.filter(account => account.status !== 'closed' && nightclubAccountLabel(account, data).toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <div className="space-y-4">
    <header><h1 className="text-2xl font-black">Mesas y rondas</h1><p className="text-sm text-slate-400">Las rondas se cargan a la cuenta. Solicita el cobro y registra los pagos en Caja.</p></header>
    <input aria-label="Buscar mesa o cliente" placeholder="Buscar mesa o cliente" value={search} onChange={event => setSearch(event.target.value)} className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-3" />
    <div className="grid gap-4 lg:grid-cols-2">{accounts.map(account => {
      const direct = !nightclubAccountTableId(account)
      const pending = account.rounds.some(round => round.status !== 'delivered' && round.status !== 'cancelled')
      const canFinish = !pending && nightclubBalance(account) === 0
      return <article key={account.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{nightclubAccountLabel(account, data)}</h2><p className="text-xs text-slate-400">{direct ? 'Venta directa en Barra' : 'Mesa ocupada'} · {account.openedBy}</p></div><span className="rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-200">{account.status === 'bill_requested' ? 'POR COBRAR' : direct ? 'BARRA' : 'OCUPADA'}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div>Consumido<strong className="block text-base">{money(account.subtotal)}</strong></div><div>Pagado<strong className="block text-base text-emerald-300">{money(nightclubPaidTotal(account))}</strong></div><div>Saldo<strong className="block text-base">{money(nightclubBalance(account))}</strong></div></div>
        <div className="mt-4 space-y-2">{account.rounds.map(round => <div key={round.id} className="rounded-xl bg-slate-950 p-3 text-xs"><div className="flex justify-between gap-2"><strong>Ronda #{round.sequence} · {round.customerId ? round.customerNameSnapshot || data.customers.find(customer => customer.id === round.customerId)?.name || 'Cliente' : round.customerId === null ? 'Sin cliente asociado' : data.customers.find(customer => customer.id === account.customerId)?.name || 'Sin cliente asociado'} · {round.authorization === 'courtesy' ? 'Cortesía' : round.authorization === 'payment' ? 'Pagada' : 'Cargada a cuenta'}</strong><span>{round.status}</span></div><p className="mt-1 text-slate-400">{round.items.map(item => `${item.quantity}× ${item.name}`).join(' · ')}</p><div className="mt-2 flex flex-wrap gap-2">{canDeliver && round.status === 'ready' && !!round.authorization && <button onClick={() => onDeliverRound(account.id, round.id)} className="rounded-lg bg-emerald-400 px-3 py-2 font-bold text-slate-950">Marcar entregado</button>}{canRefund && round.authorization === 'payment' && !['cancelled', 'delivered'].includes(round.status) && <button onClick={() => setRefundTarget({ accountId: account.id, roundId: round.id })} className="rounded-lg border border-amber-400 px-3 py-2 text-amber-200">Reembolsar</button>}</div></div>)}{!account.rounds.length && <p className="text-sm text-slate-400">Aún no hay rondas.</p>}</div>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={account.status !== 'open'} onClick={() => onGoToPOS(account)} className="rounded-xl bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Nueva ronda</button>{account.status === 'open' && nightclubBalance(account) > 0 && <button onClick={() => onRequestBill(account.id)} className="rounded-xl bg-sky-300 px-4 py-2 font-bold text-slate-950">Solicitar cobro</button>}{account.status === 'bill_requested' && canPay && <><button onClick={() => setPayingId(account.id)} disabled={nightclubBalance(account) <= 0} className="rounded-xl bg-emerald-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Registrar pago</button><button onClick={() => onReopenBill(account.id)} className="rounded-xl border border-slate-500 px-4 py-2">Reabrir</button></>}{account.status === 'open' && <button disabled={!canFinish} onClick={() => onFinishAccount(account.id)} className="rounded-xl border border-emerald-400 px-4 py-2 font-bold text-emerald-200 disabled:opacity-40">{direct ? 'Cerrar pedido' : 'Finalizar ocupación'}</button>}</div>
        {!canFinish && <p className="mt-2 text-xs text-slate-400">Completa las entregas y regulariza cualquier saldo anterior.</p>}
      </article>
    })}{!accounts.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No hay mesas ni pedidos en barra abiertos.</p>}</div>
    {refundTarget && <NightclubRefundDialog onCancel={() => setRefundTarget(null)} onConfirm={reason => { onRefundRound(refundTarget.accountId, refundTarget.roundId, reason); setRefundTarget(null) }} />}
    {payingId && data.accounts.find(account => account.id === payingId && account.status === 'bill_requested') && <NightclubAccountPayment account={data.accounts.find(account => account.id === payingId)!} onClose={() => setPayingId(null)} onPay={payment => onRecordPayment(payingId, payment)} />}
  </div>
}
