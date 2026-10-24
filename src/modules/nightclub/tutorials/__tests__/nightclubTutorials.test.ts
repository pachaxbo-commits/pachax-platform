// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
import { createNightclubTutorialPlans, createNightclubOrderTutorialSteps, getNightclubSafeResumeIndex, getNightclubTutorialProgressKey, getNightclubTutorialStatusLabel } from '../nightclubTutorials.ts'
import { calculateTutorialCardPlacement } from '../tutorialLayout.ts'

const all = ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'users', 'reports', 'members'] as const
const permissions = new Set(all.flatMap(module => [`${module}.view`, `${module}.create`, `${module}.edit`]))
const plans = (role: string, modules: readonly (typeof all[number])[] = all, safePractice = true) => createNightclubTutorialPlans({ role, modules, permissions, safePractice, allowRolePreview: true })

test('Administrador practica Ron compartido y Coca-Cola en Refrescos antes de Zonas, Usuarios y Caja', () => {
  const steps = plans('admin')[0].steps
  const ids = steps.map(step => step.id)
  assert.ok(steps.length >= 65, 'El recorrido enseña la jarra, la receta y los módulos posteriores')
  assert.equal(ids[0], 'dashboard-overview')
  assert.ok(ids.includes('inventory-ron-save') && ids.includes('inventory-coca-confirm-save'))
  assert.ok(ids.includes('inventory-coca-saved'))
  assert.ok(ids.includes('product-recipe-ron-quantity') && ids.includes('product-recipe-coca-quantity'))
  assert.ok(ids.includes('product-save') && ids.includes('product-saved-visible') && ids.includes('product-pos-availability') && ids.includes('product-recipe-consumption'))
  assert.ok(ids.indexOf('inventory-ron-save') < ids.indexOf('inventory-practice-intro'))
  assert.ok(ids.indexOf('inventory-practice-intro') < ids.indexOf('inventory-coca-new'))
  assert.ok(ids.indexOf('inventory-coca-confirm-save') < ids.indexOf('inventory-coca-saved'))
  assert.ok(ids.indexOf('inventory-coca-saved') < ids.indexOf('open-products'))
  assert.ok(ids.indexOf('open-products') < ids.indexOf('product-form'))
  assert.ok(ids.indexOf('product-save') < ids.indexOf('open-pos'))
  assert.ok(ids.indexOf('product-save') < ids.indexOf('product-saved-visible') && ids.indexOf('product-saved-visible') < ids.indexOf('open-pos'))
  assert.ok(ids.indexOf('open-floor') > ids.indexOf('product-recipe-consumption'))
  assert.ok(ids.indexOf('open-users') > ids.indexOf('open-floor'))
  assert.ok(ids.indexOf('open-cash') > ids.indexOf('open-bar'))
  assert.ok(ids.indexOf('open-users') > ids.indexOf('open-cash'))
  assert.ok(ids.indexOf('open-reports') > ids.indexOf('open-users'))
  assert.equal(steps.find(step => step.id === 'open-products')?.interaction, 'navigate')
  assert.equal(steps.find(step => step.id === 'open-products')?.target, 'nav-products')
  assert.match(steps.find(step => step.id === 'inventory-ron-bottle-off')?.explanation || '', /Bs 350/i)
  assert.match(steps.find(step => step.id === 'inventory-ron-pour-off')?.explanation || '', /vaso individual/i)
  assert.match(steps.find(step => step.id === 'inventory-practice-intro')?.explanation || '', /Aquí quedó guardado el ron/i)
  assert.match(steps.find(step => step.id === 'inventory-coca-category')?.explanation || '', /Refrescos/i)
  assert.match(steps.find(step => step.id === 'inventory-coca-presentation')?.explanation || '', /2 litros.*2000 ml/i)
  assert.match(steps.find(step => step.id === 'inventory-coca-cost')?.explanation || '', /botella de Coca-Cola de 2 litros.*Bs 40/i)
  assert.match(steps.find(step => step.id === 'inventory-coca-save')?.explanation || '', /jarra de 1 litro/i)
  assert.equal(steps.find(step => step.id === 'inventory-coca-jarra-measure')?.target, 'inventory-pour-measure')
  assert.equal(steps.find(step => step.id === 'inventory-coca-jarra-price')?.target, 'inventory-pour-price')
  assert.equal(steps.find(step => step.id === 'practice-sale-open')?.advancesOn, 'practice-account')
  assert.match(steps.find(step => step.id === 'product-recipe-ron-quantity')?.explanation || '', /descontará 50 ml/i)
  assert.match(steps.find(step => step.id === 'product-recipe-coca-quantity')?.explanation || '', /descontará 150 ml/i)
  assert.equal(steps[0].interaction, 'observe')
  assert.ok(ids.indexOf('open-floor') > ids.indexOf('open-products'))
  assert.ok(ids.includes('open-users') && ids.includes('open-cash') && ids.includes('open-reports'))
  assert.equal(steps.find(step => step.id === 'inventory-ron-name')?.advancesOn, 'enter')
  assert.equal(steps.find(step => step.id === 'inventory-ron-unit')?.target, 'inventory-bottle-cost')
  assert.notEqual(steps.find(step => step.id === 'inventory-ron-cost')?.optional, true)
  assert.equal(steps.find(step => step.id === 'product-form')?.interaction, 'draft')
})

