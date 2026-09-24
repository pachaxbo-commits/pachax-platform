import { useState, useEffect } from 'react'
import { RestaurantDemo } from './restaurant/RestaurantDemo'
import { DistributionDemo } from './distribution/DistributionDemo'
import { QuickRetailDemo } from './quick-retail/QuickRetailDemo'
import type { DemoTemplateId, DemoMode } from './demoTypes'
import type { StudioBranding } from '../studio/branding/brandingTypes'
import { applyStudioThemeTokens } from '../studio/branding/brandingAdapter'
import { Sparkles, ArrowLeft, Check, X, RotateCcw } from 'lucide-react'
import type { DemoDatasetMode } from './datasets/types'

export function DemoRuntime({
  templateId,
  mode = 'team',
  simulatedRole,
  isPublicDemo = false,
  isStudioEmbed = false,
  initialRole,
  initialDatasetMode,
  onSelectRole,
}: {
  templateId: DemoTemplateId
  mode?: DemoMode
  simulatedRole?: string
  isPublicDemo?: boolean
  isStudioEmbed?: boolean
  initialRole?: string
  initialDatasetMode?: DemoDatasetMode
  onSelectRole?: (roleId: string) => void
}) {
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [contactSubmitted, setContactSubmitted] = useState(false)
  const [leadBusinessName, setLeadBusinessName] = useState('')
  const [leadPhone, setLeadPhone] = useState('')

  const [activeRole, setActiveRole] = useState<string>(
    simulatedRole || initialRole || 'admin'
  )
  const [branding, setBranding] = useState<StudioBranding | null>(null)

  const [currentDatasetMode, setCurrentDatasetMode] = useState<DemoDatasetMode>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('data')
      if (p === 'empty') return 'empty'
    }
    return initialDatasetMode || 'full'
  })
  const [resetKey, setResetKey] = useState(0)

  const clearRestaurantDemo = () => {
    if (templateId !== 'restaurant') return
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('pachax:restaurant-demo:')) localStorage.removeItem(key)
      }
      localStorage.removeItem('cocina-tickets-impresos')
    } catch { /* Private mode may disable storage. */ }
  }

  const switchDatasetMode = (newMode: DemoDatasetMode) => {
    clearRestaurantDemo()
    setCurrentDatasetMode(newMode)
    setResetKey((k) => k + 1)
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      url.searchParams.set('data', newMode)
      window.history.replaceState({}, '', url.toString())
    }
  }

  // Escuchar sincronización en vivo desde PACHAX Studio cuando estamos en iframe
  useEffect(() => {
    if (!isStudioEmbed) return

    const handleMessage = (event: MessageEvent) => {
      // Validar origen exacto
      if (event.origin !== window.location.origin) return

      if (event.data?.type === 'PACHAX_STUDIO_SYNC') {
        const payload = event.data.payload || {}
        if (payload.role) {
          setActiveRole(payload.role)
        }
        if (payload.datasetMode) {
          setCurrentDatasetMode(payload.datasetMode)
        }
        if (payload.branding) {
          setBranding(payload.branding)
          applyStudioThemeTokens(document, payload.branding)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    // Notificar al shell padre que el preview está montado y listo para sincronizar
    try {
      window.parent?.postMessage({ type: 'PACHAX_PREVIEW_READY' }, window.location.origin)
    } catch {
      // En caso de entorno restringido
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [isStudioEmbed])

  // Sincronizar activeRole si cambia la prop simulatedRole
  useEffect(() => {
    if (simulatedRole) {
      setActiveRole(simulatedRole)
    }
  }, [simulatedRole])

  const templateInfo = {
    restaurant: {
      name: 'Restaurante',
      company: branding?.companyName || 'Bistró Demo',
      desc: 'Pedidos, mesas, cocina, caja e inventario.',
    },
    distribution: {
      name: 'Producción y distribución',
      company: branding?.companyName || 'Distribuidora Demo',
      desc: 'Inventario, almacenes, despachos, rutas, ventas, créditos y retornos.',
    },
    retail: {
      name: 'Comercio / Venta rápida',
      company: branding?.companyName || 'Amapola Demo',
      desc: 'Venta por unidad o peso, atención en mostrador, caja e inventario.',
    },
  }[templateId]

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setContactSubmitted(true)
    setTimeout(() => {
      setContactSubmitted(false)
      setIsContactModalOpen(false)
      setLeadBusinessName('')
      setLeadPhone('')
    }, 2500)
  }

  // En modo Studio Embed, el iframe renderiza exclusivamente la plantilla ocupando el 100%
  if (isStudioEmbed) {
    return (
      <div
        className="w-full min-h-screen text-slate-900 font-sans"
        style={{ backgroundColor: branding?.backgroundColor || 'var(--background)' }}
      >
        {templateId === 'restaurant' && (
          <RestaurantDemo
            key={`restaurant:${currentDatasetMode}:${resetKey}`}
            mode={mode}
            simulatedRole={activeRole}
            onSelectRole={onSelectRole}
            logoUrl={branding?.logoUrl}
            companyName={branding?.companyName}
            datasetMode={currentDatasetMode}
            resetKey={resetKey}
          />
        )}
        {templateId === 'distribution' && (
          <DistributionDemo
            mode={mode}
            simulatedRole={activeRole}
            onSelectRole={onSelectRole}
            logoUrl={branding?.logoUrl}
            companyName={branding?.companyName}
            datasetMode={currentDatasetMode}
            resetKey={resetKey}
          />
        )}
        {templateId === 'retail' && (
          <QuickRetailDemo
            mode={mode}
            simulatedRole={activeRole}
            onSelectRole={onSelectRole}
            datasetMode={currentDatasetMode}
            resetKey={resetKey}
          />
        )}
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Barra superior exclusiva para demos públicas (/demo/...) */}
      {isPublicDemo && (
        <>
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <a
                href="/demo"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition bg-slate-100 px-2.5 py-1.5 rounded-lg"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Demos PACHAX</span>
              </a>
              <div className="h-4 w-px bg-slate-200" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-slate-900">{templateInfo.company}</h1>
                  <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/60">
                    {templateInfo.name}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Demostración interactiva con datos ficticios
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsContactModalOpen(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Quiero una solución para mi negocio</span>
              </button>
            </div>
          </header>

          {/* Barra discreta de Modo Demo (Empezar desde cero vs Negocio completo) */}
          <div className="bg-slate-900 text-slate-200 px-4 sm:px-8 py-2 text-xs flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                Modo Demo:
              </span>
              <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                <button
                  onClick={() => switchDatasetMode('empty')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    currentDatasetMode === 'empty'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Empezar desde cero
                </button>
                <button
                  onClick={() => switchDatasetMode('full')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    currentDatasetMode === 'full'
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Ver negocio completo
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { clearRestaurantDemo(); setResetKey((k) => k + 1) }}
                title="Restaura el dataset original a su estado limpio"
                className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Restablecer demo</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Contenedor principal de la demo */}
      <main className={`flex-1 w-full max-w-7xl mx-auto ${isPublicDemo ? 'p-4 sm:p-6 lg:p-8' : 'p-2 sm:p-4'}`}>
        {templateId === 'restaurant' && (
          <RestaurantDemo
            key={`restaurant:${currentDatasetMode}:${resetKey}`}
            mode={mode}
            simulatedRole={activeRole}
            onSelectRole={onSelectRole}
            logoUrl={branding?.logoUrl}
            companyName={branding?.companyName}
            datasetMode={currentDatasetMode}
            resetKey={resetKey}
          />
        )}
        {templateId === 'distribution' && (
          <DistributionDemo
            mode={mode}
            simulatedRole={activeRole}
            onSelectRole={onSelectRole}
            logoUrl={branding?.logoUrl}
            companyName={branding?.companyName}
            datasetMode={currentDatasetMode}
            resetKey={resetKey}
          />
        )}
        {templateId === 'retail' && (
          <QuickRetailDemo
            mode={mode}
            simulatedRole={activeRole}
            onSelectRole={onSelectRole}
            datasetMode={currentDatasetMode}
            resetKey={resetKey}
          />
        )}
      </main>

      {/* Footer discreto */}
      <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200/60 bg-white">
        PACHAX Platform • Software de Gestión para Empresas •{' '}
        <span className="font-semibold text-slate-500">Demostración con datos ficticios</span>
      </footer>

      {/* Modal de Solicitud de Solución (CTA) */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Quiero una solución para mi negocio</h3>
                <p className="text-xs text-slate-500">Cuéntanos sobre tu empresa para preparar una propuesta</p>
              </div>
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {contactSubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">¡Gracias por tu interés!</h4>
                <p className="text-xs text-slate-500">Nos pondremos en contacto contigo a la brevedad.</p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nombre de tu negocio o marca
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Café Del Sol / Distribuidora Santa Cruz"
                    value={leadBusinessName}
                    onChange={(e) => setLeadBusinessName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Teléfono / WhatsApp de contacto
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. +591 70000000"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Enviar solicitud</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
