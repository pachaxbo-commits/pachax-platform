import { ChevronDown, Palette, Printer, Save, SlidersHorizontal, Store, TableProperties, Users } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
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
}: Props) {
  const [branding, setBranding] = useState<NightclubBranding>(
    () => structuredClone(data.branding || defaultBranding(fallbackName, fallbackLogo))
  )
  const [message, setMessage] = useState('')

  const saveBranding = async () => {
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
          <Status label="Reservas" value="Habilitadas" />
          <Status label="Cobro por ronda" value="Activo" />
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
