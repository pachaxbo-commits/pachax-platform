import { Calendar } from 'lucide-react'

export function QuickRetailReports() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reportes de Venta & Mostrador</h1>
          <p className="text-sm text-slate-500">Métricas consolidadas de productos pesados y unitarios</p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-slate-700">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>Hoy • Turno Completo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Facturado</div>
          <div className="text-2xl font-bold text-slate-900">Bs 1,850.00</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">Total de 42 tickets emitidos</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ventas por Peso</div>
          <div className="text-2xl font-bold text-slate-900">Bs 980.00 (53%)</div>
          <div className="text-xs text-slate-500 mt-1">16.3 kg de helados y granel</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ventas por Unidad</div>
          <div className="text-2xl font-bold text-slate-900">Bs 870.00 (47%)</div>
          <div className="text-xs text-slate-500 mt-1">58 cafés y repostería</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4">Top Productos Más Vendidos</h2>
          <div className="space-y-3">
            {[
              { name: 'Helado artesanal (Granel)', qty: '8.45 kg', total: 'Bs 507.00', pct: 85 },
              { name: 'Café Latte', qty: '24 unids.', total: 'Bs 432.00', pct: 70 },
              { name: 'Té verde a granel', qty: '3.20 kg', total: 'Bs 256.00', pct: 45 },
              { name: 'Croissant de Almendras', qty: '14 unids.', total: 'Bs 224.00', pct: 40 },
              { name: 'Galletas surtidas', qty: '4.60 kg', total: 'Bs 207.00', pct: 35 },
            ].map((p, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-800">
                  <span>{p.name} ({p.qty})</span>
                  <span>{p.total}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-teal-600 h-full rounded-full" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4">Medios de Pago</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Efectivo</span>
              <span>Bs 1,220.00 (66%)</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: '66%' }} />
            </div>

            <div className="flex items-center justify-between text-xs font-bold pt-2">
              <span>QR Digital / Transferencia</span>
              <span>Bs 630.00 (34%)</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full" style={{ width: '34%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
