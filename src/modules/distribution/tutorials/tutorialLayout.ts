export interface TutorialRect {
  top: number
  left: number
  width: number
  height: number
}

export interface TutorialViewport {
  width: number
  height: number
}

export interface TutorialCardPlacement {
  top: number
  left: number
  width: number
  maxHeight: number
  side: 'left' | 'right' | 'above' | 'below'
}

/**
 * Calculates a non-overlapping viewport-bounded card placement for the tutorial modal.
 * Prevents the card from ever obscuring the highlighted target element.
 */
export function calculateTutorialCardPlacement(
  target: TutorialRect,
  viewport: TutorialViewport,
  card: { width: number; height: number },
  avoidBottomNavHeight = 64
): TutorialCardPlacement {
  const edge = Math.min(16, Math.max(8, viewport.width * 0.03))
  const gap = 12
  const maxAvailableHeight = Math.max(120, viewport.height - avoidBottomNavHeight - edge * 2)
  const width = Math.min(card.width, Math.max(260, viewport.width - edge * 2))
  const height = Math.min(card.height, maxAvailableHeight)

  const centerTargetX = target.left + target.width / 2
  const centerTargetY = target.top + target.height / 2

  // In desktop (>= 1024px), prefer side placement if enough horizontal space
  if (viewport.width >= 1024) {
    const leftSpace = target.left - gap - edge
    const rightSpace = viewport.width - (target.left + target.width) - gap - edge

    if (Math.max(leftSpace, rightSpace) >= width) {
      const side: 'left' | 'right' = rightSpace >= width ? 'right' : 'left'
      const left = side === 'right' ? target.left + target.width + gap : target.left - gap - width
      const top = Math.min(
        Math.max(edge, centerTargetY - height / 2),
        Math.max(edge, viewport.height - avoidBottomNavHeight - height - edge)
      )
      return { top, left, width, maxHeight: height, side }
    }
  }

  // Vertical placement (above or below target)
  const spaceAbove = target.top - gap - edge
  const spaceBelow = viewport.height - avoidBottomNavHeight - (target.top + target.height) - gap - edge

  const side: 'above' | 'below' = spaceBelow >= height || spaceBelow >= spaceAbove ? 'below' : 'above'
  const placedTop = side === 'below'
    ? target.top + target.height + gap
    : target.top - gap - height

  const safeTop = Math.max(edge, Math.min(placedTop, viewport.height - avoidBottomNavHeight - height - edge))
  const safeLeft = Math.min(
    Math.max(edge, centerTargetX - width / 2),
    Math.max(edge, viewport.width - width - edge)
  )

  return {
    top: safeTop,
    left: safeLeft,
    width,
    maxHeight: side === 'below' ? Math.max(160, spaceBelow) : Math.max(160, spaceAbove),
    side,
  }
}
