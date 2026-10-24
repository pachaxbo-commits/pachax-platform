import type { UserRole, Permission } from '../../../types.ts'
import type { ModuleId } from '../../../config/businessTypes.ts'
import type { DistributionIndustryProfile } from '../types.ts'
import { PROFILE_METADATA } from '../../../demo/datasets/distribution/profileDatasets.ts'
import { getDemoItem, setDemoItem } from '../../../demo/core/demoContext.ts'

export type DistributionTutorialInteraction = 'observe' | 'navigate' | 'action'

export interface DistributionTutorialStep {
  id: string
  title: string
  explanation: string
  target: string
  module: ModuleId
  interaction: DistributionTutorialInteraction
  advancesOn?: 'module' | 'click' | 'change' | 'action'
  missingMessage?: string
  requiredActionHint?: string
  optional?: boolean
}

export type DistributionTrackId = 'onboarding' | 'inventory' | 'routes' | 'sales' | 'closures' | 'admin'

export interface DistributionTutorialPlan {
  id: string
  trackId: DistributionTrackId
  title: string
  description: string
  estimatedMinutes: number
  steps: DistributionTutorialStep[]
}

export type DistributionTutorialStatus = 'not_started' | 'in_progress' | 'completed' | 'omitted'

export interface DistributionTutorialProgress {
  status: DistributionTutorialStatus
  stepIndex: number
  lastUpdated: string
}

export interface ProgressStorageContext {
  isDemo?: boolean
  tenantId?: string
  uid?: string
  role?: string
  profile?: DistributionIndustryProfile
}

const BUSINESS_TYPE = 'route_distribution'

export function getDistributionTutorialProgressKey(
  actor: string | ProgressStorageContext,
  profileOrPlanId: DistributionIndustryProfile | string,
  maybePlanId?: string
): string {
  if (typeof actor === 'object') {
    const planId = profileOrPlanId as string
    if (!actor.isDemo && actor.tenantId && actor.uid) {
      return `tut_progress:${actor.tenantId}:${actor.uid}:${planId}`
    }
    const r = actor.role || 'operator'
    const p = actor.profile || 'food'
    return `tut_progress:demo:${r}:${p}:${planId}`
  }

  // Signature (actorKey, profile, planId)
  const actorKey = actor
  const profile = profileOrPlanId as DistributionIndustryProfile
  const planId = maybePlanId || ''
  return `tut_progress:${actorKey}:${profile}:${planId}`
}

export function loadTutorialProgress(
  actor: string | ProgressStorageContext,
  maybeProfile?: DistributionIndustryProfile
): Record<string, DistributionTutorialProgress> {
  if (typeof actor === 'object') {
    if (!actor.isDemo && actor.tenantId && actor.uid) {
      if (typeof window === 'undefined') return {}
      try {
        const raw = localStorage.getItem(`tut_progress:${actor.tenantId}:${actor.uid}`)
        return raw ? (JSON.parse(raw) as Record<string, DistributionTutorialProgress>) : {}
      } catch {
        return {}
      }
    }
    const r = actor.role || 'operator'
    const p = actor.profile || 'food'
    const raw = getDemoItem(BUSINESS_TYPE, `progress_${r}_${p}`)
    if (!raw) return {}
    try {
      return JSON.parse(raw) as Record<string, DistributionTutorialProgress>
    } catch {
      return {}
    }
  }

  const actorKey = actor
  const profile = maybeProfile || 'food'
  const raw = getDemoItem(BUSINESS_TYPE, `progress_${actorKey}_${profile}`)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, DistributionTutorialProgress>
  } catch {
    return {}
  }
}

export function saveTutorialProgress(
  actor: string | ProgressStorageContext,
  profileOrPlanId: DistributionIndustryProfile | string,
  planIdOrProgress: string | DistributionTutorialProgress,
  maybeProgress?: DistributionTutorialProgress
): void {
  if (typeof actor === 'object') {
    const planId = profileOrPlanId as string
    const progress = planIdOrProgress as DistributionTutorialProgress
    const current = loadTutorialProgress(actor)
    current[planId] = progress

    if (!actor.isDemo && actor.tenantId && actor.uid) {
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(`tut_progress:${actor.tenantId}:${actor.uid}`, JSON.stringify(current))
      } catch {}
      return
    }

    const r = actor.role || 'operator'
    const p = actor.profile || 'food'
    setDemoItem(BUSINESS_TYPE, `progress_${r}_${p}`, JSON.stringify(current))
    return
  }

  const actorKey = actor
  const profile = profileOrPlanId as DistributionIndustryProfile
  const planId = planIdOrProgress as string
  const progress = maybeProgress!
  const current = loadTutorialProgress(actorKey, profile)
  current[planId] = progress
  setDemoItem(BUSINESS_TYPE, `progress_${actorKey}_${profile}`, JSON.stringify(current))
}

