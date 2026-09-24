import { CajaView } from '../../components/CajaView'
import type { CartItem, CatalogCategory, Order, OrderStatus, PaymentMethod, PaymentSummary, Product, ProductExtra } from '../../types'
import type { RestaurantTable } from '../mocks/restaurantMock'
import { makeRestaurantOrderItem } from '../../modules/restaurant/domain/restaurantOperations'

export function RestaurantPOS({ categories, products, quickExtras, orders, onAddOrder, onSetOrderStatus, onCancelOrder, onConfirmPayment, enabled = true, tables = [], userRole = 'cashier', userName }: {
  categories: CatalogCategory[]
  products: Product[]
  quickExtras: ProductExtra[]
  orders: Order[]
  onAddOrder: (order: Order) => boolean
  onSetOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onCancelOrder: (orderId: string) => Promise<boolean>
  onConfirmPayment: (orderId: string, input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }) => void
  enabled?: boolean
  tables?: RestaurantTable[]
  userRole?: string
  userName: string
}) {
  const nextSeq = Math.max(44, ...orders.map(order => order.sequence || 0)) + 1

  const handleSubmitOrder = async (input: {
    cartItems: CartItem[]
    productsById: Map<string, Product>
    payment: PaymentSummary
    paymentStatus: 'paid' | 'pending' | 'gift'
    paymentMethod: PaymentMethod | null
    expectedPaymentMethod: PaymentMethod | null
    orderSource: 'local' | 'whatsapp'
    fulfillmentType: 'table' | 'pickup' | 'delivery'
    tableId?: string
    tableInfo?: string
    customerName?: string
    customerPhone?: string
    deliveryAddress?: string
  }): Promise<boolean> => {
    if (!enabled) return false
    const at = new Date().toISOString()
    const items = input.cartItems.flatMap(item => {
      const product = input.productsById.get(item.productId)
      return product ? [makeRestaurantOrderItem(product, { id: item.lineId, quantity: item.quantity, modifiers: item.modifiers }, at)] : []
    })
    if (items.length !== input.cartItems.length || !items.length) return false
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
    const order: Order = {
      id: crypto.randomUUID(), sequence: nextSeq, displayNumber: String(nextSeq).padStart(3, '0'),
      status: 'pending', orderSource: input.orderSource, fulfillmentType: input.fulfillmentType,
      tableId: input.tableId, tableInfo: input.tableInfo,
      customerName: input.customerName || 'Cliente', customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress, total, productSubtotal: total,
      payment: input.payment, paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod, expectedPaymentMethod: input.expectedPaymentMethod,
      items, createdAt: at, createdBy: userName,
    }
    return onAddOrder(order)
  }

  const handleConfirmPayment = async (orderId: string, input: { paymentStatus: 'paid'; paymentMethod: PaymentMethod; payment: PaymentSummary; paidBy: string }) => {
    const order = orders.find(item => item.id === orderId)
    if (!enabled || !order || order.paymentStatus === 'paid') return
    const { payment } = input
    onConfirmPayment(orderId, { method: input.paymentMethod === 'mixed' ? 'mixed' : input.paymentMethod === 'qr' ? 'qr' : input.paymentMethod === 'card' ? 'card' : 'cash', received: payment.cashReceived, cashAmount: payment.cashAmount, qrAmount: payment.qrAmount, cardAmount: payment.cardAmount })
  }

  return <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
    {!enabled && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">Debes iniciar un turno antes de realizar operaciones.</div>}
    <CajaView
      nextOrderNumber={String(nextSeq).padStart(3, '0')}
      categories={categories} products={products} quickExtras={quickExtras} orders={orders}
      userRole={userRole} userId="demo-cashier-id" userName={userName}
      onSubmitOrder={handleSubmitOrder} onConfirmPayment={handleConfirmPayment}
      onCancelOrder={async orderId => onCancelOrder(orderId)}
      onDeleteOrder={async orderId => { await onCancelOrder(orderId) }}
      onUpdateOrder={async () => { throw new Error('Las correcciones de una cuenta de mesa se realizan con nuevas líneas desde Mesas.') }}
      onSetOrderStatus={onSetOrderStatus}
      operationsDisabled={!enabled} restaurantTables={tables} botManagementEnabled={false} orderEditingEnabled={false}
    />
  </div>
}
