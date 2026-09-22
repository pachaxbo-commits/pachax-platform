import { useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { RESTAURANT_INGREDIENTS, type RestaurantIngredient } from '../mocks/restaurantMock'

export function RestaurantInventory() {
  const [ingredients] = useState<RestaurantIngredient[]>(RESTAURANT_INGREDIENTS)
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = ingredients.filter(
    (i) =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const lowStock = ingredients.filter((i) => i.currentStock <= i.minStock)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario de Insumos & Cocina</h1>
          <p className="text-sm text-slate-500">Control de existencias de materias primas e ingredientes</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar insumo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 w-48"
            />
          </div>
        </div>
      </div>

      {/* Stock Alerts banner if any */}
      {lowStock.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Hay {lowStock.length} insumo(s) por debajo del stock mínimo recomendado</span>
          </div>
          <span className="text-xs text-amber-700 underline cursor-pointer">Ver críticos</span>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4">Insumo</th>
              <th className="py-3 px-4">Categoría</th>
              <th className="py-3 px-4">Unidad</th>
              <th className="py-3 px-4 text-right">Stock Actual</th>
              <th className="py-3 px-4 text-right">Mínimo</th>
              <th className="py-3 px-4 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((ing) => {
              const isLow = ing.currentStock <= ing.minStock
              return (
                <tr key={ing.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-semibold text-slate-900">{ing.name}</td>
                  <td className="py-3 px-4 text-slate-600 text-xs">{ing.category}</td>
                  <td className="py-3 px-4 text-slate-500 text-xs font-mono">{ing.unit}</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    {ing.currentStock} {ing.unit}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500 text-xs">
                    {ing.minStock} {ing.unit}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        isLow ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isLow ? 'Reposición urgente' : 'Normal'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
