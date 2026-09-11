import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../lib/format'
import type { Order } from '../types'
import { enviarARawBt, modoImpresion, ticketClienteBase64, ticketCocinaBase64 } from '../lib/escpos'

/**
 * Ticket termico compartido por Caja y Cocina.
 *
 * Antes esto vivia solo dentro de CajaView e imprimia SIEMPRE dos hojas seguidas (cliente +
 * cocina) desde la misma tablet. Ahora cada tablet tiene su propia impresora bluetooth:
 * caja imprime el ticket del cliente y cocina el de preparacion, asi que el ticket se arma
 * aca una sola vez y cada vista pide el que le toca. Si estuviera duplicado en las dos
 * vistas, con el tiempo una quedaria distinta de la otra.
 *
 * Medida: papel de 80 mm, con 76 mm de contenido util (2 mm de margen a cada lado).
 */

function formatExtrasList(extras: Array<{ name: string }> | undefined) {
  if (!extras || extras.length === 0) return ''
  const counts = new Map<string, number>()
  extras.forEach((extra) => {
    counts.set(extra.name, (counts.get(extra.name) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
    .join(', ')
}

function describeFulfillment(order: Order) {
  if (order.fulfillmentType === 'table') return `Mesa: ${order.tableInfo}`
  if (order.fulfillmentType === 'pickup') return 'Retiro en Local'
  return 'Delivery'
}

function TicketHeaderData({ order }: { order: Order }) {
  return (
    <div className="border-t border-b border-black border-dashed py-1 w-full text-left space-y-0.5 text-[9px]">
      <div><b>Fecha:</b> {new Date(order.createdAt).toLocaleString('es-ES')}</div>
      <div><b>Cliente:</b> {order.customerName || 'Cliente General'}</div>
      <div><b>Entrega:</b> {describeFulfillment(order)}</div>
    </div>
  )
}

/** Lo que se lleva el cliente: precios y total. Lo imprime la tablet de caja. */
function CustomerTicket({ order }: { order: Order }) {
  return (
    <div className="print-page w-full flex flex-col items-center">
      <div className="text-center font-bold text-xl tracking-wider mb-2">{order.displayNumber}</div>

      <TicketHeaderData order={order} />

      <div className="mt-2 w-full space-y-1.5 text-[9px]">
        {order.items.map((item, idx) => (
          <div key={idx} className="w-full">
            <div className="flex justify-between font-bold">
              <span>{item.quantity}x {item.name}</span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </div>
            {item.modifiers.extras.length > 0 && (
              <div className="text-[8px] text-gray-600 ml-2">
                + Extras: {formatExtrasList(item.modifiers.extras)}
              </div>
            )}
            {item.modifiers.options.length > 0 && (
              <div className="text-[8px] text-gray-600 ml-2">
                + Opcion: {item.modifiers.options.join(', ')}
              </div>
            )}
            {item.modifiers.note && (
              <div className="text-[8px] text-red-700 font-bold ml-2">
                Obs: {item.modifiers.note}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-black border-dashed mt-2 pt-1 w-full text-right text-[9px] space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
        <div className="flex justify-between font-bold text-xs">
          <span>TOTAL:</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Metodo:</span>
          <span>{order.payment?.method === 'qr' ? 'Pago QR' : order.payment?.method === 'mixed' ? 'Mixto' : 'Efectivo'}</span>
        </div>
        <div className="flex justify-between">
          <span>Estado:</span>
          <span>{order.paymentStatus === 'paid' ? 'PAGADO' : 'PENDIENTE'}</span>
        </div>
      </div>

      <div className="text-center text-[8px] mt-4 border-t border-black border-dotted pt-1">
        Muchas gracias por su preferencia!
      </div>
    </div>
  )
}

/** El de preparacion: sin precios, con los extras y observaciones bien grandes. */
function KitchenTicket({ order }: { order: Order }) {
  return (
    <div className="print-page w-full flex flex-col items-center">
      <div className="text-center font-bold text-base bg-black text-white px-2 py-0.5 rounded mb-2">
        {order.displayNumber}
      </div>

      <TicketHeaderData order={order} />

      <div className="mt-2 w-full space-y-2 text-[10px]">
        {order.items.map((item, idx) => (
          <div key={idx} className="w-full border-b border-black/10 pb-1">
            <div className="font-bold text-xs">{item.quantity}x {item.name}</div>
            {item.modifiers.extras.length > 0 && (
              <div className="text-[9px] text-gray-700 ml-2 font-medium">
                Extras: {formatExtrasList(item.modifiers.extras)}
              </div>
            )}
            {item.modifiers.options.length > 0 && (
              <div className="text-[9px] text-gray-700 ml-2 font-medium">
                Opcion: {item.modifiers.options.join(', ')}
              </div>
            )}
            {item.modifiers.note && (
              <div className="text-[9px] text-red-600 font-bold ml-2 border border-red-200 bg-red-50 p-1 mt-0.5 rounded">
                OBS: {item.modifiers.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Monta el ticket y dispara la impresion. Se limpia solo cuando termina.
 *
 * OJO: el navegador SIEMPRE abre su dialogo de impresion; no existe forma de imprimir en
 * silencio desde una pagina web. Lo que se automatiza aca es que el dialogo se abra solo,
 * sin que nadie apriete nada. Para imprimir de verdad sin ningun dialogo hay que hablarle a
 * la impresora bluetooth directamente (ESC/POS), que es un trabajo aparte.
 */
export function PrintableTicket({
  order,
  variant,
  onDone,
}: {
  order: Order | null
  variant: 'customer' | 'kitchen'
  onDone: () => void
}) {
  const ticket = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!order) return

    // Camino preferido en las tablets: mandar el ticket como comandos a RawBT. Asi corta el
    // papel solo, no aparece ningun dialogo y el formato lo controla el sistema. La impresion
    // del navegador manda una imagen, y por eso no puede cortar.
    if (modoImpresion() === 'rawbt') {
      const datos = variant === 'customer' ? ticketClienteBase64(order) : ticketCocinaBase64(order)
      enviarARawBt(datos)
      // Se libera enseguida: RawBT se encarga desde aca y la app no tiene nada que esperar.
      const listo = window.setTimeout(onDone, 1200)
      return () => window.clearTimeout(listo)
    }

    // Respaldo (PC, o si se elige a mano): impresion del navegador.
    //
    // Chrome de Android ignora las reglas de "@media print", asi que no se le pide nada:
    // se esconde #root y se muestra el ticket con estilo EN LINEA, que es un cambio real del
    // documento. En ese instante la pagina contiene unicamente el ticket.
    //
    // Lo que fallo antes y hay que evitar:
    //   - visibility: hidden           -> hojas en blanco
    //   - imprimir dentro de un iframe -> imprimia la pagina entera
    //   - display:none por CSS print   -> imprimia la pagina entera
    //   - restaurar al recuperar el foco -> en Android el foco vuelve APENAS se llama a
    //     imprimir, asi que la app reaparecia antes de que el sistema tomara la imagen.
    const raiz = document.getElementById('root')
    const displayRaiz = raiz?.style.display ?? ''
    let restaurado = false

    const restaurar = () => {
      if (restaurado) return
      restaurado = true
      if (raiz) raiz.style.display = displayRaiz
      if (ticket.current) ticket.current.style.display = 'none'
      window.removeEventListener('afterprint', intentarRestaurar)
      window.removeEventListener('focus', intentarRestaurar)
      document.removeEventListener('visibilitychange', alVolverAVer)
      document.removeEventListener('pointerdown', intentarRestaurar, true)
      onDone()
    }

    // Cuando termina la impresion NO se puede saber por tiempo: en Android el usuario abre la
    // previsualizacion, la mira unos segundos y recien ahi imprime. Si la app se restaura antes,
    // la previsualizacion sale bien (se genero al principio) pero el papel sale con la pantalla
    // del sistema. Tampoco alcanza con la visibilidad de la pagina: en algunos Android el
    // dialogo no la marca como oculta, y entonces nunca se restaura y la pantalla queda trabada
    // mostrando el ticket. Las dos cosas pasaron.
    //
    // La señal que si es confiable: el usuario TOCA la pantalla al volver. Mientras esta en el
    // dialogo de impresion no puede tocar nuestra pagina, asi que ese toque solo puede ocurrir
    // cuando ya volvio. Se escucha eso, mas la visibilidad y "afterprint" por si alguno llega
    // primero, con una guarda inicial para descartar los avisos falsos que dispara el propio
    // print() en Android.
    const GUARDA_MS = 1200
    let momentoImpresion = 0

    const puedeRestaurar = () => momentoImpresion > 0 && Date.now() - momentoImpresion > GUARDA_MS

    const intentarRestaurar = () => {
      if (puedeRestaurar()) restaurar()
    }

    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') intentarRestaurar()
    }

    document.addEventListener('visibilitychange', alVolverAVer)
    document.addEventListener('pointerdown', intentarRestaurar, true)
    window.addEventListener('afterprint', intentarRestaurar)
    window.addEventListener('focus', intentarRestaurar)

    const imprimir = window.setTimeout(() => {
      if (raiz) raiz.style.display = 'none'
      if (ticket.current) ticket.current.style.display = 'block'
      momentoImpresion = Date.now()
      window.print()
    }, 300)

    // Respaldo largo, solo para que la app no quede oculta si el usuario nunca vuelve. No debe
    // dispararse mientras esta mirando la previsualizacion.
    const respaldo = window.setTimeout(restaurar, 180000)

    return () => {
      window.clearTimeout(imprimir)
      window.clearTimeout(respaldo)
      if (raiz) raiz.style.display = displayRaiz
      if (ticket.current) ticket.current.style.display = 'none'
      window.removeEventListener('afterprint', intentarRestaurar)
      window.removeEventListener('focus', intentarRestaurar)
      document.removeEventListener('visibilitychange', alVolverAVer)
      document.removeEventListener('pointerdown', intentarRestaurar, true)
    }
  }, [order, variant, onDone])

  if (!order) return null

  // Ancho 70 mm y no 76: en papel de 80 mm el area imprimible real es menor, y los valores
  // alineados a la derecha (BOB 22, Efectivo, PAGADO) salian cortados en la impresion.
  return createPortal(
    <div
      ref={ticket}
      id="print-ticket"
      className="text-black font-mono text-[10px] leading-normal"
      style={{ display: 'none', width: '70mm', padding: '1mm', margin: '0', background: '#fff', color: '#000' }}
    >
      <style>{'@page { size: 80mm auto; margin: 0; } #print-ticket * { max-width: 100%; }'}</style>
      {variant === 'customer' ? <CustomerTicket order={order} /> : <KitchenTicket order={order} />}
    </div>,
    document.body,
  )
}
