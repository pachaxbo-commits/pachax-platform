import { ChevronDown, Palette, Printer, Save, SlidersHorizontal, Store, TableProperties, Users, Plus, Warehouse } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { NightclubBranding, NightclubDataset } from '../domain/nightclubAccounts'
import type { TableDraft, ZoneDraft } from '../domain/nightclubFloor'
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { BusinessIdentitySettings } from '../../../components/settings/BusinessIdentitySettings'
import { PrinterSettingsView } from '../../../components/PrinterSettingsView'
import { NightclubFloor } from './NightclubFloor'

type Props = {
  data: NightclubDataset
  fallbackName: string
  fallbackLogo?: string
  onSaveBranding: (branding: NightclubBranding) => boolean | Promise<boolean>
  onSaveZone: (draft: ZoneDraft) => boolean | Promise<boolean>
  onSaveTable: (draft: TableDraft) => boolean | Promise<boolean>
  onDeleteZone: (id: string) => boolean | Promise<boolean>
  onDeleteTable: (id: string) => boolean | Promise<boolean>
  usersPanel?: ReactNode
  canViewFloor?: boolean
  readOnly?: boolean
  mode?: 'tenant' | 'demo' | 'studio'
  businessIdentity?: BusinessIdentity
  onSaveBusinessIdentity?: (identity: BusinessIdentity) => Promise<void> | void
  onUploadLogo?: (file: File) => Promise<string>
  tenantId?: string
  branchId?: string
  canManageSettings?: boolean
  onInitializeNightclubInfrastructure?: (operationId: string) => Promise<{ status: string }>
  onCreateNightclubCashbox?: (name: string, operationId: string) => Promise<{ cashboxId: string; locationId: string }>
}

const defaultBranding = (name: string, logo?: string): NightclubBranding => ({
  businessName: name,
  subtitle: 'Club nocturno / Lounge',
  logoDataUrl: logo,
  primaryColor: '#d8a84e',
  accentColor: '#35d0a0',
  surfaceColor: '#0d1720',
})

