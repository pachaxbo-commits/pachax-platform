import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantKitchenTourSteps: RestaurantTourStep[] = [
  { id: 'open-kitchen', module: 'dashboard', target: '[data-tour="restaurant-nav-kitchen"]', advanceWhen: '[data-tour="kitchen-orders"]', title: 'Abre Cocina', description: 'Pulsa Cocina para ver las comandas que necesita preparar el equipo.', placement: 'bottom', interaction: 'navigate' },
  { id: 'orders', module: 'kitchen', target: '[data-tour="kitchen-orders"]', title: 'Mira las comandas', description: 'Cada tarjeta muestra un pedido pendiente, en preparaci\u00f3n o listo.', placement: 'bottom', interaction: 'informative' },
  { id: 'ticket', module: 'kitchen', target: '[data-tour="kitchen-order-card"]', title: 'Revisa productos y observaciones', description: 'Confirma el n\u00famero, los productos, cantidades y cualquier observaci\u00f3n antes de cocinar.', placement: 'bottom', interaction: 'informative' },
  { id: 'prepare', module: 'kitchen', target: '[data-tour="kitchen-prepare-control"]', title: 'Inicia la preparaci\u00f3n', description: 'Usa Preparar cuando realmente empieces. El tutorial solo se\u00f1ala el bot\u00f3n; no cambia la comanda.', placement: 'top', interaction: 'informative' },
  { id: 'ready', module: 'kitchen', target: '[data-tour="kitchen-ready-control"]', title: 'Marca el pedido como listo', description: 'Cuando termines, usa Marcar listo. Caja o Servicio podr\u00e1n continuar con la entrega.', placement: 'top', interaction: 'informative' },
  { id: 'delivery', module: 'kitchen', target: '[data-tour="kitchen-status"]', title: 'Sigue el estado hasta la entrega', description: 'Una comanda lista queda identificada para que Servicio o Caja la entregue. Cocina no cobra ni libera mesas.', placement: 'top', interaction: 'informative' },
]

export const restaurantKitchenMobileTourSteps: RestaurantTourStep[] = [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-kitchen"]', title: 'Abre el men\u00fa', description: 'En el celular, abre este men\u00fa para encontrar Cocina.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-kitchen', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-kitchen"]', advanceWhen: '[data-tour="kitchen-orders"]', title: 'Abre Cocina', description: 'Pulsa Cocina para revisar las comandas.', placement: 'bottom', interaction: 'navigate' },
  ...restaurantKitchenTourSteps.slice(1),
]

export function restaurantKitchenTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-kitchen-tour:${tenantId}:${uid}:v1`
}
