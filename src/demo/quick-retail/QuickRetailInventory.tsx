import { useState } from 'react'
import { Scale, Package, Search } from 'lucide-react'
import type { RetailProduct } from '../mocks/retailMock'

export function QuickRetailInventory({ products }: { products: RetailProduct[] }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario de Mostrador & Granel</h1>
          <p className="text-sm text-slate-500">Existencias físicas medidas en gramos (balanza) o unidades fijas</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 w-52"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4">Producto</th>
              <th className="py-3 px-4">Rubro</th>
              <th className="py-3 px-4">Modalidad</th>
              <th className="py-3 px-4 text-right">Existencia Actual</th>
              <th className="py-3 px-4 text-right">Mínimo</th>
              <th className="py-3 px-4 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((p) => {
              const isWeight = p.soldBy === 'weight'
              const isLow = p.currentStock <= p.minStock

              return (
                <tr key={p.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{p.sku}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">{p.category}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isWeight ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {isWeight ? <Scale className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                      {isWeight ? 'Peso (g)' : 'Unidad'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    {isWeight ? `${(p.currentStock / 1000).toFixed(2)} kg (${p.currentStock} g)` : `${p.currentStock} unids.`}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500 text-xs">
                    {isWeight ? `${p.minStock} g` : `${p.minStock} unids.`}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isLow ? 'Stock Bajo' : 'Adecuado'}
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
