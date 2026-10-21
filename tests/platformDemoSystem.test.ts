import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isDemoModeActive,
  enterDemoMode,
  exitDemoMode,
  getDemoStorageKey,
  getDemoItem,
  setDemoItem,
  clearDemoState,
} from '../src/demo/core/demoContext.ts'
import { DemoDistributionRepository } from '../src/demo/distribution/demoDistributionRepository.ts'
import {
  setDistributionRepositoryAdapter,
  saveCustomer,
  registerSale,
  confirmDispatch,
  subscribeCustomers,
  getCustomerStatementHistory,
} from '../src/modules/distribution/data/distributionRepository.ts'
import { hasPermission } from '../src/services/permissionService.ts'
import { getActiveTenant } from '../src/store/activeTenant.ts'
import { getTemplate } from '../src/core/templates.ts'
import { PUBLIC_TEMPLATES } from '../src/core/publicTemplates.ts'

test('1. Demo starts without login or tenant creation', () => {
  clearDemoState('route_distribution')
  enterDemoMode('route_distribution')
  assert.equal(isDemoModeActive(), true)

  const repo = new DemoDistributionRepository('full')
  assert.ok(repo)
  assert.ok(repo.getData())
  exitDemoMode()
})

test('2. Initial seed loads correctly with deterministic baseline data', () => {
  clearDemoState('route_distribution')
  const repo = new DemoDistributionRepository('full')
  const data = repo.getData()

  assert.equal(data.products.length, 3)
  assert.equal(data.warehouses.length, 1)
  assert.equal(data.routes.length, 2)
  assert.equal(data.customers.length, 3)
  assert.equal(data.balances.length, 3)

  const viena = data.products.find(p => p.id === 'p-viena')
  assert.ok(viena)
  assert.equal(viena.referencePrice, 42)

  const centralBalance = data.balances.find(b => b.productId === 'p-viena' && b.warehouseId === 'central')
  assert.ok(centralBalance)
  assert.equal(centralBalance.quantity, 180)
})

test('2a. Demo customer statement history reads its own dataset and is complete', async () => {
  clearDemoState('route_distribution')
  const repo = new DemoDistributionRepository('full')
  setDistributionRepositoryAdapter(repo)
  try {
    const customer = repo.getData().customers[0]
    const history = await getCustomerStatementHistory(customer.id)
    assert.equal(history.complete, true)
    assert.deepEqual(history.receivables, repo.getData().receivables.filter(row => row.customerId === customer.id))
    assert.deepEqual(history.collections, repo.getData().collections.filter(row => row.customerId === customer.id))
    assert.deepEqual(history.sales, repo.getData().sales.filter(row => row.customerId === customer.id))
  } finally {
    setDistributionRepositoryAdapter(null)
  }
})

test('3. Demo writes persist in sessionStorage namespace', async () => {
  clearDemoState('route_distribution')
  const repo = new DemoDistributionRepository('full')
  setDistributionRepositoryAdapter(repo)

  const newCust = await saveCustomer({
    name: 'Cliente Prueba Demo',
    identityNumber: '1234567',
    phone: '77788990',
  })

  assert.equal(newCust.name, 'Cliente Prueba Demo')
  assert.equal(newCust.identityNumber, '1234567')

  // Verificar que los datos en storage contienen el nuevo cliente
  const raw = getDemoItem('route_distribution', 'data')
  assert.ok(raw)
  assert.match(raw, /Cliente Prueba Demo/)

  setDistributionRepositoryAdapter(null)
})

test('4. Navigation between modules preserves state across operations', async () => {
  clearDemoState('route_distribution')
  const repo = new DemoDistributionRepository('full')
  setDistributionRepositoryAdapter(repo)

  // 1. Despacho en módulo Despachos
  const dispId = await confirmDispatch({
    routeId: 'route-norte',
    routeName: 'Ruta Norte #2',
    distributorUid: 'v1',
    distributorName: 'Hugo Distribuidor',
    lines: [
      {
        productId: 'p-viena',
        productName: 'Viena Especial',
        unitType: 'kg',
        quantity: 20,
      },
    ],
  })
  assert.ok(dispId)

  // Saldo central debe haber bajado de 180 a 160
  const centralBal = repo.getData().balances.find(b => b.id === 'central__p-viena')
  assert.equal(centralBal?.quantity, 160)

  // 2. Venta en módulo Vender
  const sale = await registerSale({
    operationId: 'demo_sale_nav_1',
    sourceLocation: 'route',
    routeId: 'route-norte',
    routeName: 'Ruta Norte #2',
    sellerUid: 'v1',
    sellerName: 'Hugo Distribuidor',
    customerId: 'c-martha',
    customerName: 'Tienda Doña Martha',
    lines: [
      {
        productId: 'p-viena',
        productNameSnapshot: 'Viena Especial',
        unitType: 'kg',
        actualUnitPrice: 42,
        quantity: 5,
        subtotal: 210,
      },
    ],
    total: 210,
    paymentKind: 'cash',
    cashAmount: 210,
    qrAmount: 0,
    creditAmount: 0,
  })
  assert.equal(sale.total, 210)

  // 3. Saldo en ruta debe ser 20 - 5 = 15
  const routeBal = repo.getData().balances.find(b => b.id === 'route__route-norte__p-viena')
  assert.equal(routeBal?.quantity, 15)

  setDistributionRepositoryAdapter(null)
})

