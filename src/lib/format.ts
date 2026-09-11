import type { FulfillmentType, OrderSource } from '../types'

export const currency = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 0,
})

export const time = new Intl.DateTimeFormat('es-BO', {
  hour: '2-digit',
  minute: '2-digit',
})

export const dateTime = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatCurrency(value: number) {
  return currency.format(value)
}

export function formatTime(isoDate: string) {
  return time.format(new Date(isoDate))
}

export function formatDateTime(isoDate?: string) {
  return isoDate ? dateTime.format(new Date(isoDate)) : '-'
}

export function formatElapsed(fromIsoDate: string, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(fromIsoDate).getTime()) / 1000))
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatPaymentMethod(method: 'cash' | 'qr' | 'mixed') {
  if (method === 'cash') {
    return 'Efectivo'
  }

  if (method === 'qr') {
    return 'QR'
  }

  return 'Mixto'
}

export function formatOrderSource(source: OrderSource) {
  return source === 'whatsapp' ? 'WhatsApp' : 'Local'
}

export function formatFulfillmentType(type: FulfillmentType) {
  if (type === 'table') return 'Mesa'
  if (type === 'pickup') return 'Retiro'
  return 'Delivery'
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
