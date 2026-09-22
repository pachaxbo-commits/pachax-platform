import { X, Palette, RotateCcw } from 'lucide-react'
import { useStudioBranding } from './BrandingContext'

const PRESET_PALETTES = [
  {
    name: 'Petróleo & Ámbar (PACHAX)',
    primary: '#1E3A8A',
    sidebar: '#F8FAFC',
    accent: '#0D9488',
    bg: '#F8FAFC',
    surface: '#FFFFFF',
  },
  {
    name: 'Terracota & Crema',
    primary: '#C1121F',
    sidebar: '#FDF8F6',
    accent: '#D97706',
    bg: '#FAF7F2',
    surface: '#FFFFFF',
  },
  {
    name: 'Bosque & Mandarina',
    primary: '#0F766E',
    sidebar: '#F0FDFA',
    accent: '#EA580C',
    bg: '#FAFAF9',
    surface: '#FFFFFF',
  },
  {
    name: 'Cobalto & Esmeralda',
    primary: '#2563EB',
    sidebar: '#F8FAFC',
    accent: '#10B981',
    bg: '#F8FAFC',
    surface: '#FFFFFF',
  },
]

export function BrandingDrawer() {
  const { branding, setBranding, resetBranding, isDrawerOpen, setIsDrawerOpen } = useStudioBranding()

  if (!isDrawerOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white shadow-2xl h-full flex flex-col overflow-hidden border-l border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-slate-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Personalización de Empresa</h2>
              <p className="text-xs text-slate-500">Prueba visual multiempresa en tiempo real</p>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
            aria-label="Cerrar panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Info note */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <span className="font-semibold">Modo Studio:</span> Los cambios se guardan localmente en tu navegador para pruebas. No se escribe en Firebase ni afecta otros tenants.
          </div>

          {/* Paletas predefinidas */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">Paletas Rápidas (Estilo Claro)</label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_PALETTES.map((p) => (
                <button
                  key={p.name}
                  onClick={() =>
                    setBranding({
                      ...branding,
                      primaryColor: p.primary,
                      sidebarColor: p.sidebar,
                      accentColor: p.accent,
                      backgroundColor: p.bg,
                      surfaceColor: p.surface,
                    })
                  }
                  className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-400 text-left transition flex items-center gap-2 bg-slate-50/50"
                >
                  <div className="flex -space-x-1">
                    <span className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: p.primary }} />
                    <span className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: p.accent }} />
                  </div>
                  <span className="text-xs font-medium text-slate-800 truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nombre Comercial */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Nombre Comercial de la Empresa</label>
            <input
              type="text"
              value={branding.companyName}
              onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Ej. Mi Negocio"
            />
          </div>

          {/* Colores */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-700 block">Colores Principales</label>

            {/* Color Primario */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-800">Color Principal</div>
                <div className="text-[11px] text-slate-500">Botones de acción, cabeceras y destacados</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 uppercase">{branding.primaryColor}</span>
                <input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                />
              </div>
            </div>

            {/* Color del Sidebar/Menú */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-800">Color de Barra Lateral / Menú</div>
                <div className="text-[11px] text-slate-500">Fondo de navegación</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 uppercase">{branding.sidebarColor}</span>
                <input
                  type="color"
                  value={branding.sidebarColor}
                  onChange={(e) => setBranding({ ...branding, sidebarColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                />
              </div>
            </div>

            {/* Color de Acento */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-800">Color de Acento</div>
                <div className="text-[11px] text-slate-500">Insignias, estados y alertas secundarias</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 uppercase">{branding.accentColor}</span>
                <input
                  type="color"
                  value={branding.accentColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                />
              </div>
            </div>

            {/* Color de Fondo */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-800">Fondo Base (Estilo Claro)</div>
                <div className="text-[11px] text-slate-500">Base sobria (crema, pizarra suave, blanco)</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 uppercase">{branding.backgroundColor}</span>
                <input
                  type="color"
                  value={branding.backgroundColor}
                  onChange={(e) => setBranding({ ...branding, backgroundColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={resetBranding}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer inicial
          </button>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
