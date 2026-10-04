import { ArrowRight, Eye } from 'lucide-react'
import type { CommercialTemplateItem } from '../../admin/types'
import { OFFICIAL_WHATSAPP } from '../config/pricingConfig'
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
      window.open(OFFICIAL_WHATSAPP.buildUrl(OFFICIAL_WHATSAPP.defaultCustomDevMessage), '_blank', 'noopener,noreferrer')
    }
  }

  const handleViewDetails = () => {
    if (template.demoRoute.startsWith('/demo/')) {
      window.location.assign(template.demoRoute)
    } else if (template.demoRoute.startsWith('http')) {
      window.open(template.demoRoute, '_blank', 'noopener,noreferrer')
    } else {
      navigate(template.demoRoute)
    }
  }

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Ranura Visual / Miniatura Comercial Nítida con encuadre amplio */}
        <div className="w-full aspect-16/9 sm:aspect-auto sm:w-32 sm:h-24 rounded-xl shrink-0 border border-slate-200/80 overflow-hidden bg-[#06101c] relative shadow-2xs">
          <picture>
            <source srcSet={template.thumbnailUrl} type="image/webp" />
            <img
              src={template.thumbnailUrl.replace('.webp', '.jpg')}
              alt={template.thumbnailAlt}
              style={{ objectPosition: template.thumbnailFocalPoint || '50% 38%' }}
              className="w-full h-full object-cover select-none"
              loading="eager"
            />
          </picture>
        </div>

        {/* Información y Textos de Producto */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              {template.commercialName}
            </h4>

            {template.badge && (
              <span className="text-[10px] font-bold text-[#0066FF] uppercase tracking-wider bg-blue-50/80 border border-blue-200/80 px-2 py-0.5 rounded-md">
                {template.badge}
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl mb-2.5">
            {template.detailDescription}
          </p>

          {/* Bullets de capacidades operativas */}
          <div className="flex flex-wrap gap-1.5">
            {template.bullets.map((bullet, idx) => (
              <span
                key={idx}
                className="text-[11px] font-medium text-slate-700 bg-slate-100/90 px-2.5 py-0.5 rounded-md border border-slate-200/60"
              >
                {bullet}
              </span>
            ))}
          </div>
        </div>

        {/* Acciones de la Plantilla Activa */}
        <div className="w-full sm:w-auto shrink-0 flex flex-row sm:flex-col gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <button
            type="button"
            onClick={handleViewDetails}
            className="flex-1 sm:flex-none py-2 px-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-98"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Ver demostración</span>
          </button>

          <button
            type="button"
            onClick={handleUseTemplate}
            className="flex-1 sm:flex-none py-2 px-3.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <span>Usar plantilla</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
