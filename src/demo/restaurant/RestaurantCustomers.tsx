import { useState } from 'react'
import { Phone, Mail, Search } from 'lucide-react'
import { RESTAURANT_CUSTOMERS, type RestaurantCustomer } from '../mocks/restaurantMock'

export function RestaurantCustomers() {
  const [customers] = useState<RestaurantCustomer[]>(RESTAURANT_CUSTOMERS)
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Directorio de Clientes</h1>
          <p className="text-sm text-slate-500">Historial de consumo, visitas y preferencias de comensales</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 w-60"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4">Cliente</th>
              <th className="py-3 px-4">Contacto</th>
              <th className="py-3 px-4 text-center">Visitas</th>
              <th className="py-3 px-4 text-right">Consumo Total</th>
              <th className="py-3 px-4">Notas / Preferencias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900">{c.name}</div>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {c.phone}
                  </div>
                  {c.email && (
                    <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                      <Mail className="w-3 h-3 text-slate-400" />
                      {c.email}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-block text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-full">
                    {c.visits}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-bold text-slate-900">
                  Bs {c.totalSpent.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500 italic">
                  {c.notes || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
