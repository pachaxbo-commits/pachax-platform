import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Users,
  Palette,
  Smartphone,
  Tablet,
  Laptop,
  Maximize2,
  Shield,
} from 'lucide-react'
import type { DemoTemplateId } from '../demo/demoTypes'
import { useStudioBranding } from './branding/BrandingContext'
import { BrandingDrawer } from './branding/BrandingDrawer'

export type ViewportMode = 'responsive' | 'mobile_360' | 'mobile_390' | 'tablet_768' | 'laptop_1366'

const VIEWPORT_CONFIGS: Record<
  ViewportMode,
  { label: string; width: string; height: string; icon: any }
> = {
  responsive: { label: 'Fluido', width: '100%', height: 'calc(100vh - 135px)', icon: Maximize2 },
  mobile_360: { label: '360×800', width: '360px', height: '800px', icon: Smartphone },
  mobile_390: { label: '390×844', width: '390px', height: '844px', icon: Smartphone },
  tablet_768: { label: '768×1024', width: '768px', height: '1024px', icon: Tablet },
  laptop_1366: { label: '1366×768', width: '1366px', height: '768px', icon: Laptop },
}

export function StudioShell({
  templateId,
  onBackToHome,
  currentRole,
  onSelectRole,
}: {
  templateId: DemoTemplateId
  onBackToHome: () => void
  currentRole: string
  onSelectRole: (role: string) => void
}) {
  const { branding, setIsDrawerOpen } = useStudioBranding()
  const [viewport, setViewport] = useState<ViewportMode>('responsive')
  const [isTeamMode, setIsTeamMode] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const templateMeta = {
    restaurant: {
      name: 'Restaurante',
      defaultCompany: 'Bistró Demo',
      roles: [
        { id: 'owner', label: 'Dueño' },
        { id: 'admin', label: 'Administración' },
        { id: 'cashier', label: 'Caja' },
        { id: 'waiter', label: 'Mesero' },
        { id: 'kitchen', label: 'Cocina' },
        { id: 'inventory', label: 'Inventario' },
      ],
    },
    distribution: {
      name: 'Producción y distribución',
      defaultCompany: 'Distribuidora Demo',
      roles: [
        { id: 'admin', label: 'Administración' },
        { id: 'warehouse', label: 'Almacén' },
        { id: 'distributor', label: 'Distribuidor' },
      ],
    },
    retail: {
      name: 'Comercio / Venta rápida',
      defaultCompany: 'Amapola Demo',
      roles: [
        { id: 'owner', label: 'Dueño' },
        { id: 'admin', label: 'Administración' },
        { id: 'cashier', label: 'Caja' },
        { id: 'sales', label: 'Atención / Ventas' },
        { id: 'inventory', label: 'Inventario' },
      ],
    },
  }[templateId]

  // Enviar mensaje de sincronización seguro al iframe
  const sendSync = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    try {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'PACHAX_STUDIO_SYNC',
          payload: {
            templateId,
            role: currentRole,
            branding,
          },
        },
        window.location.origin
      )
    } catch {
      // Ignorar en contextos donde el iframe aún no esté listo
    }
  }, [templateId, currentRole, branding])

  // Despachar sincronización cuando cambien rol o branding
  useEffect(() => {
    sendSync()
  }, [sendSync])

  // Escuchar mensaje PACHAX_PREVIEW_READY emitido por el iframe al inicializarse
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'PACHAX_PREVIEW_READY') {
        sendSync()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendSync])

  const iframeSrc = `/demo/${templateId}?embed=studio&role=${encodeURIComponent(currentRole)}`

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans">
      {/* Studio Top Control Bar */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-6 py-2.5 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Lado Izquierdo: Volver a Studio y Badge de Plantilla */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHome}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>← PACHAX Studio</span>
            </button>

            <div className="h-4 w-px bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">{templateMeta.name}</span>
              <span className="text-[11px] font-semibold text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-800">
                {branding.companyName || templateMeta.defaultCompany}
              </span>
            </div>
          </div>

          {/* Centro: Selector de Modo (Equipo vs Simular Rol) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => {
                  setIsTeamMode(true)
                  onSelectRole('admin')
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  isTeamMode ? 'bg-teal-500 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Equipo</span>
              </button>

              <button
                onClick={() => setIsTeamMode(false)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  !isTeamMode ? 'bg-teal-500 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Simular rol</span>
              </button>
            </div>

            {/* Selector de Rol cuando Simular Rol está activo */}
            {!isTeamMode && (
              <select
                value={currentRole}
                onChange={(e) => onSelectRole(e.target.value)}
                className="text-xs font-bold bg-slate-800 border border-slate-700 text-teal-300 px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-400 cursor-pointer"
              >
                {templateMeta.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    Rol: {r.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Lado Derecho: Viewports reales y Personalización */}
          <div className="flex items-center gap-2">
            {/* Viewport Toggles (dimensiones físicas del iframe) */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              {(Object.keys(VIEWPORT_CONFIGS) as ViewportMode[]).map((key) => {
                const conf = VIEWPORT_CONFIGS[key]
                const Icon = conf.icon
                const isActive = viewport === key
                return (
                  <button
                    key={key}
                    onClick={() => setViewport(key)}
                    title={conf.label}
                    className={`p-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                      isActive ? 'bg-slate-700 text-teal-300 shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline text-[10px]">{conf.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Botón de Personalización de Marca y Logo */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5 text-slate-700" />
              <span className="hidden sm:inline">Personalizar Empresa</span>
            </button>
          </div>
        </div>
      </header>

      {/* Development Banner Indicator */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1 text-center text-[11px] font-semibold text-amber-300">
        ENTORNO DE DESARROLLO / PREVIEW CANÓNICO — Modo aislado sin conexión a Firebase
      </div>

      {/* Contenedor de Previsualización Responsive Aislado */}
      <div className="flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-auto bg-slate-950/70">
        <div
          style={{
            width: VIEWPORT_CONFIGS[viewport].width,
            height: VIEWPORT_CONFIGS[viewport].height,
            maxWidth: viewport === 'responsive' ? '100%' : VIEWPORT_CONFIGS[viewport].width,
          }}
          className={`transition-all duration-300 overflow-hidden bg-white ${
            viewport !== 'responsive'
              ? 'rounded-3xl shadow-2xl ring-8 ring-slate-800 my-auto shrink-0'
              : 'w-full h-full rounded-xl shadow-xs'
          }`}
        >
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title={`PACHAX Studio Preview - ${templateMeta.name}`}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>

      {/* Footer Discreto con Powered by PACHAX */}
      <footer className="py-2 px-4 bg-slate-900 text-slate-400 text-xs border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>
            PACHAX Studio v0.2 • Modo {isTeamMode ? 'Equipo Completo' : `Simulación (${currentRole})`}
          </span>
        </div>
        <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
          <span>Powered by</span>
          <span className="font-bold text-white">PACHAX</span>
        </div>
      </footer>

      {/* Panel de Personalización Lateral */}
      <BrandingDrawer />
    </div>
  )
}
