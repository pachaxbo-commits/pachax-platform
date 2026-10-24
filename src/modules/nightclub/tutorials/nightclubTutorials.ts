import type { NightclubModuleId } from '../domain/nightclubAccounts'

export type NightclubTutorialInteraction = 'navigate' | 'draft' | 'demo-operation' | 'observe'
export interface NightclubTutorialStep {
  id: string
  title: string
  explanation: string
  target?: string
  module?: NightclubModuleId
  interaction: NightclubTutorialInteraction
  advancesOn?: 'module' | 'click' | 'destination' | 'draft' | 'practice-draft' | 'practice-round' | 'round-preparing' | 'round-ready' | 'round-delivered' | 'input' | 'change' | 'enter' | 'select' | 'practice-ron' | 'practice-coca' | 'practice-product' | 'practice-account'
  optional?: boolean
  missingMessage?: string
}
export interface NightclubTutorialPlanOptions { role: string; modules: readonly NightclubModuleId[]; permissions: ReadonlySet<string>; safePractice: boolean; allowRolePreview?: boolean; practiceSaleExists?: boolean; hasPracticeAccount?: boolean; hasPracticeRon?: boolean; practiceRonBottleEnabled?: boolean; practiceRonBottlePrice?: number; practiceRonPourEnabled?: boolean; hasPracticeCoca?: boolean; practiceCocaLegacy?: boolean; practiceCocaBottleEnabled?: boolean; practiceCocaPourEnabled?: boolean; cashShiftOpen?: boolean; cashPaymentAvailable?: boolean; barRoundStatus?: string }
export interface NightclubTutorialPlan { id: string; title: string; description: string; steps: NightclubTutorialStep[] }

const labels: Partial<Record<NightclubModuleId, string>> = { dashboard: 'Inicio', floor: 'Zonas y Mesas', pos: 'POS', accounts: 'Cuentas', bar: 'Barra', inventory: 'Inventario', products: 'Productos', cash: 'Caja', history: 'Historial', customers: 'Clientes', promoters: 'Relacionadores', members: 'Socios', users: 'Usuarios', reports: 'Reportes', settings: 'Configuración' }
export function getNightclubTutorialProgressKey(actorKey: string, tutorialId: string): string { return `${actorKey}::${tutorialId}` }

