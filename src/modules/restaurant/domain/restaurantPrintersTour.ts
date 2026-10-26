import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantPrintersTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-printers',
    module: 'dashboard',
    target: '[data-tour="restaurant-nav-printers"]',
    advanceWhen: '[data-tour="printers-board"]',
    title: 'Abre Impresoras',
    description: 'Pulsa Impresoras para configurar el hardware de comandas y recibos.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'printers-config',
    module: 'printers',
    target: '[data-tour="printers-config-form"]',
    title: 'Configura la comandera',
    description: 'Elige el destino (Cocina, Barra o Caja), tipo de conexión y ancho de papel (58mm u 80mm).',
    placement: 'top',
    interaction: 'informative',
    missingTarget: {
      fallbackTarget: '[data-tour="printers-board"]',
      description: 'Panel de impresoras térmicas para emisión automática o manual de comandas.',
    },
  },
  {
    id: 'printers-test',
    module: 'printers',
    target: '[data-tour="printers-test-btn"]',
    title: 'Prueba de impresión',
    description: 'Envía un ticket de muestra para verificar la conexión antes del servicio real.',
    placement: 'bottom',
    interaction: 'informative',
    missingTarget: {
      fallbackTarget: '[data-tour="printers-board"]',
      description: 'Puedes probar la comanda de prueba una vez guardada la configuración de la impresora.',
    },
  },
]

export const restaurantPrintersMobileTourSteps: RestaurantTourStep[] = [
  {
    id: 'open-menu',
    module: 'dashboard',
    target: '[data-tour="restaurant-menu-toggle"]',
    advanceWhen: '[data-tour="restaurant-mobile-nav-printers"]',
    title: 'Abre el menú',
    description: 'En el celular, abre el menú para encontrar Impresoras.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  {
    id: 'open-printers',
    module: 'dashboard',
    target: '[data-tour="restaurant-mobile-nav-printers"]',
    advanceWhen: '[data-tour="printers-board"]',
    title: 'Abre Impresoras',
    description: 'Pulsa Impresoras para ver las opciones de conexión.',
    placement: 'bottom',
    interaction: 'navigate',
  },
  ...restaurantPrintersTourSteps.slice(1),
]

export function restaurantPrintersTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-printers-tour:${tenantId}:${uid}:v1`
}
