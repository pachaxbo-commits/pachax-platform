import { useState } from 'react'
import { Search } from 'lucide-react'
import type { Order, OrderStatus } from '../../types'

export function RestaurantOrders({
  orders,
  onAdvanceStatus,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Control de Pedidos</h1>
          <p className="text-sm text-slate-500">Monitoreo de comandas en salón, barra y para llevar</p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar mesa o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 w-48"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="preparing">En preparación</option>
            <option value="ready">Listos</option>
            <option value="delivered">Entregados</option>
          </select>
        </div>
      </div>

      {/* Orders List / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ord) => (
          <div
            key={ord.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                    #{ord.displayNumber}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{ord.tableInfo || 'Para llevar'}</h3>
                    <p className="text-xs text-slate-500">{ord.customerName || 'Cliente en mesa'}</p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${
                    ord.status === 'preparing'
                      ? 'bg-amber-100 text-amber-800'
                      : ord.status === 'ready'
                      ? 'bg-emerald-100 text-emerald-800'
                      : ord.status === 'delivered'
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {ord.status === 'preparing'
                    ? 'En preparación'
                    : ord.status === 'ready'
                    ? 'Listo para servir'
                    : ord.status === 'delivered'
                    ? 'Entregado'
                    : 'Pendiente'}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2 mb-4">
                {ord.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-slate-700">
                      <strong className="text-slate-900">{item.quantity}x</strong> {item.name}
                    </span>
                    <span className="font-semibold text-slate-900">Bs {(item.lineTotal || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total & Action */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-500 block">Total comanda</span>
                <span className="text-base font-bold text-slate-900">Bs {ord.total.toFixed(2)}</span>
              </div>

              {ord.status === 'pending' && (
                <button
                  onClick={() => onAdvanceStatus(ord.id, 'preparing')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition"
                >
                  Pasar a Cocina
                </button>
              )}
              {ord.status === 'preparing' && (
                <button
                  onClick={() => onAdvanceStatus(ord.id, 'ready')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition"
                >
                  Marcar Listo
                </button>
              )}
              {ord.status === 'ready' && (
                <button
                  onClick={() => onAdvanceStatus(ord.id, 'delivered')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Marcar Entregado
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
