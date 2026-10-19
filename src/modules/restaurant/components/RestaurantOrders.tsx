import { useState } from 'react'
import { Search, ChefHat, CheckCircle2, UtensilsCrossed, Receipt } from 'lucide-react'
import type { Order, OrderStatus } from '../../../types'

export function RestaurantOrders({
  orders,
  onAdvanceStatus,
  onViewReceipt,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onViewReceipt?: (order: Order) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
  }

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      o.displayNumber.includes(term) ||
      (o.customerName && o.customerName.toLowerCase().includes(term)) ||
      (o.tableInfo && o.tableInfo.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-5">
      {/* Encabezado compacto */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Comandas & Pedidos</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Control de flujo: Pendiente → Cocina → Listo → Entregado</p>
        </div>

        {/* Buscador rápido */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por mesa, comanda o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 shadow-xs"
          />
        </div>
      </header>

      {/* Selector de estados en píldoras */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {(
          [
            ['all', 'Todos', counts.all],
            ['pending', 'Pendientes', counts.pending],
            ['preparing', 'En cocina', counts.preparing],
            ['ready', 'Listos para servir', counts.ready],
            ['delivered', 'Entregados', counts.delivered],
          ] as const
        ).map(([key, label, count]) => {
          const isActive = statusFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key as 'all' | OrderStatus)}
              style={isActive ? { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' } : undefined}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <span>{label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Grid de Comandas */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((ord) => {
          const isPending = ord.status === 'pending'
          const isPreparing = ord.status === 'preparing'
          const isReady = ord.status === 'ready'
          const isDelivered = ord.status === 'delivered'

          return (
            <article
              key={ord.id}
              className={`bg-white rounded-2xl border p-4.5 shadow-xs flex flex-col justify-between transition hover:shadow-md ${
                isPreparing
                  ? 'border-amber-300 ring-1 ring-amber-300/40'
                  : isReady
                  ? 'border-emerald-300 ring-1 ring-emerald-300/40 bg-emerald-50/10'
                  : 'border-slate-200'
              }`}
            >
              <div>
                {/* Cabecera de la comanda */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                      #{ord.displayNumber}
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                        {ord.tableInfo || 'Para llevar'}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {ord.customerName || 'Cliente en salón'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      isPreparing
                        ? 'bg-amber-100 text-amber-800'
                        : isReady
                        ? 'bg-emerald-100 text-emerald-800'
                        : isDelivered
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {isPreparing
                      ? 'En cocina'
                      : isReady
                      ? 'Listo para servir'
                      : isDelivered
                      ? 'Entregado'
                      : 'Pendiente'}
                  </span>
                </div>

                {/* Lista de platos y bebidas */}
                <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto pr-1">
                  {ord.items.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between text-xs py-0.5">
                      <span className="text-slate-700 leading-tight">
                        <strong className="text-slate-900 font-extrabold mr-1">{item.quantity}x</strong>
                        {item.name}
                        {item.modifiers?.note && (
                          <span className="block text-[10px] text-amber-800 font-medium italic mt-0.5">
                            Nota: {item.modifiers.note}
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-slate-800 shrink-0 ml-2">
                        Bs {(item.lineTotal || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pie de comanda: Total & Acción principal */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total</span>
                  <span className="text-base font-extrabold text-slate-900">Bs {ord.total.toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isPending && (
                    <button
                      type="button"
                      onClick={() => onAdvanceStatus(ord.id, 'preparing')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-xs cursor-pointer"
                    >
                      <ChefHat size={14} />
                      <span>Pasar a cocina</span>
                    </button>
                  )}
                  {isPreparing && (
                    <button
                      type="button"
                      onClick={() => onAdvanceStatus(ord.id, 'ready')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Marcar listo</span>
                    </button>
                  )}
                  {isReady && (
                    <button
                      type="button"
                      onClick={() => onAdvanceStatus(ord.id, 'delivered')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                    >
                      <UtensilsCrossed size={14} />
                      <span>Marcar entregado</span>
                    </button>
                  )}
                  {isDelivered && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 py-1">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      Entregado
                    </span>
                  )}
                  {onViewReceipt && ord.paymentStatus === 'paid' && (
                    <button
                      type="button"
                      onClick={() => onViewReceipt(ord)}
                      title="Ver y compartir recibo"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                    >
                      <Receipt size={14} />
                      <span>Recibo</span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {!filtered.length && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <UtensilsCrossed className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-700">No hay comandas en este estado</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {searchTerm ? 'Prueba cambiando el término de búsqueda.' : 'Las nuevas comandas aparecerán aquí.'}
          </p>
        </div>
      )}
    </div>
  )
}
