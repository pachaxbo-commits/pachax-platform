import { useState } from 'react'
import {
  Truck,
  Utensils,
  Music2,
  Store,
  Building2,
  ArrowRight,
  Plus,
  LogOut,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { BrandMark } from '../public/components/BrandMark'
import type { TenantAccess } from '../store/authStore'
import type { BusinessType } from '../core/platform'

interface TenantSelectorViewProps {
  userEmail: string | null
  userDisplayName: string | null
  tenants: TenantAccess[]
  activeTenantId: string | null
  onSelectTenant: (tenantId: string) => Promise<void>
  onCreateNewTenant: () => void
  onSignOut: () => Promise<void>
}

const TEMPLATE_METADATA: Record<
  BusinessType,
  { label: string; icon: typeof Truck; badgeClass: string }
> = {
  route_distribution: {
    label: 'Producción y Distribución',
    icon: Truck,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  restaurant_pos: {
    label: 'Restaurante con salón',
    icon: Utensils,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  hamburger_shop: {
    label: 'Restaurante servicio rápido',
    icon: Utensils,
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  nightclub_lounge: {
    label: 'Club nocturno / Lounge',
    icon: Music2,
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  gelateria_weight_cafe: {
    label: 'Comercio / Venta rápida',
    icon: Store,
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
  },
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  warehouse: 'Almacén',
  distributor: 'Distribuidor',
  cashier: 'Caja',
  sales: 'Ventas',
  waiter: 'Mesero',
  kitchen: 'Cocina',
  partner: 'Socio',
  support: 'Soporte técnico',
  inventory: 'Inventario',
}

export function TenantSelectorView({
  userEmail,
  userDisplayName,
  tenants,
  activeTenantId,
  onSelectTenant,
  onCreateNewTenant,
  onSignOut,
}: TenantSelectorViewProps) {
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = async (tenantId: string) => {
    if (selectingId) return
    setError(null)
    setSelectingId(tenantId)
    try {
      await onSelectTenant(tenantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo acceder a la empresa.')
      setSelectingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col font-sans selection:bg-[#0066FF] selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandMark size="md" href="/platform" />

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {userDisplayName || 'Usuario'}
              </span>
              <span className="text-xs text-slate-500 leading-tight">
                {userEmail || ''}
              </span>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-2xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-3">
            <Building2 className="w-3.5 h-3.5" />
            <span>PACHAX Platform</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Tus empresas
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600">
            Selecciona la empresa con la que deseas operar hoy o registra una nueva.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error al cambiar de empresa</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tenants.map(({ tenant, membership }) => {
            const templateInfo = TEMPLATE_METADATA[tenant.businessType] || {
              label: tenant.businessType,
              icon: Building2,
              badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
            }
            const Icon = templateInfo.icon
            const roleLabel = ROLE_LABELS[membership.roleId] || membership.roleId
            const isCurrent = tenant.tenantId === activeTenantId
            const isPending = selectingId === tenant.tenantId

            return (
              <div
                key={tenant.tenantId}
                onClick={() => !selectingId && handleSelect(tenant.tenantId)}
                className={`group relative bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between p-5 cursor-pointer shadow-xs hover:shadow-md ${
                  isCurrent
                    ? 'border-[#0066FF] ring-2 ring-[#0066FF]/10'
                    : 'border-slate-200 hover:border-slate-300'
                } ${selectingId && !isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                      style={{
                        backgroundColor: tenant.branding?.primary || '#0F172A',
                        color: '#FFFFFF',
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-[#0066FF] border border-blue-200">
                          <CheckCircle2 className="w-3 h-3" />
                          En uso
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Activa
                      </span>
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-[#0066FF] transition-colors line-clamp-1">
                    {tenant.name}
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-2 items-center text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-medium ${templateInfo.badgeClass}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {templateInfo.label}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      {roleLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-mono">
                    ID: {tenant.tenantId.slice(0, 10)}...
                  </span>

                  <button
                    type="button"
                    disabled={Boolean(selectingId)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-900 group-hover:bg-[#0066FF] transition-colors shadow-xs"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Abriendo...</span>
                      </>
                    ) : (
                      <>
                        <span>Entrar</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Action Card: Register another tenant */}
          <div
            onClick={onCreateNewTenant}
            className="group rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#0066FF] bg-white/50 hover:bg-white transition-all duration-200 p-6 flex flex-col items-center justify-center text-center cursor-pointer min-h-[190px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-blue-50 text-slate-600 group-hover:text-[#0066FF] flex items-center justify-center transition-colors mb-3">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0066FF] transition-colors">
              Registrar otra empresa
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-xs">
              Crea un nuevo espacio de trabajo independiente para otra sucursal o modelo de negocio.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