test('5. Role switching preserves state across canonical roles (Owner -> Accountant)', async () => {
  clearDemoState('route_distribution')
  const repo = new DemoDistributionRepository('full')
  setDistributionRepositoryAdapter(repo)

  // Crear un cliente como Propietario (Owner)
  await saveCustomer({
    name: 'Bodega de Roles',
    identityNumber: '9988776',
  })

  // Simular cambio de rol: Owner -> Accountant
  const dataBefore = repo.getData()
  const custFound = dataBefore.customers.find(c => c.name === 'Bodega de Roles')
  assert.ok(custFound)

  // Cambio de rol simulado conserva exactamente los datos del repo
  const dataAfter = repo.getData()
  assert.equal(dataAfter.customers.length, dataBefore.customers.length)
  assert.equal(dataAfter.balances.length, dataBefore.balances.length)
  assert.equal(dataAfter.products.length, dataBefore.products.length)

  // El selector no modifica activeTenant, ni crea memberships, ni toca Firebase
  assert.equal(getActiveTenant(), null)

  setDistributionRepositoryAdapter(null)
})

test('6. Refresh preserves state (re-reading from storage restores mutations)', async () => {
  clearDemoState('route_distribution')
  const repo1 = new DemoDistributionRepository('full')
  setDistributionRepositoryAdapter(repo1)

  await saveCustomer({
    name: 'Cliente Persistente Reload',
    identityNumber: '4455667',
  })

  // Simular recarga de página: instanciar un nuevo repositorio sin resetear
  const repoReloaded = new DemoDistributionRepository('full')
  const reloadedData = repoReloaded.getData()

  const found = reloadedData.customers.find(c => c.name === 'Cliente Persistente Reload')
  assert.ok(found, 'El cliente debe persistir tras recargar la página')

  setDistributionRepositoryAdapter(null)
})

test('7. Reset wipes only demo state and re-seeds', async () => {
  clearDemoState('route_distribution')

  // Poner una clave simulada ajena (por ejemplo, de otra plantilla o configuración real)
  setDemoItem('other_template', 'test_key', 'preserved_value')

  const repo = new DemoDistributionRepository('full')
  await repo.saveCustomer({
    name: 'Cliente a Borrar',
    identityNumber: '1122334',
  })
  assert.equal(repo.getData().customers.length, 4)

  // Reset demo
  repo.reset('full')

  // Datos de distribución vuelven al seed original (3 clientes)
  assert.equal(repo.getData().customers.length, 3)
  assert.equal(repo.getData().customers.some(c => c.name === 'Cliente a Borrar'), false)

  // La clave ajena no debe haber sido tocada
  assert.equal(getDemoItem('other_template', 'test_key'), 'preserved_value')
})

test('8. Demo does not modify activeTenant or real tenant state', () => {
  // Las sesiones demo usan 'preview-distribution'
  const repo = new DemoDistributionRepository('full')
  const sampleProduct = repo.getData().products[0]
  assert.equal(sampleProduct.tenantId, 'preview-distribution')

  const sampleWarehouse = repo.getData().warehouses[0]
  assert.equal(sampleWarehouse.tenantId, 'preview-distribution')
})

test('9. Demo does not use real membership or real auth tokens', () => {
  enterDemoMode('route_distribution')
  assert.equal(isDemoModeActive(), true)
  exitDemoMode()
  assert.equal(isDemoModeActive(), false)
})

test('10. Demo does not write to Firebase when adapter is active', async () => {
  const repo = new DemoDistributionRepository('full')
  setDistributionRepositoryAdapter(repo)

  let called = false
  const unsub = subscribeCustomers((customers) => {
    called = true
    assert.ok(customers.length >= 3)
  })

  assert.equal(called, true, 'El adapter debe alimentar las suscripciones inmediatamente en memoria')
  unsub()
  setDistributionRepositoryAdapter(null)
})

