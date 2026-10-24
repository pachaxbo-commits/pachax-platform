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

const BUSINESS_TYPE = 'route_distribution'

export function getDistributionTutorialProgressKey(actorKey: string, profile: DistributionIndustryProfile, planId: string): string {
  return `tut_progress:${actorKey}:${profile}:${planId}`
}

export function loadTutorialProgress(actorKey: string, profile: DistributionIndustryProfile): Record<string, DistributionTutorialProgress> {
  const raw = getDemoItem(BUSINESS_TYPE, `progress_${actorKey}_${profile}`)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, DistributionTutorialProgress>
  } catch {
    return {}
  }
}

export function saveTutorialProgress(
  actorKey: string,
  profile: DistributionIndustryProfile,
  planId: string,
  progress: DistributionTutorialProgress
): void {
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
  // TRACK 1: PRIMEROS PASOS & IDENTIDAD (Disponible para todos los roles)
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
  // TRACK 2: INVENTARIO & ALMACÉN (Admin, Owner, Warehouse)
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
          module: 'dist.dashboard',
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
          interaction: 'observe',
        },
        {
          id: 'step-inventory-movements',
          title: 'Kardex y Trazabilidad de Movimientos',
          explanation: `Cada despacho a camión, venta en ruta o merma física queda auditado en el historial inmutable con fecha, usuario responsable y delta de stock correspondiente.`,
          target: 'inventory-movements-tab',
          module: 'dist.inventory',
          interaction: 'observe',
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
          module: 'dist.inventory',
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
          interaction: 'observe',
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
          module: 'dist.dashboard',
          interaction: 'navigate',
          advancesOn: 'module',
          requiredActionHint: 'Pulsa Ventas en la barra de navegación.',
        },
        {
          id: 'step-select-customer',
          title: `Paso 1: Seleccionar Cliente de la Ruta`,
          explanation: `El primer paso es elegir el negocio al que entregas la mercadería, por ejemplo "${c1}". El sistema vincula el cliente a la ruta asignada y verifica sus créditos pendientes.`,
          target: 'sell-customer-selector',
          module: 'dist.sales',
          interaction: 'observe',
          missingMessage: 'Observa el selector de clientes de la ruta.',
        },
        {
          id: 'step-select-products',
          title: `Paso 2: Elegir Producto (${meta.label})`,
          explanation: `Selecciona el producto a entregar, por ejemplo "${p1}". Cada toque suma la cantidad física vendida y valida contra el saldo cargado en tu camión para impedir sobreventas.`,
          target: 'sell-products-catalog',
          module: 'dist.sales',
          interaction: 'observe',
          missingMessage: 'Observa el catálogo de productos disponibles en ruta.',
        },
        {
          id: 'step-cart-summary',
          title: 'Paso 3: Revisar Carrito y Totales',
          explanation: `En el resumen de venta confirmas los ítems cargados, precios unitarios de lista o pactados, y el total a cobrar en moneda oficial.`,
          target: 'sell-cart-summary',
          module: 'dist.sales',
          interaction: 'observe',
        },
        {
          id: 'step-payment-methods',
          title: 'Paso 4: Efectivo, Pago QR o Crédito',
          explanation: `PACHAX permite liquidar la venta en Efectivo inmediato, Pago con QR validado, o Crédito comercial registrado en cuenta corriente si el cliente está habilitado.`,
          target: 'sell-payment-methods',
          module: 'dist.sales',
          interaction: 'observe',
        },
        {
          id: 'step-submit-sale',
          title: 'Paso 5: Confirmar y Emitir Comprobante',
          explanation: `Al confirmar la venta, se genera el comprobante de entrega oficial (térmico de 80 mm o digital) y se actualiza de inmediato el kardex offline del distribuidor.`,
          target: 'sell-confirm-btn',
          module: 'dist.sales',
          interaction: 'observe',
        },
      ],
    })
  }

  // =========================================================================
  // TRACK 5: GASTOS, RETORNOS Y CIERRE (Distributor, Warehouse, Admin, Owner)
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
          module: 'dist.sales',
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
          interaction: 'observe',
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
          module: 'dist.dashboard',
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

  return plans
}
