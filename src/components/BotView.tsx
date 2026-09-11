import {
  Bot,
  CheckCircle2,
  Clock3,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  PauseCircle,
  PlayCircle,
  Power,
  PowerOff,
  QrCode,
  RefreshCw,
  Save,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  botApiUrl,
  botAdminToken,
  emitBotHealthChanged,
  fetchBotHealth,
  fetchBotSettings,
  fetchWhatsappGroups,
  fetchWhatsappQr,
  logoutWhatsappSession,
  saveBotSettings,
  setBotAcceptingOrders,
  setBotEnabled,
  type BotHealth,
  type BotSettings,
  type WhatsappGroup,
} from '../lib/botApi'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

const emptySettings: BotSettings = {
  openHour: 17,
  closeHour: 23,
  acceptingOrders: true,
  acceptingOrdersPausedUntil: '',
  acceptingOrdersPauseReason: '',
  pickupOnlyMode: false,
  pickupOnlyMessage: '',
  autoRepliesEnabled: true,
  deliveryGroupName: '',
  deliveryGroupId: '',
  ownerAlertGroupName: '',
  ownerAlertChatId: '',
  closedMessage: '',
  pausedOrdersMessage: '',
  qrPaymentMessage: '',
  deliveryPricingMessage: '',
  humanHelpMessage: '',
  personality: '',
}

