import { ArrowRight, Eye, CheckCircle2 } from 'lucide-react'
import type { CommercialTemplateItem } from '../config/commercialShowcase'
import { usePublicRouter } from '../routing/usePublicRouter'

interface ActiveTemplateDetailProps {
  template: CommercialTemplateItem
}

export function ActiveTemplateDetail({ template }: ActiveTemplateDetailProps) {
  const { navigate } = usePublicRouter()

  const handleUseTemplate = () => {
    if (template.canonicalTemplateId) {
      navigate(`/register?template=${template.canonicalTemplateId}`)
    } else {
      navigate('/register?intent=custom')
    }
  }

  const handleViewDetails = () => {
    if (template.demoPath.startsWith('/demo/')) {
      // Navegación de documento hacia la demo canónica
      window.location.assign(template.demoPath)
    } else {
      navigate(template.demoPath)
    }
  }

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Ranura Visual / Miniatura Vectorial Nítida */}
        <div className="w-full sm:w-28 h-20 sm:h-24 rounded-xl shrink-0 border border-slate-200/80 overflow-hidden bg-[#06101c] relative shadow-2xs">
          <img
            src={template.imageSrc}
            alt={template.commercialName}
            className="w-full h-full object-cover object-center"
            loading="eager"
          />
        </div>

        {/* Información y Textos de Producto */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              {template.commercialName}
            </h4>

            {template.badge && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-[#0066FF]" />
                <span>{template.badge}</span>
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl mb-2">
            {template.detailDescription}
          </p>

          {/* Bullets concretos de funcionalidades operativas */}
          <div className="flex flex-wrap gap-1.5">
            {template.bullets.map((bullet, idx) => (
              <span
                key={idx}
                className="text-[11px] font-medium text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60"
              >
                {bullet}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Botones de Acción Funcionales */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={handleViewDetails}
          className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-950 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Eye className="w-4 h-4 text-slate-500" />
          <span>Ver demo en vivo</span>
        </button>

        <button
          type="button"
          onClick={handleUseTemplate}
          className="px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 active:scale-98"
        >
          <span>{template.primaryActionLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
