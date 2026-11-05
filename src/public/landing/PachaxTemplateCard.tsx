import { ArrowRight, ShoppingBag, Truck, Utensils, Wine, Store } from 'lucide-react'
import type { CommercialTemplateItem } from '../config/commercialShowcase'

interface PachaxTemplateCardProps {
  template: CommercialTemplateItem & { displayMode: 'specialized' | 'self_service' }
  index: number
  isActive: boolean
  onSelect: () => void
}

function TemplateIcon({ type }: { type: CommercialTemplateItem['iconType'] }) {
  const className = 'h-5 w-5'
  if (type === 'utensils') return <Utensils className={className} aria-hidden="true" />
  if (type === 'truck') return <Truck className={className} aria-hidden="true" />
  if (type === 'glass') return <Wine className={className} aria-hidden="true" />
  if (type === 'shopping-bag') return <ShoppingBag className={className} aria-hidden="true" />
  return <Store className={className} aria-hidden="true" />
}

export function PachaxTemplateCard({ template, index, isActive, onSelect }: PachaxTemplateCardProps) {
  const isSelfService = template.displayMode === 'self_service'
  const imageSrc = template.id === 'hamburger' ? '/images/fastfood/burger-combo.webp' : template.thumbnailUrl

  return (
    <button
      type="button"
      className={`pachax-template-card${isSelfService ? ' pachax-template-card-light' : ''}${isActive ? ' is-active' : ''}`}
      data-pachax-template-card=""
      data-template-id={template.id}
      data-template-index={index}
      aria-current={isActive ? 'true' : undefined}
      onClick={onSelect}
      aria-label={`Explorar ${template.commercialName}`}
    >
      <img className="pachax-template-photo" src={imageSrc} alt={template.thumbnailAlt} loading="lazy" decoding="async" />
      <span className="pachax-template-shade" aria-hidden="true" />
      <span className="pachax-template-icon"><TemplateIcon type={template.iconType} /></span>
      <span className="pachax-template-content">
        {isSelfService && <span className="pachax-template-mode">Autoservicio</span>}
        <span className="pachax-template-name">{template.commercialName}</span>
        <span className="pachax-template-description">{template.cardSubtitle}</span>
      </span>
      <span className="pachax-template-corner" aria-hidden="true"><ArrowRight /></span>
    </button>
  )
}
