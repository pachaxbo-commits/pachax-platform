import { useState } from 'react'
import { Check, ArrowRight, HelpCircle } from 'lucide-react'
import {
  CUSTOM_DEVELOPMENT_CONFIG,
  type TemplateKey,
  type TemplateTierPlan,
} from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'

export function TemplatePricingSection() {
  const { navigate } = usePublicRouter()
  const { landingContent, publishedPlansByTemplate, publishedTemplates } = useCommercialConfig()
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>(
    (publishedTemplates[0]?.templateId as TemplateKey) || 'restaurant'
  )
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  const templateTabs = publishedTemplates.map((t) => ({
    id: t.templateId,
    label: t.commercialName,
  }))

  const activePlans = publishedPlansByTemplate(selectedTemplate)

  const handleSelectPlan = (plan: TemplateTierPlan) => {
    navigate(`/register?plan=${plan.id}&template=${selectedTemplate}&cycle=${billingCycle}`)
  }

  const whatsAppLink = `https://wa.me/${landingContent.officialWhatsAppNumber}?text=${encodeURIComponent(landingContent.defaultCustomDevMessage)}`

  return (
    <section id="planes" className="w-full py-20 bg-white border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-[#0066FF] mb-2">
            PLANES COMERCIALES TRANSPARENTES
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Planes adaptados a la escala real de tu empresa
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Sin comisiones ocultas por venta ni cargos sorpresa. Cada rubro cuenta con niveles operativos diseñados para acompañar tu crecimiento desde la apertura hasta la gestión multisucursal.
          </p>

          {/* Selector de Plantilla por Pestañas */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-1 uppercase tracking-wider">Rubro:</span>
            {templateTabs.map((tab) => {
              const isActive = selectedTemplate === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedTemplate(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0066FF] text-white shadow-sm ring-2 ring-blue-500/20'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-950 hover:bg-slate-200/80'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Selector de ciclo de facturación (Mensual / Anual) */}
          <div className="mt-6 inline-flex items-center gap-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pago anual</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                -15% dto.
              </span>
            </button>
          </div>
        </div>

        {/* Grilla de 3 Planes Estándar por Plantilla */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch mb-12">
          {activePlans.map((plan) => {
            const isPopular = plan.isPopular
            const price = billingCycle === 'annual' ? plan.annualPriceUSD : plan.monthlyPriceUSD

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 relative ${
                  isPopular
                    ? 'bg-white border-2 border-[#0066FF] shadow-xl ring-4 ring-blue-500/10 md:-translate-y-2'
                    : 'bg-white border border-slate-200 shadow-xs hover:shadow-md'
                }`}
              >
                {/* Badge "Más popular" */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="px-3.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-[#0066FF] text-white shadow-sm">
                      {plan.badge || 'Recomendado'}
                    </span>
                  </div>
                )}

                <div>
                  {/* Encabezado del Plan */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight">
                      {plan.name}
                    </h3>
                    {plan.limitsLabel && (
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/80">
                        {plan.limitsLabel}
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6 min-h-[40px]">
                    {plan.clientProfile}
                  </p>

                  {/* Precio */}
                  <div className="mb-6 pb-6 border-b border-slate-100">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Desde</span>
                      <span className="text-4xl sm:text-5xl font-black text-slate-950 tracking-tight">
                        ${price}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-500">
                        USD / mes
                      </span>
                    </div>
                    {billingCycle === 'annual' && (
                      <p className="text-[11px] font-medium text-emerald-600 mt-1">
                        Facturado anualmente (ahorro de ${(plan.monthlyPriceUSD - plan.annualPriceUSD) * 12} USD al año)
                      </p>
                    )}
                  </div>

                  {/* Lista de Capacidades Técnicas Incluidas */}
                  <div className="space-y-3 mb-8">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Capacidades operativas incluidas:
                    </p>
                    <ul className="space-y-2.5">
                      {plan.includedFeatures.map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2.5 text-xs sm:text-sm leading-snug text-slate-700">
                          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isPopular ? 'text-[#0066FF]' : 'text-emerald-600'}`} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Botón CTA de Selección */}
                <div className="pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 inline-flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                      isPopular
                        ? 'bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-md hover:shadow-lg'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                    }`}
                  >
                    <span>{plan.ctaLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bloque Destacado de Desarrollo a Medida */}
        <div className="rounded-3xl bg-slate-950 text-white p-8 sm:p-10 lg:p-12 border border-slate-800 shadow-2xl relative overflow-hidden">
          {/* Acento arquitectónico sutil */}
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-1">
                SOLUCIÓN EXCLUSIVA DE INGENIERÍA
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {CUSTOM_DEVELOPMENT_CONFIG.title}
              </h3>
              <p className="text-sm sm:text-base font-semibold text-blue-300">
                {CUSTOM_DEVELOPMENT_CONFIG.subtitle}
              </p>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {CUSTOM_DEVELOPMENT_CONFIG.description}
              </p>

              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Alcance incluido del servicio:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                  {CUSTOM_DEVELOPMENT_CONFIG.highlights.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-center items-start lg:items-end gap-4 p-6 sm:p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-left lg:text-right w-full">
                <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Cotización</span>
                <div className="text-2xl sm:text-3xl font-black text-white mt-1">
                  A medida
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {CUSTOM_DEVELOPMENT_CONFIG.tagline}
                </p>
              </div>

              <div className="w-full flex flex-col sm:flex-row lg:flex-col gap-3 pt-2">
                <a
                  href={whatsAppLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-5 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white transition-all text-center inline-flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <span>Solicitar asesoría técnica</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => navigate('/register?intent=custom')}
                  className="w-full py-3 px-5 rounded-xl text-xs sm:text-sm font-bold bg-white/10 hover:bg-white/20 text-white transition-all text-center cursor-pointer border border-white/15"
                >
                  Registrar solicitud
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Nota al pie de Pricing y Aclaración de Arquitectura */}
        <div className="mt-10 p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Precios referenciales en dólares (USD) o su equivalente en bolivianos (BOB). Todos los planes incluyen actualizaciones continuas de seguridad y respaldo en la nube.
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
