import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantUsersTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-users',
    module: 'dashboard',
    target: '[data-tour="restaurant-nav-users"]',
    advanceWhen: '[data-tour="users-board"]',
    title: 'Abre Usuarios',
    description: 'Pulsa Usuarios para consultar el equipo de trabajo y sus permisos.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'users-roles-summary',
    module: 'users',
    target: '[data-tour="users-roles-summary"]',
    title: 'Roles del restaurante',
    description: 'Cada rol (Administrador, Caja, Mesero, Cocina, Inventario) tiene acceso únicamente a las funciones de su responsabilidad.',
    placement: 'bottom',
    interaction: 'informative',
  },
  {
    id: 'users-list',
    module: 'users',
    target: '[data-tour="users-list"]',
    title: 'Directorio del equipo',
    description: 'Consulta los colaboradores registrados, sus correos y estado de activación en el sistema.',
    placement: 'top',
    interaction: 'informative',
  },
  {
    id: 'users-create',
    module: 'users',
    target: '[data-tour="users-create"]',
    title: 'Registra un colaborador',
    description: 'Usa Nuevo usuario para dar de alta a un miembro del equipo. El tutorial solo señala el control.',
    placement: 'bottom',
    interaction: 'informative',
  },
]

export const restaurantUsersMobileTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-menu',
    module: 'dashboard',
    target: '[data-tour="restaurant-menu-toggle"]',
    advanceWhen: '[data-tour="restaurant-mobile-nav-users"]',
    title: 'Abre el menú',
    description: 'En el celular, abre el menú para encontrar Usuarios.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'open-users',
    module: 'dashboard',
    target: '[data-tour="restaurant-mobile-nav-users"]',
    advanceWhen: '[data-tour="users-board"]',
    title: 'Abre Usuarios',
    description: 'Pulsa Usuarios para ver el equipo de trabajo.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  ...restaurantUsersTourSteps.slice(1),
]

export function restaurantUsersTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-users-tour:${tenantId}:${uid}:v1`
}
