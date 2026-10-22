import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantTablesTourSteps: RestaurantTourStep[] = [
  { id: 'open-tables', module: 'dashboard', target: '[data-tour="restaurant-nav-tables"]', advanceWhen: '[data-tour="tables-sectors"]', title: 'Abre las mesas', description: 'Pulsa Mesas para ver el salón y las cuentas abiertas. Hazlo tú: el recorrido continuará al abrir la pantalla.', placement: 'bottom', interaction: 'navigate' },
  { id: 'sectors', module: 'tables', target: '[data-tour="tables-sectors"]', title: 'Elige un sector', description: 'Usa estos botones para ver solo las mesas de un sector o todas las mesas del salón.', placement: 'bottom', interaction: 'informative' },
  { id: 'statuses', module: 'tables', target: '[data-tour="tables-status"]', title: 'Lee el estado del salón', description: 'Aquí ves cuántas mesas están libres, ocupadas o esperando el cobro.', placement: 'bottom', interaction: 'informative' },
  { id: 'available-table', module: 'tables', target: '[data-tour="tables-available"]', title: 'Identifica una mesa disponible', description: 'Una mesa libre puede recibir un nuevo pedido cuando empieces a atenderla. Este paso solo la señala; no abre una cuenta.', placement: 'bottom', interaction: 'informative' },
  { id: 'tables', module: 'tables', target: '[data-tour="tables-active"]', advanceWhen: '[data-tour="table-add-product"]', title: 'Abre una mesa', description: 'Toca una mesa ocupada para ver su pedido. Una mesa libre se abre cuando realmente empiezas a atenderla.', placement: 'bottom', interaction: 'navigate' },
  { id: 'add-products', module: 'tables', target: '[data-tour="table-add-product"]', title: 'Añade productos', description: 'Dentro de una mesa abierta, este botón agrega productos al pedido. El tutorial no lo pulsa por ti.', placement: 'top', interaction: 'informative' },
  { id: 'send-kitchen', module: 'tables', target: '[data-tour="table-send-kitchen"]', title: 'Envía la comanda a Cocina', description: 'Cuando el pedido está listo, imprime o envía la comanda. Cocina verá los productos pendientes de preparar.', placement: 'top', interaction: 'informative' },
  { id: 'request-bill', module: 'tables', target: '[data-tour="table-request-bill"]', title: 'Solicita la cuenta', description: 'Al terminar el consumo, solicita la cuenta. Esto avisa a Caja sin liberar la mesa todavía.', placement: 'top', interaction: 'informative' },
  { id: 'release-table', module: 'tables', target: '[data-tour="tables-grid"]', title: 'Libera la mesa después del cobro', description: 'Caja libera la mesa cuando el pago queda completo. Un pago parcial mantiene la cuenta abierta.', placement: 'top', interaction: 'informative' },
]

export const restaurantTablesMobileTourSteps: RestaurantTourStep[] = [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-tables"]', title: 'Abre el menú', description: 'En el celular, las secciones están dentro de este menú. Ábrelo para encontrar Mesas.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-tables', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-tables"]', advanceWhen: '[data-tour="tables-sectors"]', title: 'Abre las mesas', description: 'Pulsa Mesas para ver el salón y las cuentas abiertas.', placement: 'bottom', interaction: 'navigate' },
  ...restaurantTablesTourSteps.slice(1),
]

export function restaurantTablesTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-tables-tour:${tenantId}:${uid}:v1`
}
