export interface TutorialRect { top: number; left: number; width: number; height: number }
export interface TutorialViewport { width: number; height: number }
export interface TutorialCardPlacement { top: number; left: number; width: number; maxHeight: number; side: 'left' | 'right' | 'above' | 'below' }

export function calculateTutorialCardPlacement(target: TutorialRect, viewport: TutorialViewport, card: { width: number; height: number }, avoid?: TutorialRect): TutorialCardPlacement {
  const edge = Math.min(16, Math.max(8, viewport.width * 0.025))
  const gap = Math.min(20, Math.max(12, viewport.width * 0.02))
  const width = Math.min(card.width, Math.max(1, viewport.width - edge * 2))
  const height = Math.min(card.height, Math.max(1, viewport.height - edge * 2))
  if (avoid) {
    const leftSpace = avoid.left - gap - edge
    const rightSpace = viewport.width - (avoid.left + avoid.width) - gap - edge
    if (Math.max(leftSpace, rightSpace) >= Math.min(220, width)) {
      const side: 'left' | 'right' = rightSpace >= leftSpace ? 'right' : 'left'
      const available = side === 'left' ? leftSpace : rightSpace
      const safeWidth = Math.min(width, available)
      const panelHeight = Math.min(height, Math.max(1, avoid.height))
      const top = Math.min(Math.max(edge, target.top + target.height / 2 - panelHeight / 2), Math.max(edge, viewport.height - panelHeight - edge))
      return { left: side === 'left' ? avoid.left - gap - safeWidth : avoid.left + avoid.width + gap, top, width: safeWidth, maxHeight: panelHeight, side }
    }
    // A tall modal can occupy almost the entire viewport on a phone. The caller
    // reserves a small top slot in that modal before showing this compact card.
    return { left: edge, top: edge, width, maxHeight: Math.min(180, height), side: 'above' }
  }
  const right = target.left + target.width
  const center = target.left + target.width / 2
  const verticalTop = Math.min(Math.max(edge, target.top + target.height / 2 - height / 2), Math.max(edge, viewport.height - height - edge))
  const leftSpace = target.left - gap - edge
  const rightSpace = viewport.width - right - gap - edge

  if (viewport.width >= 700) {
    const preferred: 'left' | 'right' = center < viewport.width / 3 ? 'right' : center > viewport.width * 2 / 3 ? 'left' : leftSpace >= rightSpace ? 'left' : 'right'
    const available = preferred === 'left' ? leftSpace : rightSpace
    const alternate = preferred === 'left' ? rightSpace : leftSpace
    if (available >= Math.min(220, width)) { const safeWidth = Math.min(width, available); return { left: preferred === 'left' ? target.left - gap - safeWidth : right + gap, top: verticalTop, width: safeWidth, maxHeight: height, side: preferred } }
    if (alternate >= Math.min(220, width)) { const safeWidth = Math.min(width, alternate); return { left: preferred === 'left' ? right + gap : target.left - gap - safeWidth, top: verticalTop, width: safeWidth, maxHeight: height, side: preferred === 'left' ? 'right' : 'left' } }
  }

  const above = target.top - gap - edge
  const below = viewport.height - target.top - target.height - gap - edge
  const side: 'above' | 'below' = above >= below ? 'above' : 'below'
  const availableHeight = Math.max(1, side === 'above' ? above : below)
  const placedHeight = Math.min(height, availableHeight)
  const placedTop = side === 'above' ? target.top - gap - placedHeight : target.top + target.height + gap
  return { left: Math.min(Math.max(edge, center - width / 2), Math.max(edge, viewport.width - width - edge)), top: Math.max(edge, Math.min(placedTop, viewport.height - placedHeight - edge)), width, maxHeight: placedHeight, side }
}
