import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Cog, ExternalLink, MessageSquare, Play, X, Zap } from 'lucide-react'
import {
  SPECIALIZED_IMPLEMENTATION_MODELS,
  QUICK_SERVICE_CATALOG,
  type SpecializedModelInfo,
  type TemplateTierPlan,
  CUSTOM_DEVELOPMENT_CONFIG,
} from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import { getWhatsAppUrl, hasWhatsAppContact } from '../config/publicContact'
import { freeDemoPath, canLaunchCommercialDemo } from '../../core/publicTemplates'
import { getQuickServiceEditorialData, getQuickServicePricingState } from './quickServicePresentation'

interface TemplatePricingSectionProps {
  initialQuickServiceId?: 'hamburger' | 'retail'
  openInitialDetails?: boolean
}

type PricingMode = 'assisted' | 'direct'
type QuickServiceId = 'hamburger' | 'retail'
type SpecializedId = 'distribution' | 'restaurant' | 'nightclub'

const currencySymbol = (currency: string) => currency === 'BOB' ? 'Bs ' : '$'

export function TemplatePricingSection({ initialQuickServiceId = 'hamburger', openInitialDetails = false }: TemplatePricingSectionProps) {
  const { navigate } = usePublicRouter()
  const { publishedPlansByTemplate, publishedTemplates, publicCatalogStatus, isPublicEditorialFallback, landingContent } = useCommercialConfig()
  const [openMode, setOpenMode] = useState<PricingMode | null>(openInitialDetails ? 'direct' : null)
  const [selectedSpecializedId, setSelectedSpecializedId] = useState<SpecializedId>('distribution')
  const [selectedQuickServiceId, setSelectedQuickServiceId] = useState<QuickServiceId>(initialQuickServiceId)
  const [selectedTierLevel, setSelectedTierLevel] = useState<number>(2)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const hasOfficialContact = hasWhatsAppContact(landingContent.officialWhatsAppNumber)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const specializedModels = publishedTemplates
    .filter((template) => ['distribution', 'restaurant', 'nightclub'].includes(template.id))
    .sort((a, b) => a.order - b.order)
    .flatMap((template) => {
      const base = SPECIALIZED_IMPLEMENTATION_MODELS.find((model) => model.id === template.id)
      if (!base) return []
      return [{
        ...base,
        title: template.commercialName,
        subtitle: template.detailDescription || template.cardSubtitle,
        diagnostic: {
          ...base.diagnostic,
          title: template.diagnosticTitle || base.diagnostic.title,
          detail: template.diagnosticDescription || base.diagnostic.detail,
        },
        implementation: {
          ...base.implementation,
          title: template.implementationTitle || base.implementation.title,
          detail: template.implementationDescription || base.implementation.detail,
        },
        demoRoute: template.demoRoute,
      }]
    })
  const publishedQuickTemplates = publishedTemplates
    .filter((template) => template.id === 'hamburger' || template.id === 'retail')
    .sort((a, b) => a.order - b.order)

  const activeSpecializedId = specializedModels.some((model) => model.id === selectedSpecializedId)
    ? selectedSpecializedId
    : (specializedModels[0]?.id || selectedSpecializedId)
  const activeSpecializedTemplate = publishedTemplates.find((template) => template.id === activeSpecializedId)
  const activeSpecialized: SpecializedModelInfo = specializedModels.find((model) => model.id === activeSpecializedId)
    || specializedModels[0] || SPECIALIZED_IMPLEMENTATION_MODELS[0]
  const activeSpecializedPlans = activeSpecializedTemplate ? publishedPlansByTemplate(activeSpecializedId) : []
  const activeSpecializedPlan = activeSpecializedPlans[0]

  const activeQuickServiceId = publishedQuickTemplates.some((template) => template.id === selectedQuickServiceId)
    ? selectedQuickServiceId
    : (publishedQuickTemplates[0]?.id as QuickServiceId | undefined) || selectedQuickServiceId
  const activeQuickTemplate = publishedQuickTemplates.find((template) => template.id === activeQuickServiceId)
  const activeQuickCatalogBase = QUICK_SERVICE_CATALOG.find((item) => item.id === activeQuickServiceId) || QUICK_SERVICE_CATALOG[0]
  const activeQuickLabel = activeQuickTemplate?.commercialName || activeQuickCatalogBase.label
  const activeQuickEditorial = activeQuickTemplate ? getQuickServiceEditorialData(activeQuickServiceId) : null
  const activeQuickPlans = activeQuickTemplate ? publishedPlansByTemplate(activeQuickServiceId) : []
  const quickPricingState = getQuickServicePricingState(publicCatalogStatus, Boolean(activeQuickTemplate), activeQuickPlans.length > 0)
  const activePlan: TemplateTierPlan | undefined = activeQuickPlans.find((plan) => plan.tierLevel === selectedTierLevel)
    || activeQuickPlans.find((plan) => plan.tierLevel === 2)
    || activeQuickPlans[0]
  const activePlanHasAnnualPrice = Boolean(activePlan && activePlan.annualPriceUnit === 'annual_total_12_months' && Number.isFinite(activePlan.annualPriceUSD) && activePlan.annualPriceUSD > 0)
  const hasAnnualPrice = activeQuickPlans.some((plan) => plan.annualPriceUnit === 'annual_total_12_months' && Number.isFinite(plan.annualPriceUSD) && plan.annualPriceUSD > 0)
  const calculatedPrice = activePlan
    ? (billingCycle === 'annual' && activePlanHasAnnualPrice ? activePlan.annualPriceUSD : activePlan.monthlyPriceUSD)
    : null
  const activeQuickDemoPath = activeQuickTemplate
    && (activeQuickTemplate.demoEnabledConfigured !== true || activeQuickTemplate.demoEnabled === true)
    ? freeDemoPath(activeQuickServiceId)
    : null
  const activeSpecializedDemoEnabled = Boolean(activeSpecializedTemplate && canLaunchCommercialDemo(activeSpecializedTemplate))

  useEffect(() => {
    if (!openMode) return
    const dialog = dialogRef.current
    const focusable = () => dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    focusable()?.[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMode(null)
      } else if (event.key === 'Tab') {
        const items = Array.from(focusable() || [])
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('pachax-dialog-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('pachax-dialog-open')
      returnFocusRef.current?.focus()
    }
  }, [openMode])

  const openDetails = (mode: PricingMode, trigger: HTMLElement) => {
    returnFocusRef.current = trigger
    setOpenMode(mode)
  }

  const contactWhatsApp = (message: string) => {
    const url = getWhatsAppUrl(message, landingContent.officialWhatsAppNumber)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSpecializedInquiry = () => contactWhatsApp(`Hola, quiero solicitar una implementación de ${activeSpecialized.title} en PACHAX.`)
  const handleQuickInquiry = (plan?: TemplateTierPlan) => {
    const description = plan ? ` sobre el plan ${plan.name}` : ' sobre los planes disponibles'
    contactWhatsApp(`Hola PACHAX, quiero consultar${description} para ${activeQuickLabel}.`)
  }
  const handleCustomDevWhatsApp = () => contactWhatsApp(landingContent.defaultCustomDevMessage || CUSTOM_DEVELOPMENT_CONFIG.whatsAppMessage)

  const renderStatus = () => {
    if (publicCatalogStatus === 'loading') return 'Verificando la publicación del catálogo.'
    if (publicCatalogStatus === 'error') return 'No se pudo verificar el catálogo. Los precios no están disponibles.'
    if (isPublicEditorialFallback) return 'Contenido de referencia; las ofertas comerciales aún no están confirmadas.'
    return null
  }

  return (
    <section id="planes" className="pachax-pricing-section" data-selected-quick-service={activeQuickServiceId} aria-labelledby="pachax-pricing-title">
      <div className="pachax-pricing-inner">
        <header className="pachax-pricing-header">
          <span className="pachax-pricing-accent" aria-hidden="true" />
          <h2 id="pachax-pricing-title">Planes adaptados a la escala real de <span>tu empresa</span></h2>
          <p>Elige la forma de activación que mejor se ajuste a tu operación, recursos y tiempo de implementación.</p>
        </header>

        {renderStatus() && <p className="pachax-pricing-catalog-note" role="status" data-catalog-state={publicCatalogStatus}>
          {renderStatus()}
        </p>}

        <div className="pachax-pricing-modes">
          <article className="pachax-mode-card pachax-mode-card-assisted" data-pricing-mode="assisted">
            <img className="pachax-mode-photo" src="/brand/showcase/distribution-concept.webp" alt="Centro de distribución con estanterías logísticas" />
            <div className="pachax-mode-photo-shade" aria-hidden="true" />
            <div className="pachax-mode-copy">
              <Cog className="pachax-mode-icon" aria-hidden="true" />
              <h3>Implementación Asistida</h3>
              <p>Para operaciones complejas, procesos a medida o flujos logísticos avanzados.</p>
              <ul>
                <li><Check aria-hidden="true" />Análisis y configuración según tu operación.</li>
                <li><Check aria-hidden="true" />Acompañamiento técnico especializado.</li>
                <li><Check aria-hidden="true" />Puesta en marcha y validación del sistema.</li>
              </ul>
              <button type="button" className="pachax-pricing-action" onClick={(event) => openDetails('assisted', event.currentTarget)}>
                Consultar modalidad <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <span className="pachax-mode-corner" aria-hidden="true" />
          </article>

          <article className="pachax-mode-card pachax-mode-card-direct" data-pricing-mode="direct">
            <img className="pachax-mode-photo" src="/brand/showcase/hamburger-counter.webp" alt="Equipo atendiendo un mostrador de restaurante rápido" />
            <div className="pachax-mode-photo-shade" aria-hidden="true" />
            <div className="pachax-mode-copy">
              <Zap className="pachax-mode-icon" aria-hidden="true" />
              <h3>Activación Directa</h3>
              <p>Soluciones estandarizadas con configuración ágil, según los planes publicados.</p>
              <ul>
                <li><Check aria-hidden="true" />Configuración más ágil.</li>
                <li><Check aria-hidden="true" />Planes y características según oferta publicada.</li>
                <li><Check aria-hidden="true" />Ideal para restaurantes rápidos y comercios.</li>
              </ul>
              <button type="button" className="pachax-pricing-action" onClick={(event) => openDetails('direct', event.currentTarget)}>
                Consultar modalidad <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <span className="pachax-mode-corner" aria-hidden="true" />
          </article>
        </div>
      </div>

      {openMode && <div className="pachax-pricing-dialog-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpenMode(null)
      }}>
        <div className="pachax-pricing-dialog" role="dialog" aria-modal="true" aria-labelledby="pachax-pricing-dialog-title" ref={dialogRef}>
          <div className="pachax-pricing-dialog-heading">
            <div>
              <span className="pachax-pricing-dialog-eyebrow">Modalidad de implementación</span>
              <h3 id="pachax-pricing-dialog-title">{openMode === 'assisted' ? 'Implementación Asistida' : 'Activación Directa'}</h3>
            </div>
            <button className="pachax-pricing-dialog-close" type="button" onClick={() => setOpenMode(null)} aria-label="Cerrar detalles"><X /></button>
          </div>

          {openMode === 'assisted' ? <div className="pachax-pricing-detail">
            <p className="pachax-pricing-detail-intro">Selecciona una solución publicada para revisar el alcance disponible, sus condiciones comerciales confirmadas y las opciones de acompañamiento.</p>
            {specializedModels.length > 0 ? <>
              <div className="pachax-pricing-template-picker" aria-label="Soluciones de implementación">
                {specializedModels.map((model) => <button
                  key={model.id}
                  type="button"
                  aria-pressed={activeSpecializedId === model.id}
                  onClick={() => setSelectedSpecializedId(model.id)}
                >{model.title}</button>)}
              </div>
              {activeSpecializedTemplate && <div className="pachax-pricing-commercial-detail" data-specialized-template={activeSpecializedId}>
                <p className="pachax-pricing-detail-summary">{activeSpecialized.subtitle}</p>
                <div className="pachax-pricing-steps">
                  <div><span>01</span><section><h4>{activeSpecialized.diagnostic.title}</h4><p>{activeSpecialized.diagnostic.detail}</p></section></div>
                  <div><span>02</span><section><h4>{activeSpecialized.implementation.title}</h4><p>{activeSpecialized.implementation.detail}</p></section></div>
                  <div><span>03</span><section><h4>Mantenimiento y soporte</h4><p>{activeSpecializedPlan?.clientProfile || 'El alcance y la mensualidad se confirman según la oferta publicada para esta solución.'}</p></section></div>
                </div>
                {activeSpecializedTemplate.implementationBasePriceUSD != null && publicCatalogStatus === 'ready' && <p className="pachax-pricing-confirmed-cost">Costo de implementación publicado: $ {activeSpecializedTemplate.implementationBasePriceUSD} USD, pago único.</p>}
                <div className="pachax-pricing-capabilities">
                  <h4>Capacidades incluidas en la oferta</h4>
                  {activeSpecializedPlan ? <ul>{activeSpecializedPlans.flatMap((plan) => plan.includedFeatures).filter((feature, index, all) => all.indexOf(feature) === index).map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}</ul> : <p>{publicCatalogStatus === 'ready' ? 'No hay una oferta aprobada para mostrar. Las condiciones se revisan durante la consulta.' : 'Las capacidades comerciales se mostrarán cuando se verifique la publicación.'}</p>}
                </div>
                {activeSpecializedPlans.length > 0 && <div className="pachax-pricing-offers"><h4>Ofertas publicadas</h4>{activeSpecializedPlans.map((plan) => <div key={plan.id} className="pachax-pricing-offer-row"><span><strong>{plan.name}</strong><small>{plan.clientProfile}</small></span><span>{currencySymbol(plan.currency)}{plan.monthlyPriceUSD} <small>{plan.currency} / mes</small></span></div>)}</div>}
                {renderStatus() && <p className="pachax-pricing-detail-status" role="status">{renderStatus()}</p>}
                <div className="pachax-pricing-detail-actions">
                  <button type="button" className="pachax-pricing-action" disabled={!hasOfficialContact} title={!hasOfficialContact ? 'El contacto comercial no está configurado.' : undefined} onClick={handleSpecializedInquiry}>Consultar implementación <MessageSquare aria-hidden="true" /></button>
                  {activeSpecializedDemoEnabled && <button type="button" className="pachax-pricing-action pachax-pricing-action-secondary" onClick={() => window.location.assign(activeSpecialized.demoRoute)}><Play aria-hidden="true" /> Ver demostración</button>}
                </div>
              </div>}
            </> : <div className="pachax-pricing-empty" role="status">{publicCatalogStatus === 'loading' ? 'Verificando soluciones publicadas…' : publicCatalogStatus === 'error' ? 'No se pudieron verificar las soluciones.' : 'No hay soluciones de implementación publicadas en este momento.'}</div>}
            {publishedTemplates.some((template) => template.id === 'custom') && <div className="pachax-pricing-custom-quote"><span><strong>{CUSTOM_DEVELOPMENT_CONFIG.title}</strong>{CUSTOM_DEVELOPMENT_CONFIG.description}</span><button type="button" className="pachax-pricing-action pachax-pricing-action-secondary" disabled={!hasOfficialContact} title={!hasOfficialContact ? 'El contacto comercial no está configurado.' : undefined} onClick={handleCustomDevWhatsApp}>Cotizar a medida <ArrowRight aria-hidden="true" /></button></div>}
          </div> : <div className="pachax-pricing-detail">
            <p className="pachax-pricing-detail-intro">Consulta las soluciones estandarizadas y las ofertas confirmadas para tu negocio. La consulta no crea una cuenta, activa una empresa ni inicia un cobro.</p>
            {publishedQuickTemplates.length > 0 ? <>
              <div className="pachax-pricing-template-picker" aria-label="Seleccionar plantilla">
                {publishedQuickTemplates.map((template) => <button
                  key={template.id}
                  type="button"
                  data-plan-template={template.id}
                  aria-pressed={activeQuickServiceId === template.id}
                  onClick={() => {
                    setSelectedQuickServiceId(template.id as QuickServiceId)
                    setSelectedTierLevel(2)
                    setBillingCycle('monthly')
                  }}
                >{template.commercialName}</button>)}
              </div>
              <div className="pachax-pricing-commercial-detail" data-commercial-state={quickPricingState}>
                <p className="pachax-pricing-detail-summary">{activeQuickTemplate?.detailDescription || activeQuickEditorial?.description}</p>
                  {hasAnnualPrice && <div className="pachax-pricing-cycle" data-plan-cycle-control="true" aria-label="Ciclo de facturación">
                  <button type="button" aria-pressed={billingCycle === 'monthly'} onClick={() => setBillingCycle('monthly')}>Mensual</button>
                    <button type="button" aria-pressed={billingCycle === 'annual'} disabled={!activePlanHasAnnualPrice} onClick={() => activePlanHasAnnualPrice && setBillingCycle('annual')}>Anual</button>
                </div>}
                {activeQuickPlans.length > 0 ? <>
                  <div className="pachax-pricing-tier-picker" aria-label="Niveles de planes">
                    {activeQuickPlans.map((plan) => <button key={plan.id} type="button" data-plan-tier={plan.tierLevel} aria-pressed={activePlan?.id === plan.id} onClick={() => {
                      setSelectedTierLevel(plan.tierLevel || 1)
                      if (!(plan.annualPriceUnit === 'annual_total_12_months' && Number.isFinite(plan.annualPriceUSD) && plan.annualPriceUSD > 0)) setBillingCycle('monthly')
                    }}>
                      <span>Nivel {plan.tierLevel}</span><strong>{plan.name}</strong>
                    </button>)}
                  </div>
                  {activePlan && <div className="pachax-pricing-published-plan">
                    <div className="pachax-pricing-plan-heading"><span><strong>{activePlan.name}</strong><small>{activePlan.clientProfile}</small></span>{activePlan.limitsLabel && <span className="pachax-pricing-limits">{activePlan.limitsLabel}</span>}</div>
                    <p className="pachax-pricing-price">{activePlan.planKind === 'free'
                      ? <strong>Gratis</strong>
                      : <><strong>{currencySymbol(activePlan.currency)}{calculatedPrice}</strong><span>{activePlan.currency} / {billingCycle === 'annual' && activePlanHasAnnualPrice ? 'año' : 'mes'}</span></>}
                    </p>
                    {activePlan.adsRequired && <p className="pachax-pricing-price-note">Este plan incluye publicidad.</p>}
                    {billingCycle === 'annual' && activePlanHasAnnualPrice && <p className="pachax-pricing-price-note">Total por 12 meses. Equivalente informativo: {currencySymbol(activePlan.currency)}{(activePlan.annualPriceUSD / 12).toFixed(2)} {activePlan.currency}/mes.</p>}
                    <ul>{activePlan.includedFeatures.map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}</ul>
                    <p className="pachax-pricing-price-note">Precio publicado. La consulta no activa contratación ni cobro.</p>
                  </div>}
                </> : activeQuickTemplate && activeQuickEditorial ? <div className="pachax-pricing-editorial" data-quick-editorial-card={activeQuickServiceId}>
                  <h4>{quickPricingState === 'editorial' ? 'Planes en preparación' : quickPricingState === 'loading' ? 'Verificando ofertas' : quickPricingState === 'unverified' ? 'Ofertas por verificar' : 'No hay ofertas aprobadas'}</h4>
                  <p>{quickPricingState === 'editorial' ? 'Aún no hay planes publicados para esta solución. Consulta disponibilidad con el equipo PACHAX.' : quickPricingState === 'loading' ? 'Esperamos la respuesta del catálogo antes de mostrar precios.' : 'No mostramos precios porque no existe una oferta confirmada en el catálogo.'}</p>
                  {isPublicEditorialFallback && <small>Contenido editorial de referencia; no representa una oferta de contratación.</small>}
                </div> : <div className="pachax-pricing-empty" role="status">{publicCatalogStatus === 'loading' ? 'Verificando ofertas…' : publicCatalogStatus === 'error' ? 'No se pudieron verificar las ofertas.' : 'No hay una solución publicada para consultar.'}</div>}
                {activeQuickEditorial && <div className="pachax-pricing-capabilities"><h4>Capacidades de {activeQuickLabel}</h4><ul>{activeQuickEditorial.capabilities.map((capability) => <li key={capability}><Check aria-hidden="true" />{capability}</li>)}</ul></div>}
                {renderStatus() && <p className="pachax-pricing-detail-status" role="status">{renderStatus()}</p>}
                <div className="pachax-pricing-detail-actions">
                  {activeQuickDemoPath && <button type="button" data-quick-demo={activeQuickServiceId} className="pachax-pricing-action pachax-pricing-action-secondary" onClick={() => navigate(activeQuickDemoPath)}><Play aria-hidden="true" /> Probar demo <ExternalLink aria-hidden="true" /></button>}
                  <button type="button" data-quick-plans-inquiry={activeQuickServiceId} className="pachax-pricing-action" disabled={!hasOfficialContact} title={!hasOfficialContact ? 'El contacto comercial no está configurado.' : undefined} onClick={() => handleQuickInquiry(activePlan)}>Consultar planes <MessageSquare aria-hidden="true" /></button>
                </div>
              </div>
            </> : <div className="pachax-pricing-empty" role="status">{publicCatalogStatus === 'loading' ? 'Verificando soluciones publicadas…' : publicCatalogStatus === 'error' ? 'No se pudieron verificar las soluciones.' : 'No hay soluciones de activación directa publicadas en este momento.'}</div>}
          </div>}
        </div>
      </div>}
    </section>
  )
}
