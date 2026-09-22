import { useState } from 'react'
import { Users, Clock, Plus, CheckCircle } from 'lucide-react'
import type { RestaurantTable } from '../mocks/restaurantMock'
import type { Order } from '../../types'

export function RestaurantTables({
  tables,
  orders,
  onOpenTableOrder,
  onUpdateTableStatus,
}: {
  tables: RestaurantTable[]
  orders: Order[]
  onOpenTableOrder: (table: RestaurantTable) => void
  onUpdateTableStatus: (tableId: string, status: RestaurantTable['status']) => void
}) {
  const [selectedZone, setSelectedZone] = useState<'all' | 'salon' | 'terraza' | 'barra'>('all')

  const filteredTables = tables.filter((t) => {
    if (selectedZone === 'terraza') return t.name.includes('Terraza')
    if (selectedZone === 'barra') return t.name.includes('Barra')
    if (selectedZone === 'salon') return !t.name.includes('Terraza') && !t.name.includes('Barra')
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salón & Mesas</h1>
          <p className="text-sm text-slate-500">Distribución de mesas y comandas en salón</p>
        </div>

        {/* Zone tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'salon', label: 'Salón Principal' },
              { id: 'terraza', label: 'Terraza' },
              { id: 'barra', label: 'Barra' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedZone(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                selectedZone === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((t) => {
          const isOccupied = t.status === 'occupied'
          const isBill = t.status === 'bill_requested'
          const isReserved = t.status === 'reserved'
          const isAvailable = t.status === 'available'

          const activeOrder = orders.find((o) => o.id === t.activeOrderId)

          return (
            <div
              key={t.id}
              className={`p-5 rounded-2xl border transition relative flex flex-col justify-between ${
                isBill
                  ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/40 shadow-xs'
                  : isOccupied
                  ? 'bg-blue-50/50 border-blue-200 shadow-xs'
                  : isReserved
                  ? 'bg-slate-50 border-slate-300'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              {/* Status pill */}
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      isBill
                        ? 'bg-amber-100 text-amber-900'
                        : isOccupied
                        ? 'bg-blue-100 text-blue-900'
                        : isReserved
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isBill ? 'Cuenta solicitada' : isOccupied ? 'Ocupada' : isReserved ? 'Reservada' : 'Disponible'}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-2">{t.name}</h3>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs font-medium">
                  <Users className="w-3.5 h-3.5" />
                  {t.capacity}p
                </div>
              </div>

              {/* Middle details */}
              <div className="my-4 min-h-[50px]">
                {isOccupied || isBill ? (
                  <div className="space-y-1 text-xs">
                    <div className="text-slate-700 font-medium">
                      {activeOrder?.customerName || 'Mesa en servicio'} • {t.diners || 2} comensales
                    </div>
                    {t.openedAt && (
                      <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                        <Clock className="w-3 h-3" />
                        Abierta a las {t.openedAt}
                      </div>
                    )}
                    {activeOrder && (
                      <div className="text-slate-900 font-bold mt-2">
                        Total actual: Bs {activeOrder.total.toFixed(2)}
                      </div>
                    )}
                  </div>
                ) : isReserved ? (
                  <div className="text-xs text-slate-500 italic">Reserva para las 19:30</div>
                ) : (
                  <div className="text-xs text-emerald-700 font-medium">Mesa libre para nuevos comensales</div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2">
                {isAvailable && (
                  <button
                    onClick={() => {
                      onUpdateTableStatus(t.id, 'occupied')
                      onOpenTableOrder(t)
                    }}
                    className="w-full py-2 text-xs font-bold text-teal-900 bg-teal-100 hover:bg-teal-200 rounded-xl transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ocupar / Nueva Comanda
                  </button>
                )}

                {isOccupied && (
                  <>
                    <button
                      onClick={() => onOpenTableOrder(t)}
                      className="flex-1 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition"
                    >
                      Ver Comanda
                    </button>
                    <button
                      onClick={() => onUpdateTableStatus(t.id, 'bill_requested')}
                      className="py-1.5 px-3 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition"
                      title="Pedir Cuenta"
                    >
                      Cuenta
                    </button>
                  </>
                )}

                {isBill && (
                  <button
                    onClick={() => onUpdateTableStatus(t.id, 'available')}
                    className="w-full py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Cobrar y Liberar Mesa
                  </button>
                )}

                {isReserved && (
                  <button
                    onClick={() => onUpdateTableStatus(t.id, 'available')}
                    className="w-full py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                  >
                    Cancelar Reserva
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
