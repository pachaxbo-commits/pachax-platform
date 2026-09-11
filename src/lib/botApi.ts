export const botApiUrl = (import.meta.env.VITE_BOT_API_URL || 'http://localhost:3010').replace(/\/$/, '')
export const botAdminToken = import.meta.env.VITE_BOT_ADMIN_TOKEN || 'pachax-bot-local-2026-cambia-esto-antes-de-produccion'

export type BotHealth = {
  ok: boolean
  botEnabled: boolean
  acceptingOrders?: boolean
  autoRepliesEnabled?: boolean
  whatsappConnected: boolean
  acceptingOrdersPausedUntil?: string
  acceptingOrdersPauseReason?: string
}

export type BotSettings = {
  openHour?: number
  closeHour?: number
  acceptingOrders: boolean
  acceptingOrdersPausedUntil: string
  acceptingOrdersPauseReason: string
  pickupOnlyMode: boolean
  pickupOnlyMessage: string
  autoRepliesEnabled: boolean
  deliveryGroupName: string
  deliveryGroupId: string
  ownerAlertGroupName: string
  ownerAlertChatId: string
  closedMessage: string
  pausedOrdersMessage: string
  qrPaymentMessage: string
  deliveryPricingMessage: string
  humanHelpMessage: string
  personality: string
}

export type WhatsappGroup = {
  id: string
  name: string
  participants: number
}

export const BOT_HEALTH_CHANGED_EVENT = 'pachax:bot-health-changed'

export function emitBotHealthChanged(health?: BotHealth) {
  window.dispatchEvent(new CustomEvent(BOT_HEALTH_CHANGED_EVENT, { detail: health }))
}

export function onBotHealthChanged(listener: (health?: BotHealth) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<BotHealth | undefined>).detail)
  window.addEventListener(BOT_HEALTH_CHANGED_EVENT, handler)
  return () => window.removeEventListener(BOT_HEALTH_CHANGED_EVENT, handler)
}

export async function fetchBotHealth(): Promise<BotHealth> {
  const response = await fetch(`${botApiUrl}/health`)
  if (!response.ok) throw new Error('Bot health failed')
  return response.json()
}

export async function setBotAcceptingOrders(accepting: boolean, options?: { pausedUntil?: string; pauseReason?: string }) {
  const response = await fetch(`${botApiUrl}/orders/accepting/${accepting ? 'on' : 'off'}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-token': botAdminToken,
    },
    body: JSON.stringify(options || {}),
  })

  if (!response.ok) {
    throw new Error('No se pudo actualizar recepcion de pedidos.')
  }

  return response.json()
}

export async function setBotEnabled(enabled: boolean) {
  const response = await fetch(`${botApiUrl}/bot/${enabled ? 'on' : 'off'}`, {
    method: 'POST',
    headers: {
      'x-bot-token': botAdminToken,
    },
  })

  if (!response.ok) throw new Error('No se pudo cambiar el estado del bot.')
  return response.json()
}

export async function fetchBotSettings(): Promise<BotSettings> {
  const response = await fetch(`${botApiUrl}/settings`, {
    headers: {
      'x-bot-token': botAdminToken,
    },
  })
  if (!response.ok) throw new Error('No se pudo leer la configuracion del bot.')
  const payload = await response.json()
  return payload.settings as BotSettings
}

export async function saveBotSettings(settings: Partial<BotSettings>): Promise<BotSettings> {
  const response = await fetch(`${botApiUrl}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-token': botAdminToken,
    },
    body: JSON.stringify(settings),
  })
  if (!response.ok) throw new Error('No se pudo guardar la configuracion del bot.')
  const payload = await response.json()
  return payload.settings as BotSettings
}

export async function fetchWhatsappGroups(): Promise<WhatsappGroup[]> {
  const response = await fetch(`${botApiUrl}/whatsapp/groups`, {
    headers: {
      'x-bot-token': botAdminToken,
    },
  })
  if (!response.ok) throw new Error('No se pudieron leer los grupos de WhatsApp.')
  const payload = await response.json()
  return payload.groups as WhatsappGroup[]
}

export async function fetchWhatsappQr(): Promise<{ connected: boolean; qrDataUrl?: string }> {
  const response = await fetch(`${botApiUrl}/whatsapp/qr`, {
    headers: {
      'x-bot-token': botAdminToken,
    },
  })
  if (!response.ok) throw new Error('No hay QR disponible todavia.')
  return response.json()
}

export async function logoutWhatsappSession() {
  const response = await fetch(`${botApiUrl}/whatsapp/logout`, {
    method: 'POST',
    headers: {
      'x-bot-token': botAdminToken,
    },
  })
  if (!response.ok) throw new Error('No se pudo cerrar la sesion de WhatsApp.')
  return response.json()
}

export async function notifyBotOrderConfirmed(orderId: string, delayMinutes: number) {
  if (!botApiUrl || !botAdminToken) {
    throw new Error('Bot no configurado.')
  }

  const response = await fetch(`${botApiUrl}/orders/${orderId}/confirmed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-token': botAdminToken,
    },
    body: JSON.stringify({ delayMinutes }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || 'El bot no pudo avisar al cliente.')
  }
}

export type SalesResetStatus = {
  usados: number
  restantes: number
  maximo: number
}

/** Cuantos borrados de ventas quedan disponibles. */
export async function fetchSalesResetStatus(): Promise<SalesResetStatus> {
  const response = await fetch(`${botApiUrl}/admin/reset-sales/status`, {
    headers: { 'x-bot-token': botAdminToken },
  })
  if (!response.ok) throw new Error('No se pudo consultar el estado del borrado de ventas.')
  return response.json()
}

/** Borra todo el historial de ventas. Lo hace el bot porque el navegador no tiene permiso. */
export async function resetSalesData(): Promise<{ pedidosBorrados: number; diasBorrados: number; restantes: number }> {
  const response = await fetch(`${botApiUrl}/admin/reset-sales`, {
    method: 'POST',
    headers: { 'x-bot-token': botAdminToken },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || 'No se pudo borrar el historial de ventas.')
  return body
}
