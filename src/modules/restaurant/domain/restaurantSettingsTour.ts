import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantSettingsTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-settings',
    module: 'dashboard',
    target: '[data-tour="restaurant-nav-settings"]',
    advanceWhen: '[data-tour="settings-board"]',
    title: 'Abre Configuración',
    description: 'Pulsa Configuración para personalizar la apariencia y datos del restaurante.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'settings-theme',
    module: 'settings',
    target: '[data-tour="settings-theme"]',
    title: 'Apariencia y Colores',
    description: 'Personaliza los colores corporativos del restaurante para botones, acentos y encabezados.',
    placement: 'bottom',
    interaction: 'informative',
  },
  {
    id: 'settings-identity',
    module: 'settings',
    target: '[data-tour="settings-identity"]',
    title: 'Identidad Comercial',
    description: 'Configura la razón social, NIT, dirección y datos que aparecen en tickets y comandas.',
    placement: 'top',
    interaction: 'informative',
    missingTarget: {
      fallbackTarget: '[data-tour="settings-board"]',
      description: 'Los datos comerciales se administran desde esta sección según los permisos de tu perfil.',
    },
  },
]

export const restaurantSettingsMobileTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-menu',
    module: 'dashboard',
    target: '[data-tour="restaurant-menu-toggle"]',
    advanceWhen: '[data-tour="restaurant-mobile-nav-settings"]',
    title: 'Abre el menú',
    description: 'En el celular, abre el menú para encontrar Configuración.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'open-settings',
    module: 'dashboard',
    target: '[data-tour="restaurant-mobile-nav-settings"]',
    advanceWhen: '[data-tour="settings-board"]',
    title: 'Abre Configuración',
    description: 'Pulsa Configuración para ver las opciones disponibles.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  ...restaurantSettingsTourSteps.slice(1),
]

export function restaurantSettingsTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-settings-tour:${tenantId}:${uid}:v1`
}
