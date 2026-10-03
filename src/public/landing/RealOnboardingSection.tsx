import { useState } from 'react'
import { Building2, Image as ImageIcon, Palette, Store, CheckCircle, ArrowRight, Sparkles } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'

export function RealOnboardingSection() {
  const { navigate } = usePublicRouter()
  const [activeStep, setActiveStep] = useState<number>(1)

  const steps = [
    {
      num: 1,
      title: 'Nombre de empresa',
      subtitle: 'Identidad legal y comercial',
      icon: Building2,
      previewTitle: 'Don Cangrejo Grill & Bar',
      previewDetail: 'Razón Social: Don Cangrejo S.R.L. · NIT: 102938401',
    },
    {
      num: 2,
      title: 'Logo oficial',
      subtitle: 'Presencia en comandas y tickets',
      icon: ImageIcon,
      previewTitle: 'Logotipo vectorizado subido',
      previewDetail: 'Adaptación automática a fondo claro/oscuro y tickets térmicos',
    },
    {
      num: 3,
      title: 'Colores de marca',
      subtitle: 'Paleta corporativa del sistema',
      icon: Palette,
      previewTitle: 'Color principal: Azul Ejecutivo (#0066FF)',
      previewDetail: 'Aplicado en botones, reportes y estados de comandas',
    },
    {
      num: 4,
      title: 'Sucursal inicial',
      subtitle: 'Almacén y caja de apertura',
      icon: Store,
      previewTitle: 'Sucursal Central (Zona Equipetrol / Calacoto)',
      previewDetail: 'Caja 01 habilitada con apertura de turno ciego',
    },
    {
      num: 5,
      title: '¡Listo para vender!',
      subtitle: 'Catálogo precargado de prueba',
      icon: CheckCircle,
      previewTitle: 'Entorno operativo 100% activo',
      previewDetail: 'Emite tu primer ticket o comanda en menos de 5 minutos',
    },
  ]

  const current = steps[activeStep - 1]

  return (
    <section id="onboarding" className="w-full py-16 bg-white border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CONFIGURACIÓN INICIAL ÁGIL</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Configura tu empresa en 5 minutos sin complicaciones
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            Sin configuraciones técnicas complejas. Ingresas la información básica de tu negocio y el sistema adapta automáticamente su interfaz, reportes y tickets térmicos.
          </p>
        </div>

        {/* Layout en dos columnas: Stepper a la izquierda, Mockup de onboarding en tiempo real a la derecha */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Stepper Vertical Interactivo */}
          <div className="lg:col-span-6 space-y-3">
            {steps.map((st) => {
              const Icon = st.icon
              const isSelected = activeStep === st.num
              return (
                <div
                  key={st.num}
                  onClick={() => setActiveStep(st.num)}
                  className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-start gap-4 ${
                    isSelected
                      ? 'bg-blue-50/60 border-[#0066FF] shadow-xs'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#0066FF] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3
                        className={`text-sm sm:text-base font-bold tracking-tight ${
                          isSelected ? 'text-[#0066FF]' : 'text-slate-900'
                        }`}
                      >
                        {st.num}. {st.title}
                      </h3>
                      {isSelected && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#0066FF] bg-blue-100 px-2 py-0.5 rounded-full">
                          En pantalla
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {st.subtitle}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Maqueta de Vista Previa del Asistente de Onboarding */}
          <div className="lg:col-span-6">
            <div className="bg-[#091728] text-white rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
              {/* Luz ambiental sutil */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10">
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    Paso {activeStep} de 5 · Asistente de configuración
                  </span>
                </div>

                {/* Contenedor del paso activo */}
                <div className="bg-[#0e2138] rounded-xl p-5 border border-white/10 mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-[#0066FF] border border-blue-500/30 flex items-center justify-center font-bold">
                      {current.num}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white tracking-tight">
                        {current.title}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {current.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-black/30 border border-white/10 space-y-1.5">
                    <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>{current.previewTitle}</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {current.previewDetail}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-1.5">
                    {steps.map((s) => (
                      <div
                        key={s.num}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          s.num === activeStep ? 'w-6 bg-[#0066FF]' : 'w-2 bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/register')}
                    className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Comenzar onboarding</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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