export function createNightclubTutorialPlans(options: NightclubTutorialPlanOptions): NightclubTutorialPlan[] {
  const { role, modules, permissions, safePractice } = options
  const canView = (module: NightclubModuleId) => modules.includes(module) && permissions.has(`${module}.view`)
  const can = (module: NightclubModuleId, action: 'create' | 'edit') => canView(module) && permissions.has(`${module}.${action}`)
  const make = (id: string, title: string, description: string, steps: NightclubTutorialStep[]): NightclubTutorialPlan => ({ id, title, description, steps })
  const nav = (module: NightclubModuleId, explanation: string): NightclubTutorialStep => ({ id: `open-${module}`, title: labels[module] || module, explanation, target: `nav-${module}`, module, interaction: 'navigate', advancesOn: 'module' })
  const observe = (id: string, title: string, explanation: string, module: NightclubModuleId, target: string): NightclubTutorialStep => ({ id, title, explanation, module, target, interaction: 'observe' })
  const action = (id: string, title: string, explanation: string, module: NightclubModuleId, target: string, allowed: boolean, advance?: NightclubTutorialStep['advancesOn']): NightclubTutorialStep => ({ id, title, explanation, module, target, interaction: safePractice && allowed ? 'demo-operation' : 'observe', advancesOn: safePractice && allowed ? advance : undefined })
  const plans: NightclubTutorialPlan[] = []

  if (role === 'admin' || role === 'owner') {
    const steps: NightclubTutorialStep[] = []
    if (canView('dashboard')) steps.push({ id: 'dashboard-overview', title: 'Panel principal', explanation: 'El Inicio resume la actividad actual y da acceso a las secciones habilitadas. Revisa sus indicadores y continúa hacia la preparación del negocio.', module: 'dashboard', interaction: 'observe' })
    if (canView('inventory')) {
      steps.push(nav('inventory', 'En Inventario guardamos lo que compramos para el negocio. Pulsa Inventario para entrar.'))
      if (can('inventory', 'create')) {
        steps.push({ id: 'inventory-ron-new', title: 'Abrir el registro del ron', explanation: 'Pulsa Nuevo producto de inventario. Después elegiremos Licores. Si el Ron de esta práctica ya existe, se abrirá el mismo registro para editarlo, sin sumar existencias.', module: 'inventory', target: 'inventory-new-item', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'inventory-ron-category', title: 'Elegir Licores', explanation: 'Pulsa Licores para registrar Ron. Si ya guardaste el Ron de práctica, se recupera por su identificador y se conserva su stock.', module: 'inventory', target: 'inventory-category-spirits', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'inventory-ron-name', title: 'Escribir el nombre', explanation: 'Escribe Ron. Es el mismo inventario que venderás en botella y usarás en recetas. Pulsa Enter; todavía no se guarda.', module: 'inventory', target: 'inventory-bottle-name', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-ron-count', title: 'Anotar las botellas', explanation: options.hasPracticeRon ? 'Aquí ves cuántas botellas cerradas quedan. Conserva el número y pulsa Enter; cámbialo solo si de verdad corriges tu inventario de práctica.' : 'Aquí pones cuántas botellas completas tienes guardadas. Para esta práctica, escribe 10 y pulsa Enter.', module: 'inventory', target: 'inventory-bottle-count', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-ron-content', title: 'Cuánto trae una botella', explanation: options.hasPracticeRon ? 'Este número dice cuánto trae cada botella. Comprueba 750 ml y pulsa Enter; puedes corregirlo si hace falta.' : 'Aquí escribes cuánto líquido trae cada botella. Pon 750 ml y pulsa Enter; la receta usará solo una parte.', module: 'inventory', target: 'inventory-bottle-capacity', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-ron-unit', title: 'Costo de compra por botella', explanation: options.hasPracticeRon ? 'Aquí está lo que pagaste por cada botella de ron. Revisa el dato y pulsa Enter.' : 'Escribe el precio al que compraste cada botella de ron. Para esta práctica, usa Bs 80. No es el precio de venta.', module: 'inventory', target: 'inventory-bottle-cost', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-ron-cost', title: 'Vender una botella completa', explanation: options.practiceRonBottleEnabled ? 'La presentación Botella ya está activa. Comprueba que quede habilitada.' : 'Marca Botella. Esta presentación venderá una botella cerrada del mismo stock que usa la receta.', module: 'inventory', target: 'inventory-sell-bottle', interaction: options.practiceRonBottleEnabled ? 'observe' : 'draft', advancesOn: options.practiceRonBottleEnabled ? undefined : 'click' })
        steps.push({ id: 'inventory-ron-bottle-off', title: 'Precio de la botella', explanation: options.practiceRonBottleEnabled && options.practiceRonBottlePrice === 350 ? 'Aquí está lo que pagará el cliente por una botella completa: Bs 350. Pulsa Enter para conservarlo.' : 'Escribe Bs 350. Este es el precio que pagará el cliente por una botella completa.', module: 'inventory', target: 'inventory-bottle-price', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-ron-pour-off', title: 'No vender el vaso de ron solo', explanation: options.practiceRonPourEnabled ? 'Quita la marca de Vaso. En este ejercicio el Ron se vende como botella o se utiliza para preparar la bebida con Coca-Cola.' : 'Vaso individual queda desactivado. Más adelante crearemos el vaso de ron con Coca-Cola como producto separado.', module: 'inventory', target: 'inventory-sell-pour', interaction: options.practiceRonPourEnabled ? 'draft' : 'observe', advancesOn: options.practiceRonPourEnabled ? 'click' : undefined })
        steps.push({ id: 'inventory-ron-save', title: 'Guardar el ron', explanation: 'Revisa los datos y pulsa Guardar. Al terminar, te mostraré el registro real en Inventario.', module: 'inventory', target: 'inventory-save', interaction: safePractice ? 'demo-operation' : 'observe', advancesOn: safePractice ? 'practice-ron' : undefined })
        steps.push({ id: 'inventory-practice-intro', title: 'Ron guardado en Inventario', explanation: '¡Muy bien! Aquí quedó guardado el ron. Inventario muestra lo que compraste y lo que queda.', module: 'inventory', target: 'inventory-practice-ron', interaction: 'observe' })
        steps.push({ id: 'inventory-coca-new', title: 'Registrar Coca-Cola', explanation: 'Pulsa Nuevo producto de inventario. La Coca-Cola se registra en Refrescos y se usará como ingrediente por mililitros.', module: 'inventory', target: 'inventory-new-item', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'inventory-coca-category', title: 'Elegir Refrescos', explanation: 'Pulsa Refrescos. Aquí se anotan gaseosas como Coca-Cola. Si la práctica ya existe como ingrediente en ml, se actualizará el mismo registro y se conservará su stock.', module: 'inventory', target: 'inventory-category-soft-drinks', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'inventory-coca-name', title: 'Escribir Coca-Cola', explanation: 'Escribe Coca-Cola. Si ya tienes la práctica anterior, renombraremos el mismo insumo; no crearemos otra copia.', module: 'inventory', target: options.practiceCocaLegacy ? 'inventory-simple-name' : 'inventory-bottle-name', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-coca-quantity', title: 'Anotar las botellas', explanation: options.hasPracticeCoca ? 'Aquí ves cuánta Coca-Cola queda. Conserva el número y pulsa Enter; cámbialo solo si corriges el inventario de práctica.' : 'Aquí pones cuántas botellas completas tienes. Para practicar, escribe 1 y pulsa Enter.', module: 'inventory', target: options.practiceCocaLegacy ? 'inventory-simple-quantity' : 'inventory-bottle-count', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-coca-presentation', title: options.practiceCocaLegacy ? 'Conservar la unidad en ml' : 'Contenido de cada botella', explanation: options.practiceCocaLegacy ? 'Este insumo ya está medido en mililitros. Conserva esta unidad y sus existencias; las recetas pueden utilizarlo directamente.' : options.hasPracticeCoca ? 'Aquí ves cuánto trae cada botella de Coca-Cola. Conserva 2 L y pulsa Enter.' : 'Escribe 2 y deja L seleccionado. Cada botella contiene 2 litros, es decir, 2000 ml para las recetas.', module: 'inventory', target: options.practiceCocaLegacy ? 'inventory-coca-legacy-unit' : 'inventory-bottle-capacity', interaction: options.practiceCocaLegacy ? 'observe' : 'draft', advancesOn: options.practiceCocaLegacy ? undefined : 'enter' })
        steps.push({ id: 'inventory-coca-cost', title: 'Costo de compra', explanation: options.hasPracticeCoca ? 'Aquí ves lo que pagaste por Coca-Cola. Revisa el dato y pulsa Enter; no es un precio de venta.' : 'Escribe el precio al que compraste cada botella de Coca-Cola de 2 litros. Para esta práctica, usa Bs 40.', module: 'inventory', target: options.practiceCocaLegacy ? 'inventory-simple-cost' : 'inventory-bottle-cost', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-coca-save', title: 'Vender Coca-Cola en jarra', explanation: options.practiceCocaPourEnabled ? 'La Jarra ya está activa. Esta presentación comparte la misma Coca-Cola de Inventario que usará la receta. Pulsa Continuar.' : 'Marca Jarra. Así podrás vender Coca-Cola sola sin crear otro inventario; una jarra de 1 litro consumirá 1000 ml.', module: 'inventory', target: options.practiceCocaLegacy ? 'inventory-simple-jarra' : 'inventory-sell-pour', interaction: options.practiceCocaPourEnabled ? 'observe' : 'draft', advancesOn: options.practiceCocaPourEnabled ? undefined : 'click' })
        steps.push({ id: 'inventory-coca-jarra-measure', title: 'Medida de la jarra', explanation: 'Una jarra lleva 1 litro. Escribe 1000 ml y pulsa Enter. Cada venta descontará esa cantidad de la misma Coca-Cola que usa la receta.', module: 'inventory', target: 'inventory-pour-measure', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-coca-jarra-price', title: 'Precio de venta de la jarra', explanation: 'Escribe cuánto cobrarías por una jarra. Elige un precio ficticio mayor que cero para esta práctica; es distinto del costo de compra.', module: 'inventory', target: 'inventory-pour-price', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'inventory-coca-confirm-save', title: 'Guardar Coca-Cola', explanation: 'Pulsa Guardar para registrar o actualizar el insumo. El tutorial esperará a que el sistema confirme el guardado.', module: 'inventory', target: 'inventory-save', interaction: safePractice ? 'demo-operation' : 'observe', advancesOn: safePractice ? 'practice-coca' : undefined })
        steps.push(observe('inventory-coca-saved', 'Coca-Cola guardada en Inventario', 'Aquí quedó guardada la Coca-Cola. Su jarra usa 1000 ml y la receta usará 150 ml del mismo inventario.', 'inventory', 'inventory-practice-coca'))
      }
    }
    if (canView('products')) {
      steps.push(nav('products', 'Ya anotamos el ron y la Coca-Cola. Ahora sí crearemos la bebida que venderemos. Pulsa Productos en el menú para entrar.'))
      if (can('products', 'create')) {
        steps.push({ id: 'product-form', title: 'Crear la bebida vendible', explanation: 'Inventario guarda lo que compraste. Productos muestra lo que el cliente puede pedir. Pulsa Nuevo producto para crear el vaso.', module: 'products', target: 'products-new', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'product-name', title: 'Ponerle nombre', explanation: 'Escribe “Vaso de ron con Coca-Cola — Práctica”. Este sí será el nombre de la bebida que podrá aparecer en POS. Enter solo continúa.', module: 'products', target: 'product-name', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'product-price', title: 'Poner un precio de venta', explanation: 'Este es el dinero que pagará el cliente por el vaso. No es lo que costaron las botellas. Escribe un precio ficticio mayor que cero para la práctica.', module: 'products', target: 'product-price', interaction: 'draft', advancesOn: 'enter' })
        steps.push({ id: 'product-inventory-mode', title: 'Activar receta', explanation: 'Una receta dice qué ingredientes lleva el vaso. Pulsa Producto preparado / receta; aquí todavía no se descuenta nada.', module: 'products', target: 'product-mode-recipe', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'product-add-ingredient', title: 'Agregar ingredientes', explanation: 'Agrega una línea para cada insumo. La receta utilizará el ron y la Coca-Cola de práctica guardados anteriormente.', module: 'products', target: 'product-recipe-add', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'product-recipe-ron', title: 'Vincular ron', explanation: 'Elige Ron de práctica en la primera línea de receta. El selector muestra existencias guardadas, no crea ingredientes.', module: 'products', target: 'product-recipe-ron', interaction: 'draft', advancesOn: 'select' })
        steps.push({ id: 'product-recipe-ron-quantity', title: 'Cuánto ron lleva', explanation: 'Un vaso de esta práctica lleva 50 ml de ron. Escribe 50. Cuando envíes un pedido de este vaso, el sistema descontará 50 ml del inventario.', module: 'products', target: 'product-recipe-ron-quantity', interaction: 'draft', advancesOn: 'enter' })
        steps.push(observe('product-recipe-ron-unit', 'Unidad del ron', 'El selector ofrece ml, L y botella. Al elegir Ron, el formulario propone ml automáticamente; puedes verificarlo aquí.', 'products', 'product-recipe-ron-unit'))
        steps.push({ id: 'product-add-coca', title: 'Agregar otra línea', explanation: 'Agrega una segunda línea para la Coca-Cola. La receta puede tener varios insumos existentes.', module: 'products', target: 'product-recipe-add', interaction: 'draft', advancesOn: 'click' })
        steps.push({ id: 'product-recipe-coca', title: 'Vincular Coca-Cola', explanation: 'Elige Coca-Cola de práctica en la segunda línea.', module: 'products', target: 'product-recipe-coca', interaction: 'draft', advancesOn: 'select' })
        steps.push({ id: 'product-recipe-coca-quantity', title: 'Cuánta Coca-Cola lleva', explanation: 'Un vaso lleva 150 ml de Coca-Cola. Escribe 150. Cuando envíes un pedido, el sistema descontará 150 ml de este ingrediente.', module: 'products', target: 'product-recipe-coca-quantity', interaction: 'draft', advancesOn: 'enter' })
        steps.push(observe('product-recipe-coca-unit', 'Unidad de Coca-Cola', 'El formulario propone ml para la existencia medida de Coca-Cola. Verifica que la cantidad y la unidad correspondan.', 'products', 'product-recipe-coca-unit'))
        steps.push({ id: 'product-save', title: 'Guardar la bebida', explanation: 'Revisa el nombre, el precio y los dos ingredientes. Pulsa Guardar producto cuando quieras. Solo se guarda cuando tú pulsas el botón; la práctica no crea copias al repetirla.', module: 'products', target: 'product-save', interaction: safePractice ? 'demo-operation' : 'observe', advancesOn: safePractice ? 'practice-product' : undefined })
        steps.push(observe('product-saved-visible', 'Bebida guardada en Productos', 'Aquí quedó creado el vaso. Este producto usa la receta; Ron y Coca-Cola siguen siendo ingredientes del Inventario.', 'products', 'products-practice-card'))
        steps.push(nav('pos', 'La bebida ya está creada. Pulsa POS en el menú para comprobar que aparece para vender.'))
        steps.push(observe('product-pos-availability', 'Disponibilidad en POS', 'Comprueba que aparece “Vaso de ron con Coca-Cola — Práctica”. La existencia calculada depende de los ml disponibles y la receta; mirar el producto no descuenta stock.', 'pos', 'pos-practice-product'))
        const practiceSaleStep = (id: string, title: string, explanation: string, existingExplanation: string, target: string, advance: NightclubTutorialStep['advancesOn']) => options.practiceSaleExists
          ? { id, title, explanation: existingExplanation, module: 'pos' as const, target, interaction: 'observe' as const }
          : action(id, title, explanation, 'pos', target, can('pos', 'create'), advance)
        steps.push(practiceSaleStep('practice-sale-mode', 'Preparar una venta de práctica', 'En Demo puedes enviar una ronda local para verificar el consumo real. No se cobra ni se ejecuta nada automáticamente; en un tenant este paso es solo explicativo.', 'La venta de práctica ya existe. No abras otra cuenta; continúa para revisar el inventario resultante.', 'pos-destination-mode-bar', 'click'))
        steps.push(options.hasPracticeAccount && !options.practiceSaleExists
          ? observe('practice-sale-open', 'Pedido de práctica abierto', 'La cuenta de barra de esta práctica ya está abierta. No crees otra; continúa con el producto.', 'pos', 'pos-destination')
          : practiceSaleStep('practice-sale-open', 'Abrir pedido de práctica', 'Pulsa Abrir pedido en barra una sola vez. Avanzaremos cuando el pedido se haya creado de verdad.', 'Ya existe un pedido local de esta práctica. No abras otra cuenta.', 'pos-destination-bar-open', 'practice-account'))
        steps.push(practiceSaleStep('practice-sale-add', 'Añadir el producto al borrador', '¡Aquí está la bebida que creaste! Pulsa la tarjeta. Avanzaremos cuando aparezca en el borrador; todavía no se cobra.', 'La ronda de práctica ya fue enviada. No agregues otra unidad.', 'pos-practice-product', 'practice-draft'))
        steps.push(practiceSaleStep('practice-sale-send', 'Enviar ronda de práctica', 'Al pulsar Enviar ronda en Demo, se registra un pedido pendiente y se descuentan los ingredientes. Esto no cobra ni registra pago. Si no deseas modificar el Demo, sal del tutorial.', 'La ronda de práctica ya está registrada. No se enviará una segunda vez.', 'pos-send', 'practice-round'))
        steps.push(nav('inventory', 'El pedido de práctica ya salió. Pulsa Inventario para ver cuánto queda de cada ingrediente.'))
        steps.push(observe('inventory-practice-ron-stock', 'Existencias del ron', 'Comprueba botellas cerradas y ml de botella abierta. Enviar la ronda consume 50 ml; no se registra un pago desde esta guía.', 'inventory', 'inventory-practice-ron'))
        steps.push(observe('inventory-practice-coca-stock', 'Existencias de Coca-Cola', 'Comprueba la cantidad actual en mililitros. Enviar la ronda consume 150 ml de Coca-Cola de práctica.', 'inventory', 'inventory-practice-coca'))
        steps.push(observe('product-recipe-consumption', 'Cuándo se descuenta inventario', 'La lógica actual descuenta los ingredientes al enviar la ronda, antes del pago. El pago posterior no vuelve a descontarlos. La anulación revierte existencias simples, pero hoy no restaura automáticamente los ml de botellas abiertas; confirma ese caso con administración antes de anular.', 'inventory', 'inventory-practice-ron'))
      }
    }
    const overview = (module: NightclubModuleId, invitation: string, title: string, explanation: string) => {
      if (!canView(module)) return
      steps.push(nav(module, invitation))
      steps.push(observe(`admin-${module}-overview`, title, explanation, module, `section-${module}`))
    }
    overview('floor', 'Pulsa Zonas para ver el mapa de mesas.', 'Zonas y mesas', 'Aquí ves dónde se sienta cada grupo y si una mesa está libre, ocupada o reservada. Abrir una cuenta exige una acción tuya.')
    overview('accounts', 'Pulsa Cuentas para revisar pedidos y cobros pendientes.', 'Cuentas', 'Cada cuenta reúne sus rondas y pagos. Enviar una ronda no significa cobrarla; Caja registra los pagos cuando corresponda.')
    overview('bar', 'Pulsa Barra para seguir la preparación.', 'Preparación en Barra', 'Barra recibe pedidos, los prepara y los marca Listo. Servicio o el mesero confirma la entrega física; Barra no la marca Entregada.')
    overview('cash', 'Pulsa Caja para consultar el turno y los cobros.', 'Caja y turnos', 'Aquí se abre el turno con un fondo inicial, se registran cobros y movimientos, y se compara el efectivo contado antes de cerrar. Esta guía no ejecuta operaciones financieras.')
    if (canView('cash')) {
      steps.push(observe('admin-cash-movements', 'Entradas y salidas', 'Una entrada suma efectivo; una salida o gasto lo resta. Revisa el motivo y el método antes de guardar un movimiento.', 'cash', 'cash-movements'))
      steps.push(observe('admin-cash-reconciliation', 'Arqueo del turno', 'Al cerrar, cuenta el dinero físico y compáralo con el esperado. Un faltante impide el cierre; un sobrante queda registrado como diferencia.', 'cash', 'cash-counted'))
    }
    overview('history', 'Pulsa Historial para consultar operaciones anteriores.', 'Historial', 'Aquí puedes revisar pedidos y cobros ya registrados. Los filtros ayudan a encontrar una jornada sin modificarla.')
    overview('customers', 'Pulsa Clientes para consultar las fichas.', 'Clientes', 'La ficha reúne datos, cumpleaños, consumos pagados e incidentes según tus permisos. No atribuyas compras anónimas a un cliente.')
    overview('promoters', 'Pulsa Relacionadores para ver su trabajo.', 'Relacionadores', 'Aquí se registran entradas, reservas de espacios y consumos administrativos. Las reservas no generan cobros de Caja por sí solas.')
    overview('members', 'Pulsa Socios para revisar cupos y cortesías.', 'Socios y cortesías', 'Aquí ves los beneficios de cada socio y las cortesías de su período. Registrar una cortesía es una operación distinta de cobrar una venta.')
    overview('users', 'Pulsa Usuarios para ver al personal.', 'Usuarios y comisiones', 'Aquí se consulta el personal, sus roles y las comisiones de meseros por ventas pagadas. Cambiar permisos requiere autorización administrativa.')
    overview('reports', 'Pulsa Reportes para ver los resultados.', 'Reportes', 'Aquí aparecen ventas cobradas, métodos de pago, productos y existencias. Usa los períodos para comparar sin cambiar operaciones.')
    overview('settings', 'Pulsa Configuración para revisar el negocio.', 'Configuración y permisos', 'Aquí se preparan datos del negocio, cajas, zonas y plantillas de permisos. Revisa cada cambio antes de guardarlo.')
    plans.push(make('admin-preparation', 'Administración y preparación', 'Configuración del negocio, operación y supervisión.', steps))
  }

  if (role === 'waiter' && canView('pos')) {
    const steps: NightclubTutorialStep[] = []
    if (canView('floor')) { steps.push(nav('floor', 'Pulsa Zonas para ver mesas libres, ocupadas o reservadas.')); steps.push(observe('waiter-floor', 'Mesas y zonas', 'Cada mesa tiene un estado. Elige una libre cuando atiendas a un grupo; no uses la cuenta de otra mesa.', 'floor', 'section-floor')) }
    steps.push(nav('pos', 'Pulsa POS para preparar un pedido. Enviar una ronda no la cobra automáticamente.'))
    steps.push(observe('waiter-destination', 'Destino del pedido', 'Aquí eliges Mesa o Pedido en barra. El cliente puede cambiar en cada ronda; también puedes dejarla sin cliente asociado.', 'pos', 'pos-destination'))
    if (can('pos', 'create')) {
      steps.push(action('waiter-bar-mode', 'Pedido en barra', 'Para practicar sin ocupar una mesa, pulsa Pedido en barra.', 'pos', 'pos-destination-mode-bar', true, 'click'))
      steps.push(options.hasPracticeAccount
        ? observe('waiter-open-bar', 'Pedido ya abierto', 'Ya abriste un pedido de práctica. El tutorial lo conserva para que no se duplique. Continúa para ver cómo se añade un producto.', 'pos', 'pos-destination')
        : action('waiter-open-bar', 'Abrir pedido', 'Pulsa una vez. La cuenta se abrirá solo si el sistema confirma la acción.', 'pos', 'pos-destination-bar-open', true, 'practice-account'))
      steps.push(options.practiceSaleExists
        ? observe('waiter-product', 'Producto del pedido', 'La bebida de práctica ya fue enviada en una ronda. Puedes verla en POS y en la cuenta; repetir esta guía no añade otra compra.', 'pos', 'pos-product')
        : action('waiter-product', 'Añadir un producto', 'Pulsa un producto disponible. Verás su cantidad en el borrador; aún no hay cobro.', 'pos', 'pos-product', true, 'draft'))
      steps.push(observe('waiter-review', 'Revisar la ronda', options.practiceSaleExists ? 'En la cuenta puedes revisar qué producto se envió, su cantidad y su cliente. Una nueva ronda se prepara desde POS.' : 'Antes de enviar, revisa producto, cantidad, destino y cliente asociado. Puedes ajustar el borrador.', 'pos', options.practiceSaleExists ? 'pos-destination' : 'pos-send'))
      steps.push(options.practiceSaleExists
        ? observe('waiter-send', 'Ronda ya enviada', 'La ronda de práctica ya está en la cuenta. No la enviaré otra vez ni volveré a descontar inventario.', 'pos', 'pos-destination')
        : action('waiter-send', 'Enviar la ronda', 'En Demo, pulsa Enviar ronda si quieres registrar el pedido de práctica. Esto no cobra; en empresa real esta guía solo explica el botón.', 'pos', 'pos-send', true, 'practice-round'))
    }
    if (canView('accounts')) { steps.push(nav('accounts', 'Pulsa Cuentas para ver el pedido y su estado.')); steps.push(observe('waiter-accounts', 'Seguir el pedido', 'Aquí ves rondas pendientes, listas y entregadas. Solo confirma Entregado después de llevar el pedido al cliente y si tienes permiso.', 'accounts', 'section-accounts')) }
    if (canView('history')) steps.push(nav('history', 'Historial permite consultar los pedidos que tus permisos muestran.'))
    plans.push(make('waiter-service', 'Atención de mesas y pedidos', 'Mesas, pedidos, rondas y entrega autorizada.', steps))
  }

  if (role === 'service' && canView('accounts')) {
    const steps: NightclubTutorialStep[] = [nav('accounts', 'Pulsa Cuentas para ver los pedidos autorizados.')]
    steps.push(observe('service-orders', 'Pedidos para entregar', 'Espera a que Barra marque Listo. Recoge el pedido y confirma Entregado solo después de llevarlo al cliente.', 'accounts', 'section-accounts'))
    if (canView('bar')) { steps.push(nav('bar', 'Barra muestra qué pedidos están en preparación y cuáles están listos.')); steps.push(observe('service-bar', 'Listo no significa Entregado', 'Barra confirma que terminó de preparar. La entrega física se confirma por Servicio o Mesero autorizado.', 'bar', 'section-bar')) }
    plans.push(make('service-delivery', 'Entrega de pedidos', 'Pedidos listos y entrega física autorizada.', steps))
  }

  if (role === 'cashier' && canView('cash')) {
    const steps: NightclubTutorialStep[] = [nav('cash', 'Caja concentra turnos, cobros, movimientos y arqueo.')]
    steps.push(observe('cash-shift', 'Estado del turno', 'Comprueba si hay un turno activo. No se abrirá ni cerrará caja desde el tutorial.', 'cash', 'cash-shift-status'))
    steps.push(observe('cash-float', 'Fondo inicial', options.cashShiftOpen ? 'El turno ya está abierto. Su fondo inicial quedó registrado al abrirlo; el tutorial no lo modifica.' : 'Aquí se indica el fondo inicial antes de abrir el turno. El tutorial no inicia caja por ti.', 'cash', options.cashShiftOpen ? 'cash-shift-status' : 'cash-opening-float'))
    if (canView('accounts')) steps.push(nav('accounts', 'Consulta cuentas que solicitaron cobro y su saldo pendiente.'))
    if (canView('accounts')) steps.push(nav('cash', 'Vuelve a Caja para conocer el registro de pagos.'))
    steps.push(observe('cash-payment', 'Cobros y métodos', options.cashPaymentAvailable ? 'Este botón abre el registro de pago de una cuenta que solicitó cobro. Revisa importe y método antes de confirmar; el tutorial no cobra.' : 'Cuando una cuenta solicite cobro, aquí aparecerá Registrar pago. Ahora no hay un saldo solicitado; el tutorial no genera un cobro ficticio.', 'cash', options.cashPaymentAvailable ? 'cash-register-payment' : 'cash-shift-status'))
    steps.push(observe('cash-movements', 'Movimientos', 'Las entradas y salidas se registran de forma explícita y afectan el efectivo esperado. Solo están disponibles con un turno abierto.', 'cash', options.cashShiftOpen ? 'cash-movements' : 'cash-shift-status'))
    steps.push(observe('cash-reconciliation', 'Arqueo y cierre', 'Compara efectivo contado y esperado. El tutorial no registra arqueos ni cierra turnos; esta acción aparece con un turno abierto.', 'cash', options.cashShiftOpen ? 'cash-counted' : 'cash-shift-status'))
    plans.push(make('cashier-shift', 'Caja y cobros', 'Turnos, cobros, movimientos y conciliación.', steps))
  }

  if (role === 'bar' && canView('bar')) {
    const steps: NightclubTutorialStep[] = [nav('bar', 'La cola muestra pedidos autorizados para preparar; los productos directos no ingresan a Barra.')]
    if (options.barRoundStatus === 'pending') steps.push(action('bar-prepare', 'Preparación', 'Este pedido está pendiente. Pulsa Iniciar preparación cuando comiences a prepararlo. En empresa real esta guía solo explica la acción.', 'bar', 'bar-prepare', can('bar', 'edit'), 'round-preparing'))
    if (options.barRoundStatus === 'pending' || options.barRoundStatus === 'preparing') steps.push(action('bar-ready', 'Marcar Listo', 'Marca Listo cuando terminaste para que Servicio o un mesero pueda recoger el pedido. Barra no marca Entregado.', 'bar', 'bar-ready', can('bar', 'edit'), 'round-ready'))
    if (!options.barRoundStatus || options.barRoundStatus === 'ready') steps.push(observe('bar-empty', 'Cola de preparación', 'Cuando llegue un pedido pendiente, aquí verás productos, cantidades y el botón para comenzar. Un pedido Listo espera a Servicio; no crearé otro pedido ficticio.', 'bar', 'section-bar'))
    plans.push(make('bar-preparation', 'Preparación en Barra', 'Pedidos entrantes, preparación y entrega al mesero.', steps))
  }

  if (role === 'partner') {
    const steps: NightclubTutorialStep[] = []
    for (const module of modules) if (canView(module)) {
      steps.push(nav(module, `Pulsa ${labels[module]} para consultar sus datos. Este perfil no modifica operaciones.`))
      steps.push(observe(`partner-${module}`, `${labels[module]} en lectura`, `Aquí puedes revisar ${labels[module]} según tus permisos. No se crean, editan ni eliminan registros desde esta guía.`, module, `section-${module}`))
    }
    plans.push(make('partner-supervision', 'Supervisión del socio', 'Indicadores, información y reportes en modo lectura.', steps))
  }

  if (role === 'supervisor' || role === 'inventory' || role === 'promoter') {
    const steps: NightclubTutorialStep[] = []
    const relevant: NightclubModuleId[] = role === 'supervisor' ? ['dashboard', 'floor', 'accounts', 'bar', 'cash', 'history', 'customers', 'reports'] : role === 'inventory' ? ['inventory', 'products', 'history'] : ['promoters', 'dashboard']
    const explanations: Partial<Record<NightclubModuleId, string>> = {
      dashboard: 'Inicio resume únicamente los datos que tu usuario puede consultar.', floor: 'Las mesas muestran si están libres, ocupadas o reservadas.', accounts: 'Cada cuenta conserva sus rondas, pagos y estado de entrega.', bar: 'Barra prepara y marca Listo; otro personal autorizado confirma Entregado.', cash: 'Caja muestra turno, pagos y diferencias según tus permisos. Esta guía no registra cobros.', history: 'Historial permite revisar operaciones previas sin cambiarlas.', customers: 'Las fichas e incidentes se consultan solo si tu permiso lo permite.', reports: 'Los filtros ayudan a leer los resultados del período.', inventory: 'Inventario muestra insumos, existencias y movimientos. Corrige cantidades solo cuando corresponda a un conteo real.', products: 'Productos muestra lo que se vende; una receta conecta cada producto con sus ingredientes.', promoters: 'Relacionadores reúne entradas, lounges y sus estadísticas sin crear cobros automáticos.',
    }
    for (const module of relevant) if (canView(module)) {
      steps.push(nav(module, `Pulsa ${labels[module]} para conocer esta sección.`))
      steps.push(observe(`${role}-${module}`, labels[module] || module, explanations[module] || 'Consulta esta sección según tus permisos.', module, `section-${module}`))
    }
    if (steps.length) plans.push(make(`${role}-overview`, role === 'inventory' ? 'Control de inventario' : role === 'promoter' ? 'Trabajo de relacionadores' : 'Supervisión operativa', 'Recorrido por las secciones autorizadas.', steps))
  }

  // In tenant mode the administrator walkthrough explains these forms without allowing edits or saves.
  if ((role === 'admin' || role === 'owner') && !safePractice) {
    const adminPlan = plans.find(plan => plan.id === 'admin-preparation')
    for (const step of adminPlan?.steps || []) {
      if ((step.module === 'inventory' || step.module === 'products') && (step.interaction === 'draft' || step.interaction === 'demo-operation')) {
        step.interaction = 'observe'
        step.advancesOn = undefined
      }
    }
  }

  if (!plans.length) {
    const steps = modules.filter(canView).flatMap(module => [nav(module, `Pulsa ${labels[module]} para conocer esta sección.`), observe(`role-${module}`, labels[module] || module, 'Consulta los datos y usa únicamente las acciones permitidas a tu usuario.', module, `section-${module}`)])
    if (steps.length) plans.push(make('role-overview', 'Recorrido de tus secciones', 'Guía según las secciones autorizadas para tu perfil.', steps))
  }
  const available = plans.filter(plan => plan.steps.length > 0)
  if (role === 'admin' && options.allowRolePreview) {
    for (const alternateRole of ['waiter', 'cashier', 'bar', 'service', 'inventory', 'supervisor', 'promoter', 'partner']) {
      available.push(...createNightclubTutorialPlans({ ...options, role: alternateRole }))
    }
  }
  return available
}

export function createNightclubOrderTutorialSteps(options: NightclubTutorialPlanOptions): NightclubTutorialStep[] {
  return createNightclubTutorialPlans(options)[0]?.steps || []
}
export function getNightclubSafeResumeIndex(steps: readonly NightclubTutorialStep[], requested: number, state: { hasPracticeRon?: boolean; hasPracticeCoca?: boolean; hasPracticeProduct?: boolean; hasPracticeAccount?: boolean; practiceSaleExists?: boolean; targetPresent: boolean }): number {
  const index = Math.min(Math.max(0, requested), Math.max(steps.length - 1, 0))
  const step = steps[index]
  if (!step) return 0
  if ((step.id === 'inventory-ron-save' && state.hasPracticeRon)
    || (step.id === 'inventory-coca-confirm-save' && state.hasPracticeCoca)
    || (step.id === 'product-save' && state.hasPracticeProduct)
    || (step.id === 'practice-sale-send' && state.practiceSaleExists)
    || (step.id === 'practice-sale-open' && state.hasPracticeAccount)) return Math.min(index + 1, steps.length - 1)
  if (state.targetPresent || step.interaction === 'navigate' || step.interaction === 'observe') return index
  const startId = step.id.startsWith('inventory-ron-') ? 'inventory-ron-new' : step.id.startsWith('inventory-coca-') ? 'inventory-coca-new' : step.id.startsWith('product-') ? 'product-form' : step.id.startsWith('practice-sale-') ? 'practice-sale-mode' : ''
  const startIndex = steps.findIndex(candidate => candidate.id === startId)
  return startIndex >= 0 ? startIndex : index
}
export type NightclubTutorialStatus = 'not_started' | 'in_progress' | 'completed' | 'omitted'
export interface NightclubTutorialProgress { status: NightclubTutorialStatus; stepIndex: number; skippedRequired?: boolean }
export function getNightclubTutorialStatusLabel(status: NightclubTutorialStatus): string { return ({ not_started: 'No iniciado', in_progress: 'En progreso', completed: 'Completado', omitted: 'Omitido' })[status] }
