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
  Truck,
  Coins,
  QrCode,
  Shuffle,
  CheckCircle2,
  Printer,
  AlertCircle,
  RotateCcw,
  PauseCircle,
  PlayCircle,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

function ProductVisual({ image, alt, badge }: { image: string; alt: string; badge?: string }) {
  return (
    <div className="relative h-24 sm:h-26 overflow-hidden">
      {isImageUrl(image) ? (
        <img alt={alt} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" src={image} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#fff1e8,#f7d7c8)] text-5xl">{image}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
      {badge ? (
        <div className="absolute bottom-2 right-2 rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-white shadow-md">
          {badge}
        </div>
      ) : null}
    </div>
  )
}

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
    tableInfo?: string
    customerName?: string
    customerPhone?: string
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(visibleCategories[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Checkout Payment State
  // Un pedido de WhatsApp arranca PENDIENTE DE PAGO y cae en "Cobros pendientes"; recien pasa a
  // pagado cuando alguien lo cobra de verdad. El de caja se cobra en el momento, asi que ese si
  // arranca en pagado.
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'gift'>(
    userRole === 'pedidos' ? 'pending' : 'paid',
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>('cash')
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null)
  const [expectedPaymentMethod, setExpectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [tableInfo, setTableInfo] = useState('')
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [cashSplitInput, setCashSplitInput] = useState('')

  // Fast Payment Modal State
  const [payingOrder, setPayingOrder] = useState<Order | null>(null)
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
  }, [])

  useEffect(() => {
    if (!demandDelayUntil) return undefined
    const interval = window.setInterval(() => {
      if (new Date(demandDelayUntil).getTime() <= Date.now()) {
        clearDemandDelay()
      }
    }, 15000)
    return () => window.clearInterval(interval)
  }, [demandDelayUntil])

  useEffect(() => {
    const el = document.getElementById('portal-header-controls')
    setPortalElement(el)
    const timer = setTimeout(() => {
      setPortalElement(document.getElementById('portal-header-controls'))
    }, 500)
    return () => clearTimeout(timer)
  }, [viewMode])

  useEffect(() => {
    if (!botApiUrl || !botAdminToken) return

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
  }, [])

  const activeCategory = visibleCategories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : (visibleCategories[0]?.id ?? '')

  const visibleProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.categoryId === activeCategory &&
            product.isActive &&
            product.isVisible &&
            product.availability === 'available',
        )
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [activeCategory, products],
  )

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
  const qrAmount = paymentMethod === 'mixed' ? Math.max(0, cartTotal - mixedCashAmount) : paymentMethod === 'qr' ? cartTotal : 0
  const cashAmount = paymentMethod === 'cash' ? cartTotal : paymentMethod === 'mixed' ? mixedCashAmount : 0
  const effectiveCashReceived = cashReceivedInput.trim() === '' ? cashAmount : cashReceived
  const change = paymentMethod === 'cash' || paymentMethod === 'mixed' ? Math.max(0, effectiveCashReceived - cashAmount) : 0
  const isPendingOrGift = paymentStatus === 'pending' || paymentStatus === 'gift'
  const isPaymentValid =
    isPendingOrGift
      ? cartTotal > 0
      : paymentMethod === 'qr'
        ? cartTotal > 0
        : paymentMethod === 'cash'
          ? cartTotal > 0
          : paymentMethod === 'mixed'
            ? cashAmount > 0 && qrAmount > 0
            : false

  // La direccion del delivery es opcional: muchas veces el cliente manda la ubicacion por
  // WhatsApp y quien carga el pedido a mano no la tiene a mano en ese momento.
  const isDeliveryInfoValid = true

  const buildPaymentSummary = (): PaymentSummary => ({
    method: paymentMethod || 'cash',
    cashAmount: isPendingOrGift ? 0 : cashAmount,
    qrAmount: isPendingOrGift ? 0 : qrAmount,
    cashReceived: isPendingOrGift ? 0 : (paymentMethod === 'qr' ? 0 : effectiveCashReceived),
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

  const canManagePayments = userRole === 'admin' || userRole === 'caja' || userRole === 'demo'
  const canManageOrders = userRole === 'admin' || userRole === 'caja' || userRole === 'demo'

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
    setOrderSource(order.orderSource || 'local')
    setFulfillmentType(order.fulfillmentType || (order.orderType === 'delivery' ? 'delivery' : 'table'))
    setTableInfo(order.tableInfo || '')
    setCustomerName(order.customerName || '')
    setCustomerPhone(order.customerPhone || '')
    setDeliveryAddress(order.deliveryAddress || '')
    setPaymentStatus(order.paymentStatus)
    setPaymentMethod(order.paymentMethod || null)
    setExpectedPaymentMethod(order.expectedPaymentMethod || null)

    if (order.paymentStatus === 'paid' && order.payment) {
      setCashReceivedInput(String(order.payment.cashReceived || ''))
      setCashSplitInput(String(order.payment.cashAmount || ''))
    } else {
      setCashReceivedInput('')
      setCashSplitInput('')
    }
    setViewMode('new_order')
    setActiveTab('cart')
    setShowCheckoutModal(true)
  }

  const handleDiscardEdit = () => {
    setEditingOrderId(null)
    setCartItems([])
    setFulfillmentType(userRole === 'pedidos' ? 'pickup' : 'table')
    setOrderSource(userRole === 'pedidos' ? 'whatsapp' : 'local')
    setCustomerName('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setTableInfo('')
    setPaymentStatus(userRole === 'pedidos' ? 'pending' : 'paid')
    setPaymentMethod('cash')
    setExpectedPaymentMethod(null)
    setCashReceivedInput('')
    setCashSplitInput('')
    setShowCheckoutModal(false)
  }

  const controlsContent = (
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
  )

  return (
    <div className={`space-y-4 ${showCheckoutModal && viewMode === 'new_order' ? 'lg:pr-[430px]' : ''}`}>
      {portalElement ? createPortal(controlsContent, portalElement) : null}
      {/* Top View Mode Switcher */}
      <div className="flex flex-wrap justify-between items-center gap-4 border-b border-line pb-4">
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

      {/* Responsive layout selector for mobile */}
      <div className="flex gap-2 rounded-2xl bg-white/70 p-1.5 shadow-insetSoft border border-white/80 lg:hidden">
        <button
          className={`flex-1 rounded-[1.15rem] py-3 text-center text-sm font-bold transition ${
            activeTab === 'catalog'
              ? 'bg-ink text-white shadow-card'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => setActiveTab('catalog')}
        >
          Productos
        </button>
        <button
          className={`flex-1 rounded-[1.15rem] py-3 text-center text-sm font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'cart'
              ? 'bg-ink text-white shadow-card'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => setActiveTab('cart')}
        >
          <span>Carrito</span>
          {cartItems.length > 0 ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-black text-white">
              {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          ) : null}
        </button>
      </div>

      <div className="w-full space-y-5">
        
        {/* Main Panel Section */}
        <section className="w-full space-y-5">
          {viewMode === 'new_order' ? (
            <>
              {/* POS Categories & Catalog */}
              <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto no-scrollbar">
                {visibleCategories.map((category) => {
                  const isActive = category.id === activeCategory

                  return (
                    <button
                      key={category.id}
                      className={`px-4 py-2 rounded-full text-xs font-black tracking-wider transition shrink-0 shadow-sm ${
                        isActive
                          ? 'bg-ink text-white'
                          : 'bg-white border border-line text-ink hover:bg-panel'
                      }`}
                      onClick={() => setSelectedCategoryId(category.id)}
                    >
                      <span className="mr-1">{category.emoji}</span>
                      {category.name.toUpperCase()}
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3 min-[1850px]:grid-cols-4">
                {visibleProducts.map((product) => (
                  <Panel
                    key={product.id}
                    className="group overflow-hidden border-slate-800 bg-[#1e1e2d] text-white transition duration-200 hover:-translate-y-0.5 hover:shadow-float flex flex-col justify-between rounded-xl"
                  >
                    <ProductVisual alt={product.name} badge={product.badge} image={product.image} />

                    <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate" title={product.name}>
                          {product.name}
                        </h3>
                      </div>
                      
                      <Button
                        className="w-full px-2.5 py-1.5 h-8 text-[11px] font-black rounded-lg bg-accent hover:bg-accent/95 text-white flex items-center justify-between shadow-sm shrink-0"
                        onClick={() => {
                          const nextItem = buildCartItem(product)
                          setCartItems((currentItems) => [...currentItems, nextItem])
                          setExpandedLineId(nextItem.lineId)
                          setActiveTab('cart')
                          setShowCheckoutModal(true)
                        }}
                      >
                        <span className="flex items-center gap-1">
                          <Plus size={12} />
                          Agregar
                        </span>
                        <span className="bg-black/35 border border-white/15 text-white px-2 py-0.5 rounded-md text-[10px] font-black tracking-tight">
                          {formatCurrency(product.price)}
                        </span>
                      </Button>
                    </div>
                  </Panel>
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

                              <button
                                type="button"
                                className="flex items-center justify-center p-1.5 border border-line bg-panel text-muted hover:text-ink rounded-lg text-[10px] font-black transition"
                                onClick={() => handleEditOrder(order)}
                              >
                                <FileEdit size={12} />
                              </button>

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

                              <button
                                type="button"
                                className="flex items-center justify-center p-1.5 border border-line bg-panel text-muted hover:text-ink rounded-lg text-[10px] font-black transition"
                                onClick={() => handleEditOrder(order)}
                              >
                                <FileEdit size={12} />
                              </button>

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

      {/* Boton flotante para reabrir el carrito cuando hay productos y el modal esta cerrado */}
      {cartItems.length > 0 && !showCheckoutModal && (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-40 bg-accent hover:bg-accent/90 text-white font-black px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 transition transform hover:scale-105 active:scale-95 border border-white/20"
          onClick={() => setShowCheckoutModal(true)}
        >
          <ShoppingBag size={18} />
          <span>VER CARRITO / COBRAR ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})</span>
        </button>
      )}

      {/* Modal emergente de checkout de doble columna (horizontal y vertical grande) */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm lg:pointer-events-none lg:left-auto lg:right-4 lg:top-5 lg:bottom-5 lg:w-[400px] xl:w-[420px] lg:items-stretch lg:justify-end lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
          <Panel className="w-full max-w-xl h-[92vh] bg-[#fffdfb] rounded-[1.5rem] shadow-float overflow-hidden flex flex-col border border-line lg:pointer-events-auto lg:h-full lg:max-w-none lg:rounded-[1.5rem]">

            {/* Header compacto */}
            <div className="border-b border-line px-3 py-1.5 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent">CONFIRMAR PEDIDO</p>
                <div className="rounded-md border border-line bg-accentWash px-2 py-0.5 flex items-center gap-1 shadow-insetSoft">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted">TICKET</span>
                  <span className="text-xs font-black text-ink">{nextOrderNumber}</span>
                </div>
                {editingOrderId ? <span className="text-[9px] bg-orange-100 text-orange-900 px-2 py-0.5 rounded-full font-black">EDITANDO</span> : null}
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-muted hover:bg-line transition"
                onClick={() => setShowCheckoutModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Cuerpo scrollable — cart items + checkout form todo junto */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* Items del carrito */}
              <div className="p-2 space-y-2">
                {cartItems.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-lineStrong bg-canvas/60 p-5 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-accent shadow-insetSoft">
                      <CookingPot size={22} />
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-ink">Sin productos</h3>
                    <p className="mt-1 text-xs text-muted">Agrega productos para armar el pedido.</p>
                  </div>
                ) : null}

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
                    <article
                      key={item.lineId}
                      className={`rounded-[0.9rem] border bg-white p-2 transition duration-150 ${isExpanded ? 'border-accent/20 shadow-card' : 'border-line'}`}
                    >
                      <div className="flex items-start gap-2.5">
                        {isImageUrl(product.image) ? (
                          <img alt={product.name} className="h-10 w-10 rounded-lg object-cover shrink-0" src={product.image} />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accentWash text-xl shrink-0">{product.image}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-[11px] font-bold text-ink truncate">{product.name}</h3>
                              <p className="mt-0.5 text-[11px] text-muted">{formatCurrency(product.price)}</p>
                            </div>
                            <button
                              type="button"
                              className="rounded-full p-1.5 text-muted transition hover:bg-accentWash hover:text-accent shrink-0"
                              onClick={() => removeItem(item.lineId)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between border-t border-line pt-1.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded-lg border border-line bg-panel text-ink transition hover:bg-line active:scale-95"
                                onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, quantity: Math.max(1, cur.quantity - 1) }))}
                              >
                                <Minus size={11} />
                              </button>
                              <span className="w-6 text-center text-xs font-semibold text-ink">{item.quantity}</span>
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded-lg border border-line bg-panel text-ink transition hover:bg-line active:scale-95"
                                onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, quantity: cur.quantity + 1 }))}
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                            <span className="text-xs font-bold text-ink">{formatCurrency(lineTotal)}</span>
                          </div>

                          {/* Toggle modificadores — solo para hamburguesas */}
                          {product.categoryId === 'hamburguesas' ? (
                            <div className="mt-1 flex justify-between items-center border-t border-dashed border-line pt-1">
                              <button
                                type="button"
                                className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${isExpanded ? 'bg-accentWash text-accent' : 'bg-panel text-muted hover:text-ink'}`}
                                onClick={() => setExpandedLineId(isExpanded ? null : item.lineId)}
                              >
                                <span>Modificadores</span>
                                <ChevronDown size={11} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                              {hasModifiers && !isExpanded ? (
                                <span className="text-[9px] text-accent font-black bg-accentWash px-2 py-0.5 rounded-md">Configurado</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Panel expandido — solo para hamburguesas */}
                      {isExpanded && product.categoryId === 'hamburguesas' ? (
                        <div className="mt-2 space-y-2.5 border-t border-line pt-2">
                          {product.options?.length ? (
                            <div>
                              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted">Modificadores</p>
                              <div className="flex flex-wrap gap-1.5">
                                {product.options.map((option) => {
                                  const label = simplifyModifierLabel(option.label)
                                  if (!label) return null
                                  const isSelected = selectedOptions.includes(label)
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      className={`rounded-full px-2 py-0.5 text-[11px] transition font-semibold ${isSelected ? 'bg-accent text-white shadow-sm' : 'bg-canvas text-ink hover:bg-accentSoft'}`}
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
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">Adicionales / Extras</p>
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
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                  {uniqueExtras.map((extra) => {
                                    const count = selectedExtras.filter((x) => x.id === extra.id).length
                                    return (
                                      <div key={extra.id} className="flex items-center justify-between bg-canvas/30 px-2 py-1 rounded-xl border border-line">
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-[11px] font-semibold text-ink truncate">{extra.name}</span>
                                          <span className="text-[9px] text-muted font-bold">{formatCurrency(extra.price)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {count > 0 ? (
                                            <>
                                              <button
                                                type="button"
                                                className="flex h-5 w-5 items-center justify-center rounded-md border border-line bg-panel text-ink hover:bg-line transition active:scale-90"
                                                onClick={() => updateItem(item.lineId, (cur) => {
                                                  const idx = cur.modifiers.extras.findIndex((x) => x.id === extra.id)
                                                  if (idx === -1) return cur
                                                  const next = [...cur.modifiers.extras]
                                                  next.splice(idx, 1)
                                                  return { ...cur, modifiers: { ...cur.modifiers, extras: next } }
                                                })}
                                              >
                                                <Minus size={10} />
                                              </button>
                                              <span className="w-3 text-center text-[11px] font-black text-ink">{count}</span>
                                              <button
                                                type="button"
                                                className="flex h-5 w-5 items-center justify-center rounded-md border border-line bg-panel text-ink hover:bg-line transition active:scale-90"
                                                onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, modifiers: { ...cur.modifiers, extras: [...cur.modifiers.extras, extra] } }))}
                                              >
                                                <Plus size={10} />
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              type="button"
                                              className="flex h-5 px-2 items-center justify-center rounded-md border border-accent bg-accentWash text-[10px] font-black text-accent hover:bg-accent hover:text-white transition active:scale-95"
                                              onClick={() => updateItem(item.lineId, (cur) => ({ ...cur, modifiers: { ...cur.modifiers, extras: [...cur.modifiers.extras, extra] } }))}
                                            >
                                              <Plus size={10} className="mr-0.5" />
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
                            <label className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                              <MessageSquareText size={11} />
                              Observacion para cocina
                            </label>
                            <textarea
                              className="min-h-10 w-full rounded-xl border border-line bg-canvas/35 px-3 py-2 text-xs text-ink outline-none transition placeholder:text-muted focus:border-accent"
                              placeholder="Ej. salsa aparte, sin cebolla..."
                              value={item.modifiers.note}
                              onChange={(e) => updateItem(item.lineId, (cur) => ({ ...cur, modifiers: { ...cur.modifiers, note: e.target.value } }))}
                            />
                          </div>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              {/* Separador */}
              <div className="mx-3 my-1 border-t border-dashed border-line" />

              {/* Formulario de checkout embebido */}
              <div className="px-3 pb-3 space-y-2">

                {/* Origen */}
                {userRole !== 'pedidos' ? (
                  <div className="rounded-[0.9rem] border border-line bg-white p-2 shadow-sm">
                    <div className="text-[9px] font-black uppercase tracking-wider text-muted mb-1.5">Origen</div>
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
                            className={`rounded-[0.7rem] border py-1.5 text-[11px] font-black transition flex items-center justify-center gap-1.5 ${isActive
                              ? option.id === 'local'
                                ? 'border-[#3b82f6] bg-[#3b82f6] text-white shadow-sm'
                                : 'border-[#10b981] bg-[#10b981] text-white shadow-sm'
                              : 'border-line bg-panel/80 text-ink hover:bg-panel'}`}
                            onClick={() => {
                              setOrderSource(option.id as 'local' | 'whatsapp')
                              setFulfillmentType(option.id === 'local' ? 'table' : 'pickup')
                              setPaymentStatus(option.id === 'whatsapp' ? 'pending' : 'paid')
                            }}
                          >
                            <Icon size={13} />
                            {option.label.toUpperCase()}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Entrega */}
                <div className="rounded-[0.9rem] border border-line bg-white p-2 shadow-sm">
                  <div className="text-[9px] font-black uppercase tracking-wider text-muted mb-1.5">Entrega</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(() => {
                      const options: Array<{ id: FulfillmentType; label: string; icon: typeof Utensils; disabled?: boolean }> = [
                        { id: 'table', label: 'Mesa', icon: Utensils, disabled: userRole === 'pedidos' || orderSource === 'whatsapp' },
                        { id: 'pickup', label: 'Retiro', icon: ShoppingBag },
                        // Faltaba: un pedido de WhatsApp cargado a mano (bot apagado o corrigiendo
                        // algo) solo se podia guardar como retiro, aunque fuera para envio.
                        { id: 'delivery', label: 'Delivery', icon: Truck },
                      ]
                      return options.map((option) => {
                        if (option.disabled) return null
                        const isActive = fulfillmentType === option.id
                        const Icon = option.icon
                        let activeStyles = 'border-ink bg-ink text-white shadow-sm'
                        if (option.id === 'table') activeStyles = 'border-[#6366f1] bg-[#6366f1] text-white shadow-sm'
                        else if (option.id === 'pickup') activeStyles = 'border-[#d97706] bg-[#d97706] text-white shadow-sm'
                        else if (option.id === 'delivery') activeStyles = 'border-[#0ea5e9] bg-[#0ea5e9] text-white shadow-sm'
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`rounded-[0.7rem] border py-1.5 text-[11px] font-black transition flex items-center justify-center gap-1.5 ${isActive ? activeStyles : 'border-line bg-panel/80 text-ink hover:bg-panel'}`}
                            onClick={() => setFulfillmentType(option.id)}
                          >
                            <Icon size={13} />
                            {option.label.toUpperCase()}
                          </button>
                        )
                      })
                    })()}
                  </div>
                  {fulfillmentType === 'table' ? (
                    <div className="mt-1.5">
                      <input
                        className="w-full rounded-[0.7rem] border border-line bg-canvas/35 px-3 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                        placeholder="Mesa (ej: 4, Terraza 2)"
                        value={tableInfo}
                        onChange={(e) => setTableInfo(e.target.value)}
                      />
                    </div>
                  ) : null}
                </div>

                {/* Contacto */}
                <div className="rounded-[0.9rem] border border-line bg-white p-2 shadow-sm space-y-1.5">
                  <div className="text-[9px] font-black uppercase tracking-wider text-muted">Datos de Contacto</div>
                  <input
                    className="w-full rounded-[0.7rem] border border-line bg-canvas/35 px-3 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                    placeholder="Nombre del Cliente (opcional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  {(orderSource === 'whatsapp' || fulfillmentType === 'delivery') ? (
                    <input
                      className="w-full rounded-[0.7rem] border border-line bg-canvas/35 px-3 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                      placeholder="Telefono (opcional)"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  ) : null}
                  {fulfillmentType === 'delivery' ? (
                    <>
                      <textarea
                        className="w-full min-h-[42px] rounded-[0.7rem] border border-line bg-canvas/35 px-3 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                        placeholder="Direccion o link de ubicacion (opcional)"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                      />
                    </>
                  ) : null}
                </div>

                {/* Estado de pago */}
                <div className="rounded-[0.9rem] border border-line bg-white p-2 shadow-sm">
                  <div className="text-[9px] font-black uppercase tracking-wider text-muted mb-1.5">Estado de Pago</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'paid', label: 'Pagado' },
                      { id: 'pending', label: 'Pendiente' },
                      { id: 'gift', label: 'Regalo' },
                    ].map((option) => {
                      const isActive = paymentStatus === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`rounded-[0.7rem] border py-1.5 text-[11px] font-black transition ${isActive
                            ? option.id === 'paid'
                              ? 'border-[#10b981] bg-[#10b981] text-white shadow-sm'
                              : option.id === 'pending'
                                ? 'border-[#ef4444] bg-[#ef4444] text-white shadow-sm'
                                : 'border-[#8b5cf6] bg-[#8b5cf6] text-white shadow-sm'
                            : 'border-line bg-panel/80 text-ink hover:bg-panel'}`}
                          onClick={() => {
                            setPaymentStatus(option.id as 'paid' | 'pending' | 'gift')
                            if (option.id === 'pending' || option.id === 'gift') setPaymentMethod(null)
                            else setPaymentMethod('cash')
                          }}
                        >
                          {option.label.toUpperCase()}
                        </button>
                      )
                    })}
                  </div>

                  {paymentStatus === 'paid' ? (
                    <div className="mt-2 border-t border-dashed border-line pt-2 space-y-1.5">
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted">Metodo de Pago</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'cash', label: 'Efectivo', icon: Coins },
                          { id: 'qr', label: 'QR', icon: QrCode },
                          { id: 'mixed', label: 'Mixto', icon: Shuffle },
                        ].map((option) => {
                          const isActive = paymentMethod === option.id
                          const Icon = option.icon
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`rounded-[0.7rem] border py-1.5 text-[11px] font-black transition flex items-center justify-center gap-1 ${isActive ? 'border-[#10b981] bg-[#10b981] text-white shadow-sm' : 'border-line bg-panel/80 text-ink hover:bg-panel'}`}
                              onClick={() => setPaymentMethod(option.id as PaymentMethod)}
                            >
                              <Icon size={12} />
                              {option.label.toUpperCase()}
                            </button>
                          )
                        })}
                      </div>

                      {paymentMethod === 'cash' ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-[0.7rem] border border-line bg-canvas/35 px-3 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                            inputMode="decimal"
                            placeholder="Efectivo recibido (opcional)"
                            value={cashReceivedInput}
                            onChange={(e) => setCashReceivedInput(e.target.value)}
                          />
                          <div className="text-xs font-black text-ink shrink-0">Cambio: {formatCurrency(change)}</div>
                        </div>
                      ) : null}

                      {paymentMethod === 'mixed' ? (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                              <div className="mb-1 text-[9px] font-black uppercase tracking-wider text-muted">Efectivo</div>
                              <input
                                className={`w-full rounded-[0.7rem] border bg-canvas/35 px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent ${cashAmount === 0 ? 'border-red-300' : 'border-line'}`}
                                inputMode="decimal"
                                placeholder="0"
                                value={cashSplitInput}
                                onChange={(e) => setCashSplitInput(e.target.value)}
                              />
                            </label>
                            <div className="block">
                              <div className="mb-1 text-[9px] font-black uppercase tracking-wider text-muted">Monto QR</div>
                              <div className="rounded-[0.7rem] border border-line bg-panel/80 px-2 py-1.5 text-xs font-bold text-ink">{formatCurrency(qrAmount)}</div>
                            </div>
                          </div>
                          {cashAmount === 0 ? <span className="text-[9px] text-red-500 font-bold block px-1">Efectivo debe ser mayor a 0</span> : null}
                          <div className="flex items-center gap-2">
                            <input
                              className="flex-1 rounded-[0.7rem] border border-line bg-canvas/35 px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
                              inputMode="decimal"
                              placeholder="Efectivo recibido (opcional)"
                              value={cashReceivedInput}
                              onChange={(e) => setCashReceivedInput(e.target.value)}
                            />
                            <div className="text-xs font-black text-ink shrink-0">Cambio: {formatCurrency(change)}</div>
                          </div>
                        </div>
                      ) : null}

                      {paymentMethod === 'qr' ? (
                        <div className="rounded-[0.7rem] bg-panel/80 px-3 py-1.5 text-xs flex justify-between items-center">
                          <span className="text-muted font-semibold">Monto por QR</span>
                          <span className="font-black text-ink">{formatCurrency(cartTotal)}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 border-t border-dashed border-line pt-2 space-y-1.5">
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted">Metodo Esperado</div>
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
                              className={`rounded-[0.7rem] border py-1.5 text-[11px] font-black transition flex items-center justify-center gap-1 ${isActive ? 'border-[#10b981] bg-[#10b981] text-white shadow-sm' : 'border-line bg-panel/80 text-ink hover:bg-panel'}`}
                              onClick={() => setExpectedPaymentMethod(option.id as PaymentMethod)}
                            >
                              <Icon size={12} />
                              {option.label.toUpperCase()}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer fijo compacto: total + enviar */}
            <div className="border-t border-line bg-white px-3 py-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-[9px] font-black uppercase text-muted tracking-wider">Productos</div>
                      <div className="text-xs font-black text-ink">{totalUnits} uds</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black uppercase text-muted tracking-wider">Total</div>
                      <div className="text-sm font-black text-accent">{formatCurrency(cartTotal)}</div>
                    </div>
                  </div>
                </div>

                {editingOrderId && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 transition text-xs font-bold text-orange-950 shrink-0"
                    onClick={handleDiscardEdit}
                  >
                    Descartar
                  </button>
                )}

                <Button
                  size="lg"
                  className="shadow-xl shadow-accent/20 shrink-0"
                  disabled={cartItems.length === 0 || isSubmitting || !isPaymentValid || !isDeliveryInfoValid}
                  onClick={async () => {
                    setIsSubmitting(true)
                    // Las reglas de Firestore exigen nombre, telefono y direccion NO vacios en los
                    // pedidos de delivery, y nombre y telefono en los de WhatsApp. Si falta alguno
                    // rechazan el pedido entero con "Missing or insufficient permissions", que no
                    // le dice nada a quien lo esta cargando. Como se pidio que la direccion fuera
                    // opcional, cuando no la escriben se guarda un texto claro en lugar de dejarla
                    // vacia: el pedido entra igual y quien lo lleva ve que hay que coordinarla.
                    const necesitaDatosDeContacto = fulfillmentType === 'delivery' || orderSource === 'whatsapp'
                    const nombreFinal = customerName.trim() || (necesitaDatosDeContacto ? 'Cliente' : '')
                    const telefonoFinal = customerPhone.trim() || (necesitaDatosDeContacto ? 'Sin telefono' : '')
                    const direccionFinal =
                      deliveryAddress.trim() ||
                      (fulfillmentType === 'delivery' ? 'Sin direccion: coordinar con el cliente' : '')

                    const payload = {
                      cartItems,
                      productsById,
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
                      setPaymentStatus('paid')
                      setPaymentMethod('cash')
                      setCashReceivedInput('')
                      setCashSplitInput('')
                      setFulfillmentType(userRole === 'pedidos' ? 'pickup' : 'table')
                      setOrderSource(userRole === 'pedidos' ? 'whatsapp' : 'local')
                      setTableInfo('')
                      setCustomerName('')
                      setCustomerPhone('')
                      setDeliveryAddress('')
                      setExpectedPaymentMethod(null)
                      setEditingOrderId(null)
                      setActiveTab('catalog')
                      setShowCheckoutModal(false)
                    }

                    setIsSubmitting(false)
                  }}
                >
                  {isSubmitting ? <LoaderCircle size={16} className="animate-spin" /> : <CookingPot size={16} />}
                  {isSubmitting ? 'Guardando...' : editingOrderId ? 'Guardar' : 'Enviar a cocina'}
                </Button>
              </div>
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
                  try {
                    await onConfirmPayment(payingOrder.id, {
                      paymentStatus: 'paid',
                      paymentMethod: fastPayMethod,
                      payment: buildFastPaymentSummary(),
                      paidBy: userName,
                    })
                    setPayingOrder(null)
                  } catch (error) {
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