test('reiniciar reconoce Ron y Coca-Cola existentes sin volver a cargar stock', () => {
  const existing = createNightclubTutorialPlans({
    role: 'admin', modules: all, permissions, safePractice: true, allowRolePreview: true,
    hasPracticeRon: true, practiceRonBottleEnabled: false, practiceRonBottlePrice: 0, practiceRonPourEnabled: false,
    hasPracticeCoca: true, practiceCocaLegacy: true, practiceCocaBottleEnabled: false, practiceCocaPourEnabled: false,
  })[0].steps
  assert.equal(existing.length, plans('admin')[0].steps.length)
  assert.equal(existing.find(step => step.id === 'inventory-ron-count')?.advancesOn, 'enter')
  assert.equal(existing.find(step => step.id === 'inventory-ron-content')?.advancesOn, 'enter')
  assert.equal(existing.find(step => step.id === 'inventory-ron-cost')?.interaction, 'draft')
  assert.equal(existing.find(step => step.id === 'inventory-ron-bottle-off')?.interaction, 'draft')
  assert.equal(existing.find(step => step.id === 'inventory-coca-quantity')?.advancesOn, 'enter')
  assert.equal(existing.find(step => step.id === 'inventory-coca-presentation')?.target, 'inventory-coca-legacy-unit')
  assert.equal(existing.some(step => step.id === 'inventory-coca-category' && step.target === 'inventory-category-kitchen'), false)
})

test('Mesero sigue Zonas, POS, pedido sin cobro y sus cuentas', () => {
  const waiter = plans('waiter')[0].steps
  assert.deepEqual(waiter.slice(0, 5).map(step => step.id), ['open-floor', 'waiter-floor', 'open-pos', 'waiter-destination', 'waiter-bar-mode'])
  assert.equal(waiter.find(step => step.id === 'waiter-open-bar')?.advancesOn, 'practice-account')
  assert.equal(waiter.find(step => step.id === 'waiter-product')?.advancesOn, 'draft')
  assert.equal(waiter.find(step => step.id === 'waiter-send')?.advancesOn, 'practice-round')
  assert.ok(waiter.some(step => step.id === 'waiter-accounts'))
  assert.equal(waiter.some(step => step.target === 'pos-quick-confirm'), false)
})

test('Cajero empieza en Caja y explica apertura, cobros, movimientos y arqueo sin ejecutar operaciones', () => {
  const steps = plans('cashier').find(plan => plan.id === 'cashier-shift')!.steps
  assert.equal(steps[0].id, 'open-cash')
  assert.deepEqual(steps.slice(1).map(step => step.id), ['cash-shift', 'cash-float', 'open-accounts', 'open-cash', 'cash-payment', 'cash-movements', 'cash-reconciliation'])
  assert.ok(steps.every(step => step.interaction === 'observe' || step.interaction === 'navigate'))
  const active = createNightclubTutorialPlans({ role: 'cashier', modules: all, permissions, safePractice: true, cashShiftOpen: true, cashPaymentAvailable: false })[0].steps
  assert.equal(active.find(step => step.id === 'cash-float')?.target, 'cash-shift-status')
  assert.equal(active.find(step => step.id === 'cash-payment')?.target, 'cash-shift-status')
  assert.equal(active.find(step => step.id === 'cash-reconciliation')?.target, 'cash-counted')
})

test('Barra puede preparar y marcar Listo en Demo, nunca Entregado', () => {
  const steps = createNightclubTutorialPlans({ role: 'bar', modules: ['bar'], permissions, safePractice: true, barRoundStatus: 'pending' })[0].steps
  assert.deepEqual(steps.map(step => step.id), ['open-bar', 'bar-prepare', 'bar-ready'])
  assert.equal(steps[1].interaction, 'demo-operation')
  assert.equal(steps.some(step => step.target === 'accounts-deliver'), false)
  const empty = createNightclubTutorialPlans({ role: 'bar', modules: ['bar'], permissions, safePractice: true })[0].steps
  assert.deepEqual(empty.map(step => step.id), ['open-bar', 'bar-empty'])
})

