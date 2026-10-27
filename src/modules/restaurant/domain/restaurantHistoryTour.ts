import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantHistoryTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-history',
    module: 'dashboard',
    target: '[data-tour="restaurant-nav-history"]',
    advanceWhen: '[data-tour="history-board"]',
    title: 'Abre Historial',
    description: 'Pulsa Historial para auditar comandas anteriores y arqueos de caja.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'history-board',
    module: 'history',
    target: '[data-tour="history-board"]',
    title: 'Registro de operaciones',
    description: 'Revisa comandas atendidas, cobros realizados y eventos de auditoría de cada turno.',
    placement: 'top',
    interaction: 'informative',
  },
  {
    id: 'history-filters',
    module: 'history',
    target: '[data-tour="history-filters"]',
    title: 'Filtros de búsqueda',
    description: 'Filtra comandas por fecha, estado de entrega o medio de pago.',
    placement: 'bottom',
    interaction: 'informative',
    missingTarget: {
      fallbackTarget: '[data-tour="history-board"]',
      description: 'El historial reúne todas las operaciones concluidas para consulta y control operativo.',
    },
  },
]

export const restaurantHistoryMobileTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-menu',
    module: 'dashboard',
    target: '[data-tour="restaurant-menu-toggle"]',
    advanceWhen: '[data-tour="restaurant-mobile-nav-history"]',
    title: 'Abre el menú',
    description: 'En el celular, abre el menú para encontrar Historial.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'open-history',
    module: 'dashboard',
    target: '[data-tour="restaurant-mobile-nav-history"]',
    advanceWhen: '[data-tour="history-board"]',
    title: 'Abre Historial',
    description: 'Pulsa Historial para consultar operaciones pasadas.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  ...restaurantHistoryTourSteps.slice(1),
]

export function restaurantHistoryTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-history-tour:${tenantId}:${uid}:v1`
}
