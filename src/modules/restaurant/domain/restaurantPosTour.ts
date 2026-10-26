import type { RestaurantModuleId } from '../views/RestaurantExperience'

export type RestaurantTourPlacement = 'bottom' | 'top'

export type RestaurantTourStep = {
  id: string
  module: RestaurantModuleId
  target: string
  title: string
  description: string
  placement: RestaurantTourPlacement
  interaction: 'informative' | 'navigate'
  advanceWhen?: string
  missingTarget?: {
    fallbackTarget: string
    description: string
  }
}

/**
 * The selectors intentionally point to stable data-tour attributes rather than
 * CSS classes. The same declarative shape can be reused by other experiences.
 */
export const restaurantPosTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-pos',
    module: 'dashboard',
    target: '[data-tour="restaurant-nav-pos"]',
    title: 'Abre el punto de venta',
    description: 'Pulsa POS para registrar un pedido. Hazlo tú: el tutorial continuará cuando la pantalla cambie.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'catalog',
    module: 'pos',
    target: '[data-tour="pos-catalog"]',
    title: 'Elige productos',
    description: 'Busca o toca un producto del catálogo para añadirlo al pedido. Este paso solo explica la pantalla; no crea una venta.',
    placement: 'bottom',
    interaction: 'informative',
  },
  {
    id: 'cart',
    module: 'pos',
    target: '[data-tour="pos-cart"]',
    title: 'Revisa el pedido',
    description: 'Aquí aparecen los productos elegidos, sus cantidades y el total antes de confirmar.',
    placement: 'top',
    interaction: 'informative',
  },
  {
    id: 'fulfillment',
    module: 'pos',
    target: '[data-tour="pos-fulfillment"]',
    title: 'Indica cómo se entrega',
    description: 'Selecciona Mesa, Para llevar o Delivery según el pedido real. El tutorial no modifica esta selección.',
    placement: 'top',
    interaction: 'informative',
  },
  {
    id: 'confirm',
    module: 'pos',
    target: '[data-tour="pos-submit"]',
    title: 'Confirma con cuidado',
    description: 'Este botón registra o cobra según el estado elegido. Durante el tutorial no lo pulses: practica en Studio si quieres hacer una venta de prueba.',
    placement: 'top',
    interaction: 'informative',
  },
]

export const restaurantPosMobileTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-menu',
    module: 'dashboard',
    target: '[data-tour="restaurant-menu-toggle"]',
    advanceWhen: '[data-tour="restaurant-mobile-nav-pos"]',
    title: 'Abre el menú',
    description: 'En el celular, las secciones están dentro de este menú. Ábrelo para encontrar POS.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'open-pos',
    module: 'dashboard',
    target: '[data-tour="restaurant-mobile-nav-pos"]',
    advanceWhen: '[data-tour="pos-catalog"]',
    title: 'Abre el punto de venta',
    description: 'Pulsa POS para registrar un pedido. Hazlo tú: el tutorial continuará cuando la pantalla cambie.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  ...restaurantPosTourSteps.slice(1),
]

export function restaurantPosTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-pos-tour:${tenantId}:${uid}:v1`
}
