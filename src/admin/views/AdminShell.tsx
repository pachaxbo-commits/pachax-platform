import { useState } from 'react'
import {
  LayoutDashboard,
  Layers,
  CreditCard,
  PlusCircle,
  FileText,
  Image,
  Users,
  MonitorPlay,
  LogOut,
  ExternalLink,
  Shield,
  ShieldAlert,
  Menu,
  X,
} from 'lucide-react'
import { useAdminAuth } from '../auth/adminAuthStore'
import { usePublicRouter } from '../../public/routing/usePublicRouter'
import { PACHAX_NAME } from '../../config/pachax'

import { DashboardSection } from './sections/DashboardSection'
import { TemplatesSection } from './sections/TemplatesSection'
import { PlansSection } from './sections/PlansSection'
import { ExtrasSection } from './sections/ExtrasSection'
import { LandingContentSection } from './sections/LandingContentSection'
import { MediaSection } from './sections/MediaSection'
import { ClientsSection } from './sections/ClientsSection'
import { StudioAdminSection } from './sections/StudioAdminSection'
import { AdminLoginView } from './AdminLoginView'

type AdminTab =
  | 'dashboard'
  | 'templates'
  | 'plans'
  | 'extras'
  | 'landing'
  | 'media'
  | 'clients'
  | 'studio'

export function AdminShell() {
  const { user, isAuthenticated, logout, status } = useAdminAuth()
  const { navigate } = usePublicRouter()
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Guardia de seguridad: si no está autenticado, renderizar login directamente
  if (status === 'unauthenticated') {
    return <AdminLoginView />
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-[#070f1a] flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-md bg-[#0c1829] border border-red-500/30 rounded-2xl p-8 shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold">Acceso Denegado</h1>
          <p className="text-xs text-slate-400 mt-2">
            Esta cuenta no cuenta con permisos de Platform Operator. Acceso reservado a administradores del sistema.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/admin/login')
              }}
              className="py-2.5 px-4 bg-[#0066FF] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Iniciar con otra cuenta
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="py-2 px-4 bg-white/10 text-slate-300 rounded-xl text-xs font-semibold hover:text-white cursor-pointer"
            >
              Ir a la web pública
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#070f1a] flex items-center justify-center text-slate-400 text-xs font-mono">
        Verificando credenciales de Platform Operator...
      </div>
    )
  }

  const navItems: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
    { id: 'templates', label: 'Plantillas', icon: Layers },
    { id: 'plans', label: 'Planes comerciales', icon: CreditCard },
    { id: 'extras', label: 'Extras y servicios', icon: PlusCircle },
    { id: 'landing', label: 'Contenido web', icon: FileText },
    { id: 'media', label: 'Biblioteca de media', icon: Image },
    { id: 'clients', label: 'Clientes / Tenants', icon: Users },
    { id: 'studio', label: 'PACHAX Studio', icon: MonitorPlay },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] text-slate-900 flex flex-col lg:flex-row antialiased selection:bg-[#0066FF] selection:text-white">
      {/* Barra Superior Mobile */}
      <div className="lg:hidden w-full bg-[#091728] text-white px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#0066FF] flex items-center justify-center font-black text-white text-[10px]">
            PX
          </div>
          <span className="font-bold text-sm tracking-tight">{PACHAX_NAME} Admin</span>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Izquierda */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } lg:block w-full lg:w-64 bg-[#091728] text-white flex flex-col justify-between shrink-0 border-r border-slate-800 z-40`}
      >
        <div>
          {/* Logo del Panel */}
          <div className="p-6 border-b border-white/10 hidden lg:flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#0066FF] flex items-center justify-center font-black text-white text-xs tracking-wider shadow-sm">
              PX
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight block text-white">
                {PACHAX_NAME}
              </span>
              <span className="text-[10px] font-semibold text-blue-400 tracking-wider uppercase block">
                ADMIN CONSOLE
              </span>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  data-admin-tab={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0066FF] text-white shadow-xs font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer del Sidebar: Perfil del Operador y Salida */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
              <span className="text-[10px] font-medium text-emerald-400 block truncate">
                {user.role === 'platform_owner' ? 'Platform Owner' : 'Platform Admin'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open('/', '_blank')}
              className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-white/10 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Abrir web pública en pestaña nueva"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Ver web</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-3 h-3" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Área de Contenido Principal */}
      <main className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-10 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' && <DashboardSection onNavigateTab={(t) => setActiveTab(t as AdminTab)} />}
          {activeTab === 'templates' && <TemplatesSection />}
          {activeTab === 'plans' && <PlansSection />}
          {activeTab === 'extras' && <ExtrasSection />}
          {activeTab === 'landing' && <LandingContentSection />}
          {activeTab === 'media' && <MediaSection />}
          {activeTab === 'clients' && <ClientsSection />}
          {activeTab === 'studio' && <StudioAdminSection />}
        </div>
      </main>
    </div>
  )
}
