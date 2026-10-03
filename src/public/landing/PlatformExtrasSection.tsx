import { Megaphone, Palette, Headphones, Zap, Code2, PlusCircle, ArrowRight } from 'lucide-react'
import { PLATFORM_ADDONS, type PlatformAddon } from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'

export function PlatformExtrasSection() {
  const { navigate } = usePublicRouter()

  const renderAddonIcon = (key: PlatformAddon['iconKey']) => {
    switch (key) {
      case 'ads':
        return <Megaphone className="w-5 h-5 text-[#0066FF]" />
      case 'palette':
        return <Palette className="w-5 h-5 text-[#0066FF]" />
      case 'headset':
        return <Headphones className="w-5 h-5 text-[#0066FF]" />
      case 'zap':
        return <Zap className="w-5 h-5 text-[#0066FF]" />
      case 'code':
        return <Code2 className="w-5 h-5 text-[#0066FF]" />
    }
  }

  const handleInquireAddon = (addon: PlatformAddon) => {
    navigate(`/register?intent=addon&addonId=${addon.id}`)
  }

  return (
    <section id="extras" className="w-full py-16 bg-[#FAF9F6] border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado */}
        <div className="max-w-3xl mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-3">
            <PlusCircle className="w-3.5 h-3.5" />
            <span>MÓDULOS Y SERVICIOS ADICIONALES</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Potencia tu sistema con servicios complementarios
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            Personaliza tu suscripción agregando módulos de marketing, soporte dedicado o integraciones contables. Actívalos cuando los necesites, sin contratos forzosos.
          </p>
        </div>

        {/* Grilla de Extras / Adicionales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PLATFORM_ADDONS.map((addon) => (
            <div
              key={addon.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    {renderAddonIcon(addon.iconKey)}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/70">
                    {addon.referencePriceLabel}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mb-1 group-hover:text-[#0066FF] transition-colors">
                  {addon.name}
                </h3>
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  {addon.tagline}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  {addon.description}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">
                  Activación modular
                </span>
                <button
                  type="button"
                  onClick={() => handleInquireAddon(addon)}
                  className="text-xs font-bold text-[#0066FF] hover:text-[#0052cc] inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Consultar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
