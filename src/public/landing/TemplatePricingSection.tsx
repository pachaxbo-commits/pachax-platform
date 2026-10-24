import { useState } from 'react'
import {
  Check,
  ArrowRight,
  MessageSquare,
  Play,
} from 'lucide-react'
import {
  OFFICIAL_WHATSAPP,
  SPECIALIZED_IMPLEMENTATION_MODELS,
  QUICK_SERVICE_CATALOG,
  type SpecializedModelInfo,
  type QuickServiceSubcategory,
  type TemplateTierPlan,
  CUSTOM_DEVELOPMENT_CONFIG,
} from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'
import { isTemplateProvisioningAvailable, canLaunchCommercialDemo, getPublicTemplate } from '../../core/publicTemplates'

export function TemplatePricingSection() {
  const { navigate } = usePublicRouter()

  // Estado del Bloque A: Implementación Especializada
  const [selectedSpecializedId, setSelectedSpecializedId] = useState<'distribution' | 'restaurant' | 'nightclub'>('distribution')
  const activeSpecialized: SpecializedModelInfo =
    SPECIALIZED_IMPLEMENTATION_MODELS.find((m) => m.id === selectedSpecializedId) ||
    SPECIALIZED_IMPLEMENTATION_MODELS[0]

  // Estado del Bloque B: Autoservicio con Planes Directos
  const [selectedQuickServiceId, setSelectedQuickServiceId] = useState<'hamburger' | 'retail'>('hamburger')
  const activeQuickCatalog: QuickServiceSubcategory =
    QUICK_SERVICE_CATALOG.find((q) => q.id === selectedQuickServiceId) ||
    QUICK_SERVICE_CATALOG[0]

  const [selectedTierLevel, setSelectedTierLevel] = useState<number>(2) // Nivel 2 (Más popular) por defecto
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  const activePlan: TemplateTierPlan =
    activeQuickCatalog.plans.find((p) => p.tierLevel === selectedTierLevel) ||
    activeQuickCatalog.plans[1] ||
    activeQuickCatalog.plans[0]

  const calculatedPrice = billingCycle === 'annual' ? activePlan.annualPriceUSD : activePlan.monthlyPriceUSD

  const handleLaunchSpecializedDemo = (route: string) => {
    if (route.startsWith('/demo/')) {
      window.location.assign(route)
    } else {
      navigate(route)
    }
  }

  const handleSpecializedWhatsApp = (model: SpecializedModelInfo) => {
    const url = OFFICIAL_WHATSAPP.buildUrl(model.whatsAppPrompt)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSelectQuickPlan = (plan: TemplateTierPlan) => {
    navigate(`/register?template=${activeQuickCatalog.templateParam}&plan=${plan.id}&cycle=${billingCycle}`)
  }

  const handleQuickWaitlistWhatsApp = (catalog: QuickServiceSubcategory, plan: TemplateTierPlan) => {
    const text = `Hola PACHAX, me interesa el plan referencial "${plan.name}" para la plantilla ${catalog.commercialTitle} (en fase de prelanzamiento). Deseo información cuando esté disponible para contratación.`
    const url = OFFICIAL_WHATSAPP.buildUrl(text)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleCustomDevWhatsApp = () => {
    const url = OFFICIAL_WHATSAPP.buildUrl(CUSTOM_DEVELOPMENT_CONFIG.whatsAppMessage)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const isQuickProvisioningActive = isTemplateProvisioningAvailable(activeQuickCatalog.templateParam)

  return (
    <section id="planes" className="w-full py-20 bg-slate-50/70 border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial Principal */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[11px] font-bold uppercase tracking-wider text-[#0066FF] mb-2.5">
            <span>MODELOS COMERCIALES TRANSPARENTES</span>
          </div>
          <div className="mb-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              TARIFAS REFERENCIALES EN FASE DE LANZAMIENTO · SUJETAS A APROBACIÓN DEFINITIVA
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Elige la ruta adaptada a la complejidad real de tu negocio
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-3 leading-relaxed">
            Sin comisiones ocultas por venta ni letra chica. Separamos el autoservicio de despliegue rápido para negocios de mostrador, de la implementación especializada para operaciones complejas con logística, salón o alta concurrencia.
          </p>
        </div>

        {/* Dos Bloques Paralelos en Desktop, Apilados en Mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch mb-14">
          {/* ========================================================================= */}
          {/* BLOQUE 1: IMPLEMENTACIÓN ESPECIALIZADA (Gris/Azul Noche Premium) */}
          {/* ========================================================================= */}
          <div className="bg-[#071322] text-white rounded-3xl p-6 sm:p-8 border border-blue-500/25 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            {/* Efecto de luz volumétrica nocturna */}
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-24 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-24 -left-24 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"
            />

            <div className="relative z-10">
              {/* Encabezado del Bloque Especializado */}
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Alta Complejidad & Flota
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  Ruta Guiada
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Implementación Especializada
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                Diseñado para operaciones que requieren auditoría de procesos, configuración de hardware y acompañamiento técnico directo.
              </p>

              {/* Selector de Plantilla Especializada (Tabs) */}
              <div className="mt-6 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-wrap sm:flex-nowrap gap-1">
                {SPECIALIZED_IMPLEMENTATION_MODELS.map((model) => {
                  const isSelected = selectedSpecializedId === model.id
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedSpecializedId(model.id)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                        isSelected
                          ? 'bg-[#0066FF] text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {model.title}
                    </button>
                  )
                })}
              </div>

              {/* Ficha Activa de la Plantilla Especializada */}
              <div className="mt-6 p-5 rounded-2xl bg-[#0b1c31] border border-blue-500/20 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400">
                      {activeSpecialized.badge}
                    </span>
                    <h4 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                      {activeSpecialized.subtitle}
                    </h4>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Base Cloud Referencial
                    </span>
                    <span className="text-lg sm:text-xl font-black text-white">
                      ${activeSpecialized.cloudMaintenance.monthlyPriceUSD}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">USD/mes</span>
                  </div>
                </div>

                {/* 3 Etapas Claras del Proceso Especializado */}
                <div className="space-y-2.5 pt-3 border-t border-white/10 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{activeSpecialized.diagnostic.title}</span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800/80">
                          {activeSpecialized.diagnostic.badge}
                        </span>
                      </div>
                      <p className="text-slate-300 mt-0.5 text-[11px] leading-relaxed">
                        {activeSpecialized.diagnostic.detail}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{activeSpecialized.implementation.title}</span>
                        <span className="text-[10px] text-sky-400 bg-sky-950/80 px-1.5 py-0.2 rounded border border-sky-800/80">
                          {activeSpecialized.implementation.badge}
                        </span>
                      </div>
                      <p className="text-slate-300 mt-0.5 text-[11px] leading-relaxed">
                        {activeSpecialized.implementation.detail}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <div className="font-bold text-white">
                        Mantenimiento Cloud, Respaldos y Soporte Continuo
                      </div>
                      <p className="text-slate-300 mt-0.5 text-[11px] leading-relaxed">
                        {activeSpecialized.cloudMaintenance.detail}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Funcionalidades Clave Incluidas */}
                <div className="pt-3 border-t border-white/10">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Capacidades del motor canónico:
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                    {activeSpecialized.includedHighlights.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Acciones del Bloque Especializado */}
            <div className="relative z-10 pt-6 mt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleSpecializedWhatsApp(activeSpecialized)}
                className="flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-lg inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Solicitar diagnóstico gratuito</span>
              </button>
              {canLaunchCommercialDemo(getPublicTemplate(activeSpecialized.id)) ? (
                <button
                  type="button"
                  onClick={() => handleLaunchSpecializedDemo(activeSpecialized.demoRoute)}
                  className="py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer border border-white/15 inline-flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />
                  <span>Ver demo en vivo</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-white/5 text-slate-400 border border-white/10 inline-flex items-center justify-center gap-2 cursor-not-allowed opacity-75"
                  title="Demostración disponible próximamente"
                >
                  <Play className="w-3.5 h-3.5 text-slate-500" />
                  <span>Demo próximamente</span>
                </button>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOQUE 2: AUTOSERVICIO CON PLANES DIRECTOS (Limpio / Comercial) */}
          {/* ========================================================================= */}
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xl flex flex-col justify-between relative">
            <div>
              {/* Encabezado del Bloque Autoservicio */}
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Despliegue Inmediato
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Sin Esperas
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight">
                Autoservicio con Planes Directos
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                Elige tu rubro y plan estándar. Comienza a operar hoy mismo registrando tu empresa en 4 sencillos pasos.
              </p>

              {/* Selector de Subcategoría (Restaurante Rápido vs Comercio & Balanza) */}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="w-full sm:w-auto p-1 rounded-xl bg-slate-100 border border-slate-200/80 inline-flex">
                  {QUICK_SERVICE_CATALOG.map((cat) => {
                    const isSelected = selectedQuickServiceId === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedQuickServiceId(cat.id)}
                        className={`flex-1 sm:flex-initial py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-slate-950 shadow-xs'
                            : 'text-slate-600 hover:text-slate-950'
                        }`}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>

                {/* Toggle de Ciclo de Facturación (Mensual / Anual) */}
                <div className="w-full sm:w-auto p-1 rounded-xl bg-slate-100 border border-slate-200/80 inline-flex items-center justify-between sm:justify-start gap-1">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      billingCycle === 'monthly'
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
                      billingCycle === 'annual'
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span>Anual</span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                      -15%
                    </span>
                  </button>
                </div>
              </div>

              {/* Selector de Nivel de Plan (Tabs de 3 Niveles) */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                {activeQuickCatalog.plans.map((p) => {
                  const isSelected = p.tierLevel === selectedTierLevel
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedTierLevel(p.tierLevel || 1)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#0066FF] bg-blue-50/50 text-[#0066FF] font-bold shadow-xs'
                          : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        Nivel {p.tierLevel}
                      </div>
                      <div className="text-xs truncate font-bold mt-0.5">
                        {p.name}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Ficha Visual del Plan Activo Seleccionado */}
              <div className="mt-6 p-6 rounded-2xl border-2 border-[#0066FF] bg-gradient-to-b from-blue-50/30 to-white relative">
                {activePlan.isPopular && (
                  <div className="absolute -top-3 left-6">
                    <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#0066FF] text-white shadow-xs">
                      {activePlan.badge || 'Más popular'}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h4 className="text-xl font-extrabold text-slate-950 tracking-tight">
                      {activePlan.name}
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-snug">
                      {activePlan.clientProfile}
                    </p>
                  </div>
                  {activePlan.limitsLabel && (
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg shrink-0">
                      {activePlan.limitsLabel}
                    </span>
                  )}
                </div>

                {/* Precio */}
                <div className="pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Referencial
                    </span>
                    <span className="text-4xl font-black text-slate-950 tracking-tight">
                      ${calculatedPrice}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      USD / mes
                    </span>
                    {billingCycle === 'annual' && (
                      <span className="ml-2 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        Ahorro estimado ${(activePlan.monthlyPriceUSD - activePlan.annualPriceUSD) * 12} USD/año
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    * Tarifa provisional de prelanzamiento. No constituye oferta comercial vinculante.
                  </span>
                </div>

                {/* Lista de Capacidades Técnicas Incluidas */}
                <div className="space-y-2.5 mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Capacidades incluidas:
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {activePlan.includedFeatures.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* CTA del Bloque Autoservicio */}
            <div className="pt-6 mt-6 border-t border-slate-100">
              {isQuickProvisioningActive ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectQuickPlan(activePlan)}
                    className="w-full py-3.5 px-6 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>{activePlan.ctaLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-[11px] text-center text-slate-400 mt-2">
                    Sin tarjeta de crédito obligatoria para comenzar. Aprovisionamiento seguro en 4 pasos.
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleQuickWaitlistWhatsApp(activeQuickCatalog, activePlan)}
                    className="w-full py-3.5 px-6 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Consultar disponibilidad · {activePlan.name}</span>
                  </button>
                  <p className="text-[11px] text-center text-slate-400 mt-2">
                    Plantilla en consolidación operativa. Tarifas referenciales no vinculantes para contratación.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BANNER DE CIERRE: INGENIERÍA Y DESARROLLO A MEDIDA */}
        {/* ========================================================================= */}
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 text-center md:text-left max-w-2xl">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
              <span>{CUSTOM_DEVELOPMENT_CONFIG.title}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {CUSTOM_DEVELOPMENT_CONFIG.subtitle}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {CUSTOM_DEVELOPMENT_CONFIG.description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={handleCustomDevWhatsApp}
              className="w-full sm:w-auto py-3 px-5 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Hablar con ingeniería</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/register?intent=custom')}
              className="w-full sm:w-auto py-3 px-5 rounded-xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all cursor-pointer text-center"
            >
              Crear cuenta corporativa
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
