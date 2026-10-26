import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantProductsTourSteps: RestaurantTourStep[] = [
  { id: 'open-products', module: 'dashboard', target: '[data-tour="restaurant-nav-products"]', advanceWhen: '[data-tour="products-board"]', title: 'Abre Productos', description: 'Pulsa Productos para administrar el catálogo del restaurante.', placement: 'bottom', interaction: 'navigate' },
  { id: 'catalog', module: 'products', target: '[data-tour="products-catalog"]', title: 'Revisa el catálogo', description: 'Aquí ves los productos, su categoría, precio, stock y disponibilidad.', placement: 'top', interaction: 'informative' },
  { id: 'search', module: 'products', target: '[data-tour="products-search"]', title: 'Busca primero', description: 'Escribe el nombre de un plato o bebida para encontrarlo más rápido.', placement: 'bottom', interaction: 'informative' },
  { id: 'create', module: 'products', target: '[data-tour="products-create"]', title: 'Crea un producto', description: 'Usa Nuevo producto cuando quieras agregar un plato, bebida o ingrediente. El tutorial no abre ni guarda nada.', placement: 'top', interaction: 'informative' },
  { id: 'details', module: 'products', target: '[data-tour="products-form-fields"], [data-tour="products-create"]', title: 'Completa los datos básicos', description: 'En el formulario indica nombre, categoría y precio. Revisa la unidad antes de guardar.', placement: 'top', interaction: 'informative' },
  { id: 'recipe', module: 'products', target: '[data-tour="products-recipe-fields"], [data-tour="products-catalog"]', title: 'Configura la receta', description: 'Para un producto preparado, agrega los insumos y las cantidades que realmente utiliza.', placement: 'top', interaction: 'informative' },
  { id: 'save', module: 'products', target: '[data-tour="products-save"], [data-tour="products-create"]', title: 'Guarda cuando esté listo', description: 'Guardar crea o actualiza el producto. Revísalo antes: el tutorial solo te indica dónde está el control.', placement: 'top', interaction: 'informative' },
  { id: 'edit', module: 'products', target: '[data-tour="products-edit"], [data-tour="products-catalog"]', title: 'Edita un producto existente', description: 'Desde las acciones de cada fila puedes revisar o editar un producto sin perder su historial.', placement: 'top', interaction: 'informative' },
]

export const restaurantProductsMobileTourSteps: RestaurantTourStep[] = [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-products"]', title: 'Abre el menú', description: 'En el celular, abre el menú para encontrar Productos.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-products', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-products"]', advanceWhen: '[data-tour="products-board"]', title: 'Abre Productos', description: 'Pulsa Productos para ver el catálogo.', placement: 'bottom', interaction: 'navigate' },
  ...restaurantProductsTourSteps.slice(1),
]

export function restaurantProductsTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-products-tour:${tenantId}:${uid}:v1`
}
