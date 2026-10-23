import { useState } from 'react'
import {
  Building2,
  Truck,
  Utensils,
  Music2,
  Palette,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Check,
} from 'lucide-react'
import { BRAND_PALETTES } from '../../core/brandPalettes'
import { usePublicRouter } from '../routing/usePublicRouter'

export function RealOnboardingSection() {
  const { navigate } = usePublicRouter()
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1)

  // Sub-estados interactivos dentro de la maqueta
  const [demoTemplate, setDemoTemplate] = useState<'route_distribution' | 'restaurant_pos' | 'nightclub_lounge'>('route_distribution')
  const [demoPaletteIndex, setDemoPaletteIndex] = useState<number>(0)

  const stepsMeta = [
    {
      num: 1 as const,
      title: 'Identidad comercial y fiscal',
      subtitle: 'Nombre comercial, NIT/Razón social, teléfono y ciudad.',
      tag: 'Entidad legal',
      icon: Building2,
    },
    {
      num: 2 as const,
      title: 'Plantilla operativa canónica',
      subtitle: 'Distribución, restaurante salón, fast food, nightclub o balanza.',
      tag: 'Motor canónico',
      icon: Truck,
    },
    {
      num: 3 as const,
      title: 'Branding oficial y paleta corporativa',
      subtitle: 'Colores oficiales PACHAX y adaptación automática de logotipo.',
      tag: 'Identidad visual',
      icon: Palette,
    },
    {
      num: 4 as const,
      title: 'Despliegue y aprovisionamiento seguro',
      subtitle: 'Tenant aislado, sucursal central, caja 01 y catálogo listo.',
      tag: 'Aprovisionamiento',
      icon: ShieldCheck,
    },
  ]

  const templatesList = [
    {
      type: 'route_distribution' as const,
      title: 'Producción & Distribución',
      badge: 'Rutas & Flota',
      desc: 'Despachos por camión, pesaje por kilos, liquidación ciega y cobros.',
      icon: Truck,
      color: '#0284C7',
    },
    {
      type: 'restaurant_pos' as const,
      title: 'Restaurante con Salón',
      badge: 'Mesas & Cocina',
      desc: 'Salón interactivo, comandas de meseros, pantalla KDS y caja ciega.',
      icon: Utensils,
      color: '#0066FF',
    },
    {
      type: 'nightclub_lounge' as const,
      title: 'Nightclub & Lounge',
      badge: 'Barras & VIP',
      desc: 'Cuentas abiertas por pulsera o mesa, botellas por ml y arqueo nocturno.',
      icon: Music2,
      color: '#7C3AED',
    },
  ]

  return (
    <section id="onboarding" className="w-full py-20 bg-white border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial */}
        <div className="max-w-3xl mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[11px] font-bold uppercase tracking-wider text-[#0066FF] mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ARQUITECTURA DE ONBOARDING EN 4 PASOS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Configura y aprovisiona tu empresa en minutos
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Sin configuraciones técnicas manuales ni scripts. El asistente oficial de PACHAX crea tu base de datos multitenant aislada, tus permisos de operador, la sucursal central y la caja de apertura de forma totalmente automatizada.
          </p>
        </div>

        {/* Layout en Dos Columnas: Stepper Funcional (Izq) + Simulador Interactivo de Viewport (Der) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Columna Izquierda: Stepper Vertical de 4 Pasos */}
          <div className="lg:col-span-5 space-y-3.5">
            {stepsMeta.map((st) => {
              const Icon = st.icon
              const isSelected = activeStep === st.num
              return (
                <div
                  key={st.num}
                  onClick={() => setActiveStep(st.num)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-start gap-4 ${
                    isSelected
                      ? 'bg-blue-50/70 border-[#0066FF] shadow-sm ring-2 ring-blue-500/15'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#0066FF] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0066FF]">
                        Paso 0{st.num} · {st.tag}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                          En pantalla
                        </span>
                      )}
                    </div>
                    <h3
                      className={`text-sm sm:text-base font-bold tracking-tight ${
                        isSelected ? 'text-[#0066FF]' : 'text-slate-900'
                      }`}
                    >
                      {st.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {st.subtitle}
                    </p>
                  </div>
                </div>
              )
            })}

            <div className="pt-3">
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="w-full py-3.5 px-6 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Comenzar onboarding de mi empresa</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Columna Derecha: Simulador de Viewport con Iluminación Volumétrica Azul Noche */}
          <div className="lg:col-span-7">
            <div className="bg-[#071322] text-white rounded-3xl p-6 sm:p-8 border border-blue-500/30 shadow-2xl relative overflow-hidden">
              {/* Resplandor atmosférico azul tecnológico */}
              <div
                aria-hidden="true"
                className="absolute top-0 right-0 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"
              />
              <div
                aria-hidden="true"
                className="absolute bottom-0 left-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"
              />

              <div className="relative z-10">
                {/* Barra de ventana de sistema */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 text-xs font-semibold text-slate-300">
                      PACHAX OS · Onboarding Oficial
                    </span>
                  </div>
                  <span className="text-xs font-bold text-sky-400 bg-sky-950/80 border border-sky-800/80 px-2.5 py-0.5 rounded-full">
                    Paso {activeStep} de 4
                  </span>
                </div>

                {/* Contenido Dinámico según Paso Activo */}
                {activeStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        Paso 1: Identidad Legal y Comercial
                      </span>
                      <h4 className="text-base sm:text-lg font-bold text-white mt-0.5">
                        Registra la razón social y ubicación de tu empresa
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        Esta información personaliza automáticamente los tickets térmicos y facturas.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Nombre Comercial
                        </span>
                        <div className="text-sm font-bold text-white mt-1 flex items-center justify-between">
                          <span>Don Cangrejo Alimentos</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          NIT / Razón Social
                        </span>
                        <div className="text-sm font-bold text-white mt-1 flex items-center justify-between">
                          <span>1029384019 · S.R.L.</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Teléfono Oficial
                        </span>
                        <div className="text-sm font-bold text-white mt-1 flex items-center justify-between">
                          <span>+591 77987776</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Ciudad Principal
                        </span>
                        <div className="text-sm font-bold text-white mt-1 flex items-center justify-between">
                          <span>Santa Cruz de la Sierra</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        Paso 2: Selección de Plantilla Operativa
                      </span>
                      <h4 className="text-base sm:text-lg font-bold text-white mt-0.5">
                        Elige el motor operativo canónico de tu negocio
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        Cada plantilla incluye flujos de trabajo especializados sin código genérico.
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      {templatesList.map((tpl) => {
                        const Icon = tpl.icon
                        const isChosen = demoTemplate === tpl.type
                        return (
                          <div
                            key={tpl.type}
                            onClick={() => setDemoTemplate(tpl.type)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isChosen
                                ? 'bg-blue-600/20 border-blue-400/50 shadow-md'
                                : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold"
                                style={{ backgroundColor: `${tpl.color}30`, color: tpl.color }}
                              >
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-bold text-white">
                                  {tpl.title}
                                </div>
                                <div className="text-[11px] text-slate-300 truncate">
                                  {tpl.desc}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${
                                isChosen
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isChosen ? 'Seleccionada' : tpl.badge}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        Paso 3: Paleta Oficial PACHAX y Personalización
                      </span>
                      <h4 className="text-base sm:text-lg font-bold text-white mt-0.5">
                        Aplica la identidad cromática corporativa a tu entorno
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        Los colores se integran en botones de comandas, estados de mesa y encabezados de tickets.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-2">
                      {BRAND_PALETTES.map((pal, idx) => {
                        const isChosen = demoPaletteIndex === idx
                        return (
                          <div
                            key={pal.id}
                            onClick={() => setDemoPaletteIndex(idx)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer ${
                              isChosen
                                ? 'bg-blue-600/20 border-blue-400/60 shadow-md ring-2 ring-blue-500/20'
                                : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="w-5 h-5 rounded-full border border-white/20"
                                style={{ backgroundColor: pal.primary }}
                              />
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: pal.accent }}
                              />
                              {isChosen && (
                                <Check className="w-3.5 h-3.5 text-blue-400 ml-auto" />
                              )}
                            </div>
                            <div className="text-xs font-bold text-white truncate">
                              {pal.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {pal.primary}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        Logotipo vectorial subido (.SVG / .PNG transparente)
                      </span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Adaptado</span>
                      </span>
                    </div>
                  </div>
                )}

                {activeStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-center py-2">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center mx-auto mb-2">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                        ¡Aprovisionamiento Exitoso!
                      </span>
                      <h4 className="text-base sm:text-lg font-bold text-white mt-0.5">
                        Tu empresa está lista para operar en vivo
                      </h4>
                      <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
                        Se ha generado tu espacio de trabajo multitenant seguro con aislamiento estricto de datos.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-2 text-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-slate-400">ID de Entorno Tenant:</span>
                        <span className="font-mono font-bold text-sky-400">tn_cangrejo_prod</span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-slate-400">Sucursal Central:</span>
                        <span className="font-bold text-white">Sucursal 01 (Activa)</span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-slate-400">Caja de Apertura:</span>
                        <span className="font-bold text-emerald-400">Caja 01 · Turno Ciego</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Seguridad & Cifrado:</span>
                        <span className="font-bold text-white">Aislamiento por Tenant</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pie del Viewport con Controles de Navegación del Simulador */}
                <div className="flex items-center justify-between pt-5 mt-6 border-t border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4)}
                    disabled={activeStep === 1}
                    className="text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer font-semibold"
                  >
                    ← Paso anterior
                  </button>

                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setActiveStep(num as 1 | 2 | 3 | 4)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          activeStep === num ? 'w-6 bg-[#0066FF]' : 'w-2 bg-slate-700'
                        }`}
                        aria-label={`Ver paso ${num}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveStep((prev) => Math.min(4, prev + 1) as 1 | 2 | 3 | 4)}
                    disabled={activeStep === 4}
                    className="text-sky-400 hover:text-sky-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer font-bold inline-flex items-center gap-1"
                  >
                    <span>Siguiente</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
