import {
  ChevronDown,
  CookingPot,
  LoaderCircle,
  MessageSquareText,
  Minus,
  Plus,
  Trash2,
  DollarSign,
  FileEdit,
  Store,
  Utensils,
  ShoppingBag,
  ShoppingCart,
  Search,
  Truck,
  Coins,
  CreditCard,
  QrCode,
  Shuffle,
  CheckCircle2,
  Printer,
  AlertCircle,
  RotateCcw,
  PauseCircle,
  PlayCircle,
  X,
  LayoutGrid,
  Salad,
  Soup,
  GlassWater,
  Coffee,
  CakeSlice,
  Pizza,
  Sandwich,
  Tag,
  Wine,
  ArrowRight,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../lib/format'
import type { CartItem, CatalogCategory, PaymentMethod, PaymentSummary, Product, Order, OrderStatus, FulfillmentType, ProductExtra } from '../types'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'
import { StatusPill, SourceBadge, FulfillmentBadge, PaymentBadge } from './ui/StatusPill'
import { PrintableTicket } from './OrderTicket'
import { PrintModeToggle } from './PrintModeToggle'

function formatExtrasList(extras: any[]) {
  if (!extras || extras.length === 0) return ''
  const counts = new Map<string, number>()
  extras.forEach((e) => {
    if (e && e.name) {
      counts.set(e.name, (counts.get(e.name) || 0) + 1)
    }
  })
  return Array.from(counts.entries())
    .map(([name, count]) => count > 1 ? `${name} (x${count})` : name)
    .join(', ')
}
import { botApiUrl, botAdminToken, emitBotHealthChanged, fetchBotHealth, fetchBotSettings, onBotHealthChanged, saveBotSettings, setBotAcceptingOrders } from '../lib/botApi'
import type { RestaurantTable } from '../demo/mocks/restaurantMock'
import { selectRestaurantProducts } from '../modules/restaurant/domain/restaurantOperations'

const DEFAULT_PREP_DELAY = 10
const DEMAND_STORAGE_KEY = 'pachax:demand-delay'

function buildCartItem(product: Product): CartItem {
  return {
    lineId: crypto.randomUUID(),
    productId: product.id,
    quantity: 1,
    modifiers: {
      extras: [],
      options: [],
      note: '',
    },
  }
}

function clampCurrency(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function isImageUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')
}

function simplifyModifierLabel(label: string) {
  const normalized = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

  if (normalized.includes('salsa bbq') || normalized.includes('barbacoa')) return ''
  if (normalized.includes('cebolla')) return 'Sin cebolla'
  if (normalized.includes('salsa')) return 'Sin salsa'
  if (normalized.includes('queso')) return 'Sin queso'
  return label
}

function getCategoryIcon(categoryId?: string, categoryName?: string) {
  const norm = `${categoryId || ''} ${categoryName || ''}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  if (categoryId === 'all') return LayoutGrid
  if (norm.includes('entrada') || norm.includes('ensalada') || norm.includes('salad') || norm.includes('appetizer')) return Salad
  if (norm.includes('sopa') || norm.includes('soup') || norm.includes('caldo')) return Soup
  if (norm.includes('bebida') || norm.includes('trago') || norm.includes('jugo') || norm.includes('drink') || norm.includes('refresco') || norm.includes('agua')) return GlassWater
  if (norm.includes('cafe') || norm.includes('coffee') || norm.includes('te')) return Coffee
  if (norm.includes('vino') || norm.includes('cerveza') || norm.includes('licor') || norm.includes('bar')) return Wine
  if (norm.includes('postre') || norm.includes('dulce') || norm.includes('cake') || norm.includes('helado')) return CakeSlice
  if (norm.includes('burger') || norm.includes('hamburguesa') || norm.includes('sandwich') || norm.includes('lomito')) return Sandwich
  if (norm.includes('pizza')) return Pizza
  if (norm.includes('fuerte') || norm.includes('plato') || norm.includes('carne') || norm.includes('pasta') || norm.includes('pollo')) return Utensils
  return Tag
}

function ProductVisual({ image, alt, badge }: { image: string; alt: string; badge?: string }) {
  return (
    <div className="restaurant-product-visual">
      {isImageUrl(image) ? (
        <img alt={alt} className="h-full w-full object-cover" src={image} loading="lazy" decoding="async" />
      ) : (
        <div className="restaurant-product-placeholder">{image || <CookingPot size={36} />}</div>
      )}
      {badge ? (
        <div className="restaurant-product-badge">
          {badge}
        </div>
      ) : null}
    </div>
  )
}

const KioskProductCard = memo(function KioskProductCard({ product, disabled, onAdd }: { product: Product; disabled: boolean; onAdd: (product: Product) => void }) {
  return (
    <article className="restaurant-product-card">
      <ProductVisual alt={product.name} badge={product.badge} image={product.image} />
      <div className="restaurant-product-details">
        <h3 title={product.name}>{product.name}</h3>
        <strong>{formatCurrency(product.price)}</strong>
      </div>
      <button type="button" className="restaurant-product-hit" disabled={disabled} aria-label={`Agregar ${product.name} al pedido`} onClick={() => onAdd(product)} />
      <button type="button" className="restaurant-product-plus" disabled={disabled} aria-label={`Agregar ${product.name} con el botón más`} onClick={(event) => { event.stopPropagation(); onAdd(product) }}>
        <Plus size={18} strokeWidth={2.5} />
      </button>
    </article>
  )
})

export function CajaView({
  nextOrderNumber,
  categories,
  products,
  orders,
  quickExtras,
  userRole,
  userId,
  userName,
  onSubmitOrder,
  onConfirmPayment,
  onCancelOrder,
  onDeleteOrder,
  onUpdateOrder,
  onSetOrderStatus,
  operationsDisabled = false,
  restaurantTables = [],
  restaurantCustomers = [],
  botManagementEnabled = true,
  orderEditingEnabled = true,
  counterServiceMode = false,
  onConfirmDemoPayment,
}: {
  nextOrderNumber: string
  categories: CatalogCategory[]
  products: Product[]
  quickExtras: ProductExtra[]
  orders: Order[]
  userRole: string
  userId: string
  userName: string
  onSubmitOrder: (input: {
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
    customerId?: string
    deliveryAddress?: string
    createdBy?: string
  }) => Promise<boolean>
  onConfirmPayment: (orderId: string, input: {
    paymentStatus: 'paid'
    paymentMethod: PaymentMethod
    payment: PaymentSummary
    paidBy: string
  }) => Promise<void>
  onCancelOrder: (orderId: string, cancelledBy: string, reason?: string) => Promise<boolean>
  onDeleteOrder: (orderId: string) => Promise<void>
  onUpdateOrder: (orderId: string, input: {
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
  }) => Promise<void>
  onSetOrderStatus: (orderId: string, status: OrderStatus, estimatedDelay?: number, options?: { suppressWhatsappDispatchNotice?: boolean; forceWhatsappDispatchNotice?: boolean }) => Promise<boolean | void>
  operationsDisabled?: boolean
  restaurantTables?: RestaurantTable[]
  restaurantCustomers?: import('../modules/restaurant/domain/restaurantCustomers').RestaurantCustomer[]
  orderEditingEnabled?: boolean
  botManagementEnabled?: boolean
  counterServiceMode?: boolean
  onConfirmDemoPayment?: (orderId: string, input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }) => void
}) {
  // Main view mode: either POS catalog or orders list
  const [viewMode, setViewMode] = useState<'new_order' | 'orders_list'>('new_order')
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [globalDelay, setGlobalDelay] = useState<number>(DEFAULT_PREP_DELAY)
  const [demandDelayUntil, setDemandDelayUntil] = useState('')
  const [demandModalDelay, setDemandModalDelay] = useState<number | null>(null)
  const [demandDurationMinutes, setDemandDurationMinutes] = useState(30)
  const [pauseOrdersModalOpen, setPauseOrdersModalOpen] = useState(false)
  const [pauseReason, setPauseReason] = useState('Nos estamos retrasando')
  const [pauseDurationMinutes, setPauseDurationMinutes] = useState(30)
  // Edit Order State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)

  // Order Details / Fields State
  const [orderSource, setOrderSource] = useState<'local' | 'whatsapp'>(
    userRole === 'pedidos' ? 'whatsapp' : 'local'
  )
  const [fulfillmentType, setFulfillmentType] = useState<'table' | 'pickup' | 'delivery'>(
    userRole === 'pedidos' ? 'pickup' : 'table'
  )
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')

  async function handleSetOrderStatus(order: Order, status: OrderStatus, estimatedDelay?: number) {
    if (status !== 'delivered' || order.orderSource !== 'whatsapp' || order.fulfillmentType !== 'delivery') {
      await onSetOrderStatus(order.id, status, estimatedDelay)
      return
    }

    const delayMinutes = Number(order.estimatedDelay || estimatedDelay || 10)
    const createdAt = new Date(order.createdAt).getTime()
    const lateMinutes = Number.isFinite(createdAt)
      ? Math.max(0, Math.floor((Date.now() - (createdAt + delayMinutes * 60 * 1000)) / 60000))
      : 0

    if (lateMinutes > 0) {
      const shouldNotify = window.confirm(`Este delivery esta atrasado ${lateMinutes} min sobre el tiempo estimado. Quieres avisar al cliente que el pedido ya salio?`)
      await onSetOrderStatus(order.id, status, estimatedDelay, {
        forceWhatsappDispatchNotice: shouldNotify,
        suppressWhatsappDispatchNotice: !shouldNotify,
      })
      return
    }

    await onSetOrderStatus(order.id, status, estimatedDelay, {
      forceWhatsappDispatchNotice: false,
      suppressWhatsappDispatchNotice: false,
    })
  }

  // Catalog State
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.isActive && category.isVisible).sort((left, right) => left.sortOrder - right.sortOrder),
    [categories],
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [productSearch, setProductSearch] = useState('')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Checkout Payment State
  // Un pedido de WhatsApp arranca PENDIENTE DE PAGO y cae en "Cobros pendientes"; recien pasa a
  // pagado cuando alguien lo cobra de verdad. El de caja se cobra en el momento, asi que ese si
  // arranca en pagado.
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'gift'>(
    counterServiceMode ? 'paid' : userRole === 'pedidos' || restaurantTables.length > 0 ? 'pending' : 'paid',
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>('cash')
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null)
  const [expectedPaymentMethod, setExpectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [tableInfo, setTableInfo] = useState('')
  const [tableId, setTableId] = useState('')
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [cashSplitInput, setCashSplitInput] = useState('')
  const [qrSplitInput, setQrSplitInput] = useState('')
  const [cardSplitInput, setCardSplitInput] = useState('')

  // Fast Payment Modal State
  const [payingOrder, setPayingOrder] = useState<Order | null>(null)
  const [operationMessage, setOperationMessage] = useState('')
  const submitOrderRef = useRef(false)
  const paidOrderIds = useRef(new Set<string>())
  const [fastPayMethod, setFastPayMethod] = useState<PaymentMethod>('cash')
  const [fastCashReceived, setFastCashReceived] = useState('')
  const [fastCashSplit, setFastCashSplit] = useState('')

  // Cancel Order Modal State
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  // Confirm WhatsApp Order Delay State
  const [confirmingDelayOrderId, setConfirmingDelayOrderId] = useState<string | null>(null)
  const [acceptingWhatsappOrders, setAcceptingWhatsappOrders] = useState(true)
  const [pickupOnlyMode, setPickupOnlyMode] = useState(false)
  const [isTogglingWhatsappOrders, setIsTogglingWhatsappOrders] = useState(false)

  // Print ticket and sub-filter state
  const [printedOrder, setPrintedOrder] = useState<Order | null>(null)
  const [whatsappSubFilter, setWhatsappSubFilter] = useState<'all' | 'pending' | 'paid'>('all')

  const demandDelayActive = Boolean(demandDelayUntil && new Date(demandDelayUntil).getTime() > Date.now())

  function clearDemandDelay() {
    window.localStorage.removeItem(DEMAND_STORAGE_KEY)
    setDemandDelayUntil('')
    setGlobalDelay(DEFAULT_PREP_DELAY)
  }

  function openDemandDelayModal(minutes: number) {
    if (minutes <= DEFAULT_PREP_DELAY) {
      clearDemandDelay()
      return
    }

    setDemandModalDelay(minutes)
    setDemandDurationMinutes(30)
  }

  function applyDemandDelay() {
    if (!demandModalDelay) return
    const until = new Date(Date.now() + demandDurationMinutes * 60 * 1000).toISOString()
    const payload = { minutes: demandModalDelay, until }
    window.localStorage.setItem(DEMAND_STORAGE_KEY, JSON.stringify(payload))
    setGlobalDelay(demandModalDelay)
    setDemandDelayUntil(until)
    setDemandModalDelay(null)
  }



  useEffect(() => {
    if (!botManagementEnabled) return
    try {
      const raw = window.localStorage.getItem(DEMAND_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { minutes?: number; until?: string }
      const untilMs = new Date(saved.until || '').getTime()
      if (Number.isFinite(untilMs) && untilMs > Date.now() && saved.minutes && saved.minutes > DEFAULT_PREP_DELAY) {
        setGlobalDelay(saved.minutes)
        setDemandDelayUntil(saved.until || '')
      } else {
        clearDemandDelay()
      }
    } catch {
      clearDemandDelay()
    }
  }, [botManagementEnabled])

  useEffect(() => {
    if (!botManagementEnabled || !demandDelayUntil) return undefined
    const interval = window.setInterval(() => {
      if (new Date(demandDelayUntil).getTime() <= Date.now()) {
        clearDemandDelay()
      }
    }, 15000)
    return () => window.clearInterval(interval)
  }, [botManagementEnabled, demandDelayUntil])

  useEffect(() => {
    const el = document.getElementById('portal-header-controls')
    setPortalElement(el)
    const timer = setTimeout(() => {
      setPortalElement(document.getElementById('portal-header-controls'))
    }, 500)
    return () => clearTimeout(timer)
  }, [viewMode])

  useEffect(() => {
    if (!botManagementEnabled || !botApiUrl || !botAdminToken) return

    let isMounted = true
    const refresh = async () => {
      try {
        const [health, settings] = await Promise.all([fetchBotHealth(), fetchBotSettings()])
        if (isMounted) {
          setAcceptingWhatsappOrders(health.acceptingOrders !== false)
          setPickupOnlyMode(settings.pickupOnlyMode)
          emitBotHealthChanged(health)
        }
      } catch {
        // El panel lateral ya muestra si el bot no responde.
      }
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), 30000)
    const unsubscribe = onBotHealthChanged((health) => {
      if (health) {
        setAcceptingWhatsappOrders(health.acceptingOrders !== false)
        void fetchBotSettings().then((settings) => setPickupOnlyMode(settings.pickupOnlyMode)).catch(() => undefined)
      } else {
        void refresh()
      }
    })
    return () => {
      isMounted = false
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [botManagementEnabled])

  const activeCategory = selectedCategoryId === 'all' ? 'all' : visibleCategories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : 'all'

  const visibleProducts = useMemo(() => {
    const selected = selectRestaurantProducts(products, categories, activeCategory)
    const term = productSearch.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    return term ? selected.filter(product => product.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(term)) : selected
  }, [activeCategory, categories, products, productSearch])

  const addCatalogProduct = useCallback((product: Product) => {
    const nextItem = buildCartItem(product)
    setCartItems(currentItems => [...currentItems, nextItem])
    setExpandedLineId(nextItem.lineId)
  }, [])

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  const cartTotal = cartItems.reduce((sum, item) => {
    const product = productsById.get(item.productId)

    if (!product) {
      return sum
    }

    const extrasTotal = item.modifiers.extras.reduce((acc, extra) => acc + extra.price, 0)
    return sum + (product.price + extrasTotal) * item.quantity
  }, 0)

  const totalUnits = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  // Cash splitter calculations
  const cashReceived = clampCurrency(cashReceivedInput)
  const mixedCashAmount = Math.min(cartTotal, clampCurrency(cashSplitInput))
  const mixedQrAmount = Math.min(cartTotal, clampCurrency(qrSplitInput))
  const mixedCardAmount = Math.min(cartTotal, clampCurrency(cardSplitInput))
  const qrAmount = paymentMethod === 'mixed' ? mixedQrAmount : paymentMethod === 'qr' ? cartTotal : 0
  const cardAmount = paymentMethod === 'mixed' ? mixedCardAmount : paymentMethod === 'card' ? cartTotal : 0
  const cashAmount = paymentMethod === 'cash' ? cartTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0
  const effectiveCashReceived = cashReceivedInput.trim() === '' ? cashAmount : cashReceived
  const change = paymentMethod === 'cash' || paymentMethod === 'mixed' ? Math.max(0, effectiveCashReceived - cashAmount) : 0
  const isPendingOrGift = paymentStatus === 'pending' || paymentStatus === 'gift'
  const isPaymentValid =
    isPendingOrGift
      ? cartTotal > 0
      : paymentMethod === 'qr'
        ? cartTotal > 0
        : paymentMethod === 'card'
          ? cartTotal > 0
        : paymentMethod === 'cash'
          ? cartTotal > 0 && effectiveCashReceived >= cartTotal
          : paymentMethod === 'mixed'
            ? cartTotal > 0 && Math.round((cashAmount + qrAmount + cardAmount + Number.EPSILON) * 100) / 100 === Math.round((cartTotal + Number.EPSILON) * 100) / 100 && (!cashAmount || effectiveCashReceived >= cashAmount) && [cashAmount, qrAmount, cardAmount].filter(amount => amount > 0).length >= 2
            : false

  // La direccion del delivery es opcional: muchas veces el cliente manda la ubicacion por
  // WhatsApp y quien carga el pedido a mano no la tiene a mano en ese momento.
  const isDeliveryInfoValid = true

  const buildPaymentSummary = (): PaymentSummary => ({
    method: paymentMethod || 'cash',
    cashAmount: isPendingOrGift ? 0 : cashAmount,
    qrAmount: isPendingOrGift ? 0 : qrAmount,
    cardAmount: isPendingOrGift ? 0 : cardAmount,
    cashReceived: isPendingOrGift ? 0 : (paymentMethod === 'qr' || paymentMethod === 'card' ? 0 : effectiveCashReceived),
    change: isPendingOrGift ? 0 : change,
  })

  // Fast payment modal computations
  const fastCashReceivedVal = clampCurrency(fastCashReceived)
  const fastCashSplitVal = clampCurrency(fastCashSplit)
  const fastQrAmount = fastPayMethod === 'mixed' ? Math.max(0, (payingOrder?.total || 0) - fastCashSplitVal) : fastPayMethod === 'qr' ? (payingOrder?.total || 0) : 0
  const fastCashAmount = fastPayMethod === 'cash' ? (payingOrder?.total || 0) : fastPayMethod === 'mixed' ? fastCashSplitVal : 0
  const effectiveFastCashReceived = fastCashReceived.trim() === '' ? fastCashAmount : fastCashReceivedVal
  const fastChange = fastPayMethod === 'cash' || fastPayMethod === 'mixed' ? Math.max(0, effectiveFastCashReceived - fastCashAmount) : 0
  const isFastPaymentValid =
    fastPayMethod === 'qr'
      ? (payingOrder?.total || 0) > 0
      : fastPayMethod === 'cash'
        ? (payingOrder?.total || 0) > 0
        : fastPayMethod === 'mixed'
          ? fastCashAmount > 0 && fastQrAmount > 0
          : false

  const buildFastPaymentSummary = (): PaymentSummary => ({
    method: fastPayMethod,
    cashAmount: fastCashAmount,
    qrAmount: fastQrAmount,
    cashReceived: fastPayMethod === 'qr' ? 0 : effectiveFastCashReceived,
    change: fastChange,
  })

  // Studio "Equipo" representa el equipo operativo completo y conserva las
  // capacidades de caja/gerencia del dataset de demostración.
  const canManagePayments = userRole === 'admin' || userRole === 'caja' || userRole === 'demo' || userRole === 'team'
  const canManageOrders = userRole === 'admin' || userRole === 'caja' || userRole === 'demo' || userRole === 'team'
  const canAuthorizeGift = userRole === 'admin' || userRole === 'owner' || userRole === 'manager' || userRole === 'demo' || userRole === 'team'
  void canAuthorizeGift

  // Filtered Orders & Badge count for delivered unpaid orders
  const pendingPaymentOrders = useMemo(() => {
    if (!canManagePayments) return []
    return orders
      .filter((order) => order.paymentStatus === 'pending' && order.status === 'delivered')
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }, [orders, canManagePayments])
  const pendingPaymentCount = pendingPaymentOrders.length

  // Alerta sonora continua para pedidos de whatsapp pendientes (tipo yango)
  useEffect(() => {
    const pendingWhatsappOrders = orders.filter(
      // Solo los que entraron solos por el bot: esos traen whatsappChatId. Los cargados a mano
      // desde caja no lo tienen, y avisar de un pedido que la persona esta escribiendo solo molesta.
      (order) => order.orderSource === 'whatsapp' && order.status === 'pending' && Boolean(order.whatsappChatId)
    )

    if (pendingWhatsappOrders.length === 0) {
      return
    }

    const playYangoSound = () => {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextCtor) return

      try {
        const context = new AudioContextCtor()
        const playTone = (freq: number, startTime: number, duration: number) => {
          const osc = context.createOscillator()
          const gain = context.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, startTime)
          gain.gain.setValueAtTime(0.0001, startTime)
          gain.gain.exponentialRampToValueAtTime(0.05, startTime + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration - 0.02)
          osc.connect(gain)
          gain.connect(context.destination)
          osc.start(startTime)
          osc.stop(startTime + duration)
        }

        // Tono tipo Yango
        playTone(660, context.currentTime, 0.15)
        playTone(880, context.currentTime + 0.2, 0.15)

        setTimeout(() => {
          context.close().catch(() => {})
        }, 1000)
      } catch (e) {
        console.error(e)
      }
    }

    playYangoSound()
    const intervalId = setInterval(playYangoSound, 1500)

    return () => {
      clearInterval(intervalId)
    }
  }, [orders])

  const todayKey = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  const getOrderDayKey = (createdAtStr: string) => {
    const d = new Date(createdAtStr)
    if (isNaN(d.getTime())) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const isOrderDeliveryDelayed = (order: Order) => {
    if (order.status === 'delivered' || order.status === 'cancelled') return false
    if (!order.estimatedDelay) return false
    const dueAt = new Date(order.createdAt).getTime() + order.estimatedDelay * 60 * 1000
    return Date.now() > dueAt
  }

  // Pedidos pendientes de dias anteriores para alerta
  const pastPendingOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderDay = getOrderDayKey(order.createdAt)
      const isPast = orderDay && orderDay < todayKey
      const isPending = order.status !== 'delivered' && order.status !== 'cancelled'
      return isPast && isPending
    })
  }, [orders, todayKey])

  // Columnas para el Tablero Operativo (Solo hoy)
  const finalizadosOrders = useMemo(() => {
    return orders
      .filter((order) => getOrderDayKey(order.createdAt) === todayKey)
      .filter((order) => order.status === 'delivered' || order.status === 'cancelled')
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, 30) // Limitar a los ultimos 30 pedidos finalizados del dia para mejor rendimiento
  }, [orders, todayKey])

  const whatsappOrders = useMemo(() => {
    return orders
      .filter((order) => getOrderDayKey(order.createdAt) === todayKey)
      .filter((order) => 
        (order.orderSource === 'whatsapp' || order.fulfillmentType === 'delivery') &&
        order.status !== 'delivered' &&
        order.status !== 'cancelled'
      )
      .filter((order) => {
        if (whatsappSubFilter === 'pending') return order.paymentStatus === 'pending'
        if (whatsappSubFilter === 'paid') return order.paymentStatus === 'paid'
        return true
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [orders, todayKey, whatsappSubFilter])

  const localesOrders = useMemo(() => {
    return orders
      .filter((order) => getOrderDayKey(order.createdAt) === todayKey)
      .filter((order) => 
        order.orderSource === 'local' &&
        order.fulfillmentType !== 'delivery' &&
        order.status !== 'delivered' &&
        order.status !== 'cancelled'
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [orders, todayKey])

  const updateItem = (lineId: string, updater: (item: CartItem) => CartItem) => {
    setCartItems((currentItems) => currentItems.map((item) => (item.lineId === lineId ? updater(item) : item)))
  }

  const handleToggleWhatsappOrders = async () => {
    if (acceptingWhatsappOrders) {
      setPauseOrdersModalOpen(true)
      return
    }

    try {
      setIsTogglingWhatsappOrders(true)
      await setBotAcceptingOrders(true)
      setAcceptingWhatsappOrders(true)
      emitBotHealthChanged()
    } catch {
      window.alert('No se pudo actualizar la recepcion de pedidos por WhatsApp. Revisa que el bot este encendido.')
    } finally {
      setIsTogglingWhatsappOrders(false)
    }
  }

  const confirmPauseWhatsappOrders = async () => {
    try {
      setIsTogglingWhatsappOrders(true)
      const endOfDay = new Date()
      endOfDay.setHours(23, 0, 0, 0)
      const pausedUntil =
        pauseDurationMinutes === -1
          ? endOfDay.toISOString()
          : new Date(Date.now() + pauseDurationMinutes * 60 * 1000).toISOString()
      await setBotAcceptingOrders(false, { pausedUntil, pauseReason })
      setAcceptingWhatsappOrders(false)
      setPauseOrdersModalOpen(false)
      emitBotHealthChanged()
    } catch {
      window.alert('No se pudo pausar la recepcion de pedidos por WhatsApp. Revisa que el bot este encendido.')
    } finally {
      setIsTogglingWhatsappOrders(false)
    }
  }

  const handleTogglePickupOnly = async () => {
    try {
      setIsTogglingWhatsappOrders(true)
      const nextValue = !pickupOnlyMode
      await saveBotSettings({ pickupOnlyMode: nextValue })
      setPickupOnlyMode(nextValue)
      emitBotHealthChanged()
    } catch {
      window.alert('No se pudo actualizar el modo solo recojo. Revisa que el bot este encendido.')
    } finally {
      setIsTogglingWhatsappOrders(false)
    }
  }

  const removeItem = (lineId: string) => {
    if (operationsDisabled || (editingOrderId && orders.find((order) => order.id === editingOrderId)?.submittedBatches?.some((batch) => batch.itemIds.includes(lineId)))) return
    setCartItems((currentItems) => currentItems.filter((item) => item.lineId !== lineId))
    setExpandedLineId((currentLineId) => (currentLineId === lineId ? null : currentLineId))
  }

  // Load order back to cart for editing
  const handleEditOrder = (order: Order) => {
    setEditingOrderId(order.id)
    const loadedCartItems: CartItem[] = order.items.map((item) => {
      const product = products.find((p) => p.name === item.name)
      return {
        lineId: item.id || crypto.randomUUID(),
        productId: product ? product.id : 'unknown',
        quantity: item.quantity,
        modifiers: item.modifiers,
      }
    })
    setCartItems(loadedCartItems)
    setOrderSource(counterServiceMode ? 'local' : order.orderSource || 'local')
    setFulfillmentType(counterServiceMode ? 'pickup' : order.fulfillmentType || (order.orderType === 'delivery' ? 'delivery' : 'table'))
    setTableInfo(counterServiceMode ? '' : order.tableInfo || '')
    setTableId(counterServiceMode ? '' : order.tableId || restaurantTables.find(table => table.name === order.tableInfo)?.id || '')
    setCustomerName(order.customerName || '')
    setCustomerPhone(order.customerPhone || '')
    setCustomerId(order.customerId || '')
    setDeliveryAddress(order.deliveryAddress || '')
    setPaymentStatus(order.paymentStatus)
    setPaymentMethod(order.paymentMethod || null)
    setExpectedPaymentMethod(order.expectedPaymentMethod || null)

    if (order.paymentStatus === 'paid' && order.payment) {
      setCashReceivedInput(String(order.payment.cashReceived || ''))
      setCashSplitInput(String(order.payment.cashAmount || ''))
      setQrSplitInput(String(order.payment.qrAmount || ''))
      setCardSplitInput(String(order.payment.cardAmount || ''))
    } else {
      setCashReceivedInput('')
      setCashSplitInput('')
      setQrSplitInput('')
      setCardSplitInput('')
    }
    setViewMode('new_order')
    setShowCheckoutModal(true)
  }

  const handleDiscardEdit = () => {
    setEditingOrderId(null)
    setCartItems([])
    setFulfillmentType(counterServiceMode || userRole === 'pedidos' ? 'pickup' : 'table')
    setOrderSource(counterServiceMode ? 'local' : userRole === 'pedidos' ? 'whatsapp' : 'local')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerId('')
    setDeliveryAddress('')
    setTableInfo('')
    setTableId('')
    setPaymentStatus(counterServiceMode ? 'paid' : userRole === 'pedidos' || restaurantTables.length > 0 ? 'pending' : 'paid')
    setPaymentMethod('cash')
    setExpectedPaymentMethod(null)
    setCashReceivedInput('')
    setCashSplitInput('')
    setQrSplitInput('')
    setCardSplitInput('')
    setShowCheckoutModal(false)
  }

  const controlsContent = botManagementEnabled ? (
    <div className="flex flex-wrap items-center gap-2">
      {/* Botón de Pausar/Reanudar y Delivery/Solo Recojo */}
      <div className="flex items-center rounded-xl border border-line bg-white p-1 gap-1 shadow-sm shrink-0">
        <button
          type="button"
          className={`px-2 py-1 rounded-lg text-[10px] font-black transition flex items-center gap-1 min-h-[26px] ${
            acceptingWhatsappOrders
              ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
          }`}
          disabled={isTogglingWhatsappOrders}
          onClick={() => void handleToggleWhatsappOrders()}
          title={acceptingWhatsappOrders ? 'Pausar pedidos por WhatsApp' : 'Reanudar pedidos por WhatsApp'}
        >
          {acceptingWhatsappOrders ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
          <span>{acceptingWhatsappOrders ? 'BOT ACTIVO' : 'BOT PAUSADO'}</span>
        </button>
        
        <button
          type="button"
          className={`px-2 py-1 rounded-lg text-[10px] font-black transition flex items-center gap-1 min-h-[26px] ${
            pickupOnlyMode
              ? 'bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
          }`}
          disabled={isTogglingWhatsappOrders || !acceptingWhatsappOrders}
          onClick={() => void handleTogglePickupOnly()}
          title={pickupOnlyMode ? 'Cambiar a delivery activo' : 'Cambiar a solo recojo'}
        >
          <ShoppingBag size={12} />
          <span>{pickupOnlyMode ? 'SOLO RECOJO' : 'DELIVERY ACTIVO'}</span>
        </button>
      </div>

      {/* Retraso general */}
      <div className="flex items-center rounded-xl border border-line bg-white p-1 gap-1 shadow-sm text-ink shrink-0">
        <span className="text-[9px] font-black text-muted px-1.5 uppercase tracking-wider">Retraso:</span>
        <div className="flex gap-0.5">
          {[10, 15, 20, 25, 30].map((mins) => {
            const isActive = globalDelay === mins
            return (
              <button
                key={mins}
                type="button"
                className={`px-1.5 py-0.5 rounded text-[10px] font-black transition ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-panel hover:bg-line text-ink'
                }`}
                onClick={() => openDemandDelayModal(mins)}
              >
                {mins}m
              </button>
            )
          })}
        </div>
        {demandDelayActive ? (
          <button
            type="button"
            className="ml-1 text-[10px] font-black border border-line bg-panel hover:bg-line px-1.5 py-0.5 rounded transition shrink-0"
            onClick={clearDemandDelay}
          >
            Normal
          </button>
        ) : null}
      </div>
    </div>
  ) : null

  return (
    <div className={`restaurant-pos-kiosk ${viewMode === 'new_order' ? 'is-catalog-view' : 'is-orders-view'}`}>
      {portalElement ? createPortal(controlsContent, portalElement) : null}
      {/* Top View Mode Switcher */}
      <div className="restaurant-pos-toolbar flex flex-wrap justify-between items-center gap-3">
        <div className="flex gap-2 bg-white/60 p-1.5 rounded-2xl border border-white/80 shadow-insetSoft">
          <button
            type="button"
            className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wider transition ${
              viewMode === 'new_order'
                ? 'bg-ink text-white shadow-card'
                : 'text-muted hover:text-ink'
            }`}
            onClick={() => setViewMode('new_order')}
          >
            NUEVO PEDIDO
          </button>
          <button
            type="button"
            className={`relative px-5 py-2.5 rounded-xl text-xs font-black tracking-wider transition ${
              viewMode === 'orders_list'
                ? 'bg-ink text-white shadow-card'
                : 'text-muted hover:text-ink'
            }`}
            onClick={() => setViewMode('orders_list')}
          >
            PEDIDOS
            {pendingPaymentCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-accent text-[9px] font-black text-white shadow-lg animate-bounce">
                {pendingPaymentCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="hidden xl:flex flex-wrap items-center gap-3">
          {controlsContent}
          {pendingPaymentCount > 0 ? (
            <button
              type="button"
              className="flex items-center gap-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2 text-xs font-extrabold tracking-wider hover:bg-rose-100 transition shadow-sm animate-pulse"
              onClick={() => {
                setViewMode('orders_list')
                setWhatsappSubFilter('pending')
              }}
            >
              <DollarSign size={14} />
              <span>COBROS PENDIENTES ({pendingPaymentCount})</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="restaurant-pos-workspace w-full space-y-5">
        {operationMessage && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{operationMessage}</p>}
        {/* Main Panel Section */}
        <section className="w-full space-y-5">
          {viewMode === 'new_order' ? (
            <>
              {/* POS Categories & Catalog */}
              <div className="restaurant-pos-categories no-scrollbar">
                {[{ id: 'all', name: 'Todos', emoji: '', sortOrder: -1, isActive: true, isVisible: true }, ...visibleCategories].map((category) => {
                  const isActive = category.id === activeCategory
                  const CategoryIcon = getCategoryIcon(category.id, category.name)

                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-normal transition shrink-0 ${
                        isActive
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                          : 'bg-white border border-border text-slate-700 hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedCategoryId(category.id)}
                    >
                      <CategoryIcon size={15} strokeWidth={2.2} aria-hidden="true" />
                      <span>{category.name}</span>
                    </button>
                  )
                })}
              </div>

              <label className="restaurant-product-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar productos</span><input type="search" value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Buscar productos..." /></label>
              <div className="restaurant-product-grid">
                {visibleProducts.map((product) => (
                  <KioskProductCard key={product.id} product={product} disabled={operationsDisabled} onAdd={addCatalogProduct} />
                ))}

                {visibleProducts.length === 0 ? (
                  <Panel className="col-span-full border-dashed border-lineStrong bg-white/55 p-8 text-center text-sm text-muted">
                    No hay productos disponibles en esta categoria.
                  </Panel>
                ) : null}
              </div>
            </>
          ) : (
            /* Orders Queue / List view */
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-black text-ink">Sistema de Pedidos</h1>
                  <p className="text-xs text-muted">Gestion de comandas y estado de entregas en tiempo real.</p>
                </div>
                <PrintModeToggle />
              </div>

              {pastPendingOrders.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-pulse">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="text-red-700 shrink-0" size={20} />
                    <div>
                      <div className="text-sm font-black text-red-950 uppercase tracking-wide">Pedidos pendientes de dias anteriores</div>
                      <div className="text-xs text-red-800 mt-0.5 font-bold">
                        Hay {pastPendingOrders.length} pedido(s) sin entregar o anular de fechas pasadas. Debes gestionarlos o anularlos para limpiar el reporte diario.
                      </div>
                    </div>
                  </div>
                  {canManageOrders ? (
                    <button
                      type="button"
                      className="px-4 py-2 bg-red-750 hover:bg-red-800 text-white text-xs font-black rounded-xl transition shadow-sm shrink-0"
                      onClick={async () => {
                        if (window.confirm(`Estas seguro de que deseas ANULAR automaticamente los ${pastPendingOrders.length} pedidos pendientes de dias anteriores?`)) {
                          for (const order of pastPendingOrders) {
                            await onCancelOrder(order.id, 'Sistema', 'Anulacion automatica por cambio de dia')
                          }
                        }
                      }}
                    >
                      ANULAR TODOS ({pastPendingOrders.length})
                    </button>
                  ) : null}
                </div>
              )}

              {pastPendingOrders.length > 0 && (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {pastPendingOrders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-red-100 bg-white p-3 text-xs shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-ink">{order.displayNumber}</span>
                        <span className="font-semibold text-red-800">{new Date(order.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-1 truncate text-muted">{order.customerName || order.items.map((item) => item.name).join(', ')}</div>
                      {canManageOrders ? (
                        <div className="mt-2 flex gap-2">
                          <button type="button" className="flex-1 rounded-lg bg-ink px-2 py-1.5 font-bold text-white" onClick={() => void handleSetOrderStatus(order, 'delivered')}>Entregado</button>
                          <button type="button" className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 font-bold text-white" onClick={() => onCancelOrder(order.id, 'Sistema', 'Anulado desde pendientes anteriores')}>Anular</button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {pendingPaymentOrders.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-black uppercase tracking-wide text-amber-950">Cobros pendientes</div>
                      <div className="text-xs font-semibold text-amber-800">
                        Estos pedidos siguen sin pago aunque ya no aparezcan en las columnas activas.
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-600 px-3 py-1 text-xs font-black text-white">
                      {pendingPaymentOrders.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {pendingPaymentOrders.map((order) => (
                      <div key={order.id} className="rounded-xl border border-amber-100 bg-white p-3 text-xs shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-ink">{order.displayNumber}</span>
                          <PaymentBadge paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
                        </div>
                        <div className="mt-1 truncate font-semibold text-ink">{order.customerName || 'Cliente general'}</div>
                        <div className="mt-1 truncate text-muted">{order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</div>
                        <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2">
                          <span className="font-black text-ink">{formatCurrency(order.productSubtotal ?? order.total)}</span>
                          <span className="text-[10px] font-semibold text-muted">{new Date(order.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 font-bold text-white"
                            onClick={() => {
                              setPayingOrder(order)
                              setFastPayMethod('cash')
                              setFastCashReceived('')
                              setFastCashSplit('')
                            }}
                          >
                            Cobrar
                          </button>
                          {canManageOrders && order.status !== 'delivered' ? (
                            <button type="button" className="flex-1 rounded-lg bg-ink px-2 py-1.5 font-bold text-white" onClick={() => void handleSetOrderStatus(order, 'delivered')}>
                              Entregado
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tablero Kanban de 3 Columnas */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                
                {/* COLUMNA 1: PEDIDOS FINALIZADOS */}
                <div className="space-y-4 lg:order-3">
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-700" />
                      <span className="font-black text-sm tracking-wide">Pedidos Finalizados</span>
                    </div>
                    <span className="bg-emerald-600 text-white rounded-full text-xs px-2.5 py-0.5 font-bold">
                      {finalizadosOrders.length}
                    </span>
                  </div>

                  <div className="space-y-3 overflow-visible lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
                    {finalizadosOrders.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-muted font-semibold bg-white/40">
                        No hay pedidos finalizados hoy.
                      </div>
                    ) : (
                      finalizadosOrders.map((order) => (
                        <div key={order.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow transition space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-black text-ink">{order.displayNumber}</span>
                            <span className="text-[10px] text-muted font-semibold">
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <div className="text-xs space-y-1">
                            <div>
                              <span className="font-bold text-muted">Cliente:</span>{' '}
                              <span className="font-semibold text-ink">{order.customerName || 'Cliente en local'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <SourceBadge source={order.orderSource} />
                              <FulfillmentBadge type={order.fulfillmentType} tableInfo={order.tableInfo} />
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                order.status === 'cancelled'
                                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                              }`}>
                                {order.status === 'cancelled' ? 'Anulado' : 'Entregado'}
                              </span>
                              {/* Esta etiqueta decia "Pagado" fijo, sin mirar el estado real: un
                                  pedido entregado pero sin cobrar aparecia como pagado aca al
                                  mismo tiempo que figuraba en "Cobros pendientes". */}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                order.paymentStatus === 'paid'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : order.paymentStatus === 'gift'
                                    ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                              }`}>
                                {order.paymentStatus === 'paid'
                                  ? 'Pagado'
                                  : order.paymentStatus === 'gift'
                                    ? 'Regalo'
                                    : 'Pendiente de pago'}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-dashed border-line pt-2 text-[11px] text-ink/90 space-y-1">
                            {order.items.map((item) => (
                              <div key={item.id} className="space-y-0.5">
                                <div className="flex justify-between">
                                  <span>{item.quantity}x {item.name}</span>
                                  <span>{formatCurrency(item.lineTotal)}</span>
                                </div>
                                {item.modifiers?.extras?.length > 0 && (
                                  <div className="text-[10px] text-accent font-semibold pl-3 animate-fadeIn">
                                    + Extras: {formatExtrasList(item.modifiers.extras)}
                                  </div>
                                )}
                                {item.modifiers?.options?.length > 0 && (
                                  <div className="text-[10px] text-muted pl-3">
                                    + Opciones: {item.modifiers.options.join(', ')}
                                  </div>
                                )}
                                {item.modifiers?.note && (
                                  <div className="text-[10px] text-red-600 font-bold pl-3">
                                    Obs: {item.modifiers.note}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="border-t border-line pt-2 flex justify-between items-center">
                            <span className="text-xs font-black text-ink">Total: {formatCurrency(order.total)}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="p-1.5 rounded-lg border border-line bg-panel text-muted hover:text-ink transition hover:bg-line"
                                title="Imprimir ticket"
                                onClick={() => setPrintedOrder(order)}
                              >
                                <Printer size={13} />
                              </button>
                              {canManageOrders && (order.orderSource === 'local' || order.orderSource === 'whatsapp') && order.status === 'delivered' ? (
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                                  title="Deshacer entregado"
                                  onClick={() => onSetOrderStatus(order.id, 'preparing')}
                                >
                                  <RotateCcw size={13} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={`p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition ${canManageOrders ? '' : 'hidden'}`}
                                title="Eliminar permanentemente"
                                onClick={async () => {
                                  if (window.confirm('Estas seguro de que deseas ELIMINAR permanentemente este pedido del sistema? Esta accion no se puede deshacer.')) {
                                    await onDeleteOrder(order.id)
                                  }
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* COLUMNA 2: PEDIDOS WHATSAPP / DELIVERY */}
                <div className="space-y-4 lg:order-2">
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                      <MessageSquareText size={18} className="text-amber-700" />
                      <span className="font-black text-sm tracking-wide">WhatsApp / Delivery</span>
                    </div>
                    <span className="bg-amber-600 text-white rounded-full text-xs px-2.5 py-0.5 font-bold">
                      {whatsappOrders.length}
                    </span>
                  </div>

                  {/* Subfiltros de Pago para WhatsApp */}
                  <div className="flex gap-1.5 bg-white/60 p-1 rounded-xl border border-line shadow-insetSoft">
                    {[
                      { id: 'all', label: `Todos (${whatsappOrders.length})` },
                      { id: 'pending', label: 'Por Pagar' },
                      { id: 'paid', label: 'Pagados' },
                    ].map((tab) => {
                      const isActive = whatsappSubFilter === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition ${
                            isActive
                              ? 'bg-ink text-white shadow-sm'
                              : 'text-muted hover:text-ink'
                          }`}
                          onClick={() => setWhatsappSubFilter(tab.id as any)}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>

                  <div className="space-y-3 overflow-visible lg:max-h-[64vh] lg:overflow-y-auto lg:pr-1">
                    {whatsappOrders.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-muted font-semibold bg-white/40">
                        Sin pedidos activos en esta seccion.
                      </div>
                    ) : (
                      whatsappOrders.map((order) => {
                        const isPaid = order.paymentStatus === 'paid'
                        return (
                          <div key={order.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow transition space-y-3 border-l-4 border-l-amber-500">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-black text-ink">{order.displayNumber}</span>
                                <StatusPill status={order.status} />
                                {isOrderDeliveryDelayed(order) ? (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-black text-red-700">RETRASO DE ENTREGA</span>
                                ) : null}
                              </div>
                              <span className="text-[10px] text-muted font-semibold">
                                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="text-xs space-y-1.5">
                              <div>
                                <span className="font-bold text-muted">Cliente:</span>{' '}
                                <span className="font-semibold text-ink">{order.customerName || 'Cliente WhatsApp'}</span>
                              </div>
                              {order.customerPhone ? (
                                <div>
                                  <span className="font-bold text-muted">Telefono:</span>{' '}
                                  <span className="font-semibold text-ink">{order.customerPhone}</span>
                                </div>
                              ) : null}
                              {order.deliveryAddress ? (
                                <div>
                                  <span className="font-bold text-muted">Direccion:</span>{' '}
                                  <span className="font-semibold text-ink">{order.deliveryAddress}</span>
                                </div>
                              ) : null}
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <SourceBadge source={order.orderSource} />
                                <FulfillmentBadge type={order.fulfillmentType} tableInfo={order.tableInfo} />
                                <PaymentBadge paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
                                {order.qrProofReceived ? (
                                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    QR por revisar
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="border-t border-dashed border-line pt-2 text-[11px] text-ink/90 space-y-1">
                              {order.items.map((item) => (
                                <div key={item.id} className="space-y-0.5">
                                  <div className="flex justify-between">
                                    <span>{item.quantity}x {item.name}</span>
                                    <span className="text-muted font-semibold">{formatCurrency(item.lineTotal)}</span>
                                  </div>
                                  {item.modifiers?.extras?.length > 0 && (
                                    <div className="text-[10px] text-accent font-semibold pl-3 animate-fadeIn">
                                      + Extras: {formatExtrasList(item.modifiers.extras)}
                                    </div>
                                  )}
                                  {item.modifiers?.options?.length > 0 && (
                                    <div className="text-[10px] text-muted pl-3">
                                      + Opciones: {item.modifiers.options.join(', ')}
                                    </div>
                                  )}
                                  {item.modifiers?.note && (
                                    <div className="text-[10px] text-red-600 font-bold pl-3">
                                      Obs: {item.modifiers.note}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {order.fulfillmentType === 'delivery' && order.deliveryFee !== undefined ? (
                                <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                                  <div className="flex justify-between">
                                    <span>Productos</span>
                                    <span className="font-semibold">{formatCurrency(order.productSubtotal ?? order.total - (order.deliveryFee || 0))}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Envio {order.deliveryDistanceKm ? `(${order.deliveryDistanceKm} km)` : ''}</span>
                                    <span className="font-semibold">{formatCurrency(order.deliveryFee)}</span>
                                  </div>
                                  {order.deliveryQuoteNote ? (
                                    <div className="mt-1 text-[10px] leading-4 text-amber-800">{order.deliveryQuoteNote}</div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="border-t border-line pt-2 flex justify-between items-center">
                              <span className="text-xs font-black text-ink">Total: {formatCurrency(order.total)}</span>
                              <button
                                type="button"
                                className="p-1.5 rounded-lg border border-line bg-panel text-muted hover:text-ink transition hover:bg-line"
                                title="Imprimir ticket"
                                onClick={() => setPrintedOrder(order)}
                              >
                                <Printer size={13} />
                              </button>
                            </div>

                            {/* Acciones para WhatsApp */}
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-dashed border-line">
                              {canManageOrders && order.status === 'pending' ? (
                                confirmingDelayOrderId === order.id ? (
                                  <div className="flex items-center gap-1 bg-[#f8fafc] p-1.5 rounded-xl border border-[#cbd5e1] flex-wrap w-full">
                                    <span className="text-[10px] font-black text-slate-500 px-1">Retraso:</span>
                                    {[10, 15, 20, 25, 30].map((mins) => (
                                      <button
                                        key={mins}
                                        type="button"
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-1 rounded text-[9px] font-black transition"
                                        onClick={async () => {
                                          await onSetOrderStatus(order.id, 'preparing', mins)
                                          setConfirmingDelayOrderId(null)
                                          setPrintedOrder(order)
                                        }}
                                      >
                                        {mins}m
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      className="bg-slate-400 hover:bg-slate-500 text-white px-1.5 py-1 rounded text-[9px] font-black transition"
                                      onClick={() => setConfirmingDelayOrderId(null)}
                                    >
                                      Atras
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex-1 flex gap-1.5">
                                    <button
                                      type="button"
                                      className="flex-1 flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-lg text-[10px] font-black transition shadow-sm"
                                      onClick={async () => {
                                        await onSetOrderStatus(order.id, 'preparing', globalDelay)
                                        setPrintedOrder(order)
                                      }}
                                    >
                                      <CheckCircle2 size={12} />
                                      Confirmar ({globalDelay}m)
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2 bg-slate-100 hover:bg-slate-200 border border-line rounded-lg text-[10px] font-bold text-ink transition"
                                      onClick={() => setConfirmingDelayOrderId(order.id)}
                                      title="Cambiar tiempo de retraso"
                                    >
                                      + Atraso
                                    </button>
                                  </div>
                                )
                              ) : null}

                              {canManagePayments && !isPaid && (
                                <button
                                  type="button"
                                  className="flex-1 flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg text-[10px] font-black transition shadow-sm"
                                  onClick={() => {
                                    setPayingOrder(order)
                                    setFastPayMethod('cash')
                                    setFastCashReceived('')
                                    setFastCashSplit('')
                                  }}
                                >
                                  <Coins size={12} />
                                  Cobrar
                                </button>
                              )}

                              <button
                                type="button"
                                className={`flex-1 items-center justify-center gap-1 bg-ink hover:bg-ink/90 text-white py-1.5 rounded-lg text-[10px] font-black transition shadow-sm ${canManageOrders ? 'flex' : 'hidden'}`}
                                onClick={() => void handleSetOrderStatus(order, 'delivered')}
                              >
                                <CheckCircle2 size={12} />
                                Entregado
                              </button>

                              {orderEditingEnabled && <button
                                type="button"
                                className="flex items-center justify-center p-1.5 border border-line bg-panel text-muted hover:text-ink rounded-lg text-[10px] font-black transition"
                                onClick={() => handleEditOrder(order)}
                              >
                                <FileEdit size={12} />
                              </button>}

                              <button
                                type="button"
                                className={`flex items-center justify-center p-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-[10px] font-black transition ${canManageOrders ? '' : 'hidden'}`}
                                onClick={async () => {
                                  // El boton decia "eliminar" pero solo anulaba: el pedido seguia
                                  // apareciendo en "Pedidos Finalizados" como anulado, y encima
                                  // como pagado. Ahora elimina de verdad y no queda rastro.
                                  if (window.confirm('Estas seguro de que deseas ELIMINAR este pedido? Va a desaparecer del sistema y no se puede deshacer.')) {
                                    await onDeleteOrder(order.id)
                                  }
                                }}
                                title="Eliminar pedido"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* COLUMNA 3: PEDIDOS LOCALES ACTIVOS */}
                <div className="space-y-4 lg:order-1">
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                      <Store size={18} className="text-blue-700" />
                      <span className="font-black text-sm tracking-wide">Pedidos Locales (Caja)</span>
                    </div>
                    <span className="bg-blue-600 text-white rounded-full text-xs px-2.5 py-0.5 font-bold">
                      {localesOrders.length}
                    </span>
                  </div>

                  <div className="space-y-3 overflow-visible lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
                    {localesOrders.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-muted font-semibold bg-white/40">
                        Sin pedidos de caja activos hoy.
                      </div>
                    ) : (
                      localesOrders.map((order) => {
                        const isPaid = order.paymentStatus === 'paid'
                        return (
                          <div key={order.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow transition space-y-3 border-l-4 border-l-blue-500">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-black text-ink">{order.displayNumber}</span>
                                <StatusPill status={order.status} />
                                {isOrderDeliveryDelayed(order) ? (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-black text-red-700">RETRASO DE ENTREGA</span>
                                ) : null}
                              </div>
                              <span className="text-[10px] text-muted font-semibold">
                                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="text-xs space-y-1.5">
                              <div>
                                <span className="font-bold text-muted">Cliente:</span>{' '}
                                <span className="font-semibold text-ink">{order.customerName || 'Cliente General'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <FulfillmentBadge type={order.fulfillmentType} tableInfo={order.tableInfo} />
                                <PaymentBadge paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
                              </div>
                            </div>

                            <div className="border-t border-dashed border-line pt-2 text-[11px] text-ink/90 space-y-1">
                              {order.items.map((item) => (
                                <div key={item.id} className="space-y-0.5">
                                  <div className="flex justify-between">
                                    <span>{item.quantity}x {item.name}</span>
                                    <span className="text-muted font-semibold">{formatCurrency(item.lineTotal)}</span>
                                  </div>
                                  {item.modifiers?.extras?.length > 0 && (
                                    <div className="text-[10px] text-accent font-semibold pl-3 animate-fadeIn">
                                      + Extras: {formatExtrasList(item.modifiers.extras)}
                                    </div>
                                  )}
                                  {item.modifiers?.options?.length > 0 && (
                                    <div className="text-[10px] text-muted pl-3">
                                      + Opciones: {item.modifiers.options.join(', ')}
                                    </div>
                                  )}
                                  {item.modifiers?.note && (
                                    <div className="text-[10px] text-red-600 font-bold pl-3">
                                      Obs: {item.modifiers.note}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="border-t border-line pt-2 flex justify-between items-center">
                              <span className="text-xs font-black text-ink">Total: {formatCurrency(order.total)}</span>
                              <button
                                type="button"
                                className="p-1.5 rounded-lg border border-line bg-panel text-muted hover:text-ink transition hover:bg-line"
                                title="Imprimir ticket"
                                onClick={() => setPrintedOrder(order)}
                              >
                                <Printer size={13} />
                              </button>
                            </div>

                            {/* Acciones para Pedido Local */}
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-dashed border-line">

                              {canManagePayments && !isPaid && (
                                <button
                                  type="button"
                                  className="flex-1 flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 rounded-lg text-[10px] font-black transition shadow-sm"
                                  onClick={() => {
                                    setPayingOrder(order)
                                    setFastPayMethod('cash')
                                    setFastCashReceived('')
                                    setFastCashSplit('')
                                  }}
                                >
                                  <Coins size={12} />
                                  Cobrar
                                </button>
                              )}

                              <button
                                type="button"
                                className={`flex-1 items-center justify-center gap-1 bg-ink hover:bg-ink/90 text-white py-1.5 rounded-lg text-[10px] font-black transition shadow-sm ${canManageOrders ? 'flex' : 'hidden'}`}
                                onClick={() => void handleSetOrderStatus(order, 'delivered')}
                              >
                                <CheckCircle2 size={12} />
                                Entregado
                              </button>

                              {orderEditingEnabled && <button
                                type="button"
                                className="flex items-center justify-center p-1.5 border border-line bg-panel text-muted hover:text-ink rounded-lg text-[10px] font-black transition"
                                onClick={() => handleEditOrder(order)}
                              >
                                <FileEdit size={12} />
                              </button>}

                              <button
                                type="button"
                                className={`flex items-center justify-center p-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-[10px] font-black transition ${canManageOrders ? '' : 'hidden'}`}
                                onClick={async () => {
                                  // El boton decia "eliminar" pero solo anulaba: el pedido seguia
                                  // apareciendo en "Pedidos Finalizados" como anulado, y encima
                                  // como pagado. Ahora elimina de verdad y no queda rastro.
                                  if (window.confirm('Estas seguro de que deseas ELIMINAR este pedido? Va a desaparecer del sistema y no se puede deshacer.')) {
                                    await onDeleteOrder(order.id)
                                  }
                                }}
                                title="Eliminar pedido"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
              </div>
            </div>
            </div>
          )}
        </section>
      </div>

      {viewMode === 'new_order' && !showCheckoutModal && (
        <button
          type="button"
          className="restaurant-mobile-cart-bar"
          onClick={() => setShowCheckoutModal(true)}
        >
          <ShoppingCart size={23} /><span className="restaurant-mobile-cart-count">{totalUnits}</span>
          <span className="restaurant-mobile-cart-label">Ver pedido</span>
          <strong>{formatCurrency(cartTotal)}</strong>
        </button>
      )}

      {viewMode === 'new_order' && (
        <div className={`restaurant-cart-layer ${showCheckoutModal ? 'is-open' : ''}`}>
          <Panel className="restaurant-cart-panel w-full overflow-hidden flex flex-col border border-line">

            {/* Header Premium */}
            <div className="border-b border-border/80 px-4 py-3 flex items-center justify-between bg-white/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center shrink-0">
                  <ShoppingCart size={17} strokeWidth={2.2} />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-slate-900">Tu Pedido</h2>
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold">
                    {totalUnits}
                  </span>
                </div>
                <div className="rounded-md border border-border/80 bg-slate-50 px-2 py-0.5 flex items-center gap-1">
                  <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Ticket</span>
                  <span className="text-xs font-bold text-slate-800">#{nextOrderNumber}</span>
                </div>
                {editingOrderId ? <span className="text-[9px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">EDITANDO</span> : null}
              </div>
              <div className="flex items-center gap-1">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-slate-500 hover:text-red-600 transition px-2 py-1 rounded-lg hover:bg-red-50"
                    onClick={() => setCartItems([])}
                    title="Vaciar pedido"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full p-1.5 text-muted hover:bg-slate-100 transition"
                  onClick={() => setShowCheckoutModal(false)}
                  aria-label="Cerrar pedido"
                  data-cart-close
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Cuerpo scrollable — cart items + checkout form todo junto */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* Items del carrito */}
              <div className="p-3">
                {cartItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-slate-50/50 p-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                      <CookingPot size={24} />
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-800">Sin productos</h3>
                    <p className="mt-1 text-xs text-slate-500">Selecciona productos del catálogo para armar el pedido.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {cartItems.map((item) => {
                      const product = productsById.get(item.productId)
                      if (!product) return null

                      const selectedExtras = item.modifiers.extras
                      const selectedOptions = item.modifiers.options
                      const extrasTotal = selectedExtras.reduce((sum, extra) => sum + extra.price, 0)
                      const lineTotal = (product.price + extrasTotal) * item.quantity
                      const isExpanded = expandedLineId === item.lineId
                      const hasModifiers = selectedExtras.length > 0 || selectedOptions.length > 0 || Boolean(item.modifiers.note)

                      return (
                        <div key={item.lineId} className="py-2.5 first:pt-0 last:pb-1">
                          <div className="flex items-start gap-2.5">
                            {isImageUrl(product.image) ? (
                              <img alt={product.name} className="h-11 w-11 rounded-xl object-cover shrink-0 border border-border/60" src={product.image} />
                            ) : (
                              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] text-sm font-black shrink-0">
                                {product.name.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-xs font-bold text-slate-900 truncate">{product.name}</h3>
                                  <p className="mt-0.5 text-[11px] text-slate-500 font-medium">{formatCurrency(product.price)}</p>
                                </div>
                                <span className="text-xs font-black text-slate-900 shrink-0">
                                  {formatCurrency(lineTotal)}
                                </span>
                              </div>

                              <div className="mt-1.5 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-slate-50 text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 active:scale-95 disabled:opacity-40"
                                    disabled={operationsDisabled || Boolean(editingOrderId && orders.find((order) => order.id === editingOrderId)?.submittedBatches?.some((batch) => batch.itemIds.includes(item.lineId)))}
                                    onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, quantity: Math.max(1, cur.quantity - 1) }))}
                                    aria-label="Disminuir cantidad"
                                  >
                                    <Minus size={11} strokeWidth={2.5} />
                                  </button>
                                  <span className="w-5 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                                  <button
                                    type="button"
                                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-slate-50 text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 active:scale-95"
                                    onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, quantity: cur.quantity + 1 }))}
                                    aria-label="Aumentar cantidad"
                                  >
                                    <Plus size={11} strokeWidth={2.5} />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {product.categoryId === 'hamburguesas' ? (
                                    <button
                                      type="button"
                                      className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition ${isExpanded ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-slate-500 hover:text-slate-900'}`}
                                      onClick={() => setExpandedLineId(isExpanded ? null : item.lineId)}
                                    >
                                      <span>Opciones</span>
                                      <ChevronDown size={11} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  ) : null}
                                  {hasModifiers && !isExpanded ? (
                                    <span className="text-[9px] text-[var(--primary)] font-bold bg-[var(--primary-soft)] px-1.5 py-0.5 rounded">Personalizado</span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="p-1 text-slate-400 transition hover:text-red-600 rounded-md hover:bg-red-50 shrink-0"
                                    onClick={() => removeItem(item.lineId)}
                                    title="Eliminar producto"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Panel expandido — solo para hamburguesas */}
                          {isExpanded && product.categoryId === 'hamburguesas' ? (
                            <div className="mt-2.5 ml-13 space-y-2 border-t border-border/50 pt-2">
                              {product.options?.length ? (
                                <div>
                                  <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Modificadores</p>
                                  <div className="flex flex-wrap gap-1">
                                    {product.options.map((option) => {
                                      const label = simplifyModifierLabel(option.label)
                                      if (!label) return null
                                      const isSelected = selectedOptions.includes(label)
                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${isSelected ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                          onClick={() =>
                                            updateItem(item.lineId, (cur) => ({
                                              ...cur,
                                              modifiers: {
                                                ...cur.modifiers,
                                                options: cur.modifiers.options.includes(label)
                                                  ? cur.modifiers.options.filter((o) => o !== label)
                                                  : [...cur.modifiers.options, label],
                                              },
                                            }))
                                          }
                                        >
                                          {label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {/* Extras Rápidos */}
                              <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Adicionales / Extras</p>
                                {(() => {
                                  const uniqueExtras: ProductExtra[] = []
                                  const seenIds = new Set<string>()
                                  ;[...(product.extras || []), ...quickExtras].forEach((extra) => {
                                    if (!seenIds.has(extra.id)) {
                                      seenIds.add(extra.id)
                                      uniqueExtras.push(extra)
                                    }
                                  })
                                  if (uniqueExtras.length === 0) {
                                    return <div className="text-[10px] text-muted italic">Sin extras disponibles</div>
                                  }
                                  return (
                                    <div className="grid gap-1 sm:grid-cols-2">
                                      {uniqueExtras.map((extra) => {
                                        const count = selectedExtras.filter((x) => x.id === extra.id).length
                                        return (
                                          <div key={extra.id} className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded-lg border border-border/60">
                                            <div className="flex flex-col min-w-0">
                                              <span className="text-[10px] font-semibold text-slate-800 truncate">{extra.name}</span>
                                              <span className="text-[9px] text-slate-500 font-bold">{formatCurrency(extra.price)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              {count > 0 ? (
                                                <>
                                                  <button
                                                    type="button"
                                                    className="flex h-5 w-5 items-center justify-center rounded border border-border bg-white text-slate-700 hover:bg-slate-100 transition"
                                                    onClick={() => updateItem(item.lineId, (cur) => {
                                                      const idx = cur.modifiers.extras.findIndex((x) => x.id === extra.id)
                                                      if (idx === -1) return cur
                                                      const next = [...cur.modifiers.extras]
                                                      next.splice(idx, 1)
                                                      return { ...cur, modifiers: { ...cur.modifiers, extras: next } }
                                                    })}
                                                  >
                                                    <Minus size={9} />
                                                  </button>
                                                  <span className="w-3 text-center text-[10px] font-bold text-slate-800">{count}</span>
                                                  <button
                                                    type="button"
                                                    className="flex h-5 w-5 items-center justify-center rounded border border-border bg-white text-slate-700 hover:bg-slate-100 transition"
                                                    onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, modifiers: { ...cur.modifiers, extras: [...cur.modifiers.extras, extra] } }))}
                                                  >
                                                    <Plus size={9} />
                                                  </button>
                                                </>
                                              ) : (
                                                <button
                                                  type="button"
                                                  className="flex h-5 px-1.5 items-center justify-center rounded border border-[var(--primary)] bg-[var(--primary-soft)] text-[9px] font-bold text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition"
                                                  onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, modifiers: { ...cur.modifiers, extras: [...cur.modifiers.extras, extra] } }))}
                                                >
                                                  <Plus size={9} className="mr-0.5" />
                                                  Agregar
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                })()}
                              </div>

                              <div>
                                <textarea
                                  className="min-h-8 w-full rounded-lg border border-border/80 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--primary)]"
                                  placeholder="Nota para cocina (ej. sin cebolla)..."
                                  value={item.modifiers.note}
                                  onChange={(e) => updateItem(item.lineId, (cur) => ({ ...cur, modifiers: { ...cur.modifiers, note: e.target.value } }))}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Separador */}
              <div className="mx-3 my-1 border-t border-dashed border-border/80" />

              {/* Formulario de checkout embebido */}
              <div className="px-3 pb-3 space-y-2.5">

                {/* Origen */}
                {!counterServiceMode && userRole !== 'pedidos' ? (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Canal</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'local', label: 'Local', icon: Store },
                        { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquareText },
                      ].map((option) => {
                        const isActive = orderSource === option.id
                        const Icon = option.icon
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`rounded-xl border py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                              isActive
                                ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                                : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              setOrderSource(option.id as 'local' | 'whatsapp')
                              setFulfillmentType(option.id === 'local' ? 'table' : 'pickup')
                              setPaymentStatus(option.id === 'whatsapp' ? 'pending' : 'paid')
                              if (option.id === 'whatsapp') setPaymentMethod(null)
                              else setPaymentMethod('cash')
                            }}
                          >
                            <Icon size={14} />
                            <span>{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Entrega */}
                {counterServiceMode ? (
                  <div className="rounded-xl border border-border/80 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                    Entrega: retiro en mostrador
                  </div>
                ) : (
                  <div className="space-y-1 pt-1.5 border-t border-border/50">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Entrega</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(() => {
                        const options: Array<{ id: FulfillmentType; label: string; icon: typeof Utensils; disabled?: boolean }> = [
                          { id: 'table', label: 'Mesa', icon: Utensils, disabled: userRole === 'pedidos' || orderSource === 'whatsapp' },
                          { id: 'pickup', label: 'Retiro', icon: ShoppingBag },
                          { id: 'delivery', label: 'Delivery', icon: Truck },
                        ]
                        return options.map((option) => {
                          if (option.disabled) return null
                          const isActive = fulfillmentType === option.id
                          const Icon = option.icon
                          return (
                            <button key={option.id} type="button"
                              className={`rounded-xl border py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${isActive ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                              onClick={() => {
                                setFulfillmentType(option.id)
                                if (option.id === 'table' && restaurantTables.length) { setPaymentStatus('pending'); setPaymentMethod(null) }
                              }}>
                              <Icon size={13} /><span>{option.label}</span>
                            </button>
                          )
                        })
                      })()}
                    </div>
                    {fulfillmentType === 'table' ? (
                      <div className="mt-1.5">
                        {restaurantTables.length ? (
                          <select className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]" value={tableId} onChange={(e) => {
                            const selected = restaurantTables.find((table) => table.id === e.target.value)
                            setTableId(selected?.id || ''); setTableInfo(selected?.name || '')
                          }}>
                            <option value="">Seleccionar mesa</option>
                            {restaurantTables.filter((table) => !table.archivedAt && table.active !== false).map((table) => (
                              <option key={table.id} value={table.id} disabled={table.status === 'bill_requested' || table.status === 'reserved'}>
                                {table.name} ? {table.status === 'available' ? 'Libre' : table.status === 'bill_requested' ? 'Por cerrarse ? reabrir cuenta' : table.status === 'reserved' ? 'Reservada' : 'Ocupada'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-900" placeholder="N?mero o referencia de mesa" value={tableInfo} onChange={(e) => setTableInfo(e.target.value)} />
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
                {/* Contacto */}
                <div className="space-y-1.5 pt-1.5 border-t border-border/50">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Datos de Contacto</div>
                  {!!restaurantCustomers.length && (
                    <select
                      aria-label="Cliente registrado"
                      value={customerId}
                      onChange={(event) => {
                        const selected = restaurantCustomers.find((item) => item.id === event.target.value)
                        setCustomerId(selected?.id || '')
                        if (selected) {
                          setCustomerName([selected.firstName, selected.lastName].filter(Boolean).join(' '))
                          setCustomerPhone(selected.normalizedPhone)
                        }
                      }}
                      className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                    >
                      <option value="">Sin cliente registrado</option>
                      {restaurantCustomers
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {[item.firstName, item.lastName].filter(Boolean).join(' ')} · +{item.normalizedPhone}
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                    placeholder="Nombre del Cliente (opcional)"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      setCustomerId('')
                    }}
                  />
                  {(orderSource === 'whatsapp' || fulfillmentType === 'delivery') ? (
                    <input
                      className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                      placeholder="Teléfono (opcional)"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value)
                        setCustomerId('')
                      }}
                    />
                  ) : null}
                  {fulfillmentType === 'delivery' ? (
                    <textarea
                      className="w-full min-h-[42px] rounded-xl border border-border/80 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                      placeholder="Dirección o referencia de entrega (opcional)"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  ) : null}
                </div>

                {/* Estado de pago — Libre conmutación Pagado/Pendiente, sin Regalo */}
                <div className="space-y-1.5 pt-1.5 border-t border-border/50">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado de Pago</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'paid', label: 'Pagado' },
                      { id: 'pending', label: 'Pendiente' },
                    ].map((option) => {
                      const isActive = paymentStatus === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`rounded-xl border py-2 text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            isActive
                              ? option.id === 'paid'
                                ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                                : 'border-amber-600 bg-amber-600 text-white shadow-sm'
                              : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                          onClick={() => {
                            setPaymentStatus(option.id as 'paid' | 'pending')
                            if (option.id === 'pending') {
                              setPaymentMethod(null)
                            } else {
                              setPaymentMethod('cash')
                            }
                          }}
                        >
                          {option.label.toUpperCase()}
                        </button>
                      )
                    })}
                  </div>

                  {paymentStatus === 'paid' ? (
                    <div className="mt-2 border-t border-dashed border-border/60 pt-2 space-y-1.5">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Método de Pago</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { id: 'cash', label: 'Efectivo', icon: Coins },
                          { id: 'qr', label: 'QR', icon: QrCode },
                          { id: 'card', label: 'Tarjeta', icon: CreditCard },
                          { id: 'mixed', label: 'Mixto', icon: Shuffle },
                        ].map((option) => {
                          const isActive = paymentMethod === option.id
                          const Icon = option.icon
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`rounded-xl border py-1.5 text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                                isActive
                                  ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                                  : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                              onClick={() => setPaymentMethod(option.id as PaymentMethod)}
                            >
                              <Icon size={12} />
                              <span>{option.label}</span>
                            </button>
                          )
                        })}
                      </div>

                      {paymentMethod === 'cash' ? (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            className="flex-1 rounded-xl border border-border/80 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                            inputMode="decimal"
                            placeholder="Efectivo recibido (opcional)"
                            value={cashReceivedInput}
                            onChange={(e) => setCashReceivedInput(e.target.value)}
                          />
                          <div className="text-xs font-bold text-slate-800 shrink-0">Cambio: {formatCurrency(change)}</div>
                        </div>
                      ) : null}

                      {paymentMethod === 'mixed' ? (
                        <div className="space-y-1.5 pt-1">
                          <div className="grid grid-cols-3 gap-1.5">
                            <label className="block">
                              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Efectivo</div>
                              <input
                                className={`w-full rounded-xl border bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)] ${cashAmount === 0 ? 'border-red-300' : 'border-border/80'}`}
                                inputMode="decimal"
                                placeholder="0"
                                value={cashSplitInput}
                                onChange={(e) => setCashSplitInput(e.target.value)}
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">QR</div>
                              <input
                                className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                                inputMode="decimal"
                                placeholder="0"
                                value={qrSplitInput}
                                onChange={(e) => setQrSplitInput(e.target.value)}
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Tarjeta</div>
                              <input
                                className="w-full rounded-xl border border-border/80 bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                                inputMode="decimal"
                                placeholder="0"
                                value={cardSplitInput}
                                onChange={(e) => setCardSplitInput(e.target.value)}
                              />
                            </label>
                          </div>
                          {Math.round((cashAmount + qrAmount + cardAmount + Number.EPSILON) * 100) / 100 !== Math.round((cartTotal + Number.EPSILON) * 100) / 100 ? (
                            <span className="text-[9px] text-red-500 font-bold block px-1">
                              Los importes deben sumar exactamente {formatCurrency(cartTotal)}.
                            </span>
                          ) : null}
                          <div className="flex items-center gap-2">
                            <input
                              className="flex-1 rounded-xl border border-border/80 bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--primary)]"
                              inputMode="decimal"
                              placeholder="Efectivo recibido (opcional)"
                              value={cashReceivedInput}
                              onChange={(e) => setCashReceivedInput(e.target.value)}
                            />
                            <div className="text-xs font-bold text-slate-800 shrink-0">Cambio: {formatCurrency(change)}</div>
                          </div>
                        </div>
                      ) : null}

                      {paymentMethod === 'qr' ? (
                        <div className="rounded-xl bg-slate-50 border border-border/80 px-3 py-1.5 text-xs flex justify-between items-center mt-1">
                          <span className="text-slate-500 font-semibold">Monto por QR</span>
                          <span className="font-extrabold text-slate-900">{formatCurrency(cartTotal)}</span>
                        </div>
                      ) : null}

                      {paymentMethod === 'card' ? (
                        <div className="rounded-xl bg-slate-50 border border-border/80 px-3 py-1.5 text-xs flex justify-between items-center mt-1">
                          <span className="text-slate-500 font-semibold">Monto por Tarjeta</span>
                          <span className="font-extrabold text-slate-900">{formatCurrency(cartTotal)}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : paymentStatus === 'pending' ? (
                    <div className="mt-2 border-t border-dashed border-border/60 pt-2 space-y-1.5">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Método Esperado</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'cash', label: 'Efectivo', icon: Coins },
                          { id: 'qr', label: 'QR', icon: QrCode },
                          { id: 'mixed', label: 'Mixto', icon: Shuffle },
                        ].map((option) => {
                          const isActive = expectedPaymentMethod === option.id
                          const Icon = option.icon
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`rounded-xl border py-1.5 text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                                isActive
                                  ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                                  : 'border-border/80 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                              onClick={() => setExpectedPaymentMethod(option.id as PaymentMethod)}
                            >
                              <Icon size={12} />
                              <span>{option.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 border-t border-dashed border-border/60 pt-2 text-xs text-violet-800">
                      Cortesía autorizada por <strong>{userName}</strong>. No se registrará ingreso en Caja; el valor comercial y el consumo quedarán en Historial e Inventario.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer fijo del carrito con total prominente en var(--primary) y botón de acción */}
            <div className="border-t border-border/80 bg-white/95 backdrop-blur-md px-4 py-3 shrink-0 space-y-2.5">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                  <span>Subtotal ({totalUnits} {totalUnits === 1 ? 'ítem' : 'ítems'})</span>
                  <span className="font-semibold text-slate-700">{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-border/40">
                  <span className="text-sm font-extrabold text-slate-900 tracking-tight">Total</span>
                  <span className="text-xl font-black text-[var(--primary)]">{formatCurrency(cartTotal)}</span>
                </div>
              </div>

              <button
                type="button"
                className="w-full h-12 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-[var(--primary)]/20 transition active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={operationsDisabled || cartItems.length === 0 || isSubmitting || !isPaymentValid || !isDeliveryInfoValid || (fulfillmentType === 'table' && restaurantTables.length > 0 && !tableId) || submitOrderRef.current}
                onClick={async () => {
                  if (operationsDisabled || submitOrderRef.current) {
                    setOperationMessage('Debes iniciar un turno antes de realizar operaciones.')
                    return
                  }
                  submitOrderRef.current = true
                  setIsSubmitting(true)
                  const necesitaDatosDeContacto = fulfillmentType === 'delivery' || orderSource === 'whatsapp'
                  const nombreFinal = customerName.trim() || (necesitaDatosDeContacto ? 'Cliente' : '')
                  const telefonoFinal = customerPhone.trim() || (necesitaDatosDeContacto ? 'Sin telefono' : '')
                  const direccionFinal =
                    deliveryAddress.trim() ||
                    (fulfillmentType === 'delivery' ? 'Sin direccion: coordinar con el cliente' : '')

                  const payload = {
                    cartItems,
                    productsById,
                    payment: paymentStatus === 'pending'
                      ? { method: (expectedPaymentMethod || 'cash'), cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 }
                      : buildPaymentSummary(),
                    paymentStatus,
                    paymentMethod: paymentStatus === 'paid' ? (paymentMethod || 'cash') : null,
                    expectedPaymentMethod: paymentStatus === 'pending' ? expectedPaymentMethod : null,
                    orderSource,
                    fulfillmentType,
                    tableId: fulfillmentType === 'table' ? tableId : undefined,
                    tableInfo: fulfillmentType === 'table' ? tableInfo.trim() : '',
                    customerName: nombreFinal,
                    customerPhone: telefonoFinal,
                    customerId: customerId || undefined,
                    deliveryAddress: direccionFinal,
                    createdBy: userId,
                  }
                  let isSuccess = false
                  const isEditing = Boolean(editingOrderId)

                    if (editingOrderId) {
                      try {
                        const items = cartItems.map((item) => {
                          const product = productsById.get(item.productId)
                          const selectedExtras = item.modifiers?.extras || []
                          const extrasTotal = selectedExtras.reduce((sum, extra) => sum + extra.price, 0)
                          return {
                            id: item.lineId,
                            name: product?.name || 'Producto',
                            price: product?.price || 0,
                            quantity: item.quantity,
                            lineTotal: ((product?.price || 0) + extrasTotal) * item.quantity,
                            modifiers: item.modifiers,
                          }
                        })

                        const updatePayload = {
                          cartItems,
                          productsById,
                          items,
                          total: cartTotal,
                          payment: buildPaymentSummary(),
                          paymentStatus,
                          paymentMethod,
                          expectedPaymentMethod,
                          orderSource,
                          fulfillmentType,
                          tableInfo: fulfillmentType === 'table' ? tableInfo.trim() : '',
                          customerName: nombreFinal,
                          customerPhone: telefonoFinal,
                          deliveryAddress: direccionFinal,
                        }

                        await onUpdateOrder(editingOrderId, updatePayload as any)
                        isSuccess = true
                      } catch (error) {
                        console.error('Failed to update order:', error)
                      }
                    } else {
                      isSuccess = await onSubmitOrder(payload)
                    }

                    if (isSuccess) {
                      if (isEditing) {
                        setSaveSuccessMessage('¡Cambios guardados con éxito!')
                        setTimeout(() => setSaveSuccessMessage(null), 3500)
                      } else {
                        const completedOrderMock = {
                          displayNumber: nextOrderNumber,
                          createdAt: new Date().toISOString(),
                          items: cartItems.map((item) => {
                            const product = productsById.get(item.productId)
                            const selectedExtras = item.modifiers.extras
                            const extrasTotal = selectedExtras.reduce((sum, extra) => sum + extra.price, 0)
                            return {
                              id: item.lineId,
                              name: product?.name || 'Producto',
                              price: product?.price || 0,
                              quantity: item.quantity,
                              lineTotal: ((product?.price || 0) + extrasTotal) * item.quantity,
                              modifiers: item.modifiers
                            }
                          }),
                          total: cartTotal,
                          payment: buildPaymentSummary(),
                          paymentStatus,
                          paymentMethod,
                          orderSource,
                          fulfillmentType,
                          tableInfo: fulfillmentType === 'table' ? tableInfo.trim() : '',
                          customerName: nombreFinal,
                          customerPhone: telefonoFinal,
                          deliveryAddress: direccionFinal,
                          createdBy: userId,
                        }
                        setPrintedOrder(completedOrderMock as any)
                      }

                      setCartItems([])
                      setExpandedLineId(null)
                      setPaymentStatus(userRole === 'pedidos' || restaurantTables.length > 0 ? 'pending' : 'paid')
                      setPaymentMethod('cash')
                      setCashReceivedInput('')
                      setCashSplitInput('')
                      setQrSplitInput('')
                      setCardSplitInput('')
                      setFulfillmentType(counterServiceMode || userRole === 'pedidos' ? 'pickup' : 'table')
                      setOrderSource(counterServiceMode ? 'local' : userRole === 'pedidos' ? 'whatsapp' : 'local')
                      setTableInfo('')
                      setTableId('')
                      setCustomerName('')
                      setCustomerPhone('')
                      setCustomerId('')
                      setDeliveryAddress('')
                      setExpectedPaymentMethod(null)
                      setEditingOrderId(null)
                      setShowCheckoutModal(false)
                    }

                    setIsSubmitting(false)
                    submitOrderRef.current = false
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <span>{editingOrderId ? 'Guardar Cambios' : 'Procesar Pedido'}</span>
                      <ArrowRight size={17} strokeWidth={2.5} />
                    </>
                  )}
                </button>

                {editingOrderId && (
                  <button
                    type="button"
                    className="w-full py-1 text-center text-xs font-bold text-amber-700 hover:text-amber-800 transition"
                    onClick={handleDiscardEdit}
                  >
                    Descartar edición
                  </button>
                )}
              </div>
          </Panel>
        </div>
      )}


      {/* Fast Payment Modal (QR, Cash change calculation & Mixed validation) */}
      {payingOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2.2rem] border border-line bg-white p-6 shadow-float space-y-4">
            <div>
              <h3 className="text-xl font-bold text-ink">Registrar Cobro Rapido</h3>
              <p className="text-sm text-muted">
                Pedido {payingOrder.displayNumber} · Total: <span className="font-extrabold text-ink">{formatCurrency(payingOrder.total)}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Metodo de Pago Realizado</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Efectivo' },
                  { id: 'qr', label: 'QR' },
                  { id: 'mixed', label: 'Mixto' },
                ].map((option) => {
                  const isActive = fastPayMethod === option.id

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-[0.9rem] border py-2 text-xs font-bold transition ${
                        isActive ? 'border-ink bg-ink text-white' : 'border-line bg-panel/85 text-ink hover:bg-panel'
                      }`}
                      onClick={() => {
                        setFastPayMethod(option.id as PaymentMethod)
                        setFastCashReceived('')
                        setFastCashSplit('')
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              {fastPayMethod === 'cash' ? (
                <div className="space-y-2 pt-2">
                  <label className="block">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recibido</div>
                    <input
                      className="w-full rounded-[0.8rem] border border-line bg-canvas/35 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent"
                      inputMode="decimal"
                      placeholder="0"
                      value={fastCashReceived}
                      onChange={(event) => setFastCashReceived(event.target.value)}
                    />
                  </label>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-muted">Cambio</span>
                    <span className="font-extrabold text-emerald-800 text-sm">{formatCurrency(fastChange)}</span>
                  </div>
                </div>
              ) : null}

              {fastPayMethod === 'mixed' ? (
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Efectivo</div>
                      <input
                        className="w-full rounded-[0.8rem] border border-line bg-canvas/35 px-2 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                        inputMode="decimal"
                        placeholder="0"
                        value={fastCashSplit}
                        onChange={(event) => setFastCashSplit(event.target.value)}
                      />
                    </label>
                    <div className="block">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Monto QR</div>
                      <div className="rounded-[0.8rem] border border-line bg-panel/80 px-2 py-1.5 text-xs font-semibold text-ink h-[34px] flex items-center">
                        {formatCurrency(fastQrAmount)}
                      </div>
                    </div>
                  </div>
                  <label className="block mt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Efectivo Recibido</div>
                    <input
                      className="w-full rounded-[0.8rem] border border-line bg-canvas/35 px-2 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                      inputMode="decimal"
                      placeholder="0"
                      value={fastCashReceived}
                      onChange={(event) => setFastCashReceived(event.target.value)}
                    />
                  </label>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted">Cambio</span>
                    <span className="font-extrabold text-emerald-800 text-sm">{formatCurrency(fastChange)}</span>
                  </div>
                </div>
              ) : null}

              {fastPayMethod === 'qr' ? (
                <div className="rounded-[0.8rem] bg-panel/80 p-3 text-xs">
                  <div className="text-muted font-semibold">Monto por QR</div>
                  <div className="mt-1 font-extrabold text-ink text-sm">{formatCurrency(payingOrder.total)}</div>
                </div>
              ) : null}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                fullWidth
                tone="success"
                disabled={!isFastPaymentValid}
                onClick={async () => {
                  if (operationsDisabled || paidOrderIds.current.has(payingOrder.id)) return
                  paidOrderIds.current.add(payingOrder.id)
                  try {
                    onConfirmDemoPayment?.(payingOrder.id, { method: fastPayMethod === 'qr' ? 'qr' : 'cash', received: effectiveFastCashReceived })
                    await onConfirmPayment(payingOrder.id, {
                      paymentStatus: 'paid',
                      paymentMethod: fastPayMethod,
                      payment: buildFastPaymentSummary(),
                      paidBy: userName,
                    })
                    setPayingOrder(null)
                  } catch (error) {
                    paidOrderIds.current.delete(payingOrder.id)
                    console.error('Failed to confirm fast payment:', error)
                  }
                }}
              >
                Confirmar Pago
              </Button>
              <button
                type="button"
                className="w-full rounded-[1.2rem] border border-line bg-panel text-ink hover:bg-line transition text-sm font-semibold"
                onClick={() => setPayingOrder(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Cancel Order Dialog Modal */}
      {cancellingOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2.2rem] border border-line bg-white p-6 shadow-float space-y-4">
            <div>
              <h3 className="text-xl font-bold text-ink">Anular Pedido</h3>
              <p className="text-sm text-muted">Esta seguro que desea anular el pedido {cancellingOrder.displayNumber}?</p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Motivo de Anulacion</label>
              <textarea
                className="w-full min-h-20 rounded-[1.2rem] border border-line bg-canvas/35 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="Ej. Cliente desistio del pedido, error al ingresar items..."
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-[1.2rem] py-3 text-sm font-bold transition shadow-md shadow-red-500/10"
                onClick={async () => {
                  try {
                    await onCancelOrder(cancellingOrder.id, userName, cancelReason)
                    setCancellingOrder(null)
                  } catch (error) {
                    console.error('Failed to cancel order:', error)
                  }
                }}
              >
                Confirmar Anulacion
              </button>
              <button
                type="button"
                className="w-full rounded-[1.2rem] border border-line bg-panel text-ink hover:bg-line transition py-3 text-sm font-semibold"
                onClick={() => setCancellingOrder(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Estilos para impresion termica y division de tickets */}
      {demandModalDelay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-accent">Gran demanda</div>
                <h2 className="mt-2 text-2xl font-black text-ink">Aumentar tiempo de preparacion</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-muted">Los pedidos nuevos de WhatsApp usaran este tiempo mientras dure la configuracion.</p>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-ink transition hover:bg-line" onClick={() => setDemandModalDelay(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="mt-5">
              <div className="text-sm font-black text-ink">Tiempo de preparacion</div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[15, 20, 25, 30, 35].map((mins) => (
                  <button key={mins} type="button" className={`rounded-2xl px-3 py-3 text-sm font-black transition ${demandModalDelay === mins ? 'bg-accent text-white shadow-sm' : 'bg-line/60 text-ink hover:bg-accentWash'}`} onClick={() => setDemandModalDelay(mins)}>
                    {mins} min
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <div className="text-sm font-black text-ink">Se aplicara durante</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: '15 min', value: 15 },
                  { label: '30 min', value: 30 },
                  { label: '1 hora', value: 60 },
                  { label: '2 horas', value: 120 },
                ].map((option) => (
                  <button key={option.value} type="button" className={`rounded-2xl px-3 py-3 text-sm font-black transition ${demandDurationMinutes === option.value ? 'bg-accent text-white shadow-sm' : 'bg-line/60 text-ink hover:bg-accentWash'}`} onClick={() => setDemandDurationMinutes(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Button tone="secondary" onClick={() => setDemandModalDelay(null)}>Cancelar</Button>
              <Button onClick={applyDemandDelay}>Aplicar horario</Button>
            </div>
          </div>
        </div>
      ) : null}

      {pauseOrdersModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-accent">WhatsApp</div>
                <h2 className="mt-2 text-2xl font-black text-ink">Pausar pedidos</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-muted">Mientras este pausado, el bot avisara que no estamos recibiendo pedidos por WhatsApp.</p>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-ink transition hover:bg-line" onClick={() => setPauseOrdersModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="mt-5">
              <div className="text-sm font-black text-ink">Cual es la razon</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Nos estamos retrasando', 'Evento o emergencia', 'Otro'].map((reason) => (
                  <button key={reason} type="button" className={`rounded-2xl px-4 py-3 text-sm font-black transition ${pauseReason === reason ? 'bg-accent text-white shadow-sm' : 'bg-line/60 text-ink hover:bg-accentWash'}`} onClick={() => setPauseReason(reason)}>
                    {reason}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <div className="text-sm font-black text-ink">Por cuanto tiempo</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Media hora', value: 30 },
                  { label: 'Hora', value: 60 },
                  { label: 'Dos horas', value: 120 },
                  { label: 'Final del dia', value: -1 },
                ].map((option) => (
                  <button key={option.value} type="button" className={`rounded-2xl px-3 py-3 text-sm font-black transition ${pauseDurationMinutes === option.value ? 'bg-accent text-white shadow-sm' : 'bg-line/60 text-ink hover:bg-accentWash'}`} onClick={() => setPauseDurationMinutes(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Button tone="secondary" onClick={() => setPauseOrdersModalOpen(false)}>No pausar</Button>
              <Button disabled={isTogglingWhatsappOrders} onClick={() => void confirmPauseWhatsappOrders()}>Pausar pedidos</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Caja imprime SOLO el ticket del cliente. El de cocina lo imprime la tablet de cocina
          en su propia impresora, asi que aca ya no se manda esa segunda hoja. */}
      <PrintableTicket order={printedOrder} variant="customer" onDone={() => setPrintedOrder(null)} />

      {saveSuccessMessage && (
        <div className="fixed top-5 right-5 z-[9999] flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-600 px-5 py-3.5 text-white shadow-2xl animate-bounce">
          <CheckCircle2 size={22} className="text-white shrink-0" />
          <div>
            <div className="text-sm font-black tracking-wide">{saveSuccessMessage}</div>
            <p className="text-[11px] text-emerald-100 font-semibold">El pedido se actualizo correctamente en el comandero.</p>
          </div>
        </div>
      )}
    </div>
  )
}
