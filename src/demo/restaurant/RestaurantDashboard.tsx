import { Utensils, DollarSign, Users, ChefHat, TrendingUp } from 'lucide-react'
import type { Order } from '../../types'
import type { RestaurantTable } from '../mocks/restaurantMock'

export function RestaurantDashboard({
  orders,
  tables,
  onNavigate,
}: {
  orders: Order[]
  tables: RestaurantTable[]
  onNavigate: (module: string) => void
}) {
  const activeOrders = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
  const occupiedTables = tables.filter((t) => t.status === 'occupied' || t.status === 'bill_requested')
  const totalSalesToday = orders.reduce((sum, o) => sum + (o.total || 0), 0)

  return (
    <div className="space-y-6">
      {/* Welcome & Shift banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-400 bg-teal-950/60 px-2.5 py-1 rounded-full mb-2">
            Turno de Salón Activo
          </span>
          <h1 className="text-2xl font-bold">Resumen de Operaciones</h1>
          <p className="text-slate-300 text-sm mt-1">
            Supervisión en tiempo real de mesas, pedidos en cocina y caja.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl transition shadow-sm"
          >
            + Nueva Orden / Mesa
          </button>
          <button
            onClick={() => onNavigate('tables')}
            className="px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white rounded-xl transition"
          >
            Ver Mesas ({occupiedTables.length}/{tables.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Ventas del Turno</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">Bs {totalSalesToday.toFixed(2)}</div>
          <div className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {orders.length} pedidos registrados
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pedidos en Cocina</span>
            <ChefHat className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{activeOrders.length}</div>
          <div className="text-xs text-slate-500 mt-1">
            {orders.filter((o) => o.status === 'preparing').length} en preparación
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Ocupación Salón</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {Math.round((occupiedTables.length / tables.length) * 100)}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {occupiedTables.length} de {tables.length} mesas ocupadas
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Ticket Promedio</span>
            <Utensils className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            Bs {orders.length ? (totalSalesToday / orders.length).toFixed(2) : '0.00'}
          </div>
          <div className="text-xs text-slate-500 mt-1">Comedor & Para llevar</div>
        </div>
      </div>

      {/* Mesas y Pedidos Activos Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mesas rápidas */}
        <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Estado de Mesas</h2>
            <button
              onClick={() => onNavigate('tables')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Ver plano →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {tables.slice(0, 9).map((t) => {
              const isOccupied = t.status === 'occupied'
              const isBill = t.status === 'bill_requested'
              const isReserved = t.status === 'reserved'
              return (
                <div
                  key={t.id}
                  onClick={() => onNavigate('tables')}
                  className={`p-3 rounded-xl border text-center cursor-pointer transition ${
                    isBill
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : isOccupied
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : isReserved
                      ? 'bg-slate-100 border-slate-300 text-slate-600'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/50'
                  }`}
                >
                  <div className="text-xs font-bold">{t.name}</div>
                  <div className="text-[10px] mt-1 font-medium">
                    {isBill ? 'Cuenta' : isOccupied ? `${t.diners || 2}p` : isReserved ? 'Reserva' : 'Libre'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pedidos recientes en curso */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Pedidos Activos en Cocina & Salón</h2>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Ver todos →
            </button>
          </div>
          <div className="space-y-3">
            {activeOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between hover:bg-slate-50/70 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center">
                    #{ord.displayNumber}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {ord.tableInfo || 'Para llevar'} •{' '}
                      <span className="text-slate-500 font-normal">{ord.customerName || 'Cliente'}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {ord.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900">Bs {ord.total.toFixed(2)}</div>
                  <span
                    className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      ord.status === 'preparing'
                        ? 'bg-amber-100 text-amber-800'
                        : ord.status === 'ready'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {ord.status === 'preparing' ? 'En cocina' : ord.status === 'ready' ? 'Listo' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
