import {
  Building2,
  Truck,
  Utensils,
  Music2,
  Store,
  LogOut,
  Plus,
  User,
  Layers,
} from 'lucide-react'
import { BrandMark } from '../public/components/BrandMark'
import type { BusinessType } from '../core/platform'
import type { UserRole } from '../types'

interface PlatformHeaderBarProps {
  tenantName: string
  businessType: BusinessType | string
  role: string | UserRole
  userName: string
  userEmail?: string | null
  hasMultipleTenants: boolean
  onSwitchTenant: () => void
  onCreateNewTenant: () => void
  onSignOut: () => Promise<void>
}

const TEMPLATE_ICONS: Record<string, typeof Truck> = {
  route_distribution: Truck,
  restaurant_pos: Utensils,
  hamburger_shop: Utensils,
  nightclub_lounge: Music2,
  gelateria_weight_cafe: Store,
}

const ROLE_DISPLAY: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Admin',
  warehouse: 'Almacén',
  distributor: 'Distribuidor',
  cashier: 'Caja',
  sales: 'Ventas',
  waiter: 'Mesero',
  kitchen: 'Cocina',
  partner: 'Socio',
  caja: 'Caja',
  cocina: 'Cocina',
  pedidos: 'Pedidos',
}

export function PlatformHeaderBar({
  tenantName,
  businessType,
  role,
  userName,
  userEmail,
  hasMultipleTenants,
  onSwitchTenant,
  onCreateNewTenant,
  onSignOut,
}: PlatformHeaderBarProps) {
  const Icon = TEMPLATE_ICONS[businessType] || Building2
  const roleLabel = ROLE_DISPLAY[role] || role

  return (
    <div className="w-full bg-slate-900 text-white text-xs border-b border-slate-800 shrink-0 select-none z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-11 flex items-center justify-between gap-3">
        {/* Left: Brand + Active Tenant Context */}
        <div className="flex items-center gap-2.5 sm:gap-4 overflow-hidden">
          <BrandMark size="sm" variant="light" href="/platform" />

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Active Tenant Badge */}
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-6 h-6 rounded-md bg-blue-600/30 text-[#38BDF8] border border-blue-500/40 flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5" />
            </div>

            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-slate-100 truncate text-[13px]">
                {tenantName}
              </span>
              <span className="hidden md:inline-flex items-center px-1.5 py-0.2 text-[10px] font-medium rounded-sm bg-slate-800 text-slate-300 border border-slate-700">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {hasMultipleTenants && (
            <button
              type="button"
              onClick={onSwitchTenant}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
              title="Cambiar de empresa"
            >
              <Layers className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span className="hidden sm:inline">Cambiar empresa</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCreateNewTenant}
            className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 transition-colors cursor-pointer"
            title="Crear otra empresa"
          >
            <Plus className="w-3.5 h-3.5 text-slate-400" />
            <span>Nueva empresa</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 text-slate-400" title={userEmail || userName}>
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate max-w-[120px] font-medium text-slate-300">
              {userName}
            </span>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1"
            title="Cerrar sesión"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </div>
  )
}
