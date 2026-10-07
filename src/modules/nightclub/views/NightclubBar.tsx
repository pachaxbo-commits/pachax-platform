import { useRef, useState } from 'react'
import type { NightclubAccount, NightclubDataset, NightclubRound, NightclubRoundStatus } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubBarQueue } from '../domain/nightclubAccounts'

const labels: Record<NightclubRoundStatus, string> = { pending: 'Pendiente', preparing: 'Preparando', ready: 'Listo', delivered: 'Entregado', cancelled: 'Anulado' }
const waiterFor = (account: NightclubAccount, round: NightclubRound) => account.serviceTarget?.type === 'customer' ? '' : round.authorization === 'payment' ? round.sentBy || account.waiterName || account.openedBy : account.waiterName || account.openedBy

export function NightclubBar({ data, onAdvance, onDeliver }: {
  data: NightclubDataset
  onAdvance: (accountId: string, roundId: string) => boolean | void | Promise<boolean | void>
  onDeliver: (accountId: string, roundId: string) => boolean | void | Promise<boolean | void>
}) {
  const inFlight = useRef(new Set<string>())
  const [processingId, setProcessingId] = useState<string | null>(null)
  const rounds = nightclubBarQueue(data)
  const act = async (account: NightclubAccount, round: NightclubRound) => {
    if (inFlight.current.has(round.id)) return
    inFlight.current.add(round.id)
    setProcessingId(round.id)
    try {
      if (round.status === 'ready') await onDeliver(account.id, round.id)
      else await onAdvance(account.id, round.id)
    } finally {
      inFlight.current.delete(round.id)
      setProcessingId(current => current === round.id ? null : current)
    }
  }

  return <div className="space-y-4">
    <header><h1 className="text-2xl font-black">Barra</h1><p className="text-sm text-slate-400">Prepara y entrega cada pedido. La entrega completa la ronda.</p></header>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rounds.map(({ account, round }) => {
      const waiter = waiterFor(account, round)
      const processing = processingId === round.id
      const action = round.status === 'pending' ? 'INICIAR PREPARACIÓN' : round.status === 'preparing' ? 'MARCAR LISTO' : waiter ? `ENTREGAR A ${waiter}` : 'MARCAR ENTREGADO'
      return <article key={round.id} className="rounded-xl border border-slate-700 bg-[#121b20] p-4">
        <div className="flex items-start justify-between gap-3"><div><strong className="block text-base">{nightclubAccountLabel(account, data)}</strong><span className="block text-xs text-slate-400">Pedido #{round.sequence} · {new Date(round.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span></div><span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-[11px] font-bold text-amber-200">{labels[round.status]}</span></div>
        <p className="mt-3 text-sm"><span className="text-slate-400">{waiter ? 'Mesero: ' : 'Entrega: '}</span><strong>{waiter || 'Pedido en barra'}</strong></p>
        <p className="mt-2 text-xs font-bold text-emerald-300">{round.authorization === 'courtesy' ? 'CORTESÍA AUTORIZADA' : 'PAGADO · ' + (account.payments?.find(payment => payment.id === round.paymentId)?.method || 'registrado').toUpperCase()}</p>
        <div className="my-4 space-y-2">{round.items.map(item => <p key={item.id} className="flex justify-between gap-2 border-b border-slate-800 pb-2 text-sm"><span>{item.quantity}× {item.name}</span><span className="shrink-0 text-xs text-slate-500">{item.preparationArea === 'Directo' ? 'Directo' : 'Barra'}</span></p>)}</div>
        {round.status === 'ready' && round.readyAt && <p className="mb-2 text-xs text-slate-400">Listo desde {new Date(round.readyAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</p>}
        <button disabled={processing} onClick={() => void act(account, round)} className={`min-h-14 w-full rounded-xl px-3 text-sm font-black disabled:cursor-wait disabled:opacity-60 ${round.status === 'ready' ? 'bg-emerald-300 text-[#07111a]' : 'bg-amber-300 text-[#07111a]'}`}>{processing ? round.status === 'ready' ? 'Marcando entrega...' : 'Actualizando...' : action}</button>
      </article>
    })}{!rounds.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No hay pedidos pendientes de preparación o entrega.</p>}</div>
  </div>
}
