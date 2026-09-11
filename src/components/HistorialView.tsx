import { Download, Filter, ScrollText, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { downloadTextFile, formatCurrency, formatDateTime, formatPaymentMethod, formatTime } from '../lib/format'
import type { Order, OrderStatus } from '../types'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'
import { StatusPill, SourceBadge, FulfillmentBadge, PaymentBadge } from './ui/StatusPill'

const filterOptions: Array<{ value: 'all' | OrderStatus; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'preparing', label: 'En preparacion' },
  { value: 'ready', label: 'Listos' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Anulados' },
]

function getTodayKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDayKeyLocal(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function getOrderSaleAmount(order: Order) {
  if (order.paymentStatus === 'gift') return 0
  return order.productSubtotal ?? order.total
}


function isDateInRange(orderDateStr: string | Date | undefined, referenceDayStr: string, range: 'day' | 'week' | 'month') {
  if (!orderDateStr) return false
  const orderDate = new Date(orderDateStr)
  if (isNaN(orderDate.getTime())) return false

  const refDate = parseDayKeyLocal(referenceDayStr)
  if (!refDate || isNaN(refDate.getTime())) return false

  const orderMidnight = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate())
  const refMidnight = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate())

  if (range === 'day') {
    return orderMidnight.getTime() === refMidnight.getTime()
  }

  if (range === 'week') {
    const sevenDaysAgo = new Date(refMidnight)
    sevenDaysAgo.setDate(refMidnight.getDate() - 7)
    return orderMidnight.getTime() <= refMidnight.getTime() && orderMidnight.getTime() > sevenDaysAgo.getTime()
  }

  if (range === 'month') {
    return orderMidnight.getFullYear() === refMidnight.getFullYear() && orderMidnight.getMonth() === refMidnight.getMonth()
  }

  return false
}

