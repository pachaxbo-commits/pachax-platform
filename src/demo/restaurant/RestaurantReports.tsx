import { Calendar } from 'lucide-react'

export function RestaurantReports() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reportes de Salón & Ventas</h1>
          <p className="text-sm text-slate-500">Métricas consolidadas de facturación, turnos y platos más pedidos</p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-slate-700">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>Hoy • Turno Almuerzo & Cena</span>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Facturado</div>
          <div className="text-2xl font-bold text-slate-900">Bs 2,420.00</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">+14% respecto a ayer</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Efectivo en Caja</div>
          <div className="text-2xl font-bold text-slate-900">Bs 1,573.00 (65%)</div>
          <div className="text-xs text-slate-500 mt-1">Cobros en mostrador y mesa</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pagos con QR / Digital</div>
          <div className="text-2xl font-bold text-slate-900">Bs 847.00 (35%)</div>
          <div className="text-xs text-slate-500 mt-1">Confirmados electrónicamente</div>
        </div>
      </div>

      {/* Analytics breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platos más pedidos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4">Platos Más Vendidos Hoy</h2>
          <div className="space-y-3">
            {[
              { name: 'Lomo a la Pimienta', count: 18, total: 'Bs 1,044.00', pct: 85 },
              { name: 'Hamburguesa Artesanal', count: 14, total: 'Bs 588.00', pct: 65 },
              { name: 'Bruschettas Mediterráneas', count: 9, total: 'Bs 216.00', pct: 40 },
              { name: 'Limonada Menta & Jengibre', count: 22, total: 'Bs 330.00', pct: 95 },
              { name: 'Tiramisú Tradicional', count: 11, total: 'Bs 242.00', pct: 50 },
            ].map((p, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-800">
                  <span>{p.name}</span>
                  <span>{p.count} pedidos ({p.total})</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-teal-600 h-full rounded-full" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ventas por turno horario */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4">Distribución Horaria de Comensales</h2>
          <div className="space-y-3">
            {[
              { hour: '12:00 - 13:00', amount: 'Bs 420.00', count: '6 mesas', pct: 45 },
              { hour: '13:00 - 14:00', amount: 'Bs 980.00', count: '14 mesas (Pico)', pct: 100 },
              { hour: '14:00 - 15:00', amount: 'Bs 360.00', count: '5 mesas', pct: 35 },
              { hour: '19:00 - 20:00', amount: 'Bs 310.00', count: '4 mesas', pct: 30 },
              { hour: '20:00 - 21:00', amount: 'Bs 350.00', count: '5 mesas', pct: 35 },
            ].map((h, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-800">
                  <span>{h.hour} • {h.count}</span>
                  <span>{h.amount}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${h.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
