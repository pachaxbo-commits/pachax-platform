import {
  Clock3,
  ChefHat,
  Check,
  ShoppingBag,
  Package,
  Truck,
  CheckCircle2,
  Ban,
  Store,
  MessageSquare,
  Utensils,
  Coins,
  QrCode,
  Shuffle,
  AlertCircle,
  Gift,
} from 'lucide-react'
import type { FulfillmentType, OrderSource, OrderStatus } from '../../types'

const styles: Record<OrderStatus, string> = {
  pending: 'border border-[#f0cfbf] bg-[#fff3ec] text-[#9c4d2a]',
  preparing: 'border border-[#ead7ad] bg-warningSoft text-warning',
  ready: 'border border-[#cfe2d6] bg-successSoft text-success',
  ready_for_pickup: 'border border-[#c5d9e8] bg-[#eef5fb] text-[#2a6b9c]',
  ready_for_dispatch: 'border border-[#c5d9e8] bg-[#eef5fb] text-[#2a6b9c]',
  out_for_delivery: 'border border-[#d8cde8] bg-[#f3eefb] text-[#6b3fa0]',
  delivered: 'border border-[#d5dbeb] bg-[#eef2fb] text-[#39518a]',
  cancelled: 'border border-[#ecc6c6] bg-[#fdf3f3] text-[#c93b3b]',
}

const labels: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  preparing: 'En preparacion',
  ready: 'Listo',
  ready_for_pickup: 'Listo para retirar',
  ready_for_dispatch: 'Listo para despachar',
  out_for_delivery: 'En delivery',
  delivered: 'Entregado',
  cancelled: 'Anulado',
}

const statusIcons: Record<OrderStatus, typeof Clock3> = {
  pending: Clock3,
  preparing: ChefHat,
  ready: Check,
  ready_for_pickup: ShoppingBag,
  ready_for_dispatch: Package,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
  cancelled: Ban,
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const Icon = statusIcons[status] || Clock3
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] ?? styles.pending}`}>
      <Icon size={12} className="shrink-0" />
      {labels[status] ?? status}
    </span>
  )
}

const sourceLabels: Record<OrderSource, string> = {
  local: 'LOCAL',
  whatsapp: 'WHATSAPP',
}

const sourceStyles: Record<OrderSource, string> = {
  local: 'bg-slate-100 border-slate-200 text-slate-700',
  whatsapp: 'bg-emerald-50 border-emerald-200 text-emerald-800',
}

const sourceIcons: Record<OrderSource, typeof Store> = {
  local: Store,
  whatsapp: MessageSquare,
}

export function SourceBadge({ source }: { source: OrderSource }) {
  const Icon = sourceIcons[source] || Store
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black uppercase tracking-wider ${sourceStyles[source] ?? sourceStyles.local}`}>
      <Icon size={13} className="shrink-0" />
      {sourceLabels[source] ?? 'LOCAL'}
    </span>
  )
}

const fulfillmentLabels: Record<FulfillmentType, string> = {
  table: 'MESA',
  pickup: 'RETIRO',
  delivery: 'DELIVERY',
}

const fulfillmentStyles: Record<FulfillmentType, string> = {
  table: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  pickup: 'bg-amber-50 border-amber-200 text-amber-800',
  delivery: 'bg-pink-50 border-pink-200 text-pink-850',
}

const fulfillmentIcons: Record<FulfillmentType, typeof Utensils> = {
  table: Utensils,
  pickup: ShoppingBag,
  delivery: Truck,
}

export function FulfillmentBadge({ type, tableInfo }: { type: FulfillmentType; tableInfo?: string }) {
  const Icon = fulfillmentIcons[type] || Utensils
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1 text-xs font-black uppercase tracking-wider ${fulfillmentStyles[type] ?? fulfillmentStyles.table}`}>
      <Icon size={13} className="shrink-0" />
      {type === 'table' ? `MESA ${tableInfo || 'N/D'}` : fulfillmentLabels[type]}
    </span>
  )
}

export function PaymentBadge({ paymentStatus, paymentMethod }: { paymentStatus: 'paid' | 'pending' | 'gift'; paymentMethod?: string | null }) {
  if (paymentStatus === 'gift') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-50 border border-purple-250 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-purple-850">
        <Gift size={13} className="shrink-0" />
        REGALO
      </span>
    )
  }

  if (paymentStatus === 'paid') {
    const method = paymentMethod || 'cash'
    let Icon = Coins
    let label = 'EFECTIVO'
    if (method === 'qr') {
      Icon = QrCode
      label = 'QR'
    } else if (method === 'mixed') {
      Icon = Shuffle
      label = 'MIXTO'
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-250 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-850">
        <Icon size={13} className="shrink-0" />
        PAGADO · {label}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-rose-800">
      <AlertCircle size={13} className="shrink-0" />
      PENDIENTE DE PAGO
    </span>
  )
}
