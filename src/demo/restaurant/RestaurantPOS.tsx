import { useState } from 'react'
import { CajaView } from '../../components/CajaView'
import type { CartItem, CatalogCategory, Order, OrderStatus, PaymentMethod, PaymentSummary, Product, ProductExtra } from '../../types'

export function RestaurantPOS({
  categories,
  products,
  quickExtras,
  orders,
  onAddOrder,
  onSetOrderStatus,
  userRole = 'caja',
}: {
  categories: CatalogCategory[]
  products: Product[]
  quickExtras: ProductExtra[]
  orders: Order[]
  onAddOrder: (newOrder: Order) => void
  onSetOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  userRole?: string
}) {
  const [localOrders, setLocalOrders] = useState<Order[]>(orders)

  const handleSubmitOrder = async (input: {
    cartItems: CartItem[]
    productsById: Map<string, Product>
    payment: PaymentSummary
    paymentStatus: 'paid' | 'pending' | 'gift'
    paymentMethod: PaymentMethod | null
    expectedPaymentMethod: PaymentMethod | null
    orderSource: 'local' | 'whatsapp'
    fulfillmentType: 'table' | 'pickup' | 'delivery'
    tableInfo?: string
    customerName?: string
    customerPhone?: string
    deliveryAddress?: string
    createdBy?: string
  }): Promise<boolean> => {
    const nextSeq = localOrders.length + 45
    const orderNumber = String(nextSeq).padStart(3, '0')

    const items = input.cartItems.map((item) => {
      const prod = input.productsById.get(item.productId)
      const basePrice = prod?.price || 0
      return {
        id: item.lineId,
        productId: item.productId,
        name: prod?.name || 'Producto',
        basePrice,
        quantity: item.quantity,
        lineTotal: basePrice * item.quantity,
        modifiers: item.modifiers,
      }
    })

    const total = items.reduce((sum, it) => sum + it.lineTotal, 0)

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      sequence: nextSeq,
      displayNumber: orderNumber,
      status: 'pending',
      orderSource: input.orderSource,
      fulfillmentType: input.fulfillmentType,
      tableInfo: input.tableInfo || (input.fulfillmentType === 'table' ? 'Mesa 1' : ''),
      customerName: input.customerName || 'Cliente',
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
      total,
      productSubtotal: total,
      payment: input.payment,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      expectedPaymentMethod: input.expectedPaymentMethod,
      items,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy || 'Cajero Demo',
    }

    setLocalOrders((prev) => [newOrder, ...prev])
    onAddOrder(newOrder)
    return true
  }

  const handleConfirmPayment = async (orderId: string, input: {
    paymentStatus: 'paid'
    paymentMethod: PaymentMethod
    payment: PaymentSummary
    paidBy: string
  }): Promise<void> => {
    setLocalOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: 'paid', paymentMethod: input.paymentMethod, payment: input.payment } : o))
    )
  }

  const handleCancelOrder = async (orderId: string): Promise<boolean> => {
    setLocalOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' } : o))
    )
    return true
  }

  const handleDeleteOrder = async (orderId: string): Promise<void> => {
    setLocalOrders((prev) => prev.filter((o) => o.id !== orderId))
  }

  const handleUpdateOrder = async (): Promise<void> => {}

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
      <CajaView
        nextOrderNumber={String(localOrders.length + 45).padStart(3, '0')}
        categories={categories}
        products={products}
        quickExtras={quickExtras}
        orders={localOrders}
        userRole={userRole}
        userId="demo-cashier-id"
        userName="Cajero Bistró Demo"
        onSubmitOrder={handleSubmitOrder}
        onConfirmPayment={handleConfirmPayment}
        onCancelOrder={handleCancelOrder}
        onDeleteOrder={handleDeleteOrder}
        onUpdateOrder={handleUpdateOrder}
        onSetOrderStatus={onSetOrderStatus}
      />
    </div>
  )
}
