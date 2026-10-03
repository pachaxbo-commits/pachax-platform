import { useState } from 'react'
import {
  Clock,
  PlayCircle,
  Sparkles,
  ArrowRight,
  Plus,
  CheckCircle2,
  Cog,
} from 'lucide-react'
import {
  PUBLIC_PRICING_TIERS,
  PRICING_TEASER_CONFIG,
} from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'

export function ProductTrioSection() {
  const { navigate } = usePublicRouter()
  // Seleccionamos 'pro' (Profesional) por defecto como en la maqueta mobile
  const [selectedTierId, setSelectedTierId] = useState<string>('pro')

  const selectedTier =
    PUBLIC_PRICING_TIERS.find((t) => t.id === selectedTierId) || PUBLIC_PRICING_TIERS[1]

  const { startingPriceDesktop, startingPriceMobile, customOfferNote } = PRICING_TEASER_CONFIG

  return (
    <section id="planes" className="w-full py-10 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ============================================================ */}
        {/* VISTA DESKTOP: 3 Columnas (Onboarding, Tutoriales, Pricing) */}
        {/* ============================================================ */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-6 items-stretch">
          {/* Bloque 1: Onboarding ("Configura tu empresa en minutos") */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-100 text-[11px] font-bold uppercase tracking-wider mb-4">
                <Clock className="w-3.5 h-3.5" />
                <span>EMPIEZA EN MINUTOS</span>
              </div>

              <h3 className="text-xl font-bold text-slate-950 tracking-tight mb-2">
                Configura tu empresa en minutos
              </h3>

              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Personaliza tu plantilla con la información de tu negocio y comienza a vender.
              </p>
            </div>

            {/* Stepper horizontal de 4 pasos */}
            <div className="pt-4 border-t border-slate-100">
              <div className="grid grid-cols-4 gap-2 text-center relative">
                {/* Paso 1 */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-[#0066FF] text-white text-xs font-bold flex items-center justify-center shadow-xs mb-2">
                    1
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 leading-tight">
                    Logo
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    de tu empresa
                  </span>
                </div>

                {/* Paso 2 */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0066FF] text-xs font-bold flex items-center justify-center mb-2">
                    2
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 leading-tight">
                    Nombre
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    del negocio
                  </span>
                </div>

                {/* Paso 3 */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0066FF] text-xs font-bold flex items-center justify-center mb-2">
                    3
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 leading-tight">
                    Colores
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    de tu marca
                  </span>
                </div>

                {/* Paso 4 */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0066FF] text-xs font-bold flex items-center justify-center mb-2">
                    4
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 leading-tight">
                    Sucursal
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    y config.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 2: Tutoriales Guiados */}
          <div id="tutoriales" className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold uppercase tracking-wider mb-4">
                <PlayCircle className="w-3.5 h-3.5" />
                <span>TUTORIALES GUIADOS</span>
              </div>

              <h3 className="text-xl font-bold text-slate-950 tracking-tight mb-2">
                Te acompañamos en cada paso
              </h3>

              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Al ingresar al sistema encontrarás tutoriales guiados con flechas y ayudas visuales.
              </p>
            </div>

            {/* Simulación visual de tooltip / ayuda en pantalla */}
            <div className="my-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 relative">
              <div className="inline-block px-3 py-1.5 rounded-lg bg-[#0066FF] text-white text-xs font-semibold shadow-xs mb-2">
                Te guiamos paso a paso dentro del sistema
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white border border-slate-200 text-[#0066FF] flex items-center justify-center shadow-xs">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="w-24 h-2 bg-slate-200 rounded-full" />
                  <div className="w-16 h-2 bg-slate-200 rounded-full" />
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('plantillas')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4 text-[#0066FF]" />
                <span>Ver tutoriales</span>
              </button>
            </div>
          </div>

          {/* Bloque 3: Pricing Teaser Desktop */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-100 text-[11px] font-bold uppercase tracking-wider mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                <span>PLANES MENSUALES</span>
              </div>

              <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {startingPriceDesktop.label}
              </span>

              <div className="flex items-baseline gap-1 my-1">
                <span className="text-4xl font-extrabold text-slate-950 tracking-tight">
                  {startingPriceDesktop.currencySymbol}
                  {startingPriceDesktop.amount}
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  {startingPriceDesktop.period}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                {startingPriceDesktop.note}
              </p>
            </div>

            {/* Mención especial: Desarrollo a medida */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="w-6 h-6 rounded-full bg-[#0066FF] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {customOfferNote.title}
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {customOfferNote.subtitle}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* VISTA MOBILE: Selector de Planes Interactivo + Onboarding/Tutorials */}
        {/* ============================================================ */}
        <div className="lg:hidden space-y-6">
          {/* Bloque Pricing Mobile con Selector Interactivo de Tiers */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-100 text-[10px] font-bold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>PLANES FLEXIBLES</span>
            </div>

            <div className="mb-4">
              <span className="block text-xs font-semibold text-slate-500">
                {startingPriceMobile.label}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-extrabold text-[#0066FF] tracking-tight">
                  {startingPriceMobile.currencySymbol}
                  {startingPriceMobile.amount}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {startingPriceMobile.period}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-snug mt-1">
                {startingPriceMobile.note}
              </p>
            </div>

            {/* Selector Horizontal de Tiers */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl mb-4">
              {PUBLIC_PRICING_TIERS.map((tier) => {
                const isSelected = tier.id === selectedTierId
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`relative flex flex-col items-center justify-center p-2 rounded-lg text-center transition-all ${
                      isSelected
                        ? 'bg-white shadow-xs text-slate-950 font-bold border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tier.badge && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold text-white bg-[#0066FF] px-1.5 py-0.2 rounded-full whitespace-nowrap shadow-2xs">
                        {tier.badge}
                      </span>
                    )}

                    <span className="text-[10px] font-semibold truncate w-full">
                      {tier.name}
                    </span>

                    {tier.isCustomQuote ? (
                      <div className="mt-1 flex flex-col items-center">
                        <Cog className="w-4 h-4 text-slate-500" />
                        <span className="text-[9px] text-slate-400">—</span>
                      </div>
                    ) : (
                      <div className="mt-1 flex flex-col items-center">
                        <span className="text-xs font-extrabold">
                          ${tier.priceMonthlyUSD}
                        </span>
                        <span className="text-[8px] text-slate-400">/mes</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Detalle del Plan Seleccionado */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <h4 className="text-xs font-bold text-slate-900 mb-1">
                {selectedTier.name} — {selectedTier.isCustomQuote ? 'Cotización personalizada' : `$${selectedTier.priceMonthlyUSD}/mes`}
              </h4>
              <p className="text-[11px] text-slate-600 mb-2">
                {selectedTier.description}
              </p>
              <ul className="space-y-1 mb-3">
                {selectedTier.highlightedFeatures.map((feat, fIdx) => (
                  <li key={fIdx} className="text-[11px] text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0066FF] shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="w-full py-2 text-xs font-semibold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1"
              >
                <span>{selectedTier.isCustomQuote ? 'Solicitar desarrollo' : 'Elegir este plan'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bloque Onboarding Mobile */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
            <h3 className="text-base font-bold text-slate-950 mb-1">
              Configura tu negocio en simples pasos
            </h3>
            <p className="text-xs text-slate-600 leading-snug mb-3">
              Después de crear tu cuenta podrás personalizar el nombre, logo, colores y tu sucursal con un asistente guiado.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-[#0066FF] text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                <span>Tu empresa</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0066FF] text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                <span>Logo y colores</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0066FF] text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                <span>Sucursal</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0066FF] text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
                <span>¡Listo!</span>
              </div>
            </div>
          </div>

          {/* Bloque Tutoriales Mobile */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-base font-bold text-slate-950 mb-1">
                Tutoriales guiados dentro de la plataforma
              </h3>
              <p className="text-xs text-slate-600 leading-snug">
                Al ingresar encontrarás tutoriales interactivos que te acompañarán en tus primeros pasos.
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0 shadow-xs">
              <PlayCircle className="w-7 h-7" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
