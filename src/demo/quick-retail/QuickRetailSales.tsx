import { useState } from 'react'
import { Search } from 'lucide-react'
import type { CompletedRetailSale } from '../mocks/retailMock'

export function QuickRetailSales({ sales }: { sales: CompletedRetailSale[] }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = sales.filter(
    (s) =>
      s.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerName && s.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historial de Ventas</h1>
          <p className="text-sm text-slate-500">Tickets y comprobantes de mostrador</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por ticket o cliente..."
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
              <th className="py-3 px-4">Comprobante</th>
              <th className="py-3 px-4">Fecha / Hora</th>
              <th className="py-3 px-4">Cliente</th>
              <th className="py-3 px-4">Detalle de Líneas</th>
              <th className="py-3 px-4">Método</th>
              <th className="py-3 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                  {s.receiptNumber}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500">
                  {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-3 px-4 text-xs font-medium text-slate-800">
                  {s.customerName || 'Consumidor Final'}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  <div className="space-y-0.5">
                    {s.lines.map((l, i) => (
                      <div key={i}>
                        • {l.productNameSnapshot}:{' '}
                        <strong>
                          {l.enteredQuantity} {l.enteredUnit}
                        </strong>{' '}
                        (Bs {(l.subtotalMinor / 100).toFixed(2)})
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      s.paymentKind === 'cash'
                        ? 'bg-emerald-100 text-emerald-800'
                        : s.paymentKind === 'qr'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {s.paymentKind === 'cash' ? 'Efectivo' : s.paymentKind === 'qr' ? 'QR' : 'Mixto'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-black text-slate-900">
                  Bs {(s.totalMinor / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