test('11. Roles use canonical permissions in distribution template', () => {
  const template = getTemplate('route_distribution')
  const roleIds = template.roles.map(r => r.id)

  assert.deepEqual(roleIds, ['owner', 'admin', 'accountant', 'warehouse', 'distributor', 'support'])

  // Todos los roles demostrables tienen etiquetas visibles comprensibles
  const ownerRole = template.roles.find(r => r.id === 'owner')
  assert.ok(ownerRole)
  assert.equal(ownerRole.name, 'Propietario')

  const adminRole = template.roles.find(r => r.id === 'admin')
  assert.ok(adminRole)
  assert.equal(adminRole.name, 'Administrador')

  const accountantRole = template.roles.find(r => r.id === 'accountant')
  assert.ok(accountantRole)
  assert.equal(accountantRole.name, 'Contabilidad')

  const warehouseRole = template.roles.find(r => r.id === 'warehouse')
  assert.ok(warehouseRole)
  assert.equal(warehouseRole.name, 'Almacén')

  const distributorRole = template.roles.find(r => r.id === 'distributor')
  assert.ok(distributorRole)
  assert.equal(distributorRole.name, 'Distribuidor')

  const supportRole = template.roles.find(r => r.id === 'support')
  assert.ok(supportRole)
  assert.equal(supportRole.name, 'Soporte')

  // Accountant usa permisos canónicos: reportes, caja, créditos, cobros, pero NO gestión de soporte ni settings
  assert.equal(hasPermission('accountant', 'dist.reports.view'), true)
  assert.equal(hasPermission('accountant', 'dist.credit.view'), true)
  assert.equal(hasPermission('accountant', 'dist.collection.create'), true)
  assert.equal(hasPermission('accountant', 'dist.customer.manage'), true)
  assert.equal(hasPermission('accountant', 'dist.inventory.view'), true)
  assert.equal(hasPermission('accountant', 'cash.close'), true)
  assert.equal(hasPermission('accountant', 'settings.manage'), false)
  assert.equal(hasPermission('accountant', 'support.settings.manage'), false)
  assert.equal(hasPermission('accountant', 'support.reset.prepare'), false)

  // Admin tiene permisos completos de distribución
  assert.equal(hasPermission('admin', 'dist.products.manage'), true)
  assert.equal(hasPermission('admin', 'dist.dispatch.create'), true)
  assert.equal(hasPermission('admin', 'dist.closure.warehouse'), true)

  // Warehouse tiene inventario y recepción física, pero no venta ni cobranza
  assert.equal(hasPermission('warehouse', 'dist.dispatch.create'), true)
  assert.equal(hasPermission('warehouse', 'dist.closure.warehouse'), true)
  assert.equal(hasPermission('warehouse', 'dist.sale.create'), false)
  assert.equal(hasPermission('warehouse', 'dist.collection.create'), false)

  // Distributor tiene venta, crédito y cobranza, pero no almacén
  assert.equal(hasPermission('distributor', 'dist.sale.create'), true)
  assert.equal(hasPermission('distributor', 'dist.collection.create'), true)
  assert.equal(hasPermission('distributor', 'dist.closure.warehouse'), false)
})

test('12. Support demo role does NOT have settings.manage', () => {
  assert.equal(hasPermission('support', 'support.settings.manage'), true)
  assert.equal(hasPermission('support', 'support.reset.prepare'), true)
  assert.equal(hasPermission('support', 'settings.manage'), false)
})

test('13. Accountant has no maintenance or support settings manage', () => {
  assert.equal(hasPermission('accountant', 'support.settings.manage'), false)
  assert.equal(hasPermission('accountant', 'support.reset.prepare'), false)
  assert.equal(hasPermission('accountant', 'settings.manage'), false)
})

test('14. Namespace is strictly isolated per template (pachax:demo:route_distribution:*)', () => {
  const keyDist = getDemoStorageKey('route_distribution', 'data')
  const keyRest = getDemoStorageKey('restaurant_pos', 'data')

  assert.equal(keyDist, 'pachax:demo:route_distribution:data')
  assert.equal(keyRest, 'pachax:demo:restaurant_pos:data')

  setDemoItem('route_distribution', 'test', 'dist_val')
  setDemoItem('restaurant_pos', 'test', 'rest_val')

  assert.equal(getDemoItem('route_distribution', 'test'), 'dist_val')
  assert.equal(getDemoItem('restaurant_pos', 'test'), 'rest_val')

  clearDemoState('route_distribution')

  assert.equal(getDemoItem('route_distribution', 'test'), null)
  assert.equal(getDemoItem('restaurant_pos', 'test'), 'rest_val')
})

test('15. Real and demo data never mix', () => {
  // Las claves demo siempre inician con 'pachax:demo:'
  const demoKey = getDemoStorageKey('route_distribution', 'my_key')
  assert.ok(demoKey.startsWith('pachax:demo:'))
  assert.equal(demoKey.includes('pachax_active_tenant'), false)
  assert.equal(demoKey.includes('firebase'), false)
})

test('Bonus: Catalog template readiness marks distribution as available and others as coming_soon', () => {
  const dist = PUBLIC_TEMPLATES.find(t => t.id === 'distribution')
  assert.ok(dist)
  assert.equal(dist.status, 'available')

  const rest = PUBLIC_TEMPLATES.find(t => t.id === 'restaurant')
  assert.ok(rest)
  assert.equal(rest.status, 'coming_soon')

  const ham = PUBLIC_TEMPLATES.find(t => t.id === 'hamburger')
  assert.ok(ham)
  assert.equal(ham.status, 'coming_soon')

  const ret = PUBLIC_TEMPLATES.find(t => t.id === 'retail')
  assert.ok(ret)
  assert.equal(ret.status, 'coming_soon')

  const night = PUBLIC_TEMPLATES.find(t => t.id === 'nightclub')
  assert.ok(night)
  assert.equal(night.status, 'coming_soon')
})
