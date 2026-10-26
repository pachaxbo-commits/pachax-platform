import type { RestaurantModuleId } from '../views/RestaurantExperience'
import type { RestaurantTourStep } from './restaurantPosTour'

export type CounterServiceTourAccess = {
  canViewKitchen: boolean
  canViewOrders: boolean
  canViewHistory: boolean
}

function navigationStep(
  id: string,
  module: RestaurantModuleId,
  target: string,
  advanceWhen: string,
  title: string,
  description: string,
): RestaurantTourStep {
  return { id, module, target, advanceWhen, title, description, placement: 'bottom', interaction: 'navigate' }
}

function informativeStep(
  id: string,
  module: RestaurantModuleId,
  target: string,
  title: string,
  description: string,
  fallbackTarget?: string,
  fallbackDescription?: string,
): RestaurantTourStep {
  return {
    id, module, target, title, description, placement: 'top', interaction: 'informative',
    ...(fallbackTarget && fallbackDescription ? { missingTarget: { fallbackTarget, description: fallbackDescription } } : {}),
  }
}

export function buildRestaurantCounterServiceTourSteps(access: CounterServiceTourAccess) {
  const steps: RestaurantTourStep[] = [
    {
      ...navigationStep('counter-open-pos', 'pos', '[data-tour="restaurant-nav-pos"]', '[data-tour="pos-catalog"]', 'Abre el POS', 'Pulsa POS para iniciar un pedido de mostrador. El tutorial no agrega productos ni registra ventas.'),
      missingTarget: {
        fallbackTarget: '[data-tour="restaurant-menu-toggle"]',
        description: 'En una pantalla pequeña, abre el menú y elige POS. El tutorial no agrega productos ni registra ventas.',
      },
    },
    informativeStep('counter-products', 'pos', '[data-tour="pos-catalog"]', 'Elige los productos', 'Busca un producto o recorre las categorías. La selección y la cantidad se revisan antes de confirmar el pedido.'),
    informativeStep('counter-customize', 'pos', '[data-tour="pos-item-controls"]', 'Ajusta el pedido', 'En el carrito puedes cambiar cantidades y abrir Opciones para seleccionar extras, modificadores o una nota para Cocina. Este recorrido no cambia el carrito.', '[data-tour="pos-cart"]', 'El carrito está vacío. Al elegir un producto aparecerán sus controles de cantidad y opciones; no necesitas añadirlo para continuar.'),
    informativeStep('counter-fulfillment', 'pos', '[data-tour="pos-fulfillment"]', 'Elige cómo se entrega', 'Selecciona el punto de entrega, Para llevar o Delivery según el pedido. La opción actual no se modifica durante el tutorial.'),
    informativeStep('counter-payment', 'pos', '[data-tour="pos-payment-methods"]', 'Revisa el cobro', 'El POS permite efectivo, QR, tarjeta o pago mixto. Comprueba el total y el cambio antes de confirmar; aquí no se realiza ningún cobro.', '[data-tour="pos-submit"]', 'Las opciones de pago aparecen al preparar un pedido. El tutorial no abre el cobro ni crea pedidos.'),
    informativeStep('counter-send-kitchen', 'pos', '[data-tour="pos-submit"]', 'Enviar a preparación', 'Al confirmar, el sistema registra el pedido y lo envía al flujo de preparación. No pulses el botón durante el tutorial.'),
  ]

  let previousModule: RestaurantModuleId = 'pos'

  if (access.canViewKitchen) {
    steps.push(
      navigationStep('counter-open-kitchen', previousModule, '[data-tour="restaurant-nav-kitchen"]', '[data-tour="kitchen-orders"]', 'Abre Cocina', 'Pulsa Cocina para consultar las comandas que esperan preparación.'),
      informativeStep('counter-kitchen-status', 'kitchen', '[data-tour="kitchen-order-items"]', 'Sigue la preparación', 'Las comandas muestran sus productos y estados. Cocina puede pasar de Pendiente a Preparar y luego a Listo; el tutorial no cambia ningún estado.', '[data-tour="kitchen-board"]', 'Cuando no hay comandas activas, esta pantalla está vacía. Los pedidos enviados aparecerán aquí con sus productos y estados.'),
    )
    previousModule = 'kitchen'
  }

  if (access.canViewOrders) {
    steps.push(
      navigationStep('counter-open-orders', previousModule, '[data-tour="restaurant-nav-orders"]', '[data-tour="orders-board"]', 'Consulta Pedidos', 'Pulsa Pedidos para buscar comandas y revisar su estado.'),
      informativeStep('counter-order-delivery', 'orders', '[data-tour="orders-delivery-control"], [data-tour="orders-order-card"]', 'Entrega el pedido', 'La lista distingue pedidos pendientes, en cocina, listos y entregados. Cuando corresponda, el control Marcar entregado registra la entrega real; no lo pulses durante el recorrido.', '[data-tour="orders-board"]', 'No hay comandas en la lista ahora. Cuando exista un pedido, aquí podrás revisar su estado y marcarlo entregado al entregarlo.'),
    )
    previousModule = 'orders'
  }

  if (access.canViewHistory) {
    steps.push(
      navigationStep('counter-open-more-history', previousModule, '[data-tour="restaurant-nav-more"]', '[data-tour="restaurant-nav-history"]', 'Busca Historial', 'En escritorio, abre Más para encontrar el Historial.'),
      navigationStep('counter-open-history', previousModule, '[data-tour="restaurant-nav-history"]', '[data-tour="history-board"]', 'Abre el Historial', 'Pulsa Historial para consultar operaciones anteriores.'),
      informativeStep('counter-history', 'history', '[data-tour="history-board"]', 'Consulta ventas anteriores', 'El historial reúne pedidos pasados y registros disponibles según tu permiso. Consultarlo no modifica ventas ni caja.'),
    )
  }

  const mobileModuleNavigation = (id: 'kitchen' | 'orders' | 'history', currentModule: RestaurantModuleId, label: string, advanceWhen: string): RestaurantTourStep[] => [
    navigationStep(`counter-open-menu-${id}`, currentModule, '[data-tour="restaurant-menu-toggle"]', `[data-tour="restaurant-mobile-nav-${id}"]`, 'Abre el menú', `En el celular, abre el menú para encontrar ${label}.`),
    {
      ...navigationStep(`counter-open-${id}-mobile`, currentModule, `[data-tour="restaurant-mobile-nav-${id}"]`, advanceWhen, `Abre ${label}`, `Pulsa ${label} para continuar el recorrido.`),
      missingTarget: {
        fallbackTarget: '[data-tour="restaurant-menu-toggle"]',
        description: `El menÃº todavÃ­a se estÃ¡ abriendo. Espera a que aparezca ${label} y selecciÃ³nalo para continuar.`,
      },
    },
  ]

  const mobileSteps: RestaurantTourStep[] = [
    navigationStep('counter-open-menu', 'pos', '[data-tour="restaurant-menu-toggle"]', '[data-tour="restaurant-mobile-nav-pos"]', 'Abre el menú', 'En el celular, abre el menú para encontrar POS.'),
    {
      ...navigationStep('counter-open-pos-mobile', 'pos', '[data-tour="restaurant-mobile-nav-pos"]', '[data-tour="pos-catalog"]', 'Entra al POS', 'Pulsa POS. El tutorial continuará cuando aparezca el catálogo.'),
      missingTarget: {
        fallbackTarget: '[data-tour="restaurant-menu-toggle"]',
        description: 'El menú todavía se está abriendo. Espera a que aparezca POS y selecciónalo para continuar.',
      },
    },
    ...steps.filter((step) => ['counter-products', 'counter-customize'].includes(step.id)).map((step) => step.id === 'counter-customize'
      ? {
          ...step,
          missingTarget: {
            fallbackTarget: '[data-tour="pos-mobile-cart"]',
            description: 'El carrito está vacío. Pulsa Ver pedido para consultar los controles cuando añadas un producto; no necesitas añadirlo para continuar.',
          },
        }
      : step),
    {
      ...navigationStep('counter-open-cart-mobile', 'pos', '[data-tour="pos-mobile-cart"]', '[data-tour="pos-fulfillment"]', 'Revisa el pedido', 'Pulsa Ver pedido para consultar entrega y cobro. Esto solo abre el resumen; no confirma ni registra nada.'),
      missingTarget: {
        fallbackTarget: '[data-tour="pos-catalog"]',
        description: 'El resumen del pedido aparecerá al terminar de cargar el POS. No hace falta seleccionar productos para continuar.',
      },
    },
    ...steps.filter((step) => ['counter-fulfillment', 'counter-payment', 'counter-send-kitchen'].includes(step.id)),
    {
      ...navigationStep('counter-close-cart-mobile', 'pos', '[data-tour="pos-cart-close"]', '[data-tour="restaurant-menu-toggle"]', 'Cierra el resumen', 'Cierra el resumen para volver al POS y abrir los otros módulos. No se cancela ni se envía ningún pedido.'),
      missingTarget: {
        fallbackTarget: '[data-tour="pos-catalog"]',
        description: 'El resumen del pedido está abierto. Pulsa la X para volver al POS; esto no cancela ni envía el pedido.',
      },
    },
  ]
  if (access.canViewKitchen) {
    mobileSteps.push(
      ...mobileModuleNavigation('kitchen', 'pos', 'Cocina', '[data-tour="kitchen-orders"]'),
      steps.find((step) => step.id === 'counter-kitchen-status')!,
    )
  }
  if (access.canViewOrders) {
    mobileSteps.push(
      ...mobileModuleNavigation('orders', access.canViewKitchen ? 'kitchen' : 'pos', 'Pedidos', '[data-tour="orders-board"]'),
      steps.find((step) => step.id === 'counter-order-delivery')!,
    )
  }
  if (access.canViewHistory) {
    mobileSteps.push(
      ...mobileModuleNavigation('history', access.canViewOrders ? 'orders' : access.canViewKitchen ? 'kitchen' : 'pos', 'Historial', '[data-tour="history-board"]'),
      steps.find((step) => step.id === 'counter-history')!,
    )
  }

  return { steps, mobileSteps }
}

export function restaurantCounterServiceTourPreferenceKey(tenantId: string, uid: string) {
  return `pachax:restaurant-counter-pos-tour:${tenantId}:${uid}:v1`
}
