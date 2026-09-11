import { Bot, Power, PowerOff, RefreshCw, ShoppingBag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { UserRole } from '../types'
import {
  botApiUrl,
  botAdminToken,
  emitBotHealthChanged,
  fetchBotHealth,
  fetchBotSettings,
  onBotHealthChanged,
  saveBotSettings,
  setBotAcceptingOrders,
  setBotEnabled as updateBotEnabled,
  type BotHealth,
  type BotSettings,
} from '../lib/botApi'

type BotStatus = 'checking' | 'online' | 'offline' | 'error' | 'not_configured'

export function BotControlPanel({ collapsed, userRole }: { collapsed: boolean; userRole: UserRole | 'demo' }) {
  const canControlBot = userRole === 'admin' || userRole === 'caja' || userRole === 'pedidos' || userRole === 'demo'
  const [health, setHealth] = useState<BotHealth | null>(null)
  const [settings, setSettings] = useState<BotSettings | null>(null)
  const [status, setStatus] = useState<BotStatus>('checking')
  const [isBusy, setIsBusy] = useState(false)

  const statusLabel = useMemo(() => {
    if (status === 'not_configured') return 'Configurar bot'
    if (status === 'checking') return 'Revisando bot'
    if (status === 'offline') return 'Bot sin conexion'
    if (status === 'error') return 'Bot no responde'
    if (!health?.whatsappConnected) return 'WhatsApp sin QR'
    return health.botEnabled ? 'Bot encendido' : 'Bot apagado'
  }, [health, status])

  const statusDetail = useMemo(() => {
    if (status === 'not_configured') return 'Falta URL o token del bot.'
    if (status === 'offline' || status === 'error') return 'Inicia el bot local o revisa el servidor.'
    if (!health) return 'Consultando estado...'
    if (!health.whatsappConnected) return 'Escanea el QR para conectar WhatsApp.'
    if (!health.botEnabled) return 'No respondera mensajes nuevos.'
    if (health.acceptingOrders === false) return 'Pedidos pausados temporalmente.'
    return settings?.pickupOnlyMode ? 'Solo pedidos para recojo.' : 'Recibe pedidos automaticamente.'
  }, [health, settings, status])

  const isConnected = Boolean(health?.whatsappConnected)
  const isEnabled = Boolean(health?.botEnabled)
  const isAcceptingOrders = health?.acceptingOrders !== false
  const isAutoReplying = health?.autoRepliesEnabled !== false
  const isPickupOnly = settings?.pickupOnlyMode === true

  async function refreshHealth() {
    if (!botApiUrl || !botAdminToken) {
      setStatus('not_configured')
      return
    }

    try {
      setStatus('checking')
      const [nextHealth, nextSettings] = await Promise.all([fetchBotHealth(), fetchBotSettings()])
      setHealth(nextHealth)
      setSettings(nextSettings)
      emitBotHealthChanged(nextHealth)
      setStatus('online')
    } catch {
      setHealth(null)
      setStatus('offline')
    }
  }

  async function runControl(action: () => Promise<unknown>) {
    try {
      setIsBusy(true)
      await action()
      await refreshHealth()
    } catch {
      setStatus('error')
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    if (!canControlBot) return
    void refreshHealth()
    const interval = window.setInterval(() => void refreshHealth(), 30000)
    const unsubscribe = onBotHealthChanged((nextHealth) => {
      if (nextHealth) {
        setHealth(nextHealth)
        setStatus('online')
      } else {
        void refreshHealth()
      }
    })
    return () => {
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [canControlBot])

  if (!canControlBot) return null

  if (collapsed) {
    return (
      <button
        type="button"
        className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
          health?.botEnabled && health?.whatsappConnected
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-white/80 bg-white/70 text-muted'
        }`}
        onClick={() => void refreshHealth()}
        title={statusLabel}
      >
        <Bot size={18} />
      </button>
    )
  }

  return (
    <div className="rounded-[1.25rem] border border-white/80 bg-white/72 p-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Bot size={16} className="text-accent" />
          Bot WhatsApp
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-white text-muted transition hover:text-ink"
          onClick={() => void refreshHealth()}
          title="Actualizar estado"
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="mt-2 text-sm font-semibold text-ink">{statusLabel}</div>
      <div className="mt-0.5 text-xs leading-4 text-muted">{statusDetail}</div>

      <div className="mt-3 grid gap-2">
        <StateSwitch
          active={isEnabled}
          disabled={isBusy}
          offIcon={PowerOff}
          offLabel="Apagado"
          onActivate={() => runControl(() => updateBotEnabled(true))}
          onDeactivate={() => runControl(() => updateBotEnabled(false))}
          onIcon={Power}
          onLabel="Encendido"
        />
        <StateSwitch
          active={isAcceptingOrders}
          disabled={isBusy || !isConnected || !isEnabled}
          offIcon={PowerOff}
          offLabel="Pedidos pausados"
          onActivate={() => runControl(() => setBotAcceptingOrders(true))}
          onDeactivate={() => runControl(() => setBotAcceptingOrders(false))}
          onIcon={Power}
          onLabel="Recibe pedidos"
        />
        <StateSwitch
          active={isPickupOnly}
          disabled={isBusy || !isConnected || !isEnabled || !isAcceptingOrders}
          offIcon={PowerOff}
          offLabel="Delivery normal"
          onActivate={() => runControl(() => saveBotSettings({ pickupOnlyMode: true }))}
          onDeactivate={() => runControl(() => saveBotSettings({ pickupOnlyMode: false }))}
          onIcon={ShoppingBag}
          onLabel="Solo recojo"
        />
        <StateSwitch
          active={isAutoReplying}
          disabled={isBusy || !isConnected || !isEnabled}
          offIcon={PowerOff}
          offLabel="Respuestas pausadas"
          onActivate={() => runControl(() => saveBotSettings({ autoRepliesEnabled: true }))}
          onDeactivate={() => runControl(() => saveBotSettings({ autoRepliesEnabled: false }))}
          onIcon={Power}
          onLabel="Responde solo"
        />
      </div>
    </div>
  )
}

function StateSwitch({
  active,
  disabled,
  offIcon: OffIcon,
  offLabel,
  onActivate,
  onDeactivate,
  onIcon: OnIcon,
  onLabel,
}: {
  active: boolean
  disabled?: boolean
  offIcon: typeof Power
  offLabel: string
  onActivate: () => Promise<void>
  onDeactivate: () => Promise<void>
  onIcon: typeof Power
  onLabel: string
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <button
        type="button"
        className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-black transition ${
          active
            ? 'bg-success text-white shadow-sm'
            : 'bg-white text-muted ring-1 ring-line hover:bg-accentWash hover:text-ink'
        } disabled:cursor-not-allowed disabled:opacity-70`}
        disabled={disabled || active}
        onClick={() => void onActivate()}
      >
        <OnIcon size={12} />
        {onLabel}
      </button>
      <button
        type="button"
        className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-black transition ${
          !active
            ? 'bg-[#2a201b] text-white shadow-sm'
            : 'bg-white text-muted ring-1 ring-line hover:bg-accentWash hover:text-ink'
        } disabled:cursor-not-allowed disabled:opacity-70`}
        disabled={disabled || !active}
        onClick={() => void onDeactivate()}
      >
        <OffIcon size={12} />
        {offLabel}
      </button>
    </div>
  )
}