export function NightclubSettings({
  data,
  fallbackName,
  fallbackLogo,
  onSaveBranding,
  onSaveZone,
  onSaveTable,
  onDeleteZone,
  onDeleteTable,
  usersPanel,
  canViewFloor = true,
  readOnly = false,
  mode = 'demo',
  businessIdentity,
  onSaveBusinessIdentity,
  onUploadLogo,
  tenantId,
  branchId = 'main',
  canManageSettings = true,
  onInitializeNightclubInfrastructure,
  onCreateNightclubCashbox,
}: Props) {
  const [branding, setBranding] = useState<NightclubBranding>(
    () => structuredClone(data.branding || defaultBranding(fallbackName, fallbackLogo))
  )
  const [message, setMessage] = useState('')
  const [infrastructureSaving, setInfrastructureSaving] = useState(false)
  const [infrastructureOperationId, setInfrastructureOperationId] = useState<string | null>(null)
  const [cashboxModalOpen, setCashboxModalOpen] = useState(false)
  const [cashboxName, setCashboxName] = useState('')
  const [cashboxSaving, setCashboxSaving] = useState(false)
  const [cashboxOperationId, setCashboxOperationId] = useState<string | null>(null)
  const [cashboxError, setCashboxError] = useState('')

  const branchLocations = (data.locations || []).filter(location => location.branchId === branchId)
  const branchCashboxes = (data.cashboxes || []).filter(cashbox => cashbox.branchId === branchId)
  const warehouse = branchLocations.find(location => location.id === 'warehouse-general')
  const baseCashbox = branchCashboxes.find(cashbox => cashbox.id === 'cashbox-1')
  const baseCashboxLocation = branchLocations.find(location => location.id === 'cashbox-1')
  const infrastructureReady = warehouse?.type === 'warehouse' && warehouse.active
    && baseCashbox?.active === true && baseCashbox.locationId === 'cashbox-1'
    && baseCashboxLocation?.type === 'cashbox' && baseCashboxLocation.active
    && baseCashboxLocation.linkedCashboxId === 'cashbox-1'
    && branchCashboxes.every(cashbox => {
      const location = branchLocations.find(item => item.id === cashbox.locationId)
      return cashbox.active && location?.active && location.type === 'cashbox' && location.linkedCashboxId === cashbox.id
    })
  const infrastructureMissing = branchLocations.length === 0 && branchCashboxes.length === 0

  const initializeInfrastructure = async () => {
    if (!onInitializeNightclubInfrastructure || infrastructureSaving) return
    const operationId = infrastructureOperationId || crypto.randomUUID()
    setInfrastructureOperationId(operationId)
    setInfrastructureSaving(true)
    try {
      const result = await onInitializeNightclubInfrastructure(operationId)
      setMessage(result.status === 'initialized' ? 'Almacén y Caja principal configurados.' : 'La infraestructura Nightclub ya estaba configurada.')
      setInfrastructureOperationId(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo configurar la infraestructura. Puedes reintentar.')
    } finally {
      setInfrastructureSaving(false)
    }
  }

  const createCashbox = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onCreateNightclubCashbox || cashboxSaving) return
    const operationId = cashboxOperationId || crypto.randomUUID()
    setCashboxOperationId(operationId)
    setCashboxSaving(true)
    setCashboxError('')
    try {
      const result = await onCreateNightclubCashbox(cashboxName, operationId)
      setMessage(`Caja creada y vinculada a su ubicación (${result.cashboxId}).`)
      setCashboxModalOpen(false)
      setCashboxName('')
      setCashboxOperationId(null)
    } catch (error) {
      setCashboxError(error instanceof Error ? error.message : 'No se pudo crear la caja. Puedes reintentar.')
    } finally {
      setCashboxSaving(false)
    }
  }

  const saveBranding = async () => {
    if (mode === 'tenant') {
      try {
        if (branding.theme) localStorage.setItem('pachax:nightclub-theme', branding.theme)
        if (branding.surfaceColor) localStorage.setItem('pachax:nightclub-surface', branding.surfaceColor)
      } catch {
        // ignore in private browsing
      }
      setMessage('Preferencias visuales guardadas localmente.')
      return
    }
    if (await onSaveBranding(branding)) {
      setMessage('Preferencias visuales guardadas.')
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-amber-300">Administración del espacio</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Configuración</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ajusta la identidad, impresoras, zonas y personal desde un solo lugar.
        </p>
      </header>

      {message && (
        <button
          type="button"
          onClick={() => setMessage('')}
          role="status"
          className="w-full rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-left text-sm text-amber-100 cursor-pointer"
        >
          {message}
        </button>
      )}

      {/* 1. SECCIÓN CANÓNICA: EMPRESA Y DOCUMENTOS (BusinessIdentity) */}
      <Accordion
        icon={Store}
        title="Empresa y documentos"
        description="Identidad comercial, logo oficial, NIT y encabezados de comprobantes"
        open
      >
        <div className="bg-slate-900/60 p-1 sm:p-2 rounded-2xl">
          <BusinessIdentitySettings
            initialIdentity={
              businessIdentity || {
                tradeName: branding.businessName,
                logoUrl: branding.logoDataUrl,
                primaryColor: branding.primaryColor,
                accentColor: branding.accentColor,
              }
            }
            tenantId={tenantId}
            canManage={canManageSettings && !readOnly}
            onSaveIdentity={async (identity) => {
              if (onSaveBusinessIdentity) {
                await onSaveBusinessIdentity(identity)
              }
              // Sincronizar colores si se modificaron
              if (identity.primaryColor && identity.accentColor) {
                setBranding((curr) => ({
                  ...curr,
                  businessName: identity.tradeName,
                  logoDataUrl: identity.logoUrl,
                  primaryColor: identity.primaryColor!,
                  accentColor: identity.accentColor!,
                }))
              }
              setMessage('Empresa y datos documentales guardados.')
            }}
            onUploadLogo={onUploadLogo}
          />
        </div>
      </Accordion>

      {/* 2. SECCIÓN CANÓNICA: IMPRESORAS Y COMANDAS */}
      <Accordion
        icon={Printer}
        title="Impresoras y tickets"
        description="Hardware de Barra (58/80 mm) y Recibos de Caja en esta estación"
      >
        <div className="bg-white rounded-2xl p-1 text-slate-900">
          <PrinterSettingsView
            tenantId={mode === 'tenant' ? tenantId : mode}
            branchId={branchId}
            canManage={canManageSettings && !readOnly}
            allowedRoles={['bar', 'receipt']}
            accentColor={branding.primaryColor}
          />
        </div>
      </Accordion>

      {mode === 'tenant' && (
        <Accordion icon={Warehouse} title="Cajas y ubicaciones" description="Almacén general y cajas operativas de esta sucursal" open>
          <div className="space-y-3 rounded-2xl bg-slate-900/60 p-4">
            {!infrastructureReady && infrastructureMissing && (
              <div role="status" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                <p>Debes configurar las cajas y el almacén antes de comenzar a operar.</p>
                {canManageSettings && !readOnly && onInitializeNightclubInfrastructure && (
                  <button type="button" disabled={infrastructureSaving} onClick={() => void initializeInfrastructure()} className="mt-3 min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-slate-950 disabled:opacity-60">
                    {infrastructureSaving ? 'Configurando…' : 'Configurar almacén y Caja principal'}
                  </button>
                )}
              </div>
            )}
            {!infrastructureReady && !infrastructureMissing && (
              <p role="alert" className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-100">
                La configuración de cajas y ubicaciones está incompleta o no coincide. No se realizaron cambios; solicita una revisión administrativa.
              </p>
            )}
            {infrastructureReady && !warehouse && (
              <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">No se pudo leer el almacén. Revisa los permisos de inventario.</p>
            )}
            {warehouse && (
              <article className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <div><p className="font-semibold text-white">{warehouse.name || 'Almacén general'}</p><p className="text-xs text-slate-400">Ubicación {warehouse.id}</p></div>
                <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">{warehouse.active ? 'Activo' : 'Inactivo'}</span>
              </article>
            )}
            <div className="space-y-2">
              {branchCashboxes.map(cashbox => {
                const location = branchLocations.find(item => item.id === cashbox.locationId)
                return <article key={cashbox.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="min-w-0"><p className="truncate font-semibold text-white">{cashbox.name}</p><p className="text-xs text-slate-400">Ubicación vinculada: {location?.name || cashbox.locationId}</p></div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${cashbox.active && location?.active ? 'bg-emerald-300/10 text-emerald-200' : 'bg-rose-300/10 text-rose-200'}`}>{cashbox.active && location?.active ? 'Activa' : 'Revisar'}</span>
                </article>
              })}
              {infrastructureReady && branchCashboxes.length === 0 && <p className="text-sm text-slate-400">No hay cajas visibles para esta sucursal.</p>}
            </div>
            {infrastructureReady && canManageSettings && !readOnly && onCreateNightclubCashbox && (
              <button type="button" onClick={() => { setCashboxError(''); setCashboxModalOpen(true) }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300/40 px-4 font-bold text-amber-100 hover:bg-amber-300/10">
                <Plus size={16} /> Añadir caja
              </button>
            )}
          </div>
        </Accordion>
      )}

      {/* 3. APARIENCIA / PREFERENCIAS VISUALES */}
      <fieldset disabled={readOnly || !canManageSettings} className="space-y-5">
        <Accordion icon={Palette} title="Apariencia del salón" description="Tema visual, alto contraste y superficies">
          <div className="mb-4">
            <span className="block text-xs font-semibold text-slate-300 mb-2">Tema visual (Alto contraste)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBranding({ ...branding, theme: 'dark' })}
                className={`min-h-10 px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  branding.theme !== 'light'
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-xs'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                🌙 Oscuro
              </button>
              <button
                type="button"
                onClick={() => setBranding({ ...branding, theme: 'light' })}
                className={`min-h-10 px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  branding.theme === 'light'
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-xs'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                ☀️ Claro
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {mode !== 'tenant' && (
              <>
                <ColorField
                  label="Dorado principal"
                  value={branding.primaryColor}
                  onChange={(value) => setBranding({ ...branding, primaryColor: value })}
                />
                <ColorField
                  label="Estado positivo"
                  value={branding.accentColor}
                  onChange={(value) => setBranding({ ...branding, accentColor: value })}
                />
              </>
            )}
            <ColorField
              label="Superficie"
              value={branding.surfaceColor}
              onChange={(value) => setBranding({ ...branding, surfaceColor: value })}
            />
          </div>
          <div className="mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={saveBranding}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 font-bold text-[#07111a] text-xs cursor-pointer"
            >
              <Save size={15} />
              Guardar preferencias visuales
            </button>
          </div>
        </Accordion>
      </fieldset>

      {/* 4. ZONAS Y MESAS */}
      {canViewFloor && (
        <Accordion
          icon={TableProperties}
          title="Zonas y mesas"
          description={`${data.zones.length} zonas · ${data.tables.length} mesas`}
        >
          <NightclubFloor
            data={data}
            onSelectTable={() => undefined}
            onSaveZone={onSaveZone}
            onSaveTable={onSaveTable}
            onDeleteZone={onDeleteZone}
            onDeleteTable={onDeleteTable}
            embedded
          />
        </Accordion>
      )}

      {cashboxModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !cashboxSaving) setCashboxModalOpen(false) }}>
          <form role="dialog" aria-modal="true" aria-labelledby="nightclub-cashbox-title" onSubmit={event => void createCashbox(event)} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#101b25] p-5 shadow-2xl">
            <div><h2 id="nightclub-cashbox-title" className="text-lg font-bold text-white">Añadir caja</h2><p className="mt-1 text-sm text-slate-400">Se creará una ubicación vinculada de forma segura.</p></div>
            <label className="block text-sm font-semibold text-slate-200">Nombre de la caja<input autoFocus required maxLength={60} value={cashboxName} onChange={event => setCashboxName(event.target.value)} placeholder="Caja 2" className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-white outline-none focus:border-amber-300" /></label>
            {cashboxError && <p role="alert" className="rounded-lg bg-rose-400/10 p-3 text-sm text-rose-200">{cashboxError}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={cashboxSaving} onClick={() => setCashboxModalOpen(false)} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-slate-200 disabled:opacity-60">Cancelar</button><button type="submit" disabled={cashboxSaving || !cashboxName.trim()} className="min-h-11 rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-60">{cashboxSaving ? 'Guardando…' : 'Guardar caja'}</button></div>
          </form>
        </div>
      )}

      {/* 5. USUARIOS Y PERMISOS */}
      {usersPanel && (
        <Accordion icon={Users} title="Usuarios y permisos" description="Personal, roles y matriz de acceso">
          {usersPanel}
        </Accordion>
      )}

      {/* 6. OPERACIÓN */}
      <Accordion icon={SlidersHorizontal} title="Operación" description="Estado del turno y reglas activas">
        <div className="grid gap-3 sm:grid-cols-3">
          <Status label="Turno" value={data.shift?.status === 'open' ? 'Abierto' : 'Cerrado'} />
          {mode !== 'tenant' && <Status label="Reservas" value="Habilitadas" />}
          {mode === 'tenant' ? (
            <Status label="Modelo de cobro" value="Cuenta abierta + pagos parciales" />
          ) : (
            <Status label="Cobro por ronda" value="Activo" />
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Los cambios de turno se realizan en Caja. Los estados de mesa se administran desde Zonas para conservar la trazabilidad.
        </p>
      </Accordion>
    </div>
  )
}

function Accordion({
  icon: Icon,
  title,
  description,
  open = false,
  children,
}: {
  icon: typeof Store
  title: string
  description: string
  open?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={open} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0d1720]/90">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-300">
          <Icon size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-white">{title}</strong>
          <span className="block truncate text-xs text-slate-400">{description}</span>
        </span>
        <ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/10 p-4 sm:p-5">{children}</div>
    </details>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-semibold text-slate-300">
      <span>{label}</span>
      <span className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-[#07111a] p-2">
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border-0! bg-transparent! p-0"
        />
        <code className="text-slate-300">{value.toUpperCase()}</code>
      </span>
    </label>
  )
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#07111a] p-3">
      <span className="block text-xs text-slate-500">{label}</span>
      <strong className="mt-1 block text-sm text-slate-100">{value}</strong>
    </div>
  )
}