export function getTutorialStatusLabel(status?: DistributionTutorialStatus): string {
  switch (status) {
    case 'completed':
      return 'Completado'
    case 'in_progress':
      return 'En progreso'
    case 'omitted':
      return 'Omitido'
    case 'not_started':
    default:
      return 'No iniciado'
  }
}

export interface TutorialPlanOptions {
  role: UserRole
  profile: DistributionIndustryProfile
  can: (permission: Permission) => boolean
  modules: ModuleId[]
}

export function createDistributionTutorialPlans(options: TutorialPlanOptions): DistributionTutorialPlan[] {
  const { role, profile, can: _can, modules } = options
  const meta = PROFILE_METADATA[profile] || PROFILE_METADATA.mixed
  const plans: DistributionTutorialPlan[] = []

  const canView = (modId: ModuleId) => modules.includes(modId)

  // =========================================================================
  // TRACK 1: PRIMEROS PASOS & IDENTIDAD (Disponible para roles con Dashboard)
  // =========================================================================
  if (canView('dist.dashboard')) {
    const isDistributor = role === 'distributor'
    plans.push({
      id: `tour-onboarding-${profile}`,
      trackId: 'onboarding',
      title: 'Primeros pasos y navegación',
      description: isDistributor
        ? `Aprende a consultar tu carga diaria y navegar en tu móvil como distribuidor de ${meta.label.toLowerCase()}.`
        : `Conoce el panel central, indicadores clave y la estructura operativa de ${meta.companyName}.`,
      estimatedMinutes: 2,
      steps: [
        {
          id: 'step-header',
          title: 'Identidad y Rubro de la Distribuidora',
          explanation: `Estás operando en ${meta.companyName}, configurada para el sector de ${meta.label}. Observa en la cabecera el nombre de tu empresa, tu rol (${role}) y el estado de sincronización.`,
          target: 'header-identity',
          module: 'dist.dashboard',
          interaction: 'observe',
          missingMessage: 'Observa la cabecera superior con los datos de tu empresa.',
        },
        {
          id: 'step-dashboard-stats',
          title: isDistributor ? 'Tu Jornada y Carga de Reparto' : 'Métricas del Día en Tiempo Real',
          explanation: isDistributor
            ? `Como distribuidor, tu inicio te muestra el camión asignado, los productos en ruta y tu avance de cobranzas. No requieres acceso a finanzas generales.`
            : `El tablero resume las ventas consolidadas del día, los clientes visitados en ruta, el dinero recaudado y el inventario restante en almacén.`,
          target: isDistributor ? 'distributor-home-summary' : 'dashboard-kpis',
          module: 'dist.dashboard',
          interaction: 'observe',
          missingMessage: 'Revisa el panel central de inicio.',
        },
        {
          id: 'step-nav',
          title: 'Navegación Adaptativa por Permisos',
          explanation: `La barra de navegación muestra únicamente las áreas autorizadas para tu rol de ${role}. Puedes cambiar entre módulos o acceder al menú "Más" para herramientas secundarias.`,
          target: 'bottom-nav',
          module: 'dist.dashboard',
          interaction: 'observe',
        },
        {
          id: 'step-tutorial-center',
          title: 'Centro de Tutoriales y Cambio de Sector',
          explanation: `Puedes abrir el Centro de Tutoriales en cualquier momento para cambiar de sector comercial (${meta.label}, Bebidas, Ferretería, etc.), reiniciar datos de práctica o repetir un recorrido.`,
          target: 'tutorial-trigger-btn',
          module: 'dist.dashboard',
          interaction: 'observe',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 2: INVENTARIO & ALMACÉN (Admin, Owner, Warehouse, Accountant)
  // =========================================================================
  if (canView('dist.inventory')) {
    const p1 = meta.sampleProducts[0]
    const p2 = meta.sampleProducts[1]
    plans.push({
      id: `tour-inventory-${profile}`,
      trackId: 'inventory',
      title: 'Inventario y Almacén Central',
      description: `Consulta existencias reales de ${p1} y ${p2}, ingresos por lote y movimientos sin conversiones arbitrarias.`,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'step-go-inventory',
          title: 'Abrir Módulo de Inventario',
          explanation: `Pulsa en Inventario para ingresar al control de existencias de ${meta.companyName}.`,
          target: 'nav-item-dist.inventory',
          module: 'dist.inventory',
          interaction: 'navigate',
          advancesOn: 'module',
          requiredActionHint: 'Pulsa el botón de Inventario resaltado en la navegación.',
        },
        {
          id: 'step-inventory-balances',
          title: `Existencias de ${meta.label}`,
          explanation: `Aquí visualizas el stock físico en Almacén Central. Observa productos como "${p1}" y "${p2}". Cada ítem se controla exactamente en su unidad declarada (${meta.primaryUnitHint}), sin inventar conversiones automáticas entre envases y granel.`,
          target: 'inventory-balances-table',
          module: 'dist.inventory',
          interaction: 'observe',
          missingMessage: 'Cargando tabla de existencias de inventario.',
        },
        {
          id: 'step-inventory-intake',
          title: 'Ingreso de Mercadería (Compras / Producción)',
          explanation: `Para ingresar nuevo stock a Almacén Central, se utiliza el botón "+ Ingreso de mercadería". Permite registrar proveedor, cantidades recibidas, lote y costo unitario real.`,
          target: 'inventory-intake-btn',
          module: 'dist.inventory',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Toca el botón "+ Ingreso de mercadería" para explorar el modal de recepción.',
        },
        {
          id: 'step-inventory-movements',
          title: 'Kardex y Trazabilidad de Movimientos',
          explanation: `Cada despacho a camión, venta en ruta o merma física queda auditado en el historial inmutable con fecha, usuario responsable y delta de stock correspondiente.`,
          target: 'inventory-movements-tab',
          module: 'dist.inventory',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Toca la pestaña de "Movimientos" para auditar el historial de salidas.',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 3: RUTAS & DESPACHOS (Admin, Owner, Warehouse)
  // =========================================================================
  if (canView('dist.dispatches')) {
    plans.push({
      id: `tour-dispatches-${profile}`,
      trackId: 'routes',
      title: 'Rutas y Despachos de Carga',
      description: `Aprende a preparar la mercadería que sale en el camión de reparto asignado al distribuidor.`,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'step-go-dispatches',
          title: 'Abrir Despachos',
          explanation: `Pulsa en Despachos para supervisar o armar la carga de los camiones de reparto.`,
          target: 'nav-item-dist.dispatches',
          module: 'dist.dispatches',
          interaction: 'navigate',
          advancesOn: 'module',
          requiredActionHint: 'Pulsa Despachos en el menú para continuar.',
        },
        {
          id: 'step-dispatch-list',
          title: 'Despacho Activo en Ruta Principal',
          explanation: `Observa el despacho abierto del día asignado a "Hugo Distribuidor". Contiene las líneas de carga inicial preparadas en Almacén Central para abastecer a los clientes de la ruta.`,
          target: 'dispatch-active-card',
          module: 'dist.dispatches',
          interaction: 'observe',
          missingMessage: 'Revisa la tarjeta de despacho en curso.',
        },
        {
          id: 'step-dispatch-lines',
          title: 'Líneas de Carga por Producto',
          explanation: `Cada línea especifica el producto de ${meta.label.toLowerCase()}, la unidad física cargada y las unidades de stock descontadas del almacén origen.`,
          target: 'dispatch-lines-detail',
          module: 'dist.dispatches',
          interaction: 'observe',
        },
        {
          id: 'step-dispatch-additions',
          title: 'Aumentos de Mercadería en Ruta',
          explanation: `Si durante la jornada el distribuidor requiere más producto por alta demanda de clientes, el almacenero o administrador puede registrar un aumento con auditoría sin reiniciar el viaje.`,
          target: 'dispatch-add-load-btn',
          module: 'dist.dispatches',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Toca "+ Aumentar carga" para ver cómo se añade stock a una ruta activa.',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 4: VENTAS & COBRANZAS EN RUTA (Distributor, Admin, Owner)
  // =========================================================================
  if (canView('dist.sales')) {
    const c1 = meta.sampleCustomers[0]
    const p1 = meta.sampleProducts[0]
    plans.push({
      id: `tour-sales-${profile}`,
      trackId: 'sales',
      title: 'Ventas y Cobranzas en Ruta',
      description: `Flujo completo de venta a clientes como "${c1}", cobro en efectivo/QR y otorgamiento de crédito comercial.`,
      estimatedMinutes: 4,
      steps: [
        {
          id: 'step-go-sales',
          title: 'Abrir Registro de Ventas',
          explanation: `Pulsa en Ventas para abrir el terminal móvil de venta en ruta.`,
          target: 'nav-item-dist.sales',
          module: 'dist.sales',
          interaction: 'navigate',
          advancesOn: 'module',
          requiredActionHint: 'Pulsa Ventas en la barra de navegación.',
        },
        {
          id: 'step-select-customer',
          title: `Paso 1: Seleccionar Cliente de la Ruta`,
          explanation: `El primer paso es elegir el negocio al que entregas la mercadería, por ejemplo "${c1}". Pulsa el botón de cliente para abrir el selector de clientes de la ruta.`,
          target: 'sell-customer-selector',
          module: 'dist.sales',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: `Toca el botón "Cliente" para seleccionar a "${c1}" de la ruta asignada.`,
          missingMessage: 'Observa el selector de clientes de la ruta.',
        },
        {
          id: 'step-select-products',
          title: `Paso 2: Elegir Producto (${meta.label})`,
          explanation: `Selecciona el producto a entregar, por ejemplo "${p1}". Al tocar la tarjeta del producto se abrirá el modal para ingresar la cantidad exacta y el precio de venta.`,
          target: 'sell-products-catalog',
          module: 'dist.sales',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: `Toca una tarjeta de producto (${p1}) en el catálogo para agregarlo.`,
          missingMessage: 'Observa el catálogo de productos disponibles en ruta.',
        },
        {
          id: 'step-cart-summary',
          title: 'Paso 3: Revisar Carrito y Cobrar',
          explanation: `En la barra inferior se totalizan los productos agregados al pedido. Pulsa el botón "Cobrar" para proceder al desglose de pago.`,
          target: 'sell-checkout-btn',
          module: 'dist.sales',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Pulsa el botón "Cobrar" resaltado en la barra de pedido.',
        },
        {
          id: 'step-payment-methods',
          title: 'Paso 4: Efectivo, Pago QR o Crédito',
          explanation: `Elige la forma de pago autorizada: Efectivo, Pago QR o Crédito comercial en cuenta corriente si el cliente cuenta con límite disponible.`,
          target: 'sell-payment-methods',
          module: 'dist.sales',
          interaction: 'observe',
        },
        {
          id: 'step-submit-sale',
          title: 'Paso 5: Confirmar y Emitir Comprobante',
          explanation: `Pulsa "Confirmar" para procesar la transacción. Se generará la nota de entrega oficial y se actualizará automáticamente el stock en el camión.`,
          target: 'sell-confirm-btn',
          module: 'dist.sales',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Pulsa el botón "Confirmar" para registrar la venta en el sistema.',
        },
        {
          id: 'step-sale-result',
          title: 'Paso 6: Verificación de Inventario y Kardex',
          explanation: `¡Venta registrada con éxito! La existencia disponible de ${p1} se ha descontado de tu carga y la transacción quedó asentada para el arqueo de cierre de jornada.`,
          target: 'sell-products-catalog',
          module: 'dist.sales',
          interaction: 'observe',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 5: GASTOS, RETORNOS Y CIERRE (Distributor, Warehouse, Admin, Owner, Accountant)
  // =========================================================================
  if (canView('dist.closure')) {
    plans.push({
      id: `tour-closure-${profile}`,
      trackId: 'closures',
      title: 'Gastos de Ruta, Retornos y Cierre',
      description: `Aprende a registrar gastos de combustible, declarar producto que regresa en el camión y conciliar el dinero.`,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'step-go-closure',
          title: 'Abrir Módulo de Cierre',
          explanation: `Pulsa en Cierre para revisar la liquidación de la jornada.`,
          target: 'nav-item-dist.closure',
          module: 'dist.closure',
          interaction: 'navigate',
          advancesOn: 'module',
          requiredActionHint: 'Pulsa Cierre en el menú para entrar.',
        },
        {
          id: 'step-closure-returns',
          title: 'Declaración de Retorno Físico',
          explanation: `Al regresar al almacén, el distribuidor anota cuántas unidades quedaron sin vender en el camión. Esto separa el producto que vuelve en buen estado de posibles faltantes o mermas.`,
          target: 'closure-returns-card',
          module: 'dist.closure',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Toca "Declarar retorno para almacén" para iniciar la recepción física.',
          missingMessage: 'Observa la sección de declaración física de retornos.',
        },
        {
          id: 'step-closure-reconciliation',
          title: 'Conciliación Física y Diferencias',
          explanation: `El sistema compara automáticamente: (Carga Inicial + Aumentos) - Ventas = Retorno Teórico. Si la cantidad física coincide, la caja y el stock quedan cuadrados. Si falta mercadería, se registra la diferencia.`,
          target: 'closure-physical-reconciliation',
          module: 'dist.closure',
          interaction: 'observe',
        },
        {
          id: 'step-closure-cash',
          title: 'Arqueo de Efectivo y Gastos',
          explanation: `Se calcula: Ventas en efectivo + Cobranzas de cartera - Gastos de ruta declarados = Efectivo esperado a entregar en caja central.`,
          target: 'closure-cash-reconciliation',
          module: 'dist.closure',
          interaction: 'observe',
        },
        {
          id: 'step-closure-submit',
          title: 'Cierre Definitivo de Jornada',
          explanation: `Una vez cuadrado el dinero y confirmado el retorno físico en almacén, se guarda el cierre inmutable, liberando la responsabilidad del distribuidor.`,
          target: 'closure-submit-btn',
          module: 'dist.closure',
          interaction: 'observe',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 6: ADMINISTRACIÓN & REPORTES (Admin, Owner, Accountant)
  // =========================================================================
  if (canView('dist.reports')) {
    plans.push({
      id: `tour-admin-${profile}`,
      trackId: 'admin',
      title: 'Supervisión, Créditos y Reportes',
      description: `Visualiza el balance consolidado, estado de cartera y exportación de reportes ejecutivos.`,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'step-go-reports',
          title: 'Abrir Reportes',
          explanation: `Pulsa en Reportes para consultar las métricas analíticas de ${meta.companyName}.`,
          target: 'nav-item-dist.reports',
          module: 'dist.reports',
          interaction: 'navigate',
          advancesOn: 'module',
          requiredActionHint: 'Pulsa Reportes en el menú.',
        },
        {
          id: 'step-reports-kpis',
          title: 'Análisis de Ventas por Período',
          explanation: `Filtra por jornada, semana o mes para analizar los ingresos brutos, márgenes brutos calculados y distribución de medios de pago.`,
          target: 'reports-summary-cards',
          module: 'dist.reports',
          interaction: 'observe',
          missingMessage: 'Observa las tarjetas de resumen analítico.',
        },
        {
          id: 'step-reports-export',
          title: 'Exportación a PDF y Excel',
          explanation: `Los reportes financieros, de inventario y de cobranzas pueden descargarse en formato Excel detallado o PDF listo para contabilidad y directorio.`,
          target: 'reports-export-actions',
          module: 'dist.reports',
          interaction: 'observe',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 7: SOPORTE TÉCNICO & CONFIGURACIÓN (Support, Admin, Owner)
  // =========================================================================
  if (canView('dist.support') || role === 'support') {
    plans.push({
      id: `tour-support-${profile}`,
      trackId: 'onboarding',
      title: 'Soporte técnico y terminales',
      description: 'Aprende a verificar la sincronización, el estado del tenant y la configuración de impresoras térmicas con permisos estrictos de soporte.',
      estimatedMinutes: 2,
      steps: [
        {
          id: 'step-support-overview',
          title: 'Aislamiento y Alcance de Soporte',
          explanation: `Como operador de soporte en ${meta.companyName}, tu acceso está estrictamente protegido: puedes diagnosticar terminales e impresoras sin exponer datos privados de ventas, clientes ni finanzas.`,
          target: 'support-security-card',
          module: 'dist.support',
          interaction: 'observe',
          missingMessage: 'Observa el panel de acceso técnico protegido.',
        },
        {
          id: 'step-support-printers',
          title: 'Impresoras Térmicas y Estaciones',
          explanation: 'Configura impresoras térmicas Bluetooth (58mm o 80mm) y conexión de red local (TCP/IP) para emitir notas de entrega en ruta o recibos de caja.',
          target: 'support-printers-btn',
          module: 'dist.support',
          interaction: 'action',
          advancesOn: 'click',
          requiredActionHint: 'Pulsa "Configurar y probar impresoras" para verificar el gestor de hardware.',
        },
        {
          id: 'step-support-diagnostics',
          title: 'Diagnóstico de Sincronización',
          explanation: `Verifica el estado de red y cola offline. Si un chofer se encuentra en una zona sin cobertura, las operaciones se guardan de forma inmutable y se sincronizan al recuperar señal.`,
          target: 'support-view-header',
          module: 'dist.support',
          interaction: 'observe',
        },
      ],
    })
  }

  return plans
}
