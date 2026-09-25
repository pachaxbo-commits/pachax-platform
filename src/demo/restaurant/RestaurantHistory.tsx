import { HistorialView } from '../../components/HistorialView'
import type { Order, OrderStatus } from '../../types'
import type { RestaurantShift } from '../../modules/restaurant/views/RestaurantExperience'

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
    <div className="space-y-4">
      {!!shiftHistory.length && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold text-slate-900">Turnos cerrados · Caja e inventario</h2><div className="space-y-2">{[...shiftHistory].reverse().map(shift => <details key={shift.id} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">{new Date(shift.openedAt).toLocaleString('es-BO')} · {shift.openedBy} · Bs {shift.expectedCashAtClose?.toFixed(2) || '0.00'} esperado</summary><p className="mt-2 text-xs text-slate-600">Cierre: {shift.closedAt ? new Date(shift.closedAt).toLocaleString('es-BO') : '—'} · Responsable: {shift.closedBy || shift.openedBy} · Efectivo contado: Bs {shift.reconciliation?.countedCash?.toFixed(2) || '0.00'}</p>{shift.inventoryClosure ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Insumo</th><th className="p-2 text-right">Inicial</th><th className="p-2 text-right">Ventas</th><th className="p-2 text-right">Teórico</th><th className="p-2 text-right">Físico</th><th className="p-2 text-right">Diferencia</th></tr></thead><tbody>{shift.inventoryClosure.rows.map(row => <tr key={row.productId} className="border-b"><td className="p-2 font-semibold">{row.name}</td><td className="p-2 text-right">{row.initial}</td><td className="p-2 text-right">{row.sales}</td><td className="p-2 text-right">{row.theoretical}</td><td className="p-2 text-right">{row.physical ?? '—'}</td><td className="p-2 text-right">{row.difference ?? '—'}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-slate-500">Turno anterior al control de inventario.</p>}</details>)}</div></section>}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
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
