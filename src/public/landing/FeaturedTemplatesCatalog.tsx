import { useState } from 'react'
import { ArrowRight, Eye, CheckCircle2, Layers, Users, Sparkles } from 'lucide-react'
import { COMMERCIAL_TEMPLATES, type CommercialTemplateItem } from '../config/commercialShowcase'
import { usePublicRouter } from '../routing/usePublicRouter'

export function FeaturedTemplatesCatalog() {
  const { navigate } = usePublicRouter()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'food' | 'logistics' | 'night' | 'retail' | 'custom'>('all')

  const filterOptions = [
    { id: 'all', label: 'Todas las plantillas' },
    { id: 'food', label: 'Gastronomía' },
    { id: 'logistics', label: 'Distribución' },
    { id: 'night', label: 'Lounge & Nightclub' },
    { id: 'retail', label: 'Comercio Express' },
    { id: 'custom', label: 'A Medida' },
  ] as const

  const filteredTemplates = COMMERCIAL_TEMPLATES.filter((tpl) => {
    if (selectedFilter === 'all') return true
    if (selectedFilter === 'food') return tpl.id === 'restaurant'
    if (selectedFilter === 'logistics') return tpl.id === 'distribution'
    if (selectedFilter === 'night') return tpl.id === 'nightclub'
    if (selectedFilter === 'retail') return tpl.id === 'retail'
    if (selectedFilter === 'custom') return tpl.id === 'custom'
    return true
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
        {/* Cabecera Editorial de la Sección */}
        <div className="max-w-3xl mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-3">
            <Layers className="w-3.5 h-3.5" />
            <span>SECCIÓN 2 · PLANTILLAS EN DETALLE</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Diseñadas para la operativa real de cada sector
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            Cada plantilla está construida sobre flujos operativos verificados en el terreno. Sin módulos genéricos de relleno: solo lo que tu negocio necesita para facturar, controlar inventario y crecer.
          </p>
        </div>

        {/* Filtros de Categoría */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-8 scrollbar-none">
          {filterOptions.map((opt) => {
            const isSelected = selectedFilter === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedFilter(opt.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Grilla de Tarjetas de Catálogo Detallado */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden group"
            >
              {/* Miniatura Comercial Nítida Superior */}
              <div className="relative w-full h-52 bg-[#06101c] overflow-hidden border-b border-slate-100">
                <picture>
                  <source srcSet={template.thumbnailUrl} type="image/webp" />
                  <img
                    src={template.thumbnailUrl.replace('.webp', '.jpg')}
                    alt={template.thumbnailAlt}
                    style={{ objectPosition: template.thumbnailFocalPoint }}
                    className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500"
                    loading="lazy"
                  />
                </picture>

                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

                {template.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-600/95 text-white border border-blue-400/40 backdrop-blur-xs shadow-xs">
                    {template.badge}
                  </span>
                )}
              </div>

              {/* Contenido Editorial Completo (Para quién sirve + Qué resuelve) */}
              <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mb-1.5">
                    {template.commercialName}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                    {template.detailDescription}
                  </p>

                  {/* Para quién sirve */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 mb-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11px] uppercase tracking-wider">
                      <Users className="w-3.5 h-3.5 text-[#0066FF]" />
                      <span>Para quién es:</span>
                    </div>
                    <p className="text-slate-600 leading-snug">{template.targetAudience}</p>
                  </div>

                  {/* Qué resuelve */}
                  <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-100/60 text-xs text-slate-700 mb-4 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#0066FF] text-[11px] uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-[#0066FF]" />
                      <span>Qué resuelve:</span>
                    </div>
                    <p className="text-slate-600 leading-snug">{template.problemSolved}</p>
                  </div>

                  {/* Funcionalidades Principales Verificadas */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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

                {/* Acciones de Tarjeta: Probar demo y Comenzar */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    data-demo-path={template.demoPath}
                    onClick={() => handleLaunchDemo(template)}
                    className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Probar demo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-xs font-semibold text-white transition-all shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
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
