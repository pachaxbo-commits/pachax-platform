import { HistorialView } from '../../components/HistorialView'
import type { Order, OrderStatus } from '../../types'

export function RestaurantHistory({
  orders,
  onAdvanceStatus,
  onCancelOrder,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onCancelOrder: (orderId: string, cancelledBy: string, reason?: string) => Promise<boolean>
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
      <HistorialView
        orders={orders}
        onAdvanceStatus={onAdvanceStatus}
        onCancelOrder={onCancelOrder}
        userName="Administrador Demo"
        userRole="admin"
      />
    </div>
  )
}
