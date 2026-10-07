import { useState, useRef, useEffect, useCallback, type ComponentType } from 'react'
import {
  ArrowLeft,
  Users,
  Palette,
  Smartphone,
  Tablet,
  Laptop,
  Maximize2,
  Minimize2,
  RotateCcw,
  Shield,
} from 'lucide-react'
import type { DemoTemplateId } from '../demo/demoTypes'
import type { DemoDatasetMode } from '../demo/datasets/types'
import { useStudioBranding } from './branding/BrandingContext'
import { BrandingDrawer } from './branding/BrandingDrawer'
import './studioRestaurantPreview.css'
import { getPublicTemplate } from '../core/publicTemplates'
import { getTemplate } from '../core/templates'

export type ViewportMode = 'responsive' | 'mobile_360' | 'mobile_390' | 'tablet_768' | 'laptop_1366'

const VIEWPORT_CONFIGS: Record<
  ViewportMode,
  { label: string; width: string; height: string; icon: ComponentType<{ className?: string }> }
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
  const { branding, setBranding, resetBranding, setIsDrawerOpen } = useStudioBranding()
  const [viewport, setViewport] = useState<ViewportMode>('responsive')
  const [isTeamMode, setIsTeamMode] = useState(true)
  const [datasetMode, setDatasetMode] = useState<DemoDatasetMode>(() => new URLSearchParams(window.location.search).get('data') === 'empty' ? 'empty' : 'full')
  const [datasetResetKey, setDatasetResetKey] = useState(0)
  const [pendingDataset, setPendingDataset] = useState<DemoDatasetMode | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const publicTemplate = getPublicTemplate(templateId)
  const templateRoles = getTemplate(publicTemplate.businessType).roles
  const defaultCompany = { restaurant: 'Bistró Demo', distribution: 'Distribuidora Demo', retail: 'Amapola Demo', nightclub: 'Nocturna Demo' }[templateId]

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
            datasetMode,
            datasetResetKey,
          },
        },
        window.location.origin
      )
    } catch {
      // Ignorar en contextos donde el iframe aún no esté listo
    }
  }, [templateId, currentRole, branding, datasetMode, datasetResetKey])

  // Despachar sincronización cuando cambien rol, branding o datasetMode
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
      if (event.data?.type === 'PACHAX_STUDIO_BRANDING' && event.source === iframeRef.current?.contentWindow && event.data.templateId === templateId) {
        setBranding({ ...branding, ...event.data.branding })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendSync, setBranding, branding, templateId])

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === shellRef.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const changeDataset = (next: DemoDatasetMode) => {
    if (next !== datasetMode) setPendingDataset(next)
  }
  const confirmDataset = () => {
    if (!pendingDataset) return
    setDatasetMode(pendingDataset)
    setDatasetResetKey(key => key + 1)
    setPendingDataset(null)
  }

  // Stable URL: role, branding and scenario changes travel through postMessage.
  const iframeSrc = `/demo/${templateId}?embed=studio`

  return (
    <div ref={shellRef} className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans">
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
              <span className="text-xs font-bold text-white">{publicTemplate.title}</span>
              <span className="text-[11px] font-semibold text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-800">
                {branding.companyName || defaultCompany}
              </span>
            </div>
          </div>

          {/* Centro: Selector de Modo (Equipo vs Simular Rol) y Selector de Dataset (Vacío vs Completo) */}
          <div className="flex items-center gap-2.5 flex-wrap">
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
                {templateRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    Rol: {r.name}
                  </option>
                ))}
              </select>
            )}

            {/* Selector de Dataset: Vacío vs Completo */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
              <span className="text-[11px] font-bold text-slate-400 px-1.5 hidden md:inline">Dataset:</span>
              <button
                onClick={() => changeDataset('empty')}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                  datasetMode === 'empty'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Vacío
              </button>
              <button
                onClick={() => changeDataset('full')}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                  datasetMode === 'full'
                    ? 'bg-teal-500 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Completo
              </button>
            </div>
            <button
              type="button"
              onClick={() => { resetBranding(); setDatasetResetKey(key => key + 1) }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
              title="Restablece datos de operación e identidad del sandbox"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer demo
            </button>

            {templateId === 'nightclub' && (
              <button
                onClick={() => {
                  setDatasetMode('empty')
                  resetBranding()
                  setDatasetResetKey((key) => key + 1)
                }}
                title="Elimina los datos locales de prueba y abre un club vacío"
                className="flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Iniciar desde cero</span>
              </button>
            )}
          </div>

          {/* Lado Derecho: Viewports reales y Personalización */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { if (isFullscreen) void document.exitFullscreen(); else { setViewport('responsive'); void shellRef.current?.requestFullscreen() } }} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800" title={isFullscreen ? 'Salir de pantalla completa' : 'Ampliar vista previa'}>{isFullscreen ? <Minimize2 className="inline h-4 w-4 sm:mr-1" /> : <Maximize2 className="inline h-4 w-4 sm:mr-1" />}<span className="hidden sm:inline">{isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}</span></button>
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
        SANDBOX PACHAX STUDIO — Datos de prueba locales, sin operaciones en tenants reales
      </div>
      {templateId === 'nightclub' && datasetMode === 'empty' && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
          Club nuevo: en la experiencia abre Configuración para definir identidad, zonas y mesas; después agrega productos y abre el turno en Caja.
        </div>
      )}

      {/* Contenedor de Previsualización Responsive Aislado */}
      <div ref={previewRef} className="restaurant-studio-preview flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-auto bg-slate-950/70">
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
            title={`PACHAX Studio Preview - ${publicTemplate.title}`}
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
      {pendingDataset && <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4"><section role="dialog" aria-modal="true" aria-label="Cambiar escenario" className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-slate-900 p-6 shadow-2xl"><h2 className="text-xl font-bold">Cambiar escenario</h2><p className="mt-2 text-sm text-slate-300">Cambiar de escenario reiniciará los datos de esta simulación.</p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setPendingDataset(null)} className="rounded-xl border border-slate-600 px-4 py-2 text-sm">Cancelar</button><button onClick={confirmDataset} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950">Cambiar escenario</button></div></section></div>}
    </div>
  )
}
