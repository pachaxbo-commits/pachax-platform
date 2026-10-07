import { useState } from 'react'
import { ArrowRight, Eye, CheckCircle2 } from 'lucide-react'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import type { CommercialTemplateItem } from '../../admin/types'
import { usePublicRouter } from '../routing/usePublicRouter'

export function FeaturedTemplatesCatalog() {
  const { navigate } = usePublicRouter()
  const { publishedTemplates, landingContent } = useCommercialConfig()
  const [selectedFilter, setSelectedFilter] = useState<string>('all')

  const filterOptions = [
    { id: 'all', label: 'Todas las plantillas' },
    { id: 'restaurant', label: 'Gastronomía' },
    { id: 'distribution', label: 'Distribución' },
    { id: 'nightclub', label: 'Lounge & Club' },
    { id: 'retail', label: 'Comercio Express' },
    { id: 'custom', label: 'A Medida' },
  ] as const

  const filteredTemplates = publishedTemplates.filter((tpl) => {
    if (selectedFilter === 'all') return true
    return tpl.id === selectedFilter
  })

  const handleLaunchDemo = (tpl: CommercialTemplateItem) => {
    if (tpl.demoRoute.startsWith('/demo/')) {
      // Navegación canónica de documento hacia demo.html
      window.location.assign(tpl.demoRoute)
    } else if (tpl.demoRoute.startsWith('http')) {
      window.open(tpl.demoRoute, '_blank', 'noopener,noreferrer')
    } else {
      navigate(tpl.demoRoute)
    }
  }

  const handleSelectTemplate = (tpl: CommercialTemplateItem) => {
    if (tpl.canonicalTemplateId) {
      navigate(`/register?template=${tpl.canonicalTemplateId}`)
    } else {
      window.open(tpl.demoRoute, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <section id="plantillas" className="w-full py-16 sm:py-20 bg-white/70 backdrop-blur-xs border-t border-slate-200/80 z-10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial con Acento Geométrico (Sin Pills Genéricas de IA) */}
        <div className="max-w-3xl mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0066FF]">
              PLANTILLAS CANÓNICAS ESPECIALIZADAS
            </span>
            <span className="h-px flex-1 max-w-[60px] bg-blue-300" />
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            {landingContent.sectionTitles.catalog}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            {landingContent.sectionTitles.catalogSubtitle}
          </p>
        </div>

        {/* Barra de Filtros por Rubro */}
        <div className="flex flex-wrap items-center gap-2 mb-10 pb-4 border-b border-slate-200/80">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2">
            Filtrar rubro:
          </span>
          {filterOptions.map((opt) => {
            const isActive = selectedFilter === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedFilter(opt.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0066FF] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Grilla Editorial de Plantillas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              data-template-id={template.id}
              className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
            >
              {/* Contenedor Superior: Imagen y Contenido */}
              <div>
                {/* Ranura Visual de Concepto (Encuadre Amplio y Nítido) */}
                <div className="relative w-full aspect-16/10 overflow-hidden bg-[#06101c] border-b border-slate-100">
                  <picture>
                    <source srcSet={template.thumbnailUrl} type="image/webp" />
                    <img
                      src={template.thumbnailUrl.replace('.webp', '.jpg')}
                      alt={template.thumbnailAlt}
                      style={{ objectPosition: template.thumbnailFocalPoint || '50% 38%' }}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103 select-none"
                      loading="lazy"
                    />
                  </picture>

                  {/* Sutil viñeta para legibilidad */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

                  {/* Badge sobrio en la esquina */}
                  {template.badge && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-600/90 text-white backdrop-blur-xs shadow-xs">
                        {template.badge}
                      </span>
                    </div>
                  )}
                </div>

                {/* Textos y Ficha Editorial */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
                    {template.commercialName}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5">
                    {template.detailDescription}
                  </p>

                  {/* Bloque Editorial: Audiencia y Propuesta de Valor (Sin cajas ni stickers de IA) */}
                  <div className="space-y-3 mb-5 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">
                        Perfil objetivo
                      </span>
                      <p className="text-slate-700 font-medium leading-relaxed">
                        {template.targetAudience}
                      </p>
                    </div>
                    <div className="pl-3 border-l-2 border-[#0066FF]/60 py-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#0066FF] block mb-0.5">
                        Impacto operacional
                      </span>
                      <p className="text-slate-600 leading-relaxed">
                        {template.problemSolved}
                      </p>
                    </div>
                  </div>

                  {/* Funcionalidades Principales Verificadas */}
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Capacidades operativas incluidas:
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {template.bullets.map((bullet, bIdx) => (
                        <div key={bIdx} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#0066FF] shrink-0" />
                          <span className="truncate">{bullet}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Acciones de Tarjeta: Probar demo y Comenzar */}
              <div className="p-6 pt-0">
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    data-demo-path={template.demoRoute}
                    onClick={() => handleLaunchDemo(template)}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Probar demo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-xs font-semibold text-white transition-all shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    <span>Comenzar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
