import { useState } from 'react'
import { Search } from 'lucide-react'
import { INITIAL_RETAIL_CUSTOMERS, type RetailCustomer } from '../mocks/retailMock'

export function QuickRetailCustomers() {
  const [customers] = useState<RetailCustomer[]>(INITIAL_RETAIL_CUSTOMERS)
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
          <h1 className="text-2xl font-bold text-slate-900">Directorio de Clientes de Mostrador</h1>
          <p className="text-sm text-slate-500">Historial de compras y fidelización</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente o NIT/CI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 w-56"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4">Cliente</th>
              <th className="py-3 px-4">Teléfono</th>
              <th className="py-3 px-4">NIT / CI</th>
              <th className="py-3 px-4 text-center">Compras</th>
              <th className="py-3 px-4 text-right">Total Acumulado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4 font-semibold text-slate-900">{c.name}</td>
                <td className="py-3 px-4 text-xs text-slate-600">{c.phone}</td>
                <td className="py-3 px-4 text-xs font-mono text-slate-500">{c.nitCi || '—'}</td>
                <td className="py-3 px-4 text-center font-semibold text-xs text-slate-800">
                  {c.purchasesCount}
                </td>
                <td className="py-3 px-4 text-right font-bold text-slate-900">
                  Bs {(c.totalSpentMinor / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
