import { useMemo, useState } from 'react'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import type { CommercialExtraService, CommercialTemplateItem } from '../../admin/types'
import { canLaunchCommercialDemo, freeDemoPath } from '../../core/publicTemplates'
import { CUSTOM_DEVELOPMENT_CONFIG } from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'
import { TemplateModeSelectorModal } from './TemplateModeSelectorModal'
import { FeaturedTemplateCard, type FeaturedCatalogEntry } from './FeaturedTemplateCard'
import { FeaturedTemplateDetails } from './FeaturedTemplateDetails'
import type { WhatsAppBusinessType } from './whatsappBusinessContact'

interface FeaturedTemplatesCatalogProps {
  onViewPlans?: (templateId: 'hamburger' | 'retail') => void
  onRequestContact?: (businessType: WhatsAppBusinessType | null) => void
}

function templateEntry(template: CommercialTemplateItem): FeaturedCatalogEntry {
  return {
    kind: 'template',
    id: template.id,
    title: template.commercialName,
    summary: template.cardSubtitle || template.detailDescription,
    imageUrl: template.thumbnailUrl,
    imageAlt: template.thumbnailAlt,
    imagePosition: template.thumbnailFocalPoint || '50% 50%',
    template,
  }
}

function customServiceEntry(
  template: CommercialTemplateItem | undefined,
  service: CommercialExtraService | undefined,
): FeaturedCatalogEntry {
  return {
    kind: 'service',
    id: 'custom',
    title: template?.commercialName || CUSTOM_DEVELOPMENT_CONFIG.title,
    summary: service?.shortDescription || template?.cardSubtitle || CUSTOM_DEVELOPMENT_CONFIG.subtitle,
    imageUrl: template?.thumbnailUrl || '/brand/showcase/custom-concept.webp',
    imageAlt: template?.thumbnailAlt || 'Equipo trabajando en una oficina tecnológica',
    imagePosition: template?.thumbnailFocalPoint || '50% 50%',
    template,
    service,
  }
}

function entryOrder(entry: FeaturedCatalogEntry): number {
  if (entry.kind === 'template') return entry.template.order
  return entry.template?.order ?? entry.service?.order ?? Number.MAX_SAFE_INTEGER
}

export function FeaturedTemplatesCatalog({ onViewPlans, onRequestContact }: FeaturedTemplatesCatalogProps) {
  const { navigate } = usePublicRouter()
  const { publishedTemplates, publishedExtras, publicCatalogStatus, isPublicEditorialFallback } = useCommercialConfig()
  const [selectedEntry, setSelectedEntry] = useState<FeaturedCatalogEntry | null>(null)
  const [selectedForDemo, setSelectedForDemo] = useState<CommercialTemplateItem | null>(null)

  const entries = useMemo(() => {
    const templates = publishedTemplates.filter((template) => template.status === 'published')
    const customTemplate = templates.find((template) => template.id === 'custom')
    const customService = publishedExtras.find((service) => service.id === 'extra_custom_dev' || service.category === 'custom')
    const regularEntries = templates
      .filter((template) => template.id !== 'custom')
      .map(templateEntry)
    const serviceEntry = customTemplate || customService
      ? [customServiceEntry(customTemplate, customService)]
      : []

    return [...regularEntries, ...serviceEntry].sort((a, b) => entryOrder(a) - entryOrder(b))
  }, [publishedTemplates, publishedExtras])

  const handleViewPlans = (templateId: 'hamburger' | 'retail') => {
    setSelectedEntry(null)
    onViewPlans?.(templateId)
  }

  const handleLaunchDemo = (entry: FeaturedCatalogEntry) => {
    if (entry.kind !== 'template' || !canLaunchCommercialDemo(entry.template)) return
    const template = entry.template
    if (template.id === 'restaurant' || template.templateId === 'restaurant') {
      setSelectedForDemo(template)
      return
    }
    const demoPath = freeDemoPath(template.id) || freeDemoPath(template.templateId || '')
    if (demoPath) {
      window.location.assign(demoPath)
      return
    }
    if (!canLaunchCommercialDemo(template)) return
    if (template.demoRoute.startsWith('/demo/')) {
      window.location.assign(template.demoRoute)
    } else if (template.demoRoute.startsWith('http')) {
      window.open(template.demoRoute, '_blank', 'noopener,noreferrer')
    } else {
      navigate(template.demoRoute)
    }
  }

  return (
    <section id="plantillas" className="pachax-catalog-section w-full relative z-10">
      <div className="pachax-catalog-inner">
        <header className="pachax-catalog-header">
          <div className="pachax-catalog-eyebrow"><span aria-hidden="true" />PLANTILLAS PACHAX</div>
          <h2 className="pachax-catalog-title">
            <span className="pachax-catalog-title-line">Soluciones especializadas</span>{' '}
            <span className="pachax-catalog-title-line">para <strong>tu tipo de negocio</strong></span>
          </h2>
          <p className="pachax-catalog-subtitle">
            Elige una plantilla diseñada para tu rubro y comienza a operar con procesos, herramientas y flujos ya preconfigurados.
          </p>
        </header>

        {isPublicEditorialFallback && (
          <p className="pachax-catalog-status" role="status" data-catalog-state={publicCatalogStatus}>
            Catálogo editorial de referencia. La disponibilidad comercial y las ofertas requieren confirmación.
          </p>
        )}
        {!isPublicEditorialFallback && publicCatalogStatus === 'loading' && (
          <p className="pachax-catalog-status" role="status" data-catalog-state="loading">
            Verificando el catálogo publicado…
          </p>
        )}
        {!isPublicEditorialFallback && publicCatalogStatus === 'error' && (
          <p className="pachax-catalog-status" role="status" data-catalog-state="error">
            No pudimos actualizar el catálogo. Se conservan los datos publicados disponibles.
          </p>
        )}

        <div className="pachax-featured-grid" aria-label="Soluciones publicadas">
          {entries.map((entry) => (
            <FeaturedTemplateCard key={`${entry.kind}-${entry.id}`} entry={entry} onDetails={setSelectedEntry} />
          ))}
          {publicCatalogStatus === 'ready' && entries.length === 0 && (
            <p className="pachax-catalog-empty" role="status" data-catalog-state="empty">
              No hay soluciones publicadas en el catálogo confirmado.
            </p>
          )}
        </div>

        <footer className="pachax-catalog-footer">
          <p>Explora cada solución para conocer sus funciones.</p>
        </footer>
      </div>

      <FeaturedTemplateDetails
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onLaunchDemo={(entry) => { setSelectedEntry(null); handleLaunchDemo(entry) }}
        onViewPlans={handleViewPlans}
        onRequestContact={(businessType) => {
          setSelectedEntry(null)
          onRequestContact?.(businessType)
        }}
      />
      <TemplateModeSelectorModal
        key={selectedForDemo?.id || 'closed'}
        item={selectedForDemo}
        onClose={() => setSelectedForDemo(null)}
      />
    </section>
  )
}