test('Socio conserva guía solo de lectura en las secciones permitidas', () => {
  const steps = plans('partner', ['dashboard', 'reports'], true)[0].steps
  assert.deepEqual(steps.map(step => step.module), ['dashboard', 'dashboard', 'reports', 'reports'])
  assert.ok(steps.every(step => step.interaction === 'navigate' || step.interaction === 'observe'))
})

test('Administrador puede elegir recorridos de otros roles cuando posee esos permisos', () => {
  const ids = plans('admin').map(plan => plan.id)
  assert.deepEqual(ids, ['admin-preparation', 'waiter-service', 'cashier-shift', 'bar-preparation', 'service-delivery', 'inventory-overview', 'supervisor-overview', 'promoter-overview', 'partner-supervision'])
})

test('Studio no ofrece recorridos de otros roles al administrador', () => {
  const studioPlans = createNightclubTutorialPlans({ role: 'admin', modules: all, permissions, safePractice: true, allowRolePreview: false })
  assert.deepEqual(studioPlans.map(plan => plan.id), ['admin-preparation'])
})

test('en tenant el recorrido de inventario y productos solo explica; no habilita formularios ni guardados', () => {
  const tenantPlans = createNightclubTutorialPlans({ role: 'admin', modules: all, permissions, safePractice: false, allowRolePreview: false })
  const practiceSteps = tenantPlans[0].steps.filter(step => step.module === 'inventory' || step.module === 'products')
  assert.ok(practiceSteps.length > 0)
  assert.ok(practiceSteps.every(step => step.interaction === 'observe' || step.interaction === 'navigate'))
  assert.equal(practiceSteps.some(step => step.interaction === 'demo-operation'), false)
})

test('una práctica ya enviada conserva la secuencia pero vuelve informativos los pasos de venta', () => {
  const fresh = plans('admin')[0].steps
  const repeated = createNightclubTutorialPlans({ role: 'admin', modules: all, permissions, safePractice: true, allowRolePreview: true, practiceSaleExists: true })[0].steps
  assert.deepEqual(repeated.map(step => step.id), fresh.map(step => step.id))
  assert.ok(repeated.filter(step => step.id.startsWith('practice-sale-')).every(step => step.interaction === 'observe'))
})

test('las guías no incluyen módulos sin permiso de lectura ni prácticas en tenant', () => {
  const restricted = createNightclubTutorialPlans({ role: 'admin', modules: ['dashboard', 'inventory'], permissions: new Set(['dashboard.view', 'inventory.view']), safePractice: false })
  assert.equal(restricted[0].steps.some(step => ['products', 'cash', 'users'].includes(step.module || '')), false)
  assert.equal(restricted.flatMap(plan => plan.steps).some(step => step.interaction === 'demo-operation'), false)
  const steps = createNightclubOrderTutorialSteps({ role: 'bar', modules: ['bar'], permissions: new Set(['bar.view', 'bar.edit']), safePractice: false })
  assert.ok(steps.every(step => step.interaction !== 'demo-operation'))
})

test('Servicio, Inventario, Supervisor y Relacionador reciben pasos de sus secciones autorizadas', () => {
  const examples = [
    { role: 'service', modules: ['accounts'] as const, ids: ['open-accounts', 'service-orders'] },
    { role: 'inventory', modules: ['inventory', 'products', 'history'] as const, ids: ['open-inventory', 'inventory-inventory', 'open-products', 'inventory-products'] },
    { role: 'supervisor', modules: ['dashboard', 'floor', 'accounts'] as const, ids: ['open-dashboard', 'supervisor-dashboard', 'open-floor', 'supervisor-floor'] },
    { role: 'promoter', modules: ['promoters', 'dashboard'] as const, ids: ['open-promoters', 'promoter-promoters', 'open-dashboard', 'promoter-dashboard'] },
  ]
  for (const example of examples) {
    const rolePermissions = new Set(example.modules.map(module => `${module}.view`))
    const steps = createNightclubTutorialPlans({ role: example.role, modules: example.modules, permissions: rolePermissions, safePractice: false })[0].steps
    assert.deepEqual(steps.slice(0, example.ids.length).map(step => step.id), example.ids)
    assert.ok(steps.every(step => step.interaction === 'navigate' || step.interaction === 'observe'))
  }
})

