import { Archive, ChefHat, CreditCard, LayoutGrid, MapPin, Menu, ReceiptText, Settings2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTenantStore } from '../store/tenantStore'
import type { UserRole } from '../types'

type View = 'caja' | 'cocina' | 'historial' | 'admin' | 'bot'

const items: Array<{ id: View; label: string; subtitle: string; icon: typeof CreditCard }> = [
  { id: 'caja', label: 'Caja POS', subtitle: 'Cobro y comandero', icon: CreditCard },
  { id: 'cocina', label: 'Cocina KDS', subtitle: 'Despacho visual', icon: ChefHat },
  { id: 'historial', label: 'Historial', subtitle: 'Ventas y reportes', icon: Archive },
  { id: 'admin', label: 'Administración', subtitle: 'Menú y productos', icon: Settings2 },
]

export function TopBar({
  availableViews,
  collapsed,
  currentView,
  onChange,
  rightSlot,
  userName,
  userRole,
  onSignOut,
  pendingOrdersCount = 0,
}: {
  availableViews: View[]
  collapsed: boolean
  currentView: View
  onChange: (view: View) => void
  rightSlot?: ReactNode
  userName: string
  userRole: UserRole | 'demo'
  mode: 'firebase' | 'local'
  onSignOut: () => Promise<void>
  pendingOrdersCount?: number
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const tenant = useTenantStore()

  return (
    <aside
      className={`sticky top-5 z-40 flex flex-col rounded-[1.65rem] border border-slate-200 bg-white/90 p-3 shadow-md backdrop-blur xl:h-full xl:sticky xl:top-5 ${
        collapsed ? 'xl:px-3 xl:py-4' : ''
      }`}
    >
      {/* Cabecera Móvil */}
      <div className="flex items-center justify-between xl:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <LayoutGrid size={20} />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">PACHAX Flow</p>
            <h1 className="font-bold text-base text-slate-800">Sistema POS</h1>
            <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <MapPin size={10} className="text-blue-500" /> {tenant.activeBranchName}
            </p>
          </div>
        </div>

        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={() => setMobileMenuOpen((open) => !open)}
          title={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Cuerpo del menú */}
      <div className={`${mobileMenuOpen ? 'mt-4 flex flex-col gap-4' : 'hidden'} xl:flex xl:flex-col xl:flex-1`}>
        {/* Logo de Desktop */}
        <div className={`hidden rounded-[1.15rem] border border-slate-200 bg-slate-50 shadow-sm xl:block ${collapsed ? 'p-2.5' : 'p-3'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <LayoutGrid size={18} />
            </div>
            <div className={collapsed ? 'hidden' : ''}>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">PACHAX Flow</p>
              <h1 className="mt-0.5 font-bold text-base text-slate-800">Sistema POS</h1>
              <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin size={10} className="text-blue-500 shrink-0" /> {tenant.activeBranchName}
              </p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="mt-3 space-y-1.5">
          {items.filter((item) => availableViews.includes(item.id)).map((item) => {
            const Icon = item.icon
            const isActive = currentView === item.id

            return (
              <button
                key={item.id}
                className={`flex w-full items-center rounded-[1.2rem] border text-left transition duration-150 ${
                  isActive
                    ? 'border-blue-600/20 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                } ${collapsed ? 'justify-center gap-0 px-3 py-3' : 'gap-2.5 px-3 py-2'}`}
                onClick={() => {
                  onChange(item.id)
                  setMobileMenuOpen(false)
                }}
                title={item.label}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <div className={`min-w-0 flex-1 flex items-center justify-between ${collapsed ? 'hidden' : ''}`}>
                  <div>
                    <div className="text-sm font-bold">{item.label}</div>
                    <div className={`truncate text-xs ${isActive ? 'text-white/80' : 'text-slate-500'}`}>{item.subtitle}</div>
                  </div>
                  {item.id === 'caja' && pendingOrdersCount > 0 ? (
                    <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-black text-white shadow-sm animate-pulse shrink-0">
                      {pendingOrdersCount}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </nav>

        {/* Slot derecho */}
        {!collapsed ? <div className="mt-4 flex-1">{rightSlot}</div> : <div className="mt-5 flex-1" />}

        {/* Caja de usuario */}
        <div className={`rounded-[1.2rem] border border-slate-200 bg-slate-50 text-sm text-slate-600 shadow-sm ${collapsed ? 'p-3' : 'p-3'}`}>
          <div className="flex items-center gap-2 text-slate-900">
            <ReceiptText size={16} className="text-blue-600" />
            <span className={`min-w-0 break-all font-bold text-xs ${collapsed ? 'hidden' : ''}`}>{userName}</span>
          </div>
          <p className={`mt-1 text-[11px] text-slate-500 ${collapsed ? 'hidden' : ''}`}>
            Rol: {userRole}
          </p>
          <button className={`mt-2.5 text-xs font-bold text-rose-600 hover:underline ${collapsed ? 'w-full text-center' : ''}`} onClick={() => void onSignOut()}>
            {collapsed ? 'Salir' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </aside>
  )
}
