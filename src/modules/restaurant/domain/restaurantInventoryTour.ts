import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantInventoryTourSteps: RestaurantTourStep[] = [
  { id: 'open-inventory', module: 'dashboard', target: '[data-tour="restaurant-nav-inventory"]', advanceWhen: '[data-tour="inventory-board"]', title: 'Abre Inventario', description: 'Pulsa Inventario para consultar insumos, existencias y movimientos.', placement: 'bottom', interaction: 'navigate' },
  { id: 'stock', module: 'inventory', target: '[data-tour="inventory-current"]', title: 'Consulta las existencias', description: 'Cada fila muestra el insumo, la cantidad disponible, su unidad y el estado de stock.', placement: 'top', interaction: 'informative' },
  { id: 'search', module: 'inventory', target: '[data-tour="inventory-search"]', title: 'Usa búsqueda y filtros', description: 'Busca por nombre, categoría o unidad. Los filtros ayudan a encontrar faltantes.', placement: 'bottom', interaction: 'informative' },
  { id: 'low-stock', module: 'inventory', target: '[data-tour="inventory-low-stock"]', title: 'Vigila el stock bajo', description: 'Esta tarjeta marca los insumos que llegaron al mínimo. Revísalos antes de que falten.', placement: 'bottom', interaction: 'informative' },
  { id: 'entries', module: 'inventory', target: '[data-tour="inventory-new-item"]', title: 'Registra insumos nuevos', description: 'Nuevo insumo abre el formulario para definir unidad, stock inicial, mínimo y costo. No se guarda nada automáticamente.', placement: 'top', interaction: 'informative' },
  { id: 'movements', module: 'inventory', target: '[data-tour="inventory-create-movement"], [data-tour="inventory-current"]', title: 'Registra entradas, salidas o ajustes', description: 'Al abrir un insumo puedes registrar una compra, merma, consumo interno o ajuste con un motivo.', placement: 'top', interaction: 'informative' },
  { id: 'history', module: 'inventory', target: '[data-tour="inventory-history-tab"]', title: 'Consulta el historial', description: 'Libro de movimientos conserva las entradas y salidas con fecha, responsable y motivo.', placement: 'bottom', interaction: 'informative' },
  { id: 'recipes', module: 'inventory', target: '[data-tour="inventory-current"]', title: 'Las recetas afectan el stock', description: 'El inventario baja cuando una venta usa una receta válida. Los productos sin receta no descuentan insumos automáticamente.', placement: 'top', interaction: 'informative' },
]

export const restaurantInventoryMobileTourSteps: RestaurantTourStep[] = [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-inventory"]', title: 'Abre el menú', description: 'En el celular, abre el menú para encontrar Inventario.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-inventory', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-inventory"]', advanceWhen: '[data-tour="inventory-board"]', title: 'Abre Inventario', description: 'Pulsa Inventario para consultar tus insumos.', placement: 'bottom', interaction: 'navigate' },
  ...restaurantInventoryTourSteps.slice(1),
]

export function restaurantInventoryTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-inventory-tour:${tenantId}:${uid}:v1`
}
