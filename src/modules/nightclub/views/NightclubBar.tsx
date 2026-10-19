import type { NightclubDataset, NightclubRoundStatus } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubBarQueue } from '../domain/nightclubAccounts'
import { Printer } from 'lucide-react'

const labels: Record<NightclubRoundStatus, string> = {
  pending: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Listo para Servicio',
  delivered: 'Entregado',
  cancelled: 'Anulado',
}

export function NightclubBar({
  data,
  onAdvance,
  onPrintComanda,
  canPrint = true,
}: {
  data: NightclubDataset
  onAdvance: (accountId: string, roundId: string) => void
  onPrintComanda?: (accountId: string, roundId: string, isReprint?: boolean) => void | Promise<void>
  canPrint?: boolean
}) {
  const rounds = nightclubBarQueue(data)
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-black">Barra</h1>
        <p className="text-sm text-slate-400">
          Preparación y entrega al mesero. Los productos de entrega directa no ingresan aquí.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rounds.map(({ account, round }) => (
          <article key={round.id} className="rounded-xl border border-slate-700 bg-[#121b20] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <strong>{nightclubAccountLabel(account, data)}</strong>
                  <span className="block text-xs text-slate-400">
                    Pedido #{round.sequence} · {account.openedBy} ·{' '}
                    {new Date(round.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-bold text-amber-200">
                  {labels[round.status]}
                </span>
              </div>
              <p className="mt-3 text-xs font-bold text-emerald-300">
                {round.authorization === 'courtesy'
                  ? 'CORTESÍA AUTORIZADA'
                  : round.authorization === 'account_charge'
                  ? 'CARGADO A CUENTA'
                  : 'PAGADO · ' +
                    (account.payments?.find((payment) => payment.id === round.paymentId)?.method || 'registrado').toUpperCase()}
              </p>
              <div className="my-4 space-y-2">
                {round.items
                  .filter((item) => item.preparationArea !== 'Directo')
                  .map((item) => (
                    <p key={item.id} className="flex justify-between border-b border-slate-800 pb-2 text-sm">
                      <span>
                        {item.quantity}× {item.name}
                      </span>
                      <span className="text-slate-500">Barra</span>
                    </p>
                  ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={round.status === 'ready'}
                onClick={() => onAdvance(account.id, round.id)}
                className="h-11 w-full rounded-xl bg-amber-400 font-bold text-slate-950 disabled:opacity-40 cursor-pointer"
              >
                {round.status === 'pending'
                  ? 'Iniciar preparación'
                  : round.status === 'preparing'
                  ? 'Marcar listo'
                  : 'Esperando entrega por Servicio'}
              </button>

              {canPrint && onPrintComanda && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onPrintComanda(account.id, round.id, false)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500 transition cursor-pointer"
                  >
                    <Printer size={13} />
                    <span>Imprimir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrintComanda(account.id, round.id, true)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 py-2 text-xs font-semibold text-amber-300 hover:border-amber-400 transition cursor-pointer"
                  >
                    <Printer size={13} />
                    <span>Reimprimir</span>
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
        {!rounds.length && (
          <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
            No hay preparaciones pendientes.
          </p>
        )}
      </div>
    </div>
  )
}
