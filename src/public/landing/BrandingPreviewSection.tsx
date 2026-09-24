import { useState } from 'react'
import { Palette, Check, Store } from 'lucide-react'

interface BrandPreset {
  name: string
  primary: string
  accent: string
  label: string
}

const PRESETS: BrandPreset[] = [
  { name: 'Zafiro & Cian', primary: '#2563EB', accent: '#0EA5A8', label: 'Corporativo / Logística' },
  { name: 'Esmeralda & Ámbar', primary: '#0D9488', accent: '#F59E0B', label: 'Gourmet / Salud' },
  { name: 'Carbón & Azul', primary: '#1E293B', accent: '#3B82F6', label: 'Industrial / Café' },
  { name: 'Ámbar & Madera', primary: '#B45309', accent: '#D97706', label: 'Panadería / Bistró' },
]

export function BrandingPreviewSection() {
  const [businessName, setBusinessName] = useState('Distribuidora El Valle')
  const [activePreset, setActivePreset] = useState<BrandPreset>(PRESETS[0])

  return (
    <section id="personalizacion" className="py-16 sm:py-24 bg-slate-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Columna de Texto & Controles */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 inline-flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-slate-700" />
                Personalización de Marca
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
                Tu empresa es la protagonista, no el software.
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                PACHAX adapta los colores principales, encabezados, tickets de venta y pantallas de operación a la identidad visual de tu negocio. Tus colaboradores y clientes reconocen tu marca en cada punto.
              </p>
            </div>

            {/* Simulador interactivo de branding */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Prueba el nombre de tu empresa
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Escribe el nombre de tu negocio..."
                  maxLength={36}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Paleta de identidad
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActivePreset(preset)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center justify-between ${
                        activePreset.name === preset.name
                          ? 'border-slate-900 bg-slate-900/5 font-bold text-slate-950'
                          : 'border-slate-200/80 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          <span
                            className="w-4 h-4 rounded-full border border-white shadow-2xs"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-white shadow-2xs"
                            style={{ backgroundColor: preset.accent }}
                          />
                        </div>
                        <span className="truncate">{preset.label}</span>
                      </div>
                      {activePreset.name === preset.name && (
                        <Check className="w-3.5 h-3.5 text-slate-900 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Columna de Previsualización en Vivo */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden ring-1 ring-slate-900/5 transition-all">
              {/* Header adaptado al color primario del cliente */}
              <div
                className="px-5 py-3.5 text-white flex items-center justify-between transition-colors duration-300"
                style={{ backgroundColor: activePreset.primary }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-black text-xs">
                    <Store className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-tight leading-tight">
                      {businessName || 'Tu Empresa'}
                    </h4>
                    <span className="text-[10px] text-white/70 block">
                      Powered by PACHAX
                    </span>
                  </div>
                </div>

                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white bg-black/20"
                >
                  Sucursal Central
                </span>
              </div>

              {/* Pantalla operativa simulada */}
              <div className="p-5 sm:p-6 space-y-4 bg-slate-50/40">
                <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-200/70">
                  <span className="font-semibold text-slate-700">Estado operativo del turno</span>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: activePreset.accent }}
                  >
                    Turno Activo
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs">
                    <span className="text-[11px] text-slate-400 block">Ventas acumuladas</span>
                    <span className="text-base font-extrabold text-slate-900">Bs 1,240.00</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs">
                    <span className="text-[11px] text-slate-400 block">Caja en efectivo</span>
                    <span className="text-base font-extrabold text-slate-900">Bs 890.00</span>
                  </div>
                </div>

                {/* Simulación de Ticket Térmico con la Marca */}
                <div className="bg-white p-4 rounded-xl border border-dashed border-slate-300 text-xs font-mono space-y-1.5 shadow-2xs">
                  <div className="text-center font-bold text-slate-800 uppercase pb-1 border-b border-slate-100">
                    {businessName || 'Tu Empresa'}
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Ticket #0042</span>
                    <span>Hoy 14:32</span>
                  </div>
                  <div className="flex justify-between text-slate-800 font-semibold pt-1">
                    <span>TOTAL VENTA</span>
                    <span>Bs 85.00</span>
                  </div>
                  <div className="text-[10px] text-center text-slate-400 pt-1">
                    ¡Gracias por su compra!
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 text-center">
              Vista previa interactiva de nombre y colores. La configuración definitiva se habilitará con cada empresa.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
