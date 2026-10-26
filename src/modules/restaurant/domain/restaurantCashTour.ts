import type { RestaurantTourStep } from './restaurantPosTour'

export const restaurantCashTourSteps: RestaurantTourStep[] = [
  { id: 'open-cash', module: 'dashboard', target: '[data-tour="restaurant-nav-cash"]', advanceWhen: '[data-tour="cash-board"]', title: 'Abre Caja', description: 'Pulsa Caja para revisar el turno y las operaciones de dinero.', placement: 'bottom', interaction: 'navigate' },
  { id: 'shift-status', module: 'cash', target: '[data-tour="cash-shift-status"]', title: 'Revisa el turno', description: 'Aquí ves si la caja está abierta. Solo opera cuando el turno corresponde a tu jornada.', placement: 'bottom', interaction: 'informative' },
  { id: 'opening', module: 'cash', target: '[data-tour="cash-open-shift"]', title: 'Inicia con el fondo inicial', description: 'Cuando no hay turno, registra el efectivo real que queda para dar cambio. El tutorial no inicia el turno.', placement: 'bottom', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-shift-status"]', description: 'Ya hay un turno abierto. El fondo inicial se registra al abrirlo; aquí puedes comprobar el estado antes de operar.' } },
  { id: 'sales', module: 'cash', target: '[data-tour="cash-sales-summary"]', title: 'Mira las ventas del turno', description: 'Este resumen reúne únicamente los cobros confirmados durante el turno actual.', placement: 'bottom', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-board"]', description: 'Con el turno cerrado todavía no hay un resumen de ventas. Cuando abras uno, aquí aparecerán los cobros de ese turno.' } },
  { id: 'payment-methods', module: 'cash', target: '[data-tour="cash-payment-methods"]', title: 'Separa efectivo, QR y tarjeta', description: 'Cada método se muestra por separado para que puedas revisar el dinero físico y los pagos digitales.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-board"]', description: 'El desglose de efectivo, QR y tarjeta aparece mientras hay un turno abierto.' } },
  { id: 'movements', module: 'cash', target: '[data-tour="cash-movements"]', title: 'Registra movimientos de caja', description: 'Usa Registrar movimiento para una entrada o salida real. El tutorial solo muestra dónde está el control.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-board"]', description: 'Los movimientos se habilitan dentro de un turno abierto. El tutorial no abre el turno ni registra movimientos.' } },
  { id: 'charges', module: 'cash', target: '[data-tour="restaurant-nav-pos"]', title: 'Los cobros se hacen en POS', description: 'En POS eliges efectivo, QR, tarjeta o pago mixto y confirmas el cambio. Caja después refleja esos cobros.', placement: 'bottom', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-board"]', description: 'Los cobros se registran desde POS. Este tutorial solo explica el recorrido y no cambia de módulo ni registra pagos.' } },
  { id: 'reconciliation', module: 'cash', target: '[data-tour="cash-expected"]', title: 'Haz el arqueo con efectivo contado', description: 'Compara el efectivo esperado con el dinero físico. QR y tarjeta no deben mezclarse con el efectivo.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-board"]', description: 'El arqueo aparece cuando hay un turno abierto. Se compara el efectivo esperado con el efectivo contado; los pagos digitales se revisan aparte.' } },
  { id: 'close', module: 'cash', target: '[data-tour="cash-close-shift"]', title: 'Cierra el turno al finalizar', description: 'Después del arqueo y de cerrar las cuentas pendientes, usa este control para confirmar el cierre.', placement: 'top', interaction: 'informative', missingTarget: { fallbackTarget: '[data-tour="cash-board"]', description: 'El cierre y el arqueo están disponibles durante un turno abierto, cuando no quedan cuentas pendientes.' } },
]

export const restaurantCashMobileTourSteps: RestaurantTourStep[] = [
  { id: 'open-menu', module: 'dashboard', target: '[data-tour="restaurant-menu-toggle"]', advanceWhen: '[data-tour="restaurant-mobile-nav-cash"]', title: 'Abre el menú', description: 'En el celular, abre este menú para encontrar Caja.', placement: 'bottom', interaction: 'navigate' },
  { id: 'open-cash', module: 'dashboard', target: '[data-tour="restaurant-mobile-nav-cash"]', advanceWhen: '[data-tour="cash-board"]', title: 'Abre Caja', description: 'Pulsa Caja para revisar tu turno.', placement: 'bottom', interaction: 'navigate' },
  ...restaurantCashTourSteps.slice(1, 7),
  { ...restaurantCashTourSteps[7], target: '[data-tour="cash-expected"]' },
  restaurantCashTourSteps[8],
]

export function restaurantCashTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-cash-tour:${tenantId}:${uid}:v1`
}
