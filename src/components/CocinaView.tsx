import { BellRing, CheckCheck, ChefHat, Clock3, LoaderCircle, Printer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime } from '../lib/format'
import { playKitchenNotification } from '../lib/sound'
import type { Order, OrderStatus } from '../types'
import { OrderTimer } from './OrderTimer'
import { Button } from './ui/Button'
import { SourceBadge, FulfillmentBadge, PaymentBadge } from './ui/StatusPill'
import { PrintableTicket } from './OrderTicket'
import { PrintModeToggle } from './PrintModeToggle'

function emphasizeText(input: string) {
  return input.toUpperCase()
}

export function CocinaView({
  orders,
  onAdvanceStatus,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [ticketToPrint, setTicketToPrint] = useState<Order | null>(null)
  // Pedidos cuyo ticket ya salio, para no repetirlo. Se guarda en el navegador porque si no,
  // al recargar la pagina la cocina imprimiria de nuevo todos los pedidos del turno.
  const printedOrderIds = useRef<Set<string>>(new Set())
  const autoPrintReady = useRef(false)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const lastPendingSequence = useRef<number>(0)
  const hideNoticeTimeout = useRef<number | null>(null)

  // Cocina active orders: pending, preparing, or ready (legacy compatibility)
  const activeOrders = useMemo(() => {
    return orders
      .filter((order) => order.status === 'pending' || order.status === 'preparing' || order.status === 'ready')
      .sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime()
        const rightTime = new Date(right.createdAt).getTime()
        return leftTime - rightTime
      })
  }, [orders])

  useEffect(() => {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAudioUnlocked(true)
      return
    }
    const context = new AudioContextCtor()
    if (context.state === 'running') {
      setAudioUnlocked(true)
    }
    void context.close()
  }, [])

  // Impresion automatica de los pedidos de WhatsApp que caja ya confirmo.
  //
  // Se imprime al confirmarse (no al llegar) para no gastar papel en pedidos que despues se
  // cancelan o se corrigen. Los pedidos que carga caja NO entran aca: esos se imprimen a mano
  // con el boton de cada tarjeta.
  //
  // La primera vuelta solo toma nota de lo que ya estaba en pantalla sin imprimirlo, si no al
  // abrir la tablet a mitad del turno saldrian de golpe todos los tickets del dia.
  useEffect(() => {
    const STORAGE_KEY = 'cocina-tickets-impresos'

    if (!autoPrintReady.current) {
      try {
        const guardados = window.localStorage.getItem(STORAGE_KEY)
        if (guardados) printedOrderIds.current = new Set(JSON.parse(guardados) as string[])
      } catch {
        printedOrderIds.current = new Set()
      }
      orders.forEach((order) => printedOrderIds.current.add(order.id))
      autoPrintReady.current = true
      return
    }

    const pendiente = orders.find(
      (order) =>
        order.orderSource === 'whatsapp' &&
        order.status === 'preparing' &&
        !printedOrderIds.current.has(order.id),
    )

    if (!pendiente || ticketToPrint) return

    printedOrderIds.current.add(pendiente.id)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...printedOrderIds.current]))
    } catch {
      // Si el navegador no deja guardar, igual se imprime; solo se pierde la memoria al recargar.
    }
    setTicketToPrint(pendiente)
  }, [orders, ticketToPrint])

  const handleUnlockAudio = () => {
    playKitchenNotification()
    setAudioUnlocked(true)
  }

  useEffect(() => {
    const latestPending = orders
      .filter((order) => order.status === 'pending')
      .reduce((highest, order) => Math.max(highest, order.sequence), 0)

    if (latestPending > lastPendingSequence.current) {
      const prevSequence = lastPendingSequence.current
      lastPendingSequence.current = latestPending

      if (latestPending !== 0) {
        const matchingOrder = orders.find((order) => order.sequence === latestPending)
        
        // Only trigger alert if the order is genuinely new (created in the last 15 seconds)
        // and it's not the initial mount loading older orders.
        if (matchingOrder && prevSequence !== 0 && new Date().getTime() - new Date(matchingOrder.createdAt).getTime() < 15000) {
          const message = `Nuevo pedido ${matchingOrder.displayNumber} recibido`
          const showNoticeTimeout = window.setTimeout(() => setNotice(message), 0)
          playKitchenNotification()

          if (hideNoticeTimeout.current) {
            window.clearTimeout(hideNoticeTimeout.current)
          }

          hideNoticeTimeout.current = window.setTimeout(() => {
            setNotice(null)
            hideNoticeTimeout.current = null
          }, 3200)

          return () => window.clearTimeout(showNoticeTimeout)
        }
      }
    }

    if (latestPending === 0) {
      lastPendingSequence.current = 0
    }
  }, [orders])

  return (
    <section className="space-y-4">
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <ChefHat size={22} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Tablero de Cocina (KDS)
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                {activeOrders.length} activo(s)
              </span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">Control de comanda en tiempo real</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {notice && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-800 animate-pulse">
              {notice}
            </div>
          )}
          <PrintModeToggle />
          {!audioUnlocked ? (
            <button
              onClick={handleUnlockAudio}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
            >
              <BellRing size={14} className="animate-bounce" /> Activar Sonido
            </button>
          ) : (
            <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <CheckCheck size={14} className="text-emerald-600" /> Sonido Activo
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {activeOrders.map((order) => {
          const isLegacy = order.status === 'preparing' || order.status === 'ready'
          const isNew = new Date().getTime() - new Date(order.createdAt).getTime() < 60000

          const bgBorderColor = isNew
            ? 'border-emerald-300 bg-[#f4fbf7]/80 ring-2 ring-emerald-500/10 shadow-lg shadow-emerald-500/5'
            : isLegacy
              ? 'border-warning/30 bg-amber-50/20'
              : 'border-white/80 bg-white/70'

          return (
            <article
              key={order.id}
              className={`rounded-[2rem] border p-5 shadow-card transition-all duration-200 hover:shadow-lg ${bgBorderColor}`}
            >
              {/* Header: Nro Pedido y Reloj */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-5xl font-black tracking-tight text-ink">
                      {order.displayNumber}
                    </div>
                    {isNew ? (
                      <span className="bg-[#10b981] text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                        NUEVO
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    Ingreso: {formatTime(order.createdAt)}
                  </div>
                </div>

                <div className="shrink-0 rounded-[1.2rem] border border-line bg-white/90 px-4 py-2.5 text-right shadow-insetSoft">
                  <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    <Clock3 size={12} />
                    Tiempo
                  </div>
                  <div className="mt-0.5 text-2xl font-bold text-ink">
                    <OrderTimer createdAt={order.createdAt} stoppedAt={order.readyAt} />
                  </div>
                </div>
              </div>

              {/* Modalidad y Pago */}
              <div className="mt-4 flex flex-wrap gap-2">
                <SourceBadge source={order.orderSource} />
                <FulfillmentBadge type={order.fulfillmentType} tableInfo={order.tableInfo} />
                <PaymentBadge paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
              </div>

              {/* Customer info for delivery/whatsapp */}
              {(order.customerName || order.customerPhone || (order.fulfillmentType === 'delivery' && order.deliveryAddress)) ? (
                <div className="mt-3 rounded-[1.2rem] border border-line bg-canvas/30 px-3 py-2 text-xs text-ink space-y-1">
                  {order.customerName ? <div><span className="font-bold text-muted">Cliente:</span> {order.customerName}</div> : null}
                  {order.customerPhone ? <div><span className="font-bold text-muted">Teléfono:</span> {order.customerPhone}</div> : null}
                  {(order.fulfillmentType === 'delivery' && order.deliveryAddress) ? <div><span className="font-bold text-muted">Dirección:</span> {order.deliveryAddress}</div> : null}
                </div>
              ) : null}

              {/* Items List */}
              <div className="mt-5 space-y-3.5">
                {order.items.map((item) => (
                  <div key={item.id} className="rounded-[1.4rem] border border-line bg-white/90 p-3.5 shadow-sm">
                    <div className="text-xl font-bold leading-6 text-ink">
                      {item.quantity}x {item.name}
                    </div>

                    {item.modifiers.extras.length || item.modifiers.options.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.modifiers.extras.map((extra, idx) => (
                          <span
                            key={`${extra.id}-${idx}`}
                            className="rounded-lg border border-accent/10 bg-accentWash px-2.5 py-1 text-xs font-extrabold tracking-wide text-accent"
                          >
                            + {emphasizeText(extra.name)}
                          </span>
                        ))}
                        {item.modifiers.options.map((option) => (
                          <span
                            key={option}
                            className="rounded-lg border border-lineStrong bg-canvas px-2.5 py-1 text-xs font-extrabold tracking-wide text-ink"
                          >
                            {emphasizeText(option)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {item.modifiers.note ? (
                      <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-black tracking-wide text-rose-800">
                        OBS: {emphasizeText(item.modifiers.note)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Contextual Action Button */}
              <div className="mt-6">
                {(() => {
                  const buttonText =
                    order.fulfillmentType === 'table'
                      ? 'SERVIR PEDIDO'
                      : order.fulfillmentType === 'pickup'
                        ? 'LISTO PARA RETIRAR'
                        : 'LISTO PARA DESPACHAR'

                  const nextStatus: OrderStatus =
                    order.fulfillmentType === 'table'
                      ? 'delivered'
                      : order.fulfillmentType === 'pickup'
                        ? 'ready_for_pickup'
                        : 'ready_for_dispatch'

                  return (
                    <div className="flex gap-2">
                    <Button
                      fullWidth
                      size="lg"
                      tone="success"
                      className="py-4 text-lg font-black tracking-wide shadow-md shadow-success/10 rounded-2xl min-h-[48px]"
                      disabled={busyOrderId === order.id}
                      onClick={async () => {
                        setBusyOrderId(order.id)
                        const ok = await onAdvanceStatus(order.id, nextStatus)
                        if (ok) {
                          setNotice(`Pedido ${order.displayNumber} actualizado correctamente`)
                          const resetTimeout = window.setTimeout(() => setNotice(null), 2500)
                          return () => window.clearTimeout(resetTimeout)
                        }
                        setBusyOrderId(null)
                      }}
                    >
                      {busyOrderId === order.id ? (
                        <LoaderCircle size={20} className="animate-spin" />
                      ) : (
                        <>{buttonText}</>
                      )}
                    </Button>
                    {/* Reimprimir a mano. Es el unico modo de imprimir los pedidos que carga
                        caja, y sirve para repetir un ticket de WhatsApp si salio mal. */}
                    <Button
                      size="lg"
                      tone="ghost"
                      title="Imprimir ticket de cocina"
                      className="py-4 px-4 rounded-2xl min-h-[48px] shrink-0"
                      disabled={Boolean(ticketToPrint)}
                      onClick={() => setTicketToPrint(order)}
                    >
                      <Printer size={20} />
                    </Button>
                    </div>
                  )
                })()}
              </div>
            </article>
          )
        })}

        {activeOrders.length === 0 ? (
          <div className="col-span-full rounded-[2rem] border border-dashed border-lineStrong bg-white/70 p-12 text-center text-lg text-muted">
            <ChefHat size={48} className="mx-auto text-accentWash mb-4 animate-pulse" />
            No hay comandas activas pendientes en este momento.
          </div>
        ) : null}
      </div>

      {/* Cocina imprime el ticket de preparacion, sin precios. */}
      <PrintableTicket order={ticketToPrint} variant="kitchen" onDone={() => setTicketToPrint(null)} />
    </section>
  )
}
