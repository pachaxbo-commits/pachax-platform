import { ArrowRight, MessageSquareCode } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { TemplateCoverflow } from './TemplateCoverflow'
import { ActiveTemplateDetail } from './ActiveTemplateDetail'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import type { CommercialTemplateItem } from '../../admin/types'

interface HeroSectionProps {
  activeIndex: number
  onChangeActiveIndex: (index: number) => void
}

export function HeroSection({ activeIndex, onChangeActiveIndex }: HeroSectionProps) {
  const { navigate } = usePublicRouter()
  const { publishedTemplates, landingContent } = useCommercialConfig()

  const activeTemplate = publishedTemplates[activeIndex] || publishedTemplates[0]

  const handleExplore = () => {
    const el = document.getElementById('plantillas')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleSelectActiveCard = (template: CommercialTemplateItem) => {
    if (template.demoRoute.startsWith('/demo/')) {
      window.location.assign(template.demoRoute)
    } else if (template.demoRoute.startsWith('http')) {
      window.open(template.demoRoute, '_blank', 'noopener,noreferrer')
    } else {
      navigate(template.demoRoute)
    }
  }

  const whatsAppUrl = `https://wa.me/${landingContent.officialWhatsAppNumber}?text=${encodeURIComponent(
    landingContent.defaultCustomDevMessage
  )}`

  return (
    <section id="hero" className="relative w-full pt-4 pb-8 sm:pt-10 sm:pb-14 overflow-hidden z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Layout Desktop: Split 2 Columnas / Layout Mobile: Stacked */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Columna Izquierda: Mensajes, Titular, CTAs y Acceso a Sesión */}
          <div className="lg:col-span-5 text-center lg:text-left flex flex-col items-center lg:items-start">
            {/* Eyebrow Editorial Limpio con Acento Sutil */}
            <div className="flex items-center gap-2.5 mb-2.5 sm:mb-4">
              <span className="h-px w-5 bg-[#0066FF] hidden sm:inline-block" />
              <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] uppercase text-slate-500">
                {landingContent.heroTagline}
              </span>
            </div>

            {/* Titular Principal Dinámico */}
            <h1 className="text-[25px] sm:text-3xl lg:text-[46px] font-extrabold text-slate-950 tracking-tight leading-[1.18] sm:leading-[1.12] mb-3 sm:mb-5 max-w-xl">
              <span className="hidden sm:inline">
                {landingContent.heroTitle}
              </span>
              <span className="sm:hidden block">
                Gestiona tu negocio<br />con{' '}
                <span className="text-[#0066FF]">plantillas premium</span>
              </span>
            </h1>

            {/* Párrafo Descriptivo Dinámico */}
            <p className="text-xs sm:text-base lg:text-[16px] text-slate-600 leading-relaxed max-w-xl mb-5 sm:mb-8">
              <span className="hidden sm:inline">
                {landingContent.heroSubtitle}
              </span>
              <span className="sm:hidden">
                Comienza en minutos con una solución diseñada para tu rubro. Arquitectura sólida sin código duplicado.
              </span>
            </p>

            {/* Acciones Hero Desktop (3 Niveles de Jerarquía) */}
            <div className="hidden lg:flex flex-col items-start w-full space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* 1. Primario: Explorar Plantillas */}
                <button
                  type="button"
                  onClick={handleExplore}
                  className="px-6 py-3.5 text-sm sm:text-base font-semibold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer inline-flex items-center justify-center gap-2 active:scale-98"
                >
                  <span>{landingContent.heroCtaPrimary}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* 2. Secundario: Comenzar Ahora */}
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="px-6 py-3.5 text-sm sm:text-base font-semibold text-slate-800 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-all cursor-pointer inline-flex items-center justify-center active:scale-98"
                >
                  {landingContent.heroCtaSecondary}
                </button>
              </div>

              {/* 3. Acción Especial: Solicitar desarrollo a medida (Directo a WhatsApp) */}
              <div className="pt-1">
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-[#0066FF] bg-slate-100/90 hover:bg-blue-50/80 px-3.5 py-2 rounded-lg border border-slate-200/80 hover:border-blue-200 transition-colors cursor-pointer"
                >
                  <MessageSquareCode className="w-4 h-4 text-[#0066FF]" />
                  <span>Solicitar desarrollo a medida</span>
                  <span className="text-[11px] text-slate-400">({landingContent.officialWhatsAppDisplay})</span>
                </a>
              </div>

              {/* Acceso a Sesión para Usuarios Existentes */}
              <p className="text-xs sm:text-sm text-slate-500 pt-1">
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

            {/* Acciones Hero Mobile: Compacto y no saturado */}
            <div className="flex lg:hidden flex-col items-center gap-2.5 w-full max-w-sm">
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 px-3.5 py-2 rounded-full shadow-2xs"
              >
                <MessageSquareCode className="w-3.5 h-3.5 text-[#0066FF]" />
                <span>Solicitar desarrollo a medida</span>
              </a>
            </div>
          </div>

          {/* Columna Derecha: Vitrina Coverflow 3D */}
          <div className="lg:col-span-7 w-full flex flex-col items-center">
            <TemplateCoverflow
              activeIndex={activeIndex}
              onChangeActiveIndex={onChangeActiveIndex}
              onExploreAll={handleExplore}
              onSelectActiveCard={handleSelectActiveCard}
            />
          </div>
        </div>

        {/* Detalle de la Plantilla Activa: En Mobile y Tablet aparece inmediatamente debajo del Coverflow */}
        {activeTemplate && (
          <div className="lg:hidden mt-4 sm:mt-6 max-w-xl mx-auto">
            <ActiveTemplateDetail template={activeTemplate} />
          </div>
        )}
      </div>
    </section>
  )
}
