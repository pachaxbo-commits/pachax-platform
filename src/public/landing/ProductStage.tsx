import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { TEMPLATE_SHOWCASE_DATA, type TemplateShowcaseItem } from './templateShowcaseData'
import { TemplateModeSelectorModal } from './TemplateModeSelectorModal'

export function ProductStage({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState<TemplateShowcaseItem | null>(null)
  return <>
    <div className={`product-stage ${compact ? 'product-stage-compact' : ''}`} aria-label="Explora las tres soluciones PACHAX">
      {TEMPLATE_SHOWCASE_DATA.map((item, index) => {
        const Preview = item.preview
        return <button key={item.id} type="button" className={`product-window product-window-${index + 1}`} onClick={() => setSelected(item)} aria-label={`Explorar ${item.title}`}>
          <span className="product-window-bar"><span>PACHAX <span className="product-window-name">/ {item.title}</span></span><ArrowUpRight size={17} /></span>
          <span className="product-window-screen"><Preview /></span>
        </button>
      })}
    </div>
    <TemplateModeSelectorModal item={selected} onClose={() => setSelected(null)} />
  </>
}