test('reanudar después de guardar recupera el registro y un formulario perdido vuelve a su inicio seguro', () => {
  const steps = plans('admin')[0].steps
  const index = (id: string) => steps.findIndex(step => step.id === id)
  assert.equal(getNightclubSafeResumeIndex(steps, index('inventory-ron-save'), { hasPracticeRon: true, targetPresent: false }), index('inventory-practice-intro'))
  assert.equal(getNightclubSafeResumeIndex(steps, index('inventory-coca-confirm-save'), { hasPracticeCoca: true, targetPresent: false }), index('inventory-coca-saved'))
  assert.equal(getNightclubSafeResumeIndex(steps, index('product-save'), { hasPracticeProduct: true, targetPresent: false }), index('product-saved-visible'))
  assert.equal(getNightclubSafeResumeIndex(steps, index('inventory-ron-content'), { targetPresent: false }), index('inventory-ron-new'))
  assert.equal(getNightclubSafeResumeIndex(steps, index('product-recipe-coca'), { targetPresent: false }), index('product-form'))
  assert.equal(getNightclubSafeResumeIndex(steps, index('practice-sale-open'), { hasPracticeAccount: true, targetPresent: false }), index('practice-sale-add'))
})

test('progreso se separa por usuario/entorno y por tutorial', () => {
  assert.notEqual(getNightclubTutorialProgressKey('demo:marco', 'waiter-service'), getNightclubTutorialProgressKey('demo:marco', 'cashier-shift'))
  assert.notEqual(getNightclubTutorialProgressKey('demo:marco', 'waiter-service'), getNightclubTutorialProgressKey('tenant:uid-1', 'waiter-service'))
})

test('los estados se presentan con etiquetas claras', () => {
  assert.equal(getNightclubTutorialStatusLabel('not_started'), 'No iniciado')
  assert.equal(getNightclubTutorialStatusLabel('in_progress'), 'En progreso')
  assert.equal(getNightclubTutorialStatusLabel('completed'), 'Completado')
  assert.equal(getNightclubTutorialStatusLabel('omitted'), 'Omitido')
})

test('la tarjeta se coloca fuera del objetivo y dentro del viewport en escritorio y móvil', () => {
  const layouts = [
    { target: { top: 300, left: 1120, width: 180, height: 48 }, viewport: { width: 1440, height: 900 } },
    { target: { top: 110, left: 12, width: 350, height: 52 }, viewport: { width: 390, height: 844 } },
  ]
  for (const { target, viewport } of layouts) {
    const card = calculateTutorialCardPlacement(target, viewport, { width: 360, height: 400 })
    const separate = card.left + card.width <= target.left || card.left >= target.left + target.width || card.top + card.maxHeight <= target.top || card.top >= target.top + target.height
    assert.equal(separate, true)
    assert.ok(card.left >= 0 && card.top >= 0 && card.left + card.width <= viewport.width && card.top + card.maxHeight <= viewport.height)
  }
})

test('la tarjeta evita el formulario entero y reserva un espacio superior cuando un diálogo ocupa el viewport móvil', () => {
  const target = { top: 420, left: 580, width: 220, height: 44 }
  const viewport = { width: 1440, height: 900 }
  const dialog = { top: 60, left: 430, width: 580, height: 780 }
  const desktop = calculateTutorialCardPlacement(target, viewport, { width: 360, height: 320 }, dialog)
  assert.ok(desktop.left + desktop.width <= dialog.left || desktop.left >= dialog.left + dialog.width)
  assert.ok(desktop.top + desktop.maxHeight <= viewport.height)

  const mobile = calculateTutorialCardPlacement({ top: 400, left: 16, width: 358, height: 44 }, { width: 390, height: 844 }, { width: 360, height: 320 }, { top: 14, left: 16, width: 358, height: 816 })
  assert.equal(mobile.side, 'above')
  assert.ok(mobile.maxHeight <= 180)
  assert.ok(mobile.top + mobile.maxHeight < 200)
})

test('la tarjeta no invade el objetivo cuando hay poca altura o una fila amplia', () => {
  for (const { target, viewport } of [
    { target: { top: 140, left: 300, width: 1000, height: 90 }, viewport: { width: 1440, height: 480 } },
    { target: { top: 110, left: 12, width: 366, height: 100 }, viewport: { width: 390, height: 360 } },
  ]) {
    const card = calculateTutorialCardPlacement(target, viewport, { width: 360, height: 390 })
    assert.ok(card.left >= 0 && card.top >= 0 && card.left + card.width <= viewport.width && card.top + card.maxHeight <= viewport.height)
    assert.ok(card.left + card.width <= target.left || card.left >= target.left + target.width || card.top + card.maxHeight <= target.top || card.top >= target.top + target.height)
  }
})