export function BotView() {
  const [health, setHealth] = useState<BotHealth | null>(null)
  const [settings, setSettings] = useState<BotSettings>(emptySettings)
  const [groups, setGroups] = useState<WhatsappGroup[]>([])
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)
  const [sessionMessage, setSessionMessage] = useState('')

  const isConfigured = Boolean(botApiUrl && botAdminToken)
  const statusLabel = useMemo(() => {
    if (!health) return 'Consultando'
    if (!health.whatsappConnected) return 'WhatsApp sin conectar'
    if (!health.botEnabled) return 'Bot apagado'
    if (health.acceptingOrders === false) return 'Pedidos pausados'
    if (health.autoRepliesEnabled === false) return 'Respuestas pausadas'
    return 'Bot operativo'
  }, [health])

  async function refreshAll() {
    if (!isConfigured) return
    try {
      setError('')
      const [nextHealth, nextSettings] = await Promise.all([
        fetchBotHealth(),
        fetchBotSettings(),
      ])
      setHealth(nextHealth)
      emitBotHealthChanged(nextHealth)
      setSettings(nextSettings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el bot.')
    }
  }

  async function runAction(action: () => Promise<void>, successMessage: string) {
    try {
      setBusy(true)
      setError('')
      await action()
      setNotice(successMessage)
      await refreshAll()
      emitBotHealthChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la accion.')
    } finally {
      setBusy(false)
    }
  }

  async function showQr() {
    try {
      setBusy(true)
      setQrLoading(true)
      setError('')
      setSessionMessage('')
      setQrDataUrl('')

      const nextHealth = await fetchBotHealth()
      setHealth(nextHealth)

      if (nextHealth.whatsappConnected) {
        setQrDataUrl('')
        setSessionMessage('Sesion iniciada con exito. El bot ya esta conectado a WhatsApp.')
        setNotice('WhatsApp conectado correctamente.')
        return
      }

      const qr = await fetchWhatsappQr()
      setQrDataUrl(qr.qrDataUrl || '')
      setSessionMessage('Escanea este QR desde WhatsApp. Cuando inicie sesion, el QR se ocultara automaticamente al actualizar.')
      setNotice('QR listo para escanear.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No hay QR disponible todavia.')
      await refreshAll()
    } finally {
      setBusy(false)
      setQrLoading(false)
    }
  }

  async function closeWhatsappSession() {
    if (!window.confirm('Esto cerrara la sesion actual de WhatsApp y pedira iniciar con QR nuevamente. Continuar?')) return
    await runAction(async () => {
      setQrDataUrl('')
      setSessionMessage('')
      await logoutWhatsappSession()
    }, 'Sesion cerrada con exito. Inicia sesion otra vez para que el bot funcione.')
    setSessionMessage('Sesion cerrada con exito. Espera unos segundos, luego toca Mostrar QR para conectar el numero.')
  }

  useEffect(() => {
    void refreshAll()
  }, [])

  useEffect(() => {
    if (!qrDataUrl || health?.whatsappConnected) return undefined

    const timer = window.setInterval(async () => {
      const nextHealth = await fetchBotHealth().catch(() => null)
      if (!nextHealth) return
      setHealth(nextHealth)
      if (nextHealth.whatsappConnected) {
        setQrDataUrl('')
        setSessionMessage('Sesion iniciada con exito. El bot ya esta conectado a WhatsApp.')
        setNotice('WhatsApp conectado correctamente.')
      }
    }, 3000)

    return () => window.clearInterval(timer)
  }, [qrDataUrl, health?.whatsappConnected])

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-accent">Bot WhatsApp</div>
            <h1 className="mt-2 text-2xl font-black text-ink">Control y configuracion</h1>
            <p className="mt-1 text-sm text-muted">Estado actual: <span className="font-bold text-ink">{statusLabel}</span></p>
          </div>
          <Button tone="secondary" onClick={() => void refreshAll()} disabled={busy}>
            <RefreshCw size={16} />
            Actualizar
          </Button>
        </div>
        {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Panel className="p-5">
          <SectionTitle icon={Power} title="Operacion" />
          <div className="mt-4 grid gap-3">
            <OperationSwitch
              active={health?.botEnabled === true}
              disabled={busy}
              offIcon={PowerOff}
              offLabel="Apagado"
              onActivate={() => runAction(() => setBotEnabled(true).then(() => undefined), 'Bot encendido.')}
              onDeactivate={() => runAction(() => setBotEnabled(false).then(() => undefined), 'Bot apagado.')}
              onIcon={Power}
              onLabel="Encendido"
            />
            <OperationSwitch
              active={settings.acceptingOrders}
              disabled={busy || health?.botEnabled === false}
              offIcon={PauseCircle}
              offLabel="Pausado"
              onActivate={() => runAction(() => setBotAcceptingOrders(true).then(() => undefined), 'Recepcion de pedidos reanudada.')}
              onDeactivate={() => runAction(() => setBotAcceptingOrders(false).then(() => undefined), 'Pedidos pausados.')}
              onIcon={PlayCircle}
              onLabel="Recibe pedidos"
            />
            <OperationSwitch
              active={settings.pickupOnlyMode}
              disabled={busy || health?.botEnabled === false || !settings.acceptingOrders}
              offIcon={PowerOff}
              offLabel="Delivery normal"
              onActivate={() => runAction(() => saveBotSettings({ pickupOnlyMode: true }).then(() => undefined), 'Modo solo recojo activado.')}
              onDeactivate={() => runAction(() => saveBotSettings({ pickupOnlyMode: false }).then(() => undefined), 'Delivery reactivado.')}
              onIcon={ShoppingBag}
              onLabel="Solo recojo"
            />
            <OperationSwitch
              active={settings.autoRepliesEnabled}
              disabled={busy || health?.botEnabled === false}
              offIcon={PauseCircle}
              offLabel="Pausa humana"
              onActivate={() => runAction(() => saveBotSettings({ autoRepliesEnabled: true }).then(() => undefined), 'Respuestas automaticas reanudadas.')}
              onDeactivate={() => runAction(() => saveBotSettings({ autoRepliesEnabled: false }).then(() => undefined), 'Respuestas automaticas pausadas.')}
              onIcon={MessageSquareText}
              onLabel="Responde solo"
            />
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionTitle icon={QrCode} title="Sesion de WhatsApp" />
          <div className="mt-4 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-2xl ${health?.whatsappConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {health?.whatsappConnected ? <CheckCircle2 size={21} /> : <QrCode size={21} />}
                </div>
                <div>
                  <div className="text-sm font-black text-ink">
                    {health?.whatsappConnected ? '1 sesion activa' : 'Sin sesion activa'}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-muted">
                    {health?.whatsappConnected ? 'WhatsApp conectado. El bot puede responder mensajes.' : 'Conecta el numero del bot escaneando un QR.'}
                  </div>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${health?.whatsappConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {health?.whatsappConnected ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                {health?.whatsappConnected ? 'Sesion iniciada' : 'Esperando QR'}
              </span>
            </div>
            {sessionMessage ? (
              <div className="mt-3 rounded-xl border border-accent/20 bg-accentWash px-3 py-2 text-sm font-semibold text-ink">
                {sessionMessage}
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ActionButton
              label={health?.whatsappConnected ? 'Sesion activa' : 'Mostrar QR'}
              icon={QrCode}
              disabled={busy || health?.whatsappConnected}
              onClick={() => void showQr()}
            />
            <ActionButton
              label="Cerrar sesion"
              icon={KeyRound}
              disabled={busy}
              onClick={() => void closeWhatsappSession()}
            />
            <ActionButton
              label="Leer grupos"
              icon={Users}
              disabled={busy}
              onClick={() => runAction(async () => {
                setGroups(await fetchWhatsappGroups())
              }, 'Grupos actualizados.')}
            />
          </div>
          {(qrLoading || qrDataUrl) && !health?.whatsappConnected ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white p-4 transition-all duration-300">
              {qrLoading ? (
                <div className="grid min-h-72 place-items-center text-sm font-bold text-muted">
                  <LoaderCircle className="mb-3 animate-spin text-accent" size={28} />
                  Generando QR...
                </div>
              ) : null}
              {qrDataUrl ? (
                <>
                  <div className="mb-3 text-center text-xs font-black uppercase tracking-[0.16em] text-muted">QR de inicio de sesion</div>
              <img alt="QR WhatsApp" className="mx-auto max-h-72 rounded-xl" src={qrDataUrl} />
                </>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionTitle icon={Users} title="Grupos y derivaciones" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Grupo de delivery" value={settings.deliveryGroupName} onChange={(value) => setSettings({ ...settings, deliveryGroupName: value, deliveryGroupId: '' })} />
          <GroupSelect
            label="Seleccionar grupo delivery"
            groups={groups}
            value={settings.deliveryGroupId}
            onChange={(group) => setSettings({ ...settings, deliveryGroupId: group.id, deliveryGroupName: group.name })}
          />
          <Field label="Grupo soporte/intervencion" value={settings.ownerAlertGroupName} onChange={(value) => setSettings({ ...settings, ownerAlertGroupName: value, ownerAlertChatId: '' })} />
          <GroupSelect
            label="Seleccionar grupo soporte"
            groups={groups}
            value={settings.ownerAlertChatId}
            onChange={(group) => setSettings({ ...settings, ownerAlertChatId: group.id, ownerAlertGroupName: group.name })}
          />
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionTitle icon={MessageSquareText} title="Mensajes del bot" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="flex items-center gap-4 lg:col-span-2 bg-panel p-3.5 rounded-xl border border-line">
            <div className="flex-1">
              <label className="block text-xs font-bold text-ink mb-1">Hora Apertura (0 - 23h)</label>
              <input
                type="number"
                min="0"
                max="23"
                className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink"
                value={settings.openHour ?? 17}
                onChange={(e) => setSettings({ ...settings, openHour: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted font-semibold mt-1 block">Ej: 17 = 5:00 PM</span>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-ink mb-1">Hora Cierre (0 - 23h)</label>
              <input
                type="number"
                min="0"
                max="23"
                className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink"
                value={settings.closeHour ?? 23}
                onChange={(e) => setSettings({ ...settings, closeHour: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted font-semibold mt-1 block">Ej: 23 = 11:00 PM</span>
            </div>
          </div>
          <TextArea label="Mensaje fuera de horario" value={settings.closedMessage} onChange={(value) => setSettings({ ...settings, closedMessage: value })} />
          <TextArea label="Mensaje pedidos pausados" value={settings.pausedOrdersMessage} onChange={(value) => setSettings({ ...settings, pausedOrdersMessage: value })} />
          <TextArea label="Mensaje solo recojo" value={settings.pickupOnlyMessage} onChange={(value) => setSettings({ ...settings, pickupOnlyMessage: value })} />
          <TextArea label="Mensaje pago QR" value={settings.qrPaymentMessage} onChange={(value) => setSettings({ ...settings, qrPaymentMessage: value })} />
          <TextArea label="Mensaje delivery/tarifario" value={settings.deliveryPricingMessage} onChange={(value) => setSettings({ ...settings, deliveryPricingMessage: value })} />
          <TextArea label="Mensaje intervencion humana" value={settings.humanHelpMessage} onChange={(value) => setSettings({ ...settings, humanHelpMessage: value })} />
          <TextArea label="Personalidad del bot" value={settings.personality} onChange={(value) => setSettings({ ...settings, personality: value })} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button disabled={busy} onClick={() => void runAction(() => saveBotSettings(settings).then(() => undefined), 'Configuracion guardada.')}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
            Guardar configuracion
          </Button>
        </div>
      </Panel>
    </div>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Bot; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-muted">
      <Icon size={16} className="text-accent" />
      {title}
    </div>
  )
}

function ActionButton({ active, icon: Icon, label, disabled, onClick }: { active?: boolean; icon: typeof Bot; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-80 ${
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-line bg-white text-ink hover:bg-accentWash'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

function OperationSwitch({
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
  offIcon: typeof Bot
  offLabel: string
  onActivate: () => Promise<void>
  onDeactivate: () => Promise<void>
  onIcon: typeof Bot
  onLabel: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={disabled || active}
        onClick={() => void onActivate()}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition disabled:cursor-not-allowed ${
          active
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-line bg-white text-ink hover:bg-accentWash disabled:opacity-60'
        }`}
      >
        <OnIcon size={15} />
        {onLabel}
      </button>
      <button
        type="button"
        disabled={disabled || !active}
        onClick={() => void onDeactivate()}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition disabled:cursor-not-allowed ${
          !active
            ? 'border-[#35251f] bg-[#2a201b] text-white'
            : 'border-line bg-white text-ink hover:bg-accentWash disabled:opacity-60'
        }`}
      >
        <OffIcon size={15} />
        {offLabel}
      </button>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-wider text-muted">{label}</span>
      <input className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-wider text-muted">{label}</span>
      <textarea className="mt-1 min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function GroupSelect({ label, groups, value, onChange }: { label: string; groups: WhatsappGroup[]; value: string; onChange: (group: WhatsappGroup) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-wider text-muted">{label}</span>
      <select className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent" value={value} onChange={(event) => {
        const group = groups.find((item) => item.id === event.target.value)
        if (group) onChange(group)
      }}>
        <option value="">Elegir grupo...</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name} ({group.participants})</option>
        ))}
      </select>
      {value ? <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={12} /> Grupo seleccionado</span> : null}
    </label>
  )
}
