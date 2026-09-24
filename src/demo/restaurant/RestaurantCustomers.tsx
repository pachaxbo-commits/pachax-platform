import { useMemo, useState } from 'react'
import { Phone, Search } from 'lucide-react'
import type { Order } from '../../types'

export function RestaurantCustomers({ orders }: { orders: Order[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const customers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; visits: number; totalSpent: number }>()
    for (const order of orders) {
      const name = order.customerName?.trim()
      if (!name || name.toLowerCase() === 'cliente' || order.status === 'cancelled') continue
      const key = order.customerPhone?.trim() || name.toLocaleLowerCase('es-BO')
      const previous = map.get(key)
      map.set(key, {
        name, phone: order.customerPhone || previous?.phone || '',
        visits: (previous?.visits || 0) + 1,
        totalSpent: (previous?.totalSpent || 0) + (order.paymentStatus === 'paid' ? order.total : 0),
      })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-BO'))
  }, [orders])
  const filtered = customers.filter(customer => customer.name.toLocaleLowerCase('es-BO').includes(searchTerm.toLocaleLowerCase('es-BO')) || customer.phone.includes(searchTerm))
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div><h1 className="text-2xl font-bold text-slate-900">Directorio de Clientes</h1><p className="text-sm text-slate-500">Clientes registrados en pedidos del restaurante.</p></div>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar cliente o teléfono" className="w-60 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs" /></div>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="p-4">Cliente</th><th className="p-4">Contacto</th><th className="p-4 text-center">Visitas</th><th className="p-4 text-right">Consumo pagado</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(customer => <tr key={customer.phone || customer.name}><td className="p-4 font-semibold">{customer.name}</td><td className="p-4 text-xs text-slate-600">{customer.phone ? <span className="inline-flex items-center gap-1"><Phone size={13} />{customer.phone}</span> : '—'}</td><td className="p-4 text-center">{customer.visits}</td><td className="p-4 text-right font-bold">Bs {customer.totalSpent.toFixed(2)}</td></tr>)}{!filtered.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Aún no hay clientes registrados en pedidos.</td></tr>}</tbody></table></div>
  </div>
}
