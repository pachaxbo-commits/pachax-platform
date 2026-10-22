import { CocinaView } from '../../../components/CocinaView'
import type { Order, OrderStatus } from '../../../types'

export function RestaurantKitchen({
  orders,
  onAdvanceStatus,
  onAdvanceItemStatus,
  onStartTour,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onAdvanceItemStatus?: (orderId: string, itemId: string, status: 'preparing' | 'ready' | 'delivered') => Promise<boolean>
  onStartTour?: () => void
}) {
  return (
    <div className="restaurant-kitchen-frame w-full">
      <CocinaView
        orders={orders.filter(order => order.items.some(item => item.quantity > 0)).map(order => ({ ...order, items: order.items.filter(item => item.quantity > 0) }))}
        onAdvanceStatus={onAdvanceStatus}
        onAdvanceItemStatus={onAdvanceItemStatus}
        onStartTour={onStartTour}
      />
    </div>
  )
}
