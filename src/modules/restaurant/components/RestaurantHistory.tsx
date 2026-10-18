import { HistorialView } from '../../../components/HistorialView'
import type { Order, OrderStatus } from '../../../types'
import type { RestaurantShift } from '../views/RestaurantExperience'
import { Archive } from 'lucide-react'

export function RestaurantHistory({
  orders,
  shiftHistory = [],
  onAdvanceStatus,
  onCancelOrder,
}: {
  orders: Order[]
  shiftHistory?: RestaurantShift[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onCancelOrder: (orderId: string, cancelledBy: string, reason?: string) => Promise<boolean>
}) {
  return (
    <div className="restaurant-history space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Historial de Operaciones</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Auditoría de comandas pasadas y registros de turnos cerrados.</p>
      </header>

      {!!shiftHistory.length && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-extrabold text-slate-900">Turnos Cerrados (Arqueo & Cierres de Stock)</h2>
          </div>
          <div className="space-y-2">
            {[...shiftHistory].reverse().map((shift) => (
              <details key={shift.id} className="rounded-xl border border-slate-200/80 p-3 bg-slate-50/50">
                <summary className="cursor-pointer text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>
                    {new Date(shift.openedAt).toLocaleString('es-BO')} · Responsable: {shift.openedBy}
                  </span>
                  <span className="text-emerald-700 font-extrabold">
                    Bs {shift.expectedCashAtClose?.toFixed(2) || '0.00'} esperado
                  </span>
                </summary>
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-xs text-slate-600 space-y-1">
                  <p>
                    Cierre: {shift.closedAt ? new Date(shift.closedAt).toLocaleString('es-BO') : '—'} · Responsable: {shift.closedBy || shift.openedBy} · Efectivo contado: <strong>Bs {shift.reconciliation?.countedCash?.toFixed(2) || '0.00'}</strong>
                  </p>
                  {shift.inventoryClosure ? (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full min-w-[500px] text-left text-[11px]">
                        <thead>
                          <tr className="border-b bg-slate-50 text-slate-500">
                            <th className="p-2 font-bold">Insumo</th>
                            <th className="p-2 text-right font-bold">Inicial</th>
                            <th className="p-2 text-right font-bold">Ventas</th>
                            <th className="p-2 text-right font-bold">Teórico</th>
                            <th className="p-2 text-right font-bold">Físico</th>
                            <th className="p-2 text-right font-bold">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {shift.inventoryClosure.rows.map((row: { productId: string; name: string; initial: number | string; sales: number | string; theoretical: number | string; physical?: number | string; difference?: number | string }) => (
                            <tr key={row.productId}>
                              <td className="p-2 font-semibold text-slate-900">{row.name}</td>
                              <td className="p-2 text-right">{row.initial}</td>
                              <td className="p-2 text-right">{row.sales}</td>
                              <td className="p-2 text-right">{row.theoretical}</td>
                              <td className="p-2 text-right">{row.physical ?? '—'}</td>
                              <td className={`p-2 text-right font-bold ${Number(row.difference) < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                {row.difference ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">Turno sin cierre de inventario detallado.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <HistorialView
          orders={orders}
          onAdvanceStatus={onAdvanceStatus}
          onCancelOrder={onCancelOrder}
          userName="Administrador Demo"
          userRole="admin"
          showLegacyIngredientEstimate={false}
        />
      </div>
    </div>
  )
}
