import { useState, useRef } from 'react'
import { X, Palette, RotateCcw, Upload, Trash2, Image as ImageIcon, AlertCircle } from 'lucide-react'
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

const MAX_LOGO_SIZE_BYTES = 300 * 1024 // 300 KB

export function BrandingDrawer() {
  const { branding, setBranding, resetBranding, isDrawerOpen, setIsDrawerOpen } = useStudioBranding()
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isDrawerOpen) return null

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Validar formato estricto: solo PNG, JPEG, WebP
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setLogoError('Formato no admitido. Usa imágenes PNG, JPEG o WebP.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Validar tamaño máximo (máx. 300 KB)
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError(
        `La imagen pesa ${(file.size / 1024).toFixed(0)} KB. El tamaño máximo permitido es de 300 KB.`
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBranding({ ...branding, logoUrl: reader.result })
      }
    }
    reader.onerror = () => {
      setLogoError('No se pudo leer el archivo seleccionado.')
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = () => {
    setLogoError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    const { logoUrl, ...rest } = branding
    setBranding({ ...rest, logoUrl: undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn">
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
            <span className="font-semibold">Modo Studio:</span> Los cambios se guardan localmente en
            tu navegador para pruebas. No se escribe en Firebase ni afecta otros tenants.
          </div>

          {/* Logo de Empresa */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              Logo de la Empresa (PNG, JPEG, WebP)
            </label>
            <div className="p-3 border border-slate-200 rounded-xl bg-slate-50/70 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-14 w-16 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-1">
                  {branding.logoUrl ? (
                    <img
                      src={branding.logoUrl}
                      alt="Logo empresa"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 text-[10px]">
                      <ImageIcon className="w-5 h-5 mb-0.5" />
                      <span>Por defecto</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="brand-logo-file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="brand-logo-file"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer shadow-xs transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Seleccionar archivo</span>
                    </label>
                    {branding.logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Quitar</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">
                    Máximo 300 KB • Almacenamiento local en tu navegador
                  </p>
                </div>
              </div>

              {logoError && (
                <div className="flex items-start gap-1.5 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{logoError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Nombre Comercial */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Nombre Comercial de la Empresa
            </label>
            <input
              type="text"
              value={branding.companyName}
              onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Ej. Mi Negocio"
            />
          </div>

          {/* Paletas predefinidas */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              Paletas Rápidas (Estilo Claro)
            </label>
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
                  className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-400 text-left transition flex items-center gap-2 bg-slate-50/50 cursor-pointer"
                >
                  <div className="flex -space-x-1">
                    <span
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ backgroundColor: p.primary }}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ backgroundColor: p.accent }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-800 truncate">{p.name}</span>
                </button>
              ))}
            </div>
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
                <span className="text-xs font-mono text-slate-600 uppercase">
                  {branding.primaryColor}
                </span>
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
                <div className="text-[11px] text-slate-500">Fondo de navegación en escritorio</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 uppercase">
                  {branding.sidebarColor}
                </span>
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
                <div className="text-[11px] text-slate-500">Insignias y elementos secundarios</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-600 uppercase">
                  {branding.accentColor}
                </span>
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
                <span className="text-xs font-mono text-slate-600 uppercase">
                  {branding.backgroundColor}
                </span>
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
            onClick={() => {
              setLogoError(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
              resetBranding()
            }}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer inicial
          </button>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
