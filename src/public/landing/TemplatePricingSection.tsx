import { useState } from 'react'
import { Check, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react'
import {
  COMMERCIAL_PLANS,
  type TemplateId,
} from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'

export function TemplatePricingSection() {
  const { navigate } = usePublicRouter()
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('restaurant')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  const templateTabs: { id: TemplateId; label: string }[] = [
    { id: 'restaurant', label: 'Restaurante' },
    { id: 'distribution', label: 'Distribuidora' },
    { id: 'nightclub', label: 'Nightclub & Lounge' },
    { id: 'retail', label: 'Ventas Express' },
  ]

  const handleSelectPlan = (planId: string, isCustomQuote?: boolean) => {
    if (isCustomQuote) {
      navigate(`/register?intent=custom&fromTemplate=${selectedTemplate}`)
    } else {
      navigate(`/register?plan=${planId}&template=${selectedTemplate}&cycle=${billingCycle}`)
    }
  }

  return (
    <section id="planes" className="w-full py-16 bg-white border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>PLANES COMERCIALES TRANSPARENTES</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Planes adaptados a la escala de tu negocio
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            Sin comisiones ocultas por venta ni letra chica. Elige la plantilla de tu rubro y selecciona el nivel operativo que necesitas para empezar.
          </p>

          {/* Selector de Plantilla para ver adaptaciones operativas */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-1">Ver funciones para:</span>
            {templateTabs.map((tab) => {
              const isActive = selectedTemplate === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedTemplate(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0066FF] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Selector de ciclo de facturación */}
          <div className="mt-5 inline-flex items-center gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200/70">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pago mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pago anual</span>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                -15% dto.
              </span>
            </button>
          </div>
        </div>

        {/* Grilla de 3 Planes Base + Tarjeta de Desarrollo a Medida */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {COMMERCIAL_PLANS.map((plan) => {
            const isCustom = plan.isCustomQuote
            const isPopular = plan.isPopular
            const templatePerks = plan.templatePerks?.[selectedTemplate] || []
            const computedPrice = billingCycle === 'annual' && !isCustom
              ? Math.round(plan.startingPriceUSD * 0.85)
              : plan.startingPriceUSD

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 relative ${
                  isPopular
                    ? 'bg-white border-2 border-[#0066FF] shadow-lg ring-4 ring-blue-500/10 lg:-translate-y-2'
                    : isCustom
                    ? 'bg-slate-900 text-white border border-slate-800 shadow-md'
                    : 'bg-white border border-slate-200/90 shadow-xs hover:shadow-md'
                }`}
              >
                {/* Badge de "Más popular" sobrio y sin emojis */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#0066FF] text-white shadow-xs">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className={`text-xl font-bold tracking-tight ${isCustom ? 'text-white' : 'text-slate-900'}`}>
                      {plan.name}
                    </h3>
                  </div>

                  <p className={`text-xs leading-relaxed mb-5 ${isCustom ? 'text-slate-300' : 'text-slate-500'}`}>
                    {plan.targetAudience}
                  </p>

                  {/* Precio */}
                  <div className="mb-6 pb-5 border-b border-slate-100/10">
                    {isCustom ? (
                      <div className="space-y-1">
                        <div className="text-2xl font-extrabold text-white">
                          A medida
                        </div>
                        <div className="text-xs text-slate-400">
                          Mantenimiento mensual incluido
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs font-bold text-slate-400">Desde</span>
                        <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${isCustom ? 'text-white' : 'text-slate-950'}`}>
                          ${computedPrice}
                        </span>
                        <span className={`text-xs font-semibold ${isCustom ? 'text-slate-400' : 'text-slate-500'}`}>
                          / mes
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Incluye (features) */}
                  <div className="space-y-3 mb-6">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isCustom ? 'text-slate-400' : 'text-slate-400'}`}>
                      Incluye:
                    </p>
                    <ul className="space-y-2">
                      {plan.includedFeatures.map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2 text-xs leading-snug">
                          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isPopular ? 'text-[#0066FF]' : isCustom ? 'text-blue-400' : 'text-slate-700'}`} />
                          <span className={isCustom ? 'text-slate-200' : 'text-slate-700'}>{feat}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Especificidad de la plantilla seleccionada */}
                    {templatePerks.length > 0 && (
                      <div className={`mt-4 pt-3 border-t ${isCustom ? 'border-white/10' : 'border-slate-100'} space-y-1.5`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isCustom ? 'text-blue-300' : 'text-blue-700'}`}>
                          Destacado para este rubro:
                        </p>
                        {templatePerks.map((perk, pIdx) => (
                          <div key={pIdx} className="flex items-center gap-1.5 text-[11px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${isCustom ? 'bg-blue-400' : 'bg-[#0066FF]'}`} />
                            <span className={isCustom ? 'text-slate-300' : 'text-slate-800 font-medium'}>{perk}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Botón CTA */}
                <div className="pt-4 border-t border-slate-100/10">
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan.id, isCustom)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                      isPopular
                        ? 'bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-xs'
                        : isCustom
                        ? 'bg-white hover:bg-slate-100 text-slate-900 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-800'
                    }`}
                  >
                    <span>{plan.ctaLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Nota al pie de Pricing y Aclaración de Arquitectura */}
        <div className="mt-10 p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Precios referenciales en dólares (USD) o su equivalente en bolivianos (BOB). Todos los planes incluyen actualizaciones de seguridad y respaldo en la nube.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const extrasEl = document.getElementById('extras')
              if (extrasEl) extrasEl.scrollIntoView({ behavior: 'smooth' })
            }}
            className="text-[#0066FF] hover:underline font-semibold shrink-0 cursor-pointer"
          >
            Ver servicios adicionales y extras &rarr;
          </button>
        </div>
      </div>
    </section>
  )
}
