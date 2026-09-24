import { ArrowUpRight } from 'lucide-react'
import type { TemplateShowcaseItem } from './templateShowcaseData'

interface Props { item: TemplateShowcaseItem; onSelect: (item: TemplateShowcaseItem) => void; index?: number }

export function TemplateShowcaseCard({ item, onSelect, index = 0 }: Props) {
  const Preview = item.preview
  return <article className={`showcase-row showcase-row-${index + 1}`}>
    <div className="showcase-row-copy">
      <span className="public-kicker">0{index + 1} / {item.industryBadge}</span>
      <h3>{item.title}</h3>
      <p>{item.tagline}</p>
      <div className="showcase-modules">{item.keyModules.slice(0, 3).map(module => <span key={module}>{module}</span>)}</div>
      <button type="button" onClick={() => onSelect(item)}>Explorar esta solución <ArrowUpRight size={18} /></button>
    </div>
    <button className="showcase-row-product" type="button" onClick={() => onSelect(item)} aria-label={`Explorar ${item.title}`}>
      <span className="showcase-row-windowbar">PACHAX / {item.title} <ArrowUpRight size={16} /></span>
      <span className="showcase-row-preview"><Preview /></span>
    </button>
  </article>
}
