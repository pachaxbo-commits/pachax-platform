import type { Order } from '../types'
import { getPrinterSettings, savePrinterSettings } from './printerSettings'

/**
 * Generador de comandos ESC/POS para Impresoras Térmicas (Estilo Loyverse).
 */

const ESC = 0x1b
const GS = 0x1d

/** Tabla de caracteres CP850 para vocales acentuadas y Ñ en impresoras térmicas */
const CP850: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6,
}

function codificar(texto: string): number[] {
  const bytes: number[] = []
  for (const caracter of texto) {
    const mapeado = CP850[caracter]
    if (mapeado !== undefined) {
      bytes.push(mapeado)
      continue
    }
    const codigo = caracter.charCodeAt(0)
    bytes.push(codigo < 128 ? codigo : 0x20)
  }
  return bytes
}

export class Ticket {
  private bytes: number[] = []
  private ancho: number = 48

  constructor(paperWidth: '58mm' | '80mm' = '80mm') {
    this.ancho = paperWidth === '58mm' ? 32 : 48
  }

  iniciar() {
    this.bytes.push(ESC, 0x40) // ESC @ : reinicia la impresora
    this.bytes.push(ESC, 0x74, 0x02) // ESC t 2 : tabla CP850
    return this
  }

  alinear(donde: 'izquierda' | 'centro' | 'derecha') {
    const valor = donde === 'centro' ? 1 : donde === 'derecha' ? 2 : 0
    this.bytes.push(ESC, 0x61, valor)
    return this
  }

  negrita(activar: boolean) {
    this.bytes.push(ESC, 0x45, activar ? 1 : 0)
    return this
  }

  doble(activar: boolean) {
    this.bytes.push(GS, 0x21, activar ? 0x11 : 0x00)
    return this
  }

  linea(texto = '') {
    this.bytes.push(...codificar(texto), 0x0a)
    return this
  }

  separador(caracter = '-') {
    return this.linea(caracter.repeat(this.ancho))
  }

  filaDoble(izquierda: string, derecha: string) {
    const espacio = this.ancho - derecha.length
    const recortada = izquierda.length > espacio ? izquierda.slice(0, Math.max(0, espacio - 1)) : izquierda
    const relleno = ' '.repeat(Math.max(1, this.ancho - recortada.length - derecha.length))
    return this.linea(`${recortada}${relleno}${derecha}`)
  }

  parrafo(texto: string, sangria = 0) {
    const disponible = this.ancho - sangria
    const palabras = texto.split(/\s+/).filter(Boolean)
    let actual = ''
    for (const palabra of palabras) {
      if (actual && (actual + ' ' + palabra).length > disponible) {
        this.linea(' '.repeat(sangria) + actual)
        actual = palabra
      } else {
        actual = actual ? `${actual} ${palabra}` : palabra
      }
    }
    if (actual) this.linea(' '.repeat(sangria) + actual)
    return this
  }

  avanzar(lineas = 1) {
    this.bytes.push(ESC, 0x64, lineas)
    return this
  }

  /** Apertura de gaveta de dinero / cajón de efectivo */
  abrirCajon() {
    this.bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa)
    return this
  }

  /** Avanza hasta la cuchilla y corta */
  cortar() {
    this.bytes.push(GS, 0x56, 0x42, 0x00)
    return this
  }

  aBase64() {
    const datos = new Uint8Array(this.bytes)
    let binario = ''
    const bloque = 0x8000
    for (let i = 0; i < datos.length; i += bloque) {
      binario += String.fromCharCode(...datos.subarray(i, i + bloque))
    }
    return btoa(binario)
  }
}

function precio(valor: number) {
  return `Bs ${valor.toFixed(2)}`
}

function describirEntrega(order: Order) {
  if (order.fulfillmentType === 'table') return `Mesa: ${order.tableInfo || 'N/D'}`
  if (order.fulfillmentType === 'pickup') return 'Retiro en Local'
  return 'Delivery'
}

function listarExtras(extras: Array<{ name: string }>) {
  const cuenta = new Map<string, number>()
  extras.forEach((extra) => cuenta.set(extra.name, (cuenta.get(extra.name) ?? 0) + 1))
  return Array.from(cuenta.entries())
    .map(([nombre, veces]) => (veces > 1 ? `${nombre} (x${veces})` : nombre))
    .join(', ')
}

