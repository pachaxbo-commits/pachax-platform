import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantKitchenTourSteps: RestaurantTourStep[] = [
  { id: 'open-kitchen', module: 'dashboard', target: '[data-tour="restaurant-nav-kitchen"]', advanceWhen: '[data-tour="kitchen-orders"]', title: 'Abre Cocina', description: 'Pulsa Cocina para ver las comandas que necesita preparar el equipo.', placement: 'bottom', interaction: 'navigate' },
  { id: 'orders', module: 'kitchen', target: '[data-tour="kitchen-order-card"]', title: 'Mira las comandas', description: 'Cada tarjeta muestra un pedido pendiente, en preparación o listo.', placement: 'bottom', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="kitchen-orders"]', description: 'No hay comandas activas ahora. Los pedidos pendientes aparecerán en esta lista con su número, productos, cantidades y observaciones.' } },
  { id: 'ticket', module: 'kitchen', target: '[data-tour="kitchen-order-card"]', title: 'Revisa productos y observaciones', description: 'Confirma el n\u00famero, los productos, cantidades y cualquier observaci\u00f3n antes de cocinar.', placement: 'bottom', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="kitchen-orders"]', description: 'Aqu\u00ed aparecer\u00e1n los pedidos enviados a Cocina. Cada comanda mostrar\u00e1 su n\u00famero, productos, cantidades y observaciones.' } },
  { id: 'prepare', module: 'kitchen', target: '[data-tour="kitchen-prepare-control"]', title: 'Inicia la preparaci\u00f3n', description: 'Usa Preparar cuando realmente empieces. El tutorial solo se\u00f1ala el bot\u00f3n; no cambia la comanda.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="kitchen-orders"]', description: 'Cuando recibas una comanda, el bot\u00f3n Preparar aparecer\u00e1 junto a sus productos. \u00dasalo al comenzar; este tutorial no cambia estados.' } },
  { id: 'ready', module: 'kitchen', target: '[data-tour="kitchen-ready-control"]', title: 'Marca el pedido como listo', description: 'Cuando termines, usa Marcar listo. Caja o Servicio podr\u00e1n continuar con la entrega.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="kitchen-orders"]', description: 'Despu\u00e9s de preparar una comanda, aparecer\u00e1 Marcar listo junto al producto. No hay pedidos en preparaci\u00f3n ahora.' } },
  { id: 'delivery', module: 'kitchen', target: '[data-tour="kitchen-status"]', title: 'Sigue el estado hasta la entrega', description: 'Una comanda lista queda identificada para que Servicio o Caja la entregue. Cocina no cobra ni libera mesas.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="kitchen-orders"]', description: 'Aqu\u00ed ver\u00e1s el estado de cada producto. Al marcarlo como listo, Caja o Servicio podr\u00e1 continuar con la entrega; Cocina no cobra.' } },
]

export const restaurantKitchenMobileTourSteps: RestaurantTourStep[] = [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-kitchen"]', title: 'Abre el men\u00fa', description: 'En el celular, abre este men\u00fa para encontrar Cocina.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-kitchen', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-kitchen"]', advanceWhen: '[data-tour="kitchen-orders"]', title: 'Abre Cocina', description: 'Pulsa Cocina para revisar las comandas.', placement: 'bottom', interaction: 'navigate' },
  ...restaurantKitchenTourSteps.slice(1),
]

export function restaurantKitchenTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-kitchen-tour:${tenantId}:${uid}:v1`
}
