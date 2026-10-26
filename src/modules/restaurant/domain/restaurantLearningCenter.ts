export const RESTAURANT_TUTORIAL_IDS = ['pos', 'counter_pos', 'tables', 'kitchen', 'cash', 'products', 'inventory', 'customers'] as const

export type RestaurantTutorialId = typeof RESTAURANT_TUTORIAL_IDS[number]
export type RestaurantTutorialStatus = 'not-started' | 'in-progress' | 'completed' | 'skipped'

export type RestaurantLearningTutorial = {
  id: RestaurantTutorialId
  title: string
  description: string
  status: RestaurantTutorialStatus
}

const TUTORIAL_DETAILS: Record<RestaurantTutorialId, Omit<RestaurantLearningTutorial, 'id' | 'status'>> = {
  pos: { title: 'Punto de venta', description: 'Busca productos, revisa el pedido y conoce cómo se registra una venta.' },
  counter_pos: { title: 'Restaurante Rápido', description: 'Aprende el recorrido de mostrador: productos, extras, entrega, cobro y despacho.' },
  tables: { title: 'Mesas y salón', description: 'Ubica sectores, revisa mesas y entiende el recorrido de una cuenta.' },
  kitchen: { title: 'Cocina', description: 'Identifica comandas, productos, observaciones y estados de preparación.' },
  cash: { title: 'Caja', description: 'Conoce turnos, cobros, movimientos y arqueo.' },
  products: { title: 'Productos y recetas', description: 'Consulta el catálogo, precios, recetas e ingredientes.' },
  inventory: { title: 'Inventario', description: 'Revisa existencias, movimientos y alertas.' },
  customers: { title: 'Clientes', description: 'Busca contactos, consulta actividad y conoce las opciones disponibles.' },
}

export function restaurantLearningTutorialIdsForProfile(
  availableIds: readonly RestaurantTutorialId[],
  profile: 'restaurant' | 'counter_service',
): RestaurantTutorialId[] {
  if (profile === 'counter_service') {
    return availableIds.filter((id) => id !== 'tables' && id !== 'pos').concat(availableIds.includes('pos') ? ['counter_pos'] : [])
  }
  return availableIds.filter((id) => id !== 'counter_pos')
}

export function restaurantTutorialStatusFromStorage(value: string | null): RestaurantTutorialStatus {
  if (value === 'started') return 'in-progress'
  if (value === 'completed') return 'completed'
  if (value === 'skipped') return 'skipped'
  return 'not-started'
}

export function buildRestaurantLearningTutorials(
  availableIds: readonly RestaurantTutorialId[],
  statuses: Partial<Record<RestaurantTutorialId, RestaurantTutorialStatus>> = {},
): RestaurantLearningTutorial[] {
  return availableIds.map((id) => ({ id, ...TUTORIAL_DETAILS[id], status: statuses[id] ?? 'not-started' }))
}

export function restaurantLearningProgress(tutorials: readonly RestaurantLearningTutorial[]) {
  const completed = tutorials.filter((tutorial) => tutorial.status === 'completed').length
  return {
    completed,
    total: tutorials.length,
    percent: tutorials.length ? Math.round((completed / tutorials.length) * 100) : 0,
  }
}

export function restaurantTutorialActionLabel(status: RestaurantTutorialStatus): string {
  if (status === 'completed') return 'Repetir'
  if (status === 'in-progress') return 'Volver a empezar'
  return 'Iniciar'
}

export function restaurantTutorialStatusLabel(status: RestaurantTutorialStatus): string {
  if (status === 'completed') return 'Completado'
  if (status === 'in-progress') return 'En progreso'
  if (status === 'skipped') return 'Omitido'
  return 'No iniciado'
}
