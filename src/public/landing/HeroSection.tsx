import { useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { TemplateModeSelectorModal } from './TemplateModeSelectorModal'
import { PachaxProductMockup } from './PachaxProductMockup'
import { PachaxTemplateCard } from './PachaxTemplateCard'
import type { CommercialTemplateItem } from '../config/commercialShowcase'
import type { WhatsAppBusinessType } from './whatsappBusinessContact'
import { canLaunchCommercialDemo, freeDemoPath } from '../../core/publicTemplates'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import { buildPublishedShowcaseGroup } from './commercialPresentation'

interface HeroSectionProps {
  onViewPlans?: (templateId: 'hamburger' | 'retail') => void
  onOpenContact?: (initialBusinessType?: WhatsAppBusinessType | null) => void
}

type PresentedTemplate = CommercialTemplateItem & { displayMode: 'specialized' | 'self_service' }

export function HeroSection({ onViewPlans, onOpenContact }: HeroSectionProps) {
  const { navigate } = usePublicRouter()
  const { publishedTemplates, publicCatalogStatus, isPublicEditorialFallback } = useCommercialConfig()
  const trackRef = useRef<HTMLDivElement>(null)
  const [selectedForModal, setSelectedForModal] = useState<CommercialTemplateItem | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const templates = useMemo(() => [
    ...buildPublishedShowcaseGroup(publishedTemplates, 'specialized').map((template) => ({ ...template, displayMode: 'specialized' as const })),
    ...buildPublishedShowcaseGroup(publishedTemplates, 'self_service').map((template) => ({ ...template, displayMode: 'self_service' as const })),
  ], [publishedTemplates])

  const scrollToTemplates = () => document.getElementById('plantillas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const scrollByCard = (direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector<HTMLElement>('[data-pachax-template-card]')
    if (track.scrollWidth <= track.clientWidth + 1) {
      setActiveIndex((current) => (current + direction + templates.length) % templates.length)
      return
    }
    const gap = Number.parseFloat(getComputedStyle(track).columnGap || '0')
    const maximumScroll = track.scrollWidth - track.clientWidth
    if (direction > 0 && track.scrollLeft >= maximumScroll - 2) {
      track.scrollTo({ left: 0, behavior: 'smooth' })
      return
    }
    if (direction < 0 && track.scrollLeft <= 2) {
      track.scrollTo({ left: maximumScroll, behavior: 'smooth' })
      return
    }
    track.scrollBy({ left: direction * ((card?.offsetWidth ?? track.clientWidth * 0.8) + gap), behavior: 'smooth' })
  }

  const handleTrackScroll = () => {
    const track = trackRef.current
    const card = track?.querySelector<HTMLElement>('[data-pachax-template-card]')
    if (!track || !card) return
    const gap = Number.parseFloat(getComputedStyle(track).columnGap || '0')
    setActiveIndex(Math.max(0, Math.min(templates.length - 1, Math.round(track.scrollLeft / (card.offsetWidth + gap)))))
  }

  const handleSelectTemplate = (template: PresentedTemplate) => {
    if (!canLaunchCommercialDemo(template)) {
      if (template.displayMode === 'self_service' && (template.id === 'hamburger' || template.id === 'retail')) {
        onViewPlans?.(template.id)
      } else {
        scrollToTemplates()
      }
      return
    }

    const demoPath = freeDemoPath(template.id) || freeDemoPath(template.templateId || '')
    if (demoPath) {
      window.location.assign(demoPath)
      return
    }
    if (template.id === 'restaurant' || template.templateId === 'restaurant') {
      setSelectedForModal(template)
      return
    }
    if (template.demoRoute.startsWith('/demo/')) {
      window.location.assign(template.demoRoute)
    } else if (template.demoRoute.startsWith('http')) {
      window.open(template.demoRoute, '_blank', 'noopener,noreferrer')
    } else {
      navigate(template.demoRoute)
    }
  }

  return (
    <section id="hero" className="pachax-hero relative z-10 w-full">
      <div className="pachax-hero-main">
        <div className="pachax-hero-copy">
          <div className="pachax-hero-eyebrow"><span>PACHAX PLATFORM</span></div>
          <h1>
            Gestiona tu negocio<br className="pachax-desktop-break" /> de forma <span>inteligente</span>
          </h1>
          <p>Plantillas especializadas, listas para operar y adaptadas a la realidad de tu negocio.</p>
          <div className="pachax-hero-actions">
            <button type="button" className="pachax-hero-primary-btn" onClick={scrollToTemplates}>
              <span>Probar plantillas</span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" className="pachax-hero-contact-btn" onClick={() => onOpenContact?.(null)}>
              <MessageCircle aria-hidden="true" />
              <span>
                <strong>Contactar a PACHAX</strong>
                <small>Consultar planes e implementación</small>
              </span>
            </button>
          </div>
        </div>
        <PachaxProductMockup />
      </div>

      {isPublicEditorialFallback && (
        <p className="pachax-catalog-notice" role="status" data-catalog-state={publicCatalogStatus}>
          {publicCatalogStatus === 'loading'
            ? 'Verificando el catálogo. Las fichas editoriales son de referencia hasta confirmar la publicación.'
            : 'No pudimos verificar el catálogo. Las fichas editoriales son de referencia; la disponibilidad comercial requiere confirmación.'}
        </p>
      )}

      <div className="pachax-carousel-shell">
        <button type="button" className="pachax-carousel-arrow pachax-carousel-prev" onClick={() => scrollByCard(-1)} aria-label="Plantilla anterior" disabled={templates.length < 2}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <div
          ref={trackRef}
          className="pachax-template-track"
          role="region"
          aria-label="Plantillas publicadas"
          tabIndex={0}
          onScroll={handleTrackScroll}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') scrollByCard(-1)
            if (event.key === 'ArrowRight') scrollByCard(1)
          }}
        >
          {templates.map((template, index) => (
            <PachaxTemplateCard
              key={template.id}
              template={template}
              index={index}
              isActive={activeIndex === index}
              onSelect={() => handleSelectTemplate(template)}
            />
          ))}
          {templates.length === 0 && (
            <p className="pachax-empty-catalog" role="status">
              {publicCatalogStatus === 'loading' ? 'Verificando las plantillas publicadas…' : 'No hay plantillas publicadas en el catálogo confirmado.'}
            </p>
          )}
        </div>
        <button type="button" className="pachax-carousel-arrow pachax-carousel-next" onClick={() => scrollByCard(1)} aria-label="Siguiente plantilla" disabled={templates.length < 2}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      {templates.length > 1 && (
        <div className="pachax-carousel-dots" aria-label="Posición del carrusel">
          {templates.map((template, index) => (
            <button
              type="button"
              key={template.id}
              aria-label={`Ir a ${template.commercialName}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => {
                const track = trackRef.current
                const card = track?.querySelectorAll<HTMLElement>('[data-pachax-template-card]')[index]
                card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
              }}
            />
          ))}
        </div>
      )}

      <div className="pachax-recommender">
        <div className="pachax-recommender-copy">
          <h2>¿No estás seguro de cuál elegir?</h2>
          <p>Explora las opciones y revisa cuál se adapta mejor a tu negocio.</p>
        </div>
        <button type="button" className="pachax-outline-button" onClick={scrollToTemplates}>
          <img src="/brand/pachax-isotipo-color.png" alt="" aria-hidden="true" />
          <span>Descubrir mi plantilla</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <TemplateModeSelectorModal item={selectedForModal} onClose={() => setSelectedForModal(null)} />
    </section>
  )
}
