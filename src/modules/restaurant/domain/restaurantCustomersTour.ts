import type { RestaurantTourStep } from './restaurantPosTour'

type CustomersTourOptions = {
  canManage: boolean
  canViewHistory: boolean
  canCreate: boolean
  hasCustomers: boolean
  hasWhatsAppContact: boolean
}

export function buildRestaurantCustomersTourSteps({ canManage, canViewHistory, canCreate, hasCustomers, hasWhatsAppContact }: CustomersTourOptions): RestaurantTourStep[] {
  const steps: RestaurantTourStep[] = [
    { id: 'open-customers', module: 'dashboard', target: '[data-tour="restaurant-nav-customers"]', advanceWhen: '[data-tour="customers-board"]', title: 'Abre Clientes', description: 'Pulsa Clientes para buscar contactos y consultar su actividad.', placement: 'bottom', interaction: 'navigate' },
    { id: 'search-customers', module: 'customers', target: '[data-tour="customers-search"]', title: 'Busca un cliente', description: 'Puedes buscar por nombre, teléfono o correo para encontrar un contacto.', placement: 'bottom', interaction: 'informative' },
    { id: 'customer-list', module: 'customers', target: '[data-tour="customers-list"]', title: 'Revisa la lista', description: 'Aquí aparecen los clientes y un resumen de sus visitas. Si todavía no hay clientes, la lista te lo indicará.', placement: 'top', interaction: 'informative' },
  ]

  if (canCreate) {
    steps.push(
      { id: 'open-customer-form', module: 'customers', target: '[data-tour="customers-create"]', advanceWhen: '[data-tour="customers-form-fields"]', title: 'Mira el formulario', description: 'Pulsa Nuevo cliente para ver sus campos. Después puedes cerrar el formulario sin guardar; el tutorial no registra información.', placement: 'bottom', interaction: 'navigate' },
      { id: 'customer-fields', module: 'customers', target: '[data-tour="customers-form-fields"]', title: 'Revisa los campos', description: 'Nombre y teléfono son obligatorios; apellido, correo, cumpleaños y notas son opcionales. Luego cierra con Cancelar sin guardar.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="customers-board"]', description: 'El formulario está cerrado. Si quieres conocer sus campos, abre Nuevo cliente y cierra con Cancelar sin guardar; el tutorial no registra datos.' } },
    )
  }

  if (canViewHistory && hasCustomers) {
    steps.push(
      { id: 'open-customer-profile', module: 'customers', target: '[data-tour="customers-first-profile"]', advanceWhen: '[data-tour="customers-history"]', title: 'Abre la ficha', description: 'Pulsa el nombre de un cliente para consultar su ficha. Este acceso solo abre información de lectura.', placement: 'bottom', interaction: 'navigate' },
      { id: 'customer-history', module: 'customers', target: '[data-tour="customers-history"]', title: 'Consulta el historial', description: 'Aquí puedes revisar visitas y pedidos asociados, si están disponibles para tu perfil.', placement: 'top', interaction: 'informative' },
    )
  } else {
    steps.push({ id: 'customer-history', module: 'customers', target: '[data-tour="customers-list"]', title: 'Consulta la actividad', description: canManage ? 'Al abrir una ficha puedes revisar el historial si el cliente tiene pedidos asociados.' : 'El resumen muestra las visitas disponibles. El historial detallado depende de los permisos de tu perfil.', placement: 'top', interaction: 'informative' })
  }

  steps.push(
    { id: 'customer-contact', module: 'customers', target: hasCustomers && canViewHistory ? '[data-tour="customers-profile-actions"]' : hasWhatsAppContact ? '[data-tour="customers-whatsapp"]' : '[data-tour="customers-list"]', title: 'Contacto y opciones', description: 'WhatsApp solo se abre si tú pulsas su botón. Editar aparece únicamente cuando tienes permiso; el tutorial no abre WhatsApp ni modifica datos.', placement: 'bottom', interaction: 'informative' },
  )

  return steps
}

export const restaurantCustomersMobileTourSteps = (steps: RestaurantTourStep[]): RestaurantTourStep[] => [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-customers"]', title: 'Abre el menú', description: 'En el celular, abre el menú para encontrar Clientes.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-customers', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-customers"]', advanceWhen: '[data-tour="customers-board"]', title: 'Abre Clientes', description: 'Pulsa Clientes para buscar contactos y consultar su actividad.', placement: 'bottom', interaction: 'navigate' },
  ...steps.slice(1),
]

export function restaurantCustomersTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-customers-tour:${tenantId}:${uid}:v1`
}
