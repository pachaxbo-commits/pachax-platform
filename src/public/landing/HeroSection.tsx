import { ArrowRight } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { TemplateCoverflow } from './TemplateCoverflow'
import { ActiveTemplateDetail } from './ActiveTemplateDetail'
import { COMMERCIAL_TEMPLATES } from '../config/commercialShowcase'

interface HeroSectionProps {
  activeIndex: number
  onChangeActiveIndex: (index: number) => void
}

export function HeroSection({ activeIndex, onChangeActiveIndex }: HeroSectionProps) {
  const { navigate } = usePublicRouter()
  const activeTemplate = COMMERCIAL_TEMPLATES[activeIndex] || COMMERCIAL_TEMPLATES[0]

  const handleExplore = () => {
    const el = document.getElementById('plantillas')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section id="plantillas" className="relative w-full pt-4 pb-6 sm:pt-10 sm:pb-12 overflow-hidden">
      {/* Luz y resplandor sutil de fondo */}
      <div
        className="absolute top-0 right-0 w-[550px] h-[480px] bg-blue-100/35 blur-[120px] rounded-full pointer-events-none -z-10"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-slate-100/60 blur-[90px] rounded-full pointer-events-none -z-10"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Layout Desktop: Split 2 Columnas / Layout Mobile: Stacked */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Columna Izquierda: Mensajes, Titular, CTAs y Acceso a Sesión */}
          <div className="lg:col-span-5 text-center lg:text-left flex flex-col items-center lg:items-start">
            {/* Kicker Superior */}
            <div className="inline-flex items-center gap-2 mb-2 sm:mb-4">
              <span className="text-[10px] sm:text-xs font-bold tracking-[0.16em] uppercase text-slate-500">
                <span className="hidden sm:inline">PLANTILLAS LISTAS · PLANES FLEXIBLES · SOLUCIONES A MEDIDA</span>
                <span className="sm:hidden">PLANTILLAS LISTAS PARA TU NEGOCIO</span>
              </span>
            </div>

            {/* Titular Principal */}
            <h1 className="text-[25px] sm:text-3xl lg:text-[46px] font-extrabold text-slate-950 tracking-tight leading-[1.18] sm:leading-[1.12] mb-3 sm:mb-5 max-w-xl">
              <span className="hidden sm:inline">
                La plataforma visual para negocios que quieren crecer
              </span>
              <span className="sm:hidden block">
                Gestiona tu negocio<br />con{' '}
                <span className="text-[#0066FF]">plantillas premium</span>
              </span>
            </h1>

            {/* Párrafo Descriptivo */}
            <p className="text-xs sm:text-base lg:text-[16px] text-slate-600 leading-relaxed max-w-xl mb-4 sm:mb-8">
              <span className="hidden sm:inline">
                Elige una plantilla, personalízala a tu medida y lleva tu negocio al siguiente nivel. Planes mensuales accesibles o desarrollo a medida con mantenimiento incluido.
              </span>
              <span className="sm:hidden">
                Comienza en minutos con una solución diseñada para tu industria. Todo en un solo lugar.
              </span>
            </p>

            {/* Botones de Acción Desktop (En Mobile las acciones principales residen en ActiveTemplateDetail) */}
            <div className="hidden lg:flex flex-col items-start w-full">
              <div className="flex items-center gap-3 mb-5">
                <button
                  type="button"
                  onClick={handleExplore}
                  className="px-6 py-3.5 text-sm sm:text-base font-semibold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer inline-flex items-center justify-center gap-2 active:scale-98"
                >
                  <span>Explorar plantillas</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="px-6 py-3.5 text-sm sm:text-base font-semibold text-slate-800 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-all cursor-pointer inline-flex items-center justify-center active:scale-98"
                >
                  Comenzar ahora
                </button>
              </div>

              {/* Acceso a Sesión para Usuarios Existentes */}
              <p className="text-xs sm:text-sm text-slate-500">
                ¿Ya tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="font-semibold text-[#0066FF] hover:text-[#0052cc] underline underline-offset-2 cursor-pointer"
                >
                  Inicia sesión
                </button>
              </p>
            </div>
          </div>

          {/* Columna Derecha: Vitrina Coverflow 3D */}
          <div className="lg:col-span-7 w-full flex flex-col items-center">
            <TemplateCoverflow
              activeIndex={activeIndex}
              onChangeActiveIndex={onChangeActiveIndex}
              onExploreAll={handleExplore}
            />
          </div>
        </div>

        {/* Detalle de la Plantilla Activa: En Mobile y Tablet aparece inmediatamente debajo del Coverflow (Imagen 3) */}
        <div className="lg:hidden mt-4 sm:mt-6 max-w-xl mx-auto">
          <ActiveTemplateDetail template={activeTemplate} />
        </div>
      </div>
    </section>
  )
}
