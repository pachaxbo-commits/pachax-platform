import { ArrowRight, Eye, Utensils, Truck, GlassWater, ShoppingBag, Settings } from 'lucide-react'
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

  const renderIcon = (type: CommercialTemplateItem['iconType']) => {
    switch (type) {
      case 'utensils':
        return <Utensils className="w-8 h-8 text-amber-500" />
      case 'truck':
        return <Truck className="w-8 h-8 text-blue-500" />
      case 'glass':
        return <GlassWater className="w-8 h-8 text-purple-500" />
      case 'shopping-bag':
        return <ShoppingBag className="w-8 h-8 text-emerald-500" />
      case 'settings':
        return <Settings className="w-8 h-8 text-sky-500" />
    }
  }

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm transition-all duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Ranura Visual / Miniatura Desacoplada */}
        <div
          className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl shrink-0 flex items-center justify-center border shadow-xs relative overflow-hidden bg-gradient-to-br ${template.visualSlot.gradientClass}`}
        >
          {/* Luz ambiental sutil */}
          <div
            className="absolute inset-0 opacity-25"
            style={{
              background: `radial-gradient(circle at center, ${template.visualSlot.accentColor}, transparent 70%)`,
            }}
          />
          <div className="relative z-10 p-2 rounded-xl bg-black/30 backdrop-blur-xs border border-white/10">
            {renderIcon(template.iconType)}
          </div>
        </div>

        {/* Información y Textos */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              {template.commercialName}
            </h4>

            {template.badge && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0066FF] bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md">
                <span>★</span> {template.badge}
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
            {template.detailDescription}
          </p>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={handleViewDetails}
          className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-950 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Eye className="w-4 h-4 text-slate-500" />
          <span>Ver detalles</span>
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
