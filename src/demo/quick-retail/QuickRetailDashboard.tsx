import { DollarSign, Scale, Package, Banknote, TrendingUp, Plus } from 'lucide-react'
import type { CompletedRetailSale } from '../mocks/retailMock'

export function QuickRetailDashboard({
  sales,
  onNavigate,
}: {
  sales: CompletedRetailSale[]
  onNavigate: (module: string) => void
}) {
  const totalSalesMinor = sales.reduce((sum, s) => sum + s.totalMinor, 0)
  const totalSalesBs = (totalSalesMinor / 100).toFixed(2)

  // Calcular total de gramos despachados
  const totalGrams = sales.reduce((sum, s) => {
    return (
      sum +
      s.lines
        .filter((l) => l.soldBy === 'weight')
        .reduce((lineSum, l) => lineSum + l.enteredQuantity, 0)
    )
  }, 0)

  // Total de unidades vendidas
  const totalUnits = sales.reduce((sum, s) => {
    return (
      sum +
      s.lines
        .filter((l) => l.soldBy === 'unit')
        .reduce((lineSum, l) => lineSum + l.enteredQuantity, 0)
    )
  }, 0)

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-teal-900 to-slate-900 text-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider bg-teal-800/60 text-teal-300 px-2.5 py-0.5 rounded-full mb-2">
            Mostrador & Caja Activa
          </span>
          <h1 className="text-2xl font-bold">Comercio / Venta Rápida</h1>
          <p className="text-slate-300 text-sm mt-1">
            Ventas combinadas por peso (gramos) y unidad para cafeterías, heladerías, panaderías y tiendas a granel.
          </p>
        </div>
        <div>
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2.5 text-sm font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl transition shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nueva Venta / POS
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Ventas del Día</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">Bs {totalSalesBs}</div>
          <div className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {sales.length} transacciones
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Despacho por Peso</span>
            <Scale className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {(totalGrams / 1000).toFixed(2)} kg
          </div>
          <div className="text-xs text-slate-500 mt-1">{totalGrams} gramos pesados en mostrador</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Venta por Unidad</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalUnits} unids.</div>
          <div className="text-xs text-slate-500 mt-1">Cafés, repostería y envasados</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Efectivo en Caja</span>
            <Banknote className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            Bs{' '}
            {(
              sales
                .filter((s) => s.paymentKind === 'cash' || s.paymentKind === 'mixed')
                .reduce((sum, s) => sum + s.cashMinor, 0) / 100
            ).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Gaveta cuadrada</div>
        </div>
      </div>

      {/* Ventas Recientes */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Últimas Ventas Registradas</h2>
          <button
            onClick={() => onNavigate('sales')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Ver historial completo →
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {sales.slice(0, 5).map((s) => (
            <div key={s.id} className="py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-800 font-bold flex items-center justify-center">
                  {s.receiptNumber.split('-')[1]}
                </span>
                <div>
                  <div className="font-bold text-slate-900">
                    {s.customerName || 'Venta de mostrador'}{' '}
                    <span className="font-normal text-slate-400">({s.receiptNumber})</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {s.lines.map((l) => `${l.productNameSnapshot} (${l.enteredQuantity} ${l.enteredUnit})`).join(' • ')}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  Bs {(s.totalMinor / 100).toFixed(2)}
                </div>
                <span
                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    s.paymentKind === 'cash'
                      ? 'bg-emerald-100 text-emerald-800'
                      : s.paymentKind === 'qr'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {s.paymentKind === 'cash' ? 'Efectivo' : s.paymentKind === 'qr' ? 'QR' : 'Mixto'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
