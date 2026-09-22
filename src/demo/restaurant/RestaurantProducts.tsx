import { useState } from 'react'
import { Eye, EyeOff, Tag, Search } from 'lucide-react'
import type { CatalogCategory, Product } from '../../types'

export function RestaurantProducts({
  categories,
  products,
  onToggleProductActive,
}: {
  categories: CatalogCategory[]
  products: Product[]
  onToggleProductActive: (productId: string) => void
}) {
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = products.filter((p) => {
    if (selectedCat !== 'all' && p.categoryId !== selectedCat) return false
    if (!searchTerm.trim()) return true
    return (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de Productos y Platos</h1>
          <p className="text-sm text-slate-500">Gestión de menú, precios y disponibilidad en salón</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar plato o bebida..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 w-52"
            />
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCat('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
            selectedCat === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Todos ({products.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCat(c.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              selectedCat === c.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Products Table / Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4">Plato / Producto</th>
              <th className="py-3 px-4">Categoría</th>
              <th className="py-3 px-4 text-right">Precio</th>
              <th className="py-3 px-4 text-center">Estado</th>
              <th className="py-3 px-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.categoryId)
              return (
                <tr key={p.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500 line-clamp-1">{p.description}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                      <Tag className="w-3 h-3 text-slate-400" />
                      {cat?.name || 'General'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    Bs {p.price.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        p.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.isActive !== false ? 'Activo en salón' : 'Oculto'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onToggleProductActive(p.id)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                      title="Alternar disponibilidad"
                    >
                      {p.isActive !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                    </button>
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
