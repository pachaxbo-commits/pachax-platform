import { useEffect, useRef } from 'react'
import { ArrowRight, Check, ExternalLink, X } from 'lucide-react'
import { CUSTOM_DEVELOPMENT_CONFIG } from '../config/pricingConfig'
import { canLaunchCommercialDemo } from '../../core/publicTemplates'
import { getTemplateContactUrl, getTemplateSecondaryAction } from './templateActionPolicy'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import type { FeaturedCatalogEntry } from './FeaturedTemplateCard'

interface FeaturedTemplateDetailsProps {
  entry: FeaturedCatalogEntry | null
  onClose: () => void
  onLaunchDemo: (entry: FeaturedCatalogEntry) => void
  onViewPlans: (templateId: 'hamburger' | 'retail') => void
}

export function FeaturedTemplateDetails({ entry, onClose, onLaunchDemo, onViewPlans }: FeaturedTemplateDetailsProps) {
  const { landingContent } = useCommercialConfig()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!entry) return
    previousFocusRef.current = document.activeElement as HTMLElement
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => previousFocusRef.current?.focus()
  }, [entry])

  useEffect(() => {
    if (!entry) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [entry, onClose])

  if (!entry) return null

  const isService = entry.kind === 'service'
  const template = isService ? undefined : entry.template
  const action = getTemplateSecondaryAction(isService ? 'custom' : entry.template.id)
  const detailLabel = action.kind === 'quote' ? 'Cotizar a medida'
    : action.kind === 'contact' ? 'Solicitar implementación' : 'Ver planes'
  const serviceHighlights = isService ? CUSTOM_DEVELOPMENT_CONFIG.highlights : []
  const mainFeatures = isService ? serviceHighlights : (template?.features || [])
  const canDemo = Boolean(template && template.id !== 'custom' && canLaunchCommercialDemo(template))
  const availability = template?.commercialAvailability === 'available'
    ? 'Disponibilidad comercial habilitada'
    : 'Disponibilidad comercial por confirmar'
  const implementationMode = template?.commercialMode === 'self_service'
    ? 'Activación rápida'
    : 'Implementación especializada'
  const contactUrl = getTemplateContactUrl(entry.title, action, landingContent.officialWhatsAppNumber)

  const handlePrimaryAction = () => {
    if (action.kind === 'quote' || action.kind === 'contact') {
      if (contactUrl) window.open(contactUrl, '_blank', 'noopener,noreferrer')
      return
    }
    onClose()
    onViewPlans(action.templateId)
  }

  return (
    <div
      className="pachax-details-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pachax-template-details-title"
        className="pachax-details-dialog"
      >
        <div className="pachax-details-photo-wrap">
          <img src={entry.imageUrl} alt={entry.imageAlt} className="pachax-details-photo" />
          <span className="pachax-details-photo-shade" aria-hidden="true" />
          <span className="pachax-details-type">{isService ? 'Servicio de desarrollo' : implementationMode}</span>
          <button className="pachax-details-close" type="button" onClick={onClose} aria-label="Cerrar detalles">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="pachax-details-content">
          <div className="pachax-details-heading">
            <div>
              <h2 id="pachax-template-details-title">{entry.title}</h2>
              <p>{entry.summary}</p>
            </div>
            {!isService && <span className="pachax-details-availability">{availability}</span>}
          </div>

          {entry.kind === 'service' ? (
            <div className="pachax-details-service-copy">
              <h3>Una solución diseñada alrededor de tu operación</h3>
              <p>{entry.service?.shortDescription || CUSTOM_DEVELOPMENT_CONFIG.description}</p>
            </div>
          ) : (
            <div className="pachax-details-context">
              <div>
                <h3>Para quién está pensada</h3>
                <p>{entry.template.targetAudience}</p>
              </div>
              <div>
                <h3>Qué ayuda a resolver</h3>
                <p>{entry.template.problemSolved}</p>
              </div>
            </div>
          )}

          {!isService && template && template.bullets.length > 0 && (
            <div className="pachax-details-capabilities">
              <h3>Capacidades operativas</h3>
              <ul>
                {template.bullets.map((bullet) => <li key={bullet}><Check aria-hidden="true" />{bullet}</li>)}
              </ul>
            </div>
          )}
          {mainFeatures.length > 0 && (
            <div className="pachax-details-capabilities">
              <h3>{isService ? 'Alcance del servicio' : 'Funciones principales'}</h3>
              <ul>
                {mainFeatures.map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}
              </ul>
            </div>
          )}

          <div className="pachax-details-actions">
            {template && template.id !== 'custom' && (
              canDemo ? (
                <button className="pachax-details-secondary" type="button" onClick={() => onLaunchDemo(entry)}>
                  Probar demo <ExternalLink aria-hidden="true" />
                </button>
              ) : (
                <p className="pachax-details-demo-state" role="status">Demo pública no disponible por ahora.</p>
              )
            )}
            {action.kind === 'view-plans' || contactUrl ? (
              <button className="pachax-details-primary" type="button" onClick={handlePrimaryAction}>
                {detailLabel} <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <p className="pachax-details-demo-state" role="status">El contacto comercial aún no está configurado.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