export function HistorialView({
  orders,
  onAdvanceStatus,
  onCancelOrder,
  userName,
  userRole,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onCancelOrder: (orderId: string, cancelledBy: string, reason?: string) => Promise<boolean>
  userName: string
  userRole: string
}) {
  const dayOptions = useMemo(() => {
    const options: string[] = []
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      options.push(`${year}-${month}-${day}`)
    }
    return options
  }, [])

  const [selectedDayKey, setSelectedDayKey] = useState<string>(dayOptions[0] ?? getTodayKey())
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('day')
  const [filter, setFilter] = useState<'all' | OrderStatus>('all')
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  const selectedDayOrders = useMemo(() => {
    return orders.filter((order) => {
      const createdInRange = isDateInRange(order.createdAt, selectedDayKey, timeRange)
      const paidInRange = order.paymentStatus === 'paid' && (isDateInRange(order.paidAt, selectedDayKey, timeRange) || (!order.paidAt && createdInRange))
      return createdInRange || paidInRange
    })
  }, [orders, selectedDayKey, timeRange])

  const filteredOrders = useMemo(
    () => (filter === 'all' ? selectedDayOrders : selectedDayOrders.filter((order) => order.status === filter)),
    [filter, selectedDayOrders],
  )

  const summary = useMemo(() => {
    // Pedidos activos creados en el rango seleccionado
    const activeCreatedOrders = orders.filter((order) => order.status !== 'cancelled' && isDateInRange(order.createdAt, selectedDayKey, timeRange))
    
    // Pedidos activos pagados en el rango seleccionado (para caja)
    const activePaidOrders = orders.filter((order) => {
      if (order.status === 'cancelled') return false
      if (order.paymentStatus !== 'paid') return false
      const paidDay = order.paidAt
      if (paidDay) {
        return isDateInRange(paidDay, selectedDayKey, timeRange)
      }
      return isDateInRange(order.createdAt, selectedDayKey, timeRange)
    })

    // Pedidos activos con cobro pendiente creados en el rango seleccionado
    const activePendingPaymentOrders = activeCreatedOrders.filter((order) => order.paymentStatus === 'pending')

    const mostSoldMap = new Map<string, number>()
    activeCreatedOrders.forEach((order) => {
      order.items.forEach((item) => {
        mostSoldMap.set(item.name, (mostSoldMap.get(item.name) ?? 0) + item.quantity)
      })
    })

    const topProducts = [...mostSoldMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([name, quantity]) => ({ name, quantity }))

    // Totales de pago usando solo pedidos pagados en el rango seleccionado
    const paymentTotals = activePaidOrders.reduce(
      (accumulator, order) => {
        accumulator.cashSales += order.payment.cashAmount
        accumulator.qrSales += order.payment.qrAmount
        accumulator.cashReceived += order.payment.cashReceived
        accumulator.change += order.payment.change
        if (order.payment.method === 'mixed') {
          accumulator.mixedCount += 1
        }
        return accumulator
      },
      {
        cashSales: 0,
        qrSales: 0,
        cashReceived: 0,
        change: 0,
        mixedCount: 0,
      },
    )

    const totalSales = activeCreatedOrders.reduce((sum, order) => sum + getOrderSaleAmount(order), 0)
    const paidSales = activePaidOrders.reduce((sum, order) => sum + getOrderSaleAmount(order), 0)
    const pendingPaymentTotal = activePendingPaymentOrders.reduce((sum, order) => sum + getOrderSaleAmount(order), 0)

    const deliveredCount = activeCreatedOrders.filter((order) => order.status === 'delivered').length

    return {
      totalSales,
      paidSales,
      pendingPaymentTotal,
      pendingPaymentCount: activePendingPaymentOrders.length,
      orderCount: activeCreatedOrders.length,
      averageTicket: activePaidOrders.length ? paidSales / activePaidOrders.length : 0,
      pending: activeCreatedOrders.filter((order) => order.status === 'pending').length,
      preparing: activeCreatedOrders.filter((order) => order.status === 'preparing').length,
      ready: activeCreatedOrders.filter((order) => order.status === 'ready').length,
      delivered: deliveredCount,
      paymentTotals,
      topProducts,
    }
  }, [orders, selectedDayKey, timeRange])

  // Cálculo de Insumos Gastados (Panes y Carnes)
  const insumos = useMemo(() => {
    let panes = 0
    let carnes = 0

    const activeCreatedOrders = orders.filter((order) => order.status !== 'cancelled' && isDateInRange(order.createdAt, selectedDayKey, timeRange))

    activeCreatedOrders.forEach((order) => {
      order.items.forEach((item) => {
        const nameLower = item.name
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
        const qty = item.quantity

        const isBurger =
          nameLower.includes('burger') ||
          nameLower.includes('hamburguesa') ||
          nameLower.startsWith('bbq ')
        const isBreadSandwich = nameLower.includes('sandwich')

        if (isBreadSandwich && !isBurger) {
          panes += qty
        }

        if (isBurger) {
          panes += qty

          let basePatties = 1
          if (nameLower.includes('doble') || nameLower.includes('double')) {
            basePatties = 2
          } else if (nameLower.includes('triple')) {
            basePatties = 3
          } else if (nameLower.includes('cuadruple')) {
            basePatties = 4
          }

          let extraPatties = 0
          if (item.modifiers && item.modifiers.extras) {
            item.modifiers.extras.forEach((extra: any) => {
              const extraNameLower = extra.name
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .toLowerCase()
              if (extraNameLower.includes('carne') || extraNameLower.includes('patty') || extraNameLower.includes('patties')) {
                extraPatties += 1
              }
            })
          }

          carnes += (basePatties + extraPatties) * qty
        }
      })
    })

    return { panes, carnes }
  }, [orders, selectedDayKey, timeRange])
  const exportCsv = () => {
    const csvOrders = selectedDayOrders.filter((order) => order.status !== 'cancelled')
    const summaryRows = [
      ['resumen', 'valor'],
      ['ventas_totales_registradas', summary.totalSales],
      ['cobrado_hoy', summary.paidSales],
      ['pendiente_cobro', summary.pendingPaymentTotal],
      ['cantidad_pedidos_activos', summary.orderCount],
      ['ticket_promedio_cobrado', summary.averageTicket],
      ['pendientes_cocina', summary.pending],
      ['en_preparacion', summary.preparing],
      ['listos', summary.ready],
      ['entregados', summary.delivered],
      ['efectivo_cobrado', summary.paymentTotals.cashSales],
      ['qr_cobrado', summary.paymentTotals.qrSales],
      ['pedidos_mixtos_cantidad', summary.paymentTotals.mixedCount],
      ['efectivo_recibido', summary.paymentTotals.cashReceived],
      ['cambio_entregado', summary.paymentTotals.change],
      [],
      [
        'numero',
        'origen',
        'hora_creacion',
        'hora_listo',
        'hora_entregado',
        'estado',
        'modalidad',
        'info_mesa',
        'cliente_nombre',
        'cliente_telefono',
        'direccion_entrega',
        'estado_pago',
        'metodo_pago',
        'monto_efectivo',
        'monto_qr',
        'recibido_efectivo',
        'cambio',
        'fecha_hora_pago',
        'usuario_pago',
        'items',
        'detalle_productos',
        'observaciones',
        'total',
      ],
    ]

    const orderRows = csvOrders.map((order) => {
      const isPaid = order.paymentStatus === 'paid'
      return [
        order.displayNumber,
        order.orderSource || 'local',
        formatDateTime(order.createdAt),
        formatDateTime(order.readyAt),
        formatDateTime(order.deliveredAt),
        order.status,
        order.fulfillmentType || (order.orderType === 'delivery' ? 'delivery' : 'table'),
        order.tableInfo ?? '',
        order.customerName ?? '',
        order.customerPhone ?? '',
        order.deliveryAddress ?? '',
        isPaid ? 'Pagado' : 'Pendiente',
        isPaid && order.paymentMethod ? formatPaymentMethod(order.paymentMethod) : 'Pendiente',
        isPaid ? order.payment.cashAmount : 0,
        isPaid ? order.payment.qrAmount : 0,
        isPaid ? order.payment.cashReceived : 0,
        isPaid ? order.payment.change : 0,
        isPaid && order.paidAt ? formatDateTime(order.paidAt) : '',
        isPaid && order.paidBy ? order.paidBy.replace('mock-', '') : '',
        order.items.reduce((sum, item) => sum + item.quantity, 0),
        order.items
          .map((item) => {
            const fragments = [`${item.quantity}x ${item.name}`]

            if (item.modifiers.extras.length) {
              fragments.push(`extras: ${item.modifiers.extras.map((extra) => extra.name).join('|')}`)
            }

            if (item.modifiers.options.length) {
              fragments.push(`opciones: ${item.modifiers.options.join('|')}`)
            }

            if (item.modifiers.note) {
              fragments.push(`obs: ${item.modifiers.note}`)
            }

            return fragments.join(' / ')
          })
          .join(' | '),
        order.items
          .map((item) => item.modifiers.note)
          .filter(Boolean)
          .join(' | '),
        String(getOrderSaleAmount(order)),
      ]
    })

    const csv = [...summaryRows, ...orderRows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';'))
      .join('\n')

    downloadTextFile(`comandero-${selectedDayKey}.csv`, csv)
  }

  const handleCancelClick = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId)
    if (order && order.paymentStatus === 'paid') {
      window.alert('Un pedido cobrado requiere devolución antes de poder anularse.')
      return
    }
    const reason = window.prompt('Motivo de la anulación (opcional):')
    if (reason === null) return
    setBusyOrderId(orderId)
    await onCancelOrder(orderId, userName || 'Usuario', reason)
    setBusyOrderId(null)
  }

  if (userRole === 'pedidos') {
    return (
      <div className="rounded-[1.8rem] border border-orange-200 bg-orange-50/60 p-6 text-center text-sm font-semibold text-orange-950">
        No tienes permisos para acceder a esta sección.
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Historial de Ventas y Arqueo
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              {summary.orderCount} pedido(s)
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">Consolidado operativo de caja e historial</p>
        </div>

        {/* Controles de Rango de Tiempo y Fecha */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector Diario/Semanal/Mensual */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              className={`px-3 py-1.5 rounded-lg transition ${timeRange === 'day' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setTimeRange('day')}
            >
              Día
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg transition ${timeRange === 'week' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setTimeRange('week')}
            >
              Semana
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg transition ${timeRange === 'month' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setTimeRange('month')}
            >
              Mes
            </button>
          </div>

          <select
            className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
            value={selectedDayKey}
            onChange={(e) => setSelectedDayKey(e.target.value)}
          >
            {dayOptions.map((dayStr) => (
              <option key={dayStr} value={dayStr}>
                {dayStr}
              </option>
            ))}
          </select>
        </div>
      </div>

          {/* Accesos Rápidos de Días (solo visible si el rango es diario) */}
          {timeRange === 'day' && (
            <div className="flex flex-wrap gap-1.5 border-t border-dashed border-line pt-3">
              {dayOptions.map((dayKey) => {
                const date = new Date(dayKey + 'T00:00:00')
                const formattedDate = date.toLocaleDateString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                })
                const isSelected = selectedDayKey === dayKey
                return (
                  <button
                    key={dayKey}
                    onClick={() => {
                      setSelectedDayKey(dayKey)
                      setFilter('all')
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-white border border-line text-muted hover:bg-panel hover:text-ink'
                    }`}
                  >
                    {dayKey === getTodayKey() ? 'Hoy' : formattedDate}
                  </button>
                )
              })}
            </div>
          )}

          {/* Grid de Métricas y Estadísticas */}
          <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-t border-dashed border-line pt-4">
            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Ventas registradas</div>
              <div className="mt-2 text-xl font-black text-ink">{formatCurrency(summary.totalSales)}</div>
              <div className="mt-0.5 text-[10px] text-muted font-bold">{summary.orderCount} pedidos</div>
            </div>
            
            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Cobrado en rango</div>
              <div className="mt-2 text-xl font-black text-ink">{formatCurrency(summary.paidSales)}</div>
            </div>

            {summary.pendingPaymentCount > 0 ? (
              <div className="rounded-[1.4rem] border border-[#ead7ad] bg-warningSoft p-4 shadow-insetSoft">
                <div className="text-[10px] font-black uppercase tracking-wider text-warning">Por cobrar</div>
                <div className="mt-2 text-xl font-black text-warning">{formatCurrency(summary.pendingPaymentTotal)}</div>
                <div className="mt-0.5 text-[10px] text-warning/80 font-bold">{summary.pendingPaymentCount} pedidos</div>
              </div>
            ) : (
              <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted">Por cobrar</div>
                <div className="mt-2 text-xl font-black text-ink">Bs 0</div>
              </div>
            )}

            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Ticket promedio</div>
              <div className="mt-2 text-xl font-black text-ink">{formatCurrency(summary.averageTicket)}</div>
            </div>

            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Pedidos Entregados</div>
              <div className="mt-2 text-xl font-black text-ink">{summary.delivered}</div>
            </div>

            {/* Cálculo de Insumos Gastados */}
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-700">Insumos Gastados</div>
              <div className="mt-2 flex gap-3">
                <div>
                  <div className="text-[9px] font-black text-slate-500 uppercase">Panes</div>
                  <div className="text-sm font-black text-slate-900">{insumos.panes} u</div>
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-500 uppercase">Carnes</div>
                  <div className="text-sm font-black text-slate-900">{insumos.carnes} u</div>
                </div>
              </div>
            </div>
          </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Panel className="border-white/85 bg-white/78 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentWash text-accent">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink">Cierre del dia</h3>
              <p className="text-sm text-muted">Arqueo basico listo para caja y reporte operativo (excluye anulados).</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.3rem] border border-line bg-panel/85 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Efectivo cobrado</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.cashSales)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/85 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">QR cobrado</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.qrSales)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/85 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Pedidos mixtos</div>
              <div className="mt-2 text-xl font-semibold text-ink">{summary.paymentTotals.mixedCount} pedidos</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/85 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recibido efectivo</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.cashReceived)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/85 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Cambio entregado</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.change)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Caja balanceada</div>
              <div className="mt-2 text-sm font-semibold text-emerald-950">
                Efectivo + QR coincide con total cobrado
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="border-white/85 bg-white/78 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">Mas vendidos</h3>
              <p className="text-sm text-muted">Demanda de productos en pedidos activos para compras del siguiente turno.</p>
            </div>
            <Button tone="secondary" onClick={exportCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {summary.topProducts.map((product, index) => (
              <div key={product.name} className="flex items-center justify-between rounded-[1.25rem] border border-line bg-panel/80 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accentWash text-sm font-semibold text-accent">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold text-ink">{product.name}</div>
                    <div className="text-xs text-muted">Cantidad registrada</div>
                  </div>
                </div>
                <div className="text-lg font-semibold text-ink">{product.quantity}</div>
              </div>
            ))}

            {summary.topProducts.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-lineStrong bg-canvas/55 p-6 text-center text-sm text-muted">
                Todavia no hay ventas suficientes para calcular productos mas vendidos.
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === option.value ? 'bg-ink text-white shadow-card' : 'bg-white/72 text-muted hover:bg-white hover:text-ink'
              }`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm text-muted shadow-insetSoft lg:flex">
            <Filter size={14} className="text-accent" />
            Filtro activo: {filterOptions.find((option) => option.value === filter)?.label}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentWash text-accent">
            <ScrollText size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">Registro del día</h3>
            <p className="text-sm text-muted">{filteredOrders.length} pedidos visibles</p>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-line p-10 text-center text-muted font-semibold bg-white/50">
            No se encontraron pedidos para este filtro.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map((order) => {
              return (
                <div key={order.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow transition-all space-y-3.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-ink">{order.displayNumber}</span>
                    <span className="text-xs text-muted font-medium">
                      {formatTime(order.createdAt)}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <div>
                      <span className="font-bold text-muted">Cliente:</span>{' '}
                      <span className="font-semibold text-ink">{order.customerName || 'Cliente General'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <SourceBadge source={order.orderSource} />
                      <FulfillmentBadge type={order.fulfillmentType} tableInfo={order.tableInfo} />
                      <PaymentBadge paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
                      <StatusPill status={order.status} />
                    </div>
                  </div>

                  <div className="border-t border-dashed border-line pt-2.5 text-xs text-ink/90 space-y-1 max-h-[120px] overflow-y-auto pr-1">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.quantity}x {item.name}</span>
                        <span className="text-muted font-semibold">{formatCurrency(item.lineTotal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-line pt-2.5 flex justify-between items-center">
                    <span className="text-xs font-black text-ink">Total: {formatCurrency(getOrderSaleAmount(order))}</span>
                    <div className="flex gap-2">
                      {order.status !== 'delivered' && order.status !== 'cancelled' ? (
                        <>
                          <Button
                            size="sm"
                            tone="success"
                            className="px-2 py-1 h-7 text-[10px] font-black rounded-lg"
                            disabled={busyOrderId === order.id}
                            onClick={async () => {
                              setBusyOrderId(order.id)
                              await onAdvanceStatus(order.id, 'delivered')
                              setBusyOrderId(null)
                            }}
                          >
                            Entregar
                          </Button>

                          {(userRole === 'admin' || userRole === 'caja' || userRole === 'demo') ? (
                            <button
                              type="button"
                              disabled={busyOrderId === order.id}
                              onClick={() => handleCancelClick(order.id)}
                              className="text-[10px] font-black text-rose-600 hover:underline"
                            >
                              Anular
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                          {order.status === 'cancelled' ? 'Anulado' : 'Entregado'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
