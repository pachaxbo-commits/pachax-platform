import { createElement } from 'react'
import { ArrowRight, Layers3, Martini, Package, Sandwich, Store, Utensils } from 'lucide-react'
import type { CommercialExtraService, CommercialTemplateItem } from '../../admin/types'

export type FeaturedCatalogEntry =
  | {
      kind: 'template'
      id: string
      title: string
      summary: string
      imageUrl: string
      imageAlt: string
      imagePosition?: string
      template: CommercialTemplateItem
    }
  | {
      kind: 'service'
      id: 'custom'
      title: string
      summary: string
      imageUrl: string
      imageAlt: string
      imagePosition?: string
      template?: CommercialTemplateItem
      service?: CommercialExtraService
    }

interface FeaturedTemplateCardProps {
  entry: FeaturedCatalogEntry
  onDetails: (entry: FeaturedCatalogEntry) => void
}

function getEntryIcon(entry: FeaturedCatalogEntry) {
  if (entry.kind === 'service') return Layers3
  switch (entry.template.id) {
    case 'restaurant': return Utensils
    case 'distribution': return Package
    case 'nightclub': return Martini
    case 'hamburger': return Sandwich
    case 'retail': return Store
    default: return Layers3
  }
}

export function FeaturedTemplateCard({ entry, onDetails }: FeaturedTemplateCardProps) {
  const Icon = getEntryIcon(entry)
  const titleId = `featured-template-${entry.id}-title`

  return (
    <article className="pachax-featured-card" aria-labelledby={titleId} data-template-id={entry.id} data-entry-kind={entry.kind}>
      <img
        className="pachax-featured-card-photo"
        src={entry.imageUrl}
        alt={entry.imageAlt}
        style={{ objectPosition: entry.imagePosition || '50% 50%' }}
        loading="lazy"
        decoding="async"
      />
      <div className="pachax-featured-card-photo-shade" aria-hidden="true" />
      <div className="pachax-featured-card-copy">
        {createElement(Icon, { className: 'pachax-featured-card-icon', 'aria-hidden': true, strokeWidth: 1.7 })}
        {entry.kind === 'service' && <span className="pachax-featured-card-kicker">Servicio</span>}
        <h3 id={titleId}>{entry.title}</h3>
        <p>{entry.summary}</p>
        <button
          className="pachax-card-detail-button"
          type="button"
          onClick={() => onDetails(entry)}
          aria-label={`Ver detalles de ${entry.title}`}
        >
          <span>{entry.kind === 'service' ? 'Cotizar a medida' : 'Ver detalles'}</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <span className="pachax-featured-card-corner" aria-hidden="true" />
    </article>
  )
}
