import { CocinaView } from '../../components/CocinaView'
import type { Order, OrderStatus } from '../../types'

export function RestaurantKitchen({
  orders,
  onAdvanceStatus,
  onAdvanceItemStatus,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onAdvanceItemStatus?: (orderId: string, itemId: string, status: 'preparing' | 'ready' | 'delivered') => Promise<boolean>
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
      <CocinaView orders={orders.filter(order => order.items.some(item => item.quantity > 0)).map(order => ({ ...order, items: order.items.filter(item => item.quantity > 0) }))} onAdvanceStatus={onAdvanceStatus} onAdvanceItemStatus={onAdvanceItemStatus} />
    </div>
  )
}
