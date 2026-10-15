import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('QA permitido solo en demo-pachax-platform.')
}
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const { executeRestaurantCommand } = require('./restaurant.cjs')

const suffix = Date.now().toString(36)
const tenantId = `rest_${suffix}`
const otherTenantId = `other_${suffix}`
const app = initializeApp({ projectId }, `restaurant-operations-${suffix}`)
const db = getFirestore(app)
const root = db.doc(`tenants/${tenantId}`)
const otherRoot = db.doc(`tenants/${otherTenantId}`)

const call = (uid, commandType, operationId, payload = {}, tId = tenantId) =>
  executeRestaurantCommand(db, {
    auth: { uid },
    data: { tenantId: tId, branchId: 'main', commandType, operationId, payload },
  })

const data = async path => (await root.collection(path.split('/')[0]).doc(path.split('/')[1]).get()).data()

try {
  console.log('--- Configurando tenants de prueba ---')
  const template = getTemplate('restaurant_pos')

  // Setup Tenant Principal (Restaurante)
  await root.set({ tenantId, businessType: 'restaurant_pos', configuration: template.defaults })
  for (const role of template.roles) {
    await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  }

  // Members: owner, admin, cashier, waiter, kitchen
  for (const [uid, roleId] of [
    ['owner_user', 'owner'],
    ['admin_user', 'admin'],
    ['cashier_user', 'cashier'],
    ['waiter_user', 'waiter'],
    ['kitchen_user', 'kitchen'],
  ]) {
    await root.collection('members').doc(uid).set({
      uid,
      tenantId,
      roleId,
      status: 'active',
      branchIds: ['main'],
    })
  }

  // Setup Other Tenant (Aislamiento)
  await otherRoot.set({ tenantId: otherTenantId, businessType: 'restaurant_pos', configuration: template.defaults })
  for (const role of template.roles) {
    await otherRoot.collection('roles').doc(role.id).set({ ...role, tenantId: otherTenantId })
  }
  await otherRoot.collection('members').doc('other_waiter').set({
    uid: 'other_waiter',
    tenantId: otherTenantId,
    roleId: 'waiter',
    status: 'active',
    branchIds: ['main'],
  })

  // 1. Verificar Rechazo de Turno Sin Permisos
  console.log('1. Validando permisos de inicio de turno...')
  await assert.rejects(
    () => call('waiter_user', 'openShift', 'shift-waiter-fail', { openingFloat: 100 }),
    err => err.code === 'permission-denied',
    'El mesero no debe poder abrir turno de caja'
  )

  // 2. Abrir Turno con Cajero
  console.log('2. Apertura de turno por cajero...')
  const shiftRes = await call('cashier_user', 'openShift', 'shift-op-1', { openingFloat: 150 })
  assert.ok(shiftRes.shiftId)
  assert.equal(shiftRes.openingFloat, 150)

  const activeShift = (await root.collection('restaurantOperationalState').doc('main').get()).data()
  assert.equal(activeShift.activeShiftId, shiftRes.shiftId)
  console.log('PASS Turno abierto correctamente en estado operativo.')

  // 2b. Intentar abrir segundo turno debe fallar
  await assert.rejects(
    () => call('cashier_user', 'openShift', 'shift-op-duplicate', { openingFloat: 100 }),
    err => err.code === 'failed-precondition',
    'No se puede abrir dos turnos simultáneos'
  )
  console.log('PASS Rechazo de múltiples turnos activos.')

  // 3. Crear Sector y Mesa vía FloorAction (Admin)
  console.log('3. Administrar plano con floorAction...')
  await assert.rejects(
    () => call('waiter_user', 'floorAction', 'floor-waiter-fail', { action: { type: 'sector.create', id: 'sec-main', name: 'Salón Principal' } }),
    err => err.code === 'permission-denied',
    'Mesero no puede configurar plano'
  )

  await call('admin_user', 'floorAction', 'floor-sec-1', {
    action: { type: 'sector.create', id: 'sec-main', name: 'Salón Principal' },
  })
  const secData = (await root.collection('restaurantSectors').doc('sec-main').get()).data()
  assert.equal(secData.name, 'Salón Principal')

  await call('admin_user', 'floorAction', 'floor-tbl-1', {
    action: { type: 'table.create', id: 'tbl-1', name: 'Mesa 1', sectorId: 'sec-main', capacity: 4, shape: 'square', active: true },
  })
  const tblData = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblData.name, 'Mesa 1')
  assert.equal(tblData.status, 'available')
  console.log('PASS Sector y mesa creados con validaciones y permisos.')

  // 4. Crear Producto
  await call('admin_user', 'saveProduct', 'prod-pizza-op', {
    product: {
      id: 'pizza-artesanal',
      name: 'Pizza Artesanal',
      price: 65,
      categoryId: 'cat-pizzas',
      preparationArea: 'Cocina',
    },
  })
  const prodData = (await root.collection('products').doc('pizza-artesanal').get()).data()
  assert.equal(prodData.price, 65)
  console.log('PASS Producto registrado en el catálogo del tenant.')

  // 5. Abrir Mesa (Mesero)
  console.log('5. Apertura de mesa...')
  const openRes = await call('waiter_user', 'openTableOrder', 'open-tbl-1', {
    tableId: 'tbl-1',
    diners: 3,
    customerName: 'Carlos Siles',
  })
  assert.ok(openRes.orderId)
  assert.equal(openRes.tableId, 'tbl-1')

  const updatedTbl = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(updatedTbl.status, 'occupied')
  assert.equal(updatedTbl.activeOrderId, openRes.orderId)

  // Intentar abrir la misma mesa nuevamente debe fallar
  await assert.rejects(
    () => call('waiter_user', 'openTableOrder', 'open-tbl-again', { tableId: 'tbl-1' }),
    err => err.code === 'aborted',
    'No se puede abrir una mesa ya ocupada'
  )
  console.log('PASS Mesa ocupada atómicamente y protegida contra aperturas duplicadas.')

  // 6. Añadir Producto a la Mesa
  console.log('6. Añadir productos a la comanda...')
  const addRes = await call('waiter_user', 'addProduct', 'add-items-1', {
    orderId: openRes.orderId,
    input: { productId: 'pizza-artesanal', quantity: 2, note: 'Sin orégano' },
  })
  assert.equal(addRes.total, 130)

  const orderAfterAdd = (await root.collection('restaurantOrders').doc(openRes.orderId).get()).data()
  assert.equal(orderAfterAdd.total, 130)
  assert.equal(orderAfterAdd.items.length, 1)
  assert.equal(orderAfterAdd.items[0].lineTotal, 130)
  console.log('PASS Productos agregados y totales recalculados.')

  // 7. Flujo KDS Cocina: pending -> preparing -> ready -> delivered
  console.log('7. Transiciones de estado KDS cocina...')
  const kds1 = await call('kitchen_user', 'advanceStatus', 'kds-prep', { orderId: openRes.orderId })
  assert.equal(kds1.status, 'preparing')

  const kds2 = await call('kitchen_user', 'advanceStatus', 'kds-ready', { orderId: openRes.orderId })
  assert.equal(kds2.status, 'ready')

  const kds3 = await call('waiter_user', 'advanceStatus', 'kds-delivered', { orderId: openRes.orderId })
  assert.equal(kds3.status, 'delivered')
  console.log('PASS Estados de preparación y entrega auditados correctamente.')

  // 8. Pedir Cuenta y Verificar Bloqueo de Cierre de Turno
  console.log('8. Pedido de cuenta y bloqueo de cierre con saldos pendientes...')
  await call('waiter_user', 'requestBill', 'req-bill-1', { tableId: 'tbl-1' })
  const tblBill = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblBill.status, 'bill_requested')

  // Intento de cerrar turno con cuenta pendiente debe fallar
  await assert.rejects(
    () => call('cashier_user', 'closeShift', 'close-premature', { countedCash: 280 }),
    err => err.code === 'failed-precondition',
    'No se puede cerrar turno con pedidos pendientes de cobro'
  )
  console.log('PASS Cierre de caja bloqueado correctamente ante cuentas por cobrar.')

  // 9. Cobro Atómico
  console.log('9. Liquidación y cobro de la cuenta...')
  const payRes = await call('cashier_user', 'recordPayment', 'pay-op-1', {
    orderId: openRes.orderId,
    method: 'cash',
    received: 150,
  })
  assert.equal(payRes.total, 130)
  assert.equal(payRes.change, 20)

  // Mesa debe liberarse automáticamente
  const tblFreed = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblFreed.status, 'available')
  assert.equal(tblFreed.activeOrderId, null)

  const paidOrder = (await root.collection('restaurantOrders').doc(openRes.orderId).get()).data()
  assert.equal(paidOrder.paymentStatus, 'paid')
  assert.equal(paidOrder.accountStatus, 'closed')
  console.log('PASS Cobro registrado, cambio calculado y mesa liberada.')

  // 10. Cerrar Turno
  console.log('10. Cierre y arqueo de turno...')
  // Fondo inicial 150 + Venta efectivo 130 = 280 efectivo esperado
  const closeRes = await call('cashier_user', 'closeShift', 'close-op-final', {
    countedCash: 280,
  })
  assert.equal(closeRes.expectedCash, 280)
  assert.equal(closeRes.difference, 0)

  const finalState = (await root.collection('restaurantOperationalState').doc('main').get()).data()
  assert.equal(finalState.activeShiftId, null)

  const closedShiftDoc = (await root.collection('restaurantShifts').doc(shiftRes.shiftId).get()).data()
  assert.equal(closedShiftDoc.status, 'closed')
  assert.equal(closedShiftDoc.reconciliationStatus, 'balanced')
  console.log('PASS Turno cerrado y conciliado con arqueo exacto.')

  // 11. Idempotencia y Resistencia a Reintentos
  console.log('11. Verificando idempotencia...')
  const retryRes = await call('cashier_user', 'closeShift', 'close-op-final', {
    countedCash: 280,
  })
  assert.equal(retryRes.expectedCash, 280)

  // Reintento con mismo ID pero payload distinto debe ser rechazado
  await assert.rejects(
    () => call('cashier_user', 'closeShift', 'close-op-final', { countedCash: 999 }),
    err => err.code === 'already-exists',
    'operationId con payload modificado debe ser rechazado'
  )
  console.log('PASS Idempotencia comprobada contra reintentos y mutaciones.')

  // 12. Aislamiento Multi-Tenant Estricto
  console.log('12. Verificando aislamiento multi-tenant...')
  // Usuario de Tenant B no puede ejecutar comandos en Tenant A
  await assert.rejects(
    () => call('other_waiter', 'openTableOrder', 'cross-tenant-op', { tableId: 'tbl-1' }, tenantId),
    err => err.code === 'permission-denied',
    'Usuario de otra empresa no puede interactuar con el tenant'
  )

  // Usuario no existente o sin membresía no puede interactuar
  await assert.rejects(
    () => call('hacker_user', 'openTableOrder', 'hack-op', { tableId: 'tbl-1' }, tenantId),
    err => err.code === 'permission-denied',
    'Usuario sin membresía activa es rechazado'
  )
  console.log('PASS Aislamiento tenant verificado: ningún cruce entre empresas ni roles externos.')

  console.log('\n==================================================')
  console.log('TODAS LAS PRUEBAS DE OPERACIONES RESTAURANTE PASARON')
  console.log('==================================================\n')
  process.exit(0)
} catch (error) {
  console.error('ERROR EN PRUEBAS:', error)
  process.exit(1)
}
