import { useState } from 'react'
import { ArrowRight, MessageSquare, Play, Check } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { TemplateCoverflow } from './TemplateCoverflow'
import { TemplateModeSelectorModal } from './TemplateModeSelectorModal'
import type { CommercialTemplateItem } from '../config/commercialShowcase'
import { canLaunchCommercialDemo, freeDemoPath } from '../../core/publicTemplates'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import { buildPublishedShowcaseGroup } from './commercialPresentation'

interface HeroSectionProps {
  activeIndex?: number
  onChangeActiveIndex?: (index: number) => void
  onViewPlans?: (templateId: 'hamburger' | 'retail') => void
}

export function HeroSection(props: HeroSectionProps) {
  const { navigate } = usePublicRouter()
  const { publishedTemplates, landingContent, publicCatalogStatus, isPublicEditorialFallback } = useCommercialConfig()
  const specializedTemplates = buildPublishedShowcaseGroup(publishedTemplates, 'specialized')
  const selfServiceTemplates = buildPublishedShowcaseGroup(publishedTemplates, 'self_service')

  // Estados independientes para cada carrusel
  const [activeIndexSpecialized, setActiveIndexSpecialized] = useState(0)
  const [activeIndexSelfService, setActiveIndexSelfService] = useState(0)

  // Modal para selector de modos de restaurante (salón vs mostrador)
  const [selectedForModal, setSelectedForModal] = useState<CommercialTemplateItem | null>(null)

  const activeSpecialized = specializedTemplates.length > 0
    ? specializedTemplates[((activeIndexSpecialized % specializedTemplates.length) + specializedTemplates.length) % specializedTemplates.length]
    : undefined

  const activeSelfService = selfServiceTemplates.length > 0
    ? selfServiceTemplates[((activeIndexSelfService % selfServiceTemplates.length) + selfServiceTemplates.length) % selfServiceTemplates.length]
    : undefined

  // Manejo de Demo para Especializadas (Carrusel A)
  const handleLaunchSpecializedDemo = (template: CommercialTemplateItem) => {
    if (!canLaunchCommercialDemo(template)) return
    const demoPath = freeDemoPath(template.id) || freeDemoPath(template.templateId || '')
    if (demoPath) {
      window.location.assign(demoPath)
      return
    }
    if (template.id === 'restaurant' || template.templateId === 'restaurant') {
      setSelectedForModal(template)
      return
    }
    if (template.demoRoute.startsWith('/demo/')) {
      window.location.assign(template.demoRoute)
    } else if (template.demoRoute.startsWith('http')) {
      window.open(template.demoRoute, '_blank', 'noopener,noreferrer')
    } else {
      navigate(template.demoRoute)
    }
  }

  // Solicitud de implementación por WhatsApp para las tres plantillas especializadas.
  const handleConsultSpecialized = (template: CommercialTemplateItem) => {
    const text = encodeURIComponent(
      `Hola PACHAX, solicito una implementación para la plantilla "${template.commercialName}". Quisiera conocer el diagnóstico y los siguientes pasos.`
    )
    const number = landingContent.officialWhatsAppNumber.replace(/\D/g, '')
    if (!number) return
    window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  const handleViewPlans = (template: CommercialTemplateItem) => {
    if (template.id === 'hamburger' || template.id === 'retail') {
      props.onViewPlans?.(template.id)
    }
  }

  const isSpecializedDemoAvailable = Boolean(activeSpecialized && canLaunchCommercialDemo(activeSpecialized))
  const isSelfServiceDemoAvailable = Boolean(activeSelfService && (freeDemoPath(activeSelfService.id) || freeDemoPath(activeSelfService.templateId || '') || canLaunchCommercialDemo(activeSelfService)))
  const catalogGroupLabel = (count: number) => {
    if (isPublicEditorialFallback) return 'Fichas editoriales de referencia'
    if (publicCatalogStatus === 'loading') return 'Verificando publicación…'
    if (publicCatalogStatus === 'error') return 'Último catálogo confirmado'
    return `${count} publicadas`
  }

  return (
    <section id="hero" className="relative w-full pt-4 pb-10 sm:pt-8 sm:pb-16 overflow-hidden z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial Principal: Presentación de las Dos Modalidades */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[11px] font-bold uppercase tracking-wider text-[#0066FF] mb-3">
            <span>{landingContent.heroTagline}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight leading-[1.15]">
            {landingContent.heroTitle}
          </h1>

          <p className="text-xs sm:text-base text-slate-600 mt-3 sm:mt-4 leading-relaxed max-w-2xl mx-auto">
            {landingContent.heroSubtitle}
          </p>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span>¿Ya eres cliente?</span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="font-bold text-[#0066FF] hover:text-[#0052cc] underline underline-offset-2 cursor-pointer"
            >
              Iniciar sesión en mi empresa
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DOS CARRUSELES: SIDE-BY-SIDE EN DESKTOP / APILADOS VERTICALMENTE EN MOBILE */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-stretch">
          {isPublicEditorialFallback && <p className="lg:col-span-2 -mb-4 text-center text-xs text-slate-500" role="status" data-catalog-state={publicCatalogStatus}>
            {publicCatalogStatus === 'loading'
              ? 'Verificando el catálogo. Mientras tanto mostramos fichas editoriales de referencia; la información comercial se confirma en el servidor.'
              : 'No pudimos verificar el catálogo en este momento. Mostramos fichas editoriales de referencia; la información comercial requiere confirmación del servidor.'}
          </p>}
          {/* ===================================================================== */}
          {/* CARRUSEL A: SOLUCIONES ESPECIALIZADAS (3 PLANTILLAS)                  */}
          {/* ===================================================================== */}
          <div className="flex flex-col justify-between bg-white/90 backdrop-blur-xs border border-slate-200/90 rounded-3xl p-5 sm:p-7 shadow-xs">
            <div>
              {/* Encabezado del Grupo A */}
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                    Soluciones Especializadas
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {catalogGroupLabel(specializedTemplates.length)}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  Operaciones Complejas y Soporte Continuo
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Diseñadas para restaurantes con salón, distribuidoras y locales nocturnos. Requieren diagnóstico técnico, configuración a medida y mantenimiento mensual garantizado.
                </p>
              </div>

              {/* Coverflow 3D Especializado */}
              {specializedTemplates.length > 0 ? <div className="w-full flex justify-center my-2">
                <TemplateCoverflow
                  templates={specializedTemplates}
                  activeIndex={activeIndexSpecialized}
                  onChangeActiveIndex={setActiveIndexSpecialized}
                  onSelectActiveCard={handleLaunchSpecializedDemo}
                  compact={true}
                  ariaLabel="Carrusel de soluciones especializadas"
                />
              </div> : <p className="my-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600" role="status">
                {publicCatalogStatus === 'loading' ? 'Verificando las plantillas de implementación…' : publicCatalogStatus === 'error' ? 'No se pudo verificar la publicación de estas plantillas.' : 'No hay plantillas especializadas publicadas en el catálogo confirmado.'}
              </p>}

              {/* Tarjeta de Detalle de la Plantilla Activa A */}
              {activeSpecialized && (
                <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-900">
                      {activeSpecialized.commercialName}
                    </h3>
                    <span className="text-[10px] font-semibold text-[#0066FF] bg-blue-100/60 px-2 py-0.5 rounded-md">
                      Mantenimiento continuo
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug line-clamp-2 mb-2.5">
                    {activeSpecialized.description}
                  </p>

                  {/* Micro-bullets de capacidades */}
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 mb-3">
                    {activeSpecialized.bullets.slice(0, 4).map((bullet, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-[#0066FF] shrink-0" />
                        <span className="truncate">{bullet}</span>
                      </div>
                    ))}
                  </div>

                  {/* Acciones de la Tarjeta Activa A: Ver demo en vivo + Solicitar asesoría */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-200/60">
                    {isSpecializedDemoAvailable ? (
                      <button
                        type="button"
                        onClick={() => handleLaunchSpecializedDemo(activeSpecialized)}
                        className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0052cc] shadow-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Ver demo en vivo</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 inline-flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80"
                        title="Demostración pública en desarrollo (G2)"
                      >
                        <Play className="w-3.5 h-3.5 text-slate-400" />
                        <span>Demo próximamente</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleConsultSpecialized(activeSpecialized)}
                      className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#0066FF]" />
                      <span>Solicitar implementación</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <span className="text-[11px] text-slate-400">
                Diagnóstico y configuración personalizada · Sin registro automático
              </span>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* CARRUSEL B: SOLUCIONES AUTOSERVICIO (2 PLANTILLAS)                   */}
          {/* ===================================================================== */}
          <div className="flex flex-col justify-between bg-white/90 backdrop-blur-xs border border-slate-200/90 rounded-3xl p-5 sm:p-7 shadow-xs">
            <div>
              {/* Encabezado del Grupo B */}
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    Soluciones Autoservicio
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {catalogGroupLabel(selfServiceTemplates.length)}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  Punto de Venta Ágil por Rubro
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Para comida rápida, mostrador, para llevar y comercio minorista por peso o unidad. Modelos ágiles en proceso de apertura comercial.
                </p>
              </div>

              {/* Coverflow 3D Autoservicio */}
              {selfServiceTemplates.length > 0 ? <div className="w-full flex justify-center my-2">
                <TemplateCoverflow
                  templates={selfServiceTemplates}
                  activeIndex={activeIndexSelfService}
                  onChangeActiveIndex={setActiveIndexSelfService}
                  onSelectActiveCard={handleLaunchSpecializedDemo}
                  compact={true}
                  ariaLabel="Carrusel de soluciones autoservicio"
                />
              </div> : <p className="my-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600" role="status">
                {publicCatalogStatus === 'loading' ? 'Verificando las plantillas de autoservicio…' : publicCatalogStatus === 'error' ? 'No se pudo verificar la publicación de estas plantillas.' : 'No hay soluciones de autoservicio publicadas en el catálogo confirmado.'}
              </p>}

              {/* Tarjeta de Detalle de la Plantilla Activa B */}
              {activeSelfService && (
                <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-900">
                      {activeSelfService.commercialName}
                    </h3>
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 border border-amber-200/60 px-2 py-0.5 rounded-md">
                      Próximamente disponible
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug line-clamp-2 mb-2.5">
                    {activeSelfService.description}
                  </p>

                  {/* Micro-bullets de capacidades */}
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 mb-3">
                    {activeSelfService.bullets.slice(0, 4).map((bullet, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">{bullet}</span>
                      </div>
                    ))}
                  </div>

                  {/* Acciones de la Tarjeta Activa B: Consultar disponibilidad / Lista de espera + Demo honesta */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => handleViewPlans(activeSelfService)}
                      className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span>Ver planes</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {isSelfServiceDemoAvailable ? (
                      <button
                        type="button"
                        onClick={() => handleLaunchSpecializedDemo(activeSelfService)}
                        className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 text-slate-600" />
                        <span>{freeDemoPath(activeSelfService.id) || freeDemoPath(activeSelfService.templateId || '') ? 'Probar demo' : 'Ver demo'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 inline-flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80"
                        title="Demostración técnica en desarrollo"
                      >
                        <Play className="w-3.5 h-3.5 text-slate-400" />
                        <span>Demo próximamente</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <span className="text-[11px] text-slate-400">
                Plantilla en proceso de consolidación · Apertura comercial próximamente
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal para Selector de Modos de Restaurante */}
      <TemplateModeSelectorModal
        item={selectedForModal}
        onClose={() => setSelectedForModal(null)}
      />
    </section>
  )
}