function encabezado(t: Ticket, order: Order, titulo?: string) {
  t.alinear('centro')
  if (titulo) t.negrita(true).linea(titulo).negrita(false)
  t.doble(true).negrita(true).linea(order.displayNumber).negrita(false).doble(false)
  t.alinear('izquierda').separador()
  t.linea(`Fecha:   ${new Date(order.createdAt).toLocaleString('es-BO')}`)
  t.linea(`Cliente: ${order.customerName || 'Cliente General'}`)
  t.linea(`Entrega: ${describirEntrega(order)}`)
  if (order.customerPhone) t.linea(`Telefono: ${order.customerPhone}`)
  if (order.fulfillmentType === 'delivery' && order.deliveryAddress) {
    t.parrafo(`Dirección: ${order.deliveryAddress}`)
  }
  t.separador()
}

/** Ticket Cliente */
export function ticketClienteBase64(order: Order) {
  const settings = getPrinterSettings()
  const t = new Ticket(settings.paperWidth).iniciar()

  if (settings.kickCashDrawer && order.payment?.method === 'cash') {
    t.abrirCajon()
  }

  encabezado(t, order)

  order.items.forEach((item) => {
    t.filaDoble(`${item.quantity}x ${item.name}`, precio(item.lineTotal))
    if (item.modifiers.extras.length) t.parrafo(`+ ${listarExtras(item.modifiers.extras)}`, 2)
    if (item.modifiers.options.length) t.parrafo(`+ ${item.modifiers.options.join(', ')}`, 2)
    if (item.modifiers.note) t.parrafo(`Obs: ${item.modifiers.note}`, 2)
  })

  t.separador()
  t.negrita(true).filaDoble('TOTAL', precio(order.total)).negrita(false)
  t.linea(`Pago:   ${order.payment?.method === 'qr' ? 'QR' : order.payment?.method === 'mixed' ? 'Mixto' : 'Efectivo'}`)
  t.linea(`Estado: ${order.paymentStatus === 'paid' ? 'PAGADO' : order.paymentStatus === 'gift' ? 'REGALO' : 'PENDIENTE'}`)
  t.separador()
  t.alinear('centro').linea('¡Gracias por su preferencia!')
  t.avanzar(3).cortar()

  return t.aBase64()
}

/** Ticket Cocina */
export function ticketCocinaBase64(order: Order) {
  const settings = getPrinterSettings()
  const t = new Ticket(settings.paperWidth).iniciar()
  encabezado(t, order, '*** COCINA ***')

  order.items.forEach((item) => {
    t.doble(true).negrita(true).linea(`${item.quantity}x ${item.name}`).negrita(false).doble(false)
    if (item.modifiers.extras.length) t.parrafo(`EXTRAS: ${listarExtras(item.modifiers.extras)}`, 2)
    if (item.modifiers.options.length) t.parrafo(`OPCION: ${item.modifiers.options.join(', ')}`, 2)
    if (item.modifiers.note) {
      t.negrita(true).parrafo(`** ${item.modifiers.note.toUpperCase()} **`, 2).negrita(false)
    }
    t.linea()
  })

  t.separador()
  t.avanzar(3).cortar()

  return t.aBase64()
}

/** Ticket de Prueba */
export function ticketPruebaBase64() {
  const settings = getPrinterSettings()
  const t = new Ticket(settings.paperWidth).iniciar()
  
  if (settings.kickCashDrawer) {
    t.abrirCajon()
  }

  t.alinear('centro')
  t.doble(true).negrita(true).linea('PACHAX FLOW').negrita(false).doble(false)
  t.linea('Impresora Térmica Configurada')
  t.separador()
  t.alinear('izquierda')
  t.linea(`Ancho:   ${settings.paperWidth}`)
  t.linea(`Modo:    ${settings.connectionType}`)
  t.linea(`Gaveta:  ${settings.kickCashDrawer ? 'Habilitada' : 'Deshabilitada'}`)
  t.linea(`Fecha:   ${new Date().toLocaleString('es-BO')}`)
  t.separador()
  t.alinear('centro').linea('¡Prueba exitosa!')
  t.avanzar(3).cortar()

  return t.aBase64()
}

export function enviarARawBt(base64: string) {
  try {
    const enlace = `intent:base64,${base64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`
    const marco = document.createElement('iframe')
    marco.style.display = 'none'
    marco.src = enlace
    document.body.appendChild(marco)
    window.setTimeout(() => marco.remove(), 3000)
    return true
  } catch {
    return false
  }
}

export function esAndroid() {
  return /android/i.test(navigator.userAgent)
}

export type ModoImpresion = 'rawbt' | 'browser' | 'navegador' | 'bluetooth' | 'wifi'

export function modoImpresion(): ModoImpresion {
  return getPrinterSettings().connectionType
}

export function guardarModoImpresion(modo: ModoImpresion) {
  const current = getPrinterSettings()
  savePrinterSettings({ ...current, connectionType: modo === 'navegador' ? 'browser' : modo })
}
