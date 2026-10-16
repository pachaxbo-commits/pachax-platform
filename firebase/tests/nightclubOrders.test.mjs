import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('QA permitido solo en demo-pachax-platform.')
}
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const { executeNightclubCommand } = require('./nightclub.cjs')

const suffix = Date.now().toString(36)
const tenantId = `orders_${suffix}`
const otherTenantId = `other_${suffix}`
const app = initializeApp({ projectId }, `nightclub-orders-${suffix}`)
const db = getFirestore(app)
const root = db.doc(`tenants/${tenantId}`)
const otherRoot = db.doc(`tenants/${otherTenantId}`)

const call = (uid, commandType, operationId, payload = {}, tId = tenantId, bId = 'main') =>
  executeNightclubCommand(db, {
    auth: { uid },
    data: { tenantId: tId, branchId: bId, commandType, operationId, payload },
  })

const data = async path => (await root.collection(path.split('/')[0]).doc(path.split('/')[1]).get()).data()

try {
  const template = getTemplate('nightclub_lounge')

  // Setup main tenant
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) {
    await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  }
  for (const [uid, roleId] of [
    ['waiter', 'waiter'],
    ['service', 'service'],
    ['bar', 'bar'],
    ['cashier', 'cashier'],
    ['admin', 'admin'],
  ]) {
    await root.collection('members').doc(uid).set({
      uid,
      tenantId,
      roleId,
      status: 'active',
      branchIds: ['main'],
    })
  }

  // Setup other tenant for negative testing
  await otherRoot.set({ tenantId: otherTenantId, businessType: 'restaurant_pos', configuration: template.defaults })
  await otherRoot.collection('members').doc('intruder').set({
    uid: 'intruder',
    tenantId: otherTenantId,
    roleId: 'admin',
    status: 'active',
    branchIds: ['main'],
  })

  console.log('=== TEST 1: FLUJO CANÓNICO MESA VIP1 (Bs 62) ===')
  // 1. Abrir Turno con Bs 200
  const shiftOp = await call('cashier', 'openShift', 'shift-op-1', { openingFloat: 200 })
  const shiftId = shiftOp.shiftId
  assert.ok(shiftId)
  assert.equal((await data(`nightclubShifts/${shiftId}`)).openingFloat, 200)
  assert.equal((await data(`nightclubShifts/${shiftId}`)).status, 'open')

  // Configurar Mesa VIP1, Cerveza (Barra) y Agua (Directo)
  await root.collection('nightclubTables').doc('VIP1').set({ id: 'VIP1', branchId: 'main', name: 'Mesa VIP1', status: 'available' })
  await root.collection('nightclubProducts').doc('cerveza').set({
    id: 'cerveza',
    branchId: 'main',
    name: 'Cerveza',
    price: 25,
    active: true,
    preparationArea: 'Barra',
    recipe: [{ inventoryId: 'inv-cerveza', quantity: 1 }],
  })
  await root.collection('nightclubProducts').doc('agua').set({
    id: 'agua',
    branchId: 'main',
    name: 'Agua',
    price: 12,
    active: true,
    preparationArea: 'Directo',
    recipe: [{ inventoryId: 'inv-agua', quantity: 1 }],
  })
  await root.collection('nightclubInventory').doc('inv-cerveza').set({ id: 'inv-cerveza', branchId: 'main', name: 'Cerveza', current: 50 })
  await root.collection('nightclubInventory').doc('inv-agua').set({ id: 'inv-agua', branchId: 'main', name: 'Agua', current: 30 })

  // 2. Abrir Cuenta Mesa VIP1
  const openAcc = await call('waiter', 'openAccount', 'acc-vip1-op', { target: { type: 'table', tableId: 'VIP1' } })
  const accountId = openAcc.accountId
  assert.ok(accountId)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).status, 'open')
  assert.equal((await data('nightclubTables/VIP1')).status, 'occupied')
  assert.equal((await data('nightclubTables/VIP1')).activeAccountId, accountId)

  // 3. Añadir Ronda sin exigir pago inmediato (2 Cerveza × Bs25 + 1 Agua × Bs12 = Bs62)
  const roundDraft = [
    { productId: 'cerveza', quantity: 2 },
    { productId: 'agua', quantity: 1 },
  ]
  const addRoundRes = await call('waiter', 'addRound', 'round-vip1-1', {
    accountId,
    items: roundDraft,
  })
  assert.equal(addRoundRes.total, 62)
  assert.equal(addRoundRes.status, 'pending') // has Cerveza for Barra
  const roundId = addRoundRes.roundId

  // Validar inventario descontado: Cerveza 50 -> 48, Agua 30 -> 29
  assert.equal((await data('nightclubInventory/inv-cerveza')).current, 48)
  assert.equal((await data('nightclubInventory/inv-agua')).current, 29)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).subtotal, 62)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).balance, 62)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).paidTotal, 0)

  // Validar movimientos de inventario registrados
  assert.equal((await data(`nightclubInventoryMovements/round-vip1-1_inv-cerveza`)).quantity, -2)
  assert.equal((await data(`nightclubInventoryMovements/round-vip1-1_inv-agua`)).quantity, -1)

  // Validar que repetir operationId es idempotente y no descuenta inventario dos veces
  const repeatedAddRound = await call('waiter', 'addRound', 'round-vip1-1', {
    accountId,
    items: roundDraft,
  })
  assert.deepEqual(repeatedAddRound, addRoundRes)
  assert.equal((await data('nightclubInventory/inv-cerveza')).current, 48)
  assert.equal((await data('nightclubInventory/inv-agua')).current, 29)

  // 4. Barra prepara: Pendiente -> Preparando -> Listo
  const prep = await call('bar', 'advanceRound', 'prep-op-1', { accountId, roundId })
  assert.equal(prep.status, 'preparing')
  assert.equal((await data(`nightclubRounds/${roundId}`)).status, 'preparing')

  const ready = await call('bar', 'advanceRound', 'ready-op-1', { accountId, roundId })
  assert.equal(ready.status, 'ready')
  assert.equal((await data(`nightclubRounds/${roundId}`)).status, 'ready')

  // 5. Servicio entrega: Listo -> Entregado
  const delivered = await call('service', 'deliverRound', 'deliv-op-1', { accountId, roundId })
  assert.equal(delivered.status, 'delivered')
  assert.equal((await data(`nightclubRounds/${roundId}`)).status, 'delivered')

  // 6. Solicitar cobro
  const billReq = await call('waiter', 'requestBill', 'req-bill-1', { accountId })
  assert.equal(billReq.status, 'bill_requested')
  assert.equal((await data(`nightclubAccounts/${accountId}`)).status, 'bill_requested')
  assert.equal((await data('nightclubTables/VIP1')).status, 'bill_requested')

  // 7. Pagos parciales en Caja:
  // Pago 1: Efectivo 40 (recibido 50, cambio 10)
  const pay1 = await call('cashier', 'recordPayment', 'pay-op-1', {
    accountId,
    amount: 40,
    method: 'cash',
    received: 50,
  })
  assert.equal(pay1.amount, 40)
  assert.equal(pay1.balance, 22)
  assert.equal((await data(`nightclubPayments/${pay1.paymentId}`)).cashAmount, 40)
  assert.equal((await data(`nightclubPayments/${pay1.paymentId}`)).change, 10)
  assert.equal((await data(`nightclubCashMovements/cash_pay-op-1`)).amount, 40)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).paidTotal, 40)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).balance, 22)

  // Pago 2: QR 22
  const pay2 = await call('cashier', 'recordPayment', 'pay-op-2', {
    accountId,
    amount: 22,
    method: 'qr',
  })
  assert.equal(pay2.amount, 22)
  assert.equal(pay2.balance, 0)
  assert.equal((await data(`nightclubPayments/${pay2.paymentId}`)).qrAmount, 22)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).paidTotal, 62)
  assert.equal((await data(`nightclubAccounts/${accountId}`)).balance, 0)

  // 8. Finalizar ocupación y liberar mesa
  const finished = await call('service', 'finishOccupancy', 'finish-op-1', { accountId })
  assert.equal(finished.status, 'closed')
  assert.equal((await data(`nightclubAccounts/${accountId}`)).status, 'closed')
  assert.equal((await data('nightclubTables/VIP1')).status, 'available')
  assert.equal((await data('nightclubTables/VIP1')).activeAccountId, null)

  // 9. Cierre de Turno Ciego
  // Expected cash: openingFloat (200) + cash sales (40) = 240
  const closeShiftRes = await call('cashier', 'closeShift', 'close-shift-op', {
    shiftId,
    countedCash: 240,
  })
  assert.equal(closeShiftRes.expectedCash, 240)
  assert.equal(closeShiftRes.countedCash, 240)
  assert.equal(closeShiftRes.difference, 0)
  assert.equal((await data(`nightclubShifts/${shiftId}`)).status, 'closed')
  assert.equal((await data(`nightclubShifts/${shiftId}`)).totalSales, 62)
  assert.equal((await data(`nightclubShifts/${shiftId}`)).cashIncome, 40)
  assert.equal((await data('nightclubOperationalState/main')).activeShiftId, null)

  console.log('PASS: Flujo canónico VIP1 Bs 62 completado con éxito.')

  console.log('=== TEST 2: TESTS NEGATIVOS Y VALIDACIONES DE SEGURIDAD ===')
  // A. Otro tenant intentando ejecutar comando
  await assert.rejects(
    () => call('intruder', 'openAccount', 'neg-tenant', { target: { type: 'bar' } }, otherTenantId),
    err => err.code === 'failed-precondition' || err.code === 'permission-denied'
  )

  // B. Branch no autorizado
  await assert.rejects(
    () => call('waiter', 'openAccount', 'neg-branch', { target: { type: 'bar' } }, tenantId, 'secondary-branch'),
    err => err.code === 'permission-denied'
  )

  // Reabrir turno para pruebas de rol y operaciones
  const shift2Op = await call('admin', 'openShift', 'shift-qa-2', { openingFloat: 100 })
  const shift2Id = shift2Op.shiftId
  await root.collection('nightclubTables').doc('T1').set({ id: 'T1', branchId: 'main', name: 'Mesa 1', status: 'available' })
  const accT1 = (await call('waiter', 'openAccount', 'open-t1', { target: { type: 'table', tableId: 'T1' } })).accountId

  // C. Abrir mesa ya ocupada
  await assert.rejects(
    () => call('waiter', 'openAccount', 'open-t1-again', { target: { type: 'table', tableId: 'T1' } }),
    err => err.code === 'aborted'
  )

  // D. Stock insuficiente
  await assert.rejects(
    () => call('waiter', 'addRound', 'neg-stock', { accountId: accT1, items: [{ productId: 'cerveza', quantity: 999 }] }),
    err => err.code === 'aborted'
  )

  // Añadir ronda válida para pruebas de rol
  const rT1 = (await call('waiter', 'addRound', 'round-t1-valid', { accountId: accT1, items: [{ productId: 'cerveza', quantity: 1 }] })).roundId

  // E. Servicio intentando preparar (debe ser rechazado: Solo Barra)
  await assert.rejects(
    () => call('service', 'advanceRound', 'neg-prep', { accountId: accT1, roundId: rT1 }),
    err => err.code === 'permission-denied' && err.message.includes('Barra')
  )

  // Barra prepara
  await call('bar', 'advanceRound', 'prep-ok', { accountId: accT1, roundId: rT1 })
  await call('bar', 'advanceRound', 'ready-ok', { accountId: accT1, roundId: rT1 })

  // F. Barra intentando entregar (debe ser rechazado: Solo Servicio)
  await assert.rejects(
    () => call('bar', 'deliverRound', 'neg-deliv', { accountId: accT1, roundId: rT1 }),
    err => err.code === 'permission-denied' && err.message.includes('Servicio')
  )

  // Servicio entrega
  await call('waiter', 'deliverRound', 'deliv-ok', { accountId: accT1, roundId: rT1 })

  // Solicitar cobro
  await call('waiter', 'requestBill', 'req-bill-t1', { accountId: accT1 })

  // G. Segundo pago sobre saldo ya pagado
  await call('cashier', 'recordPayment', 'pay-t1-full', { accountId: accT1, amount: 25, method: 'cash' })
  await assert.rejects(
    () => call('cashier', 'recordPayment', 'pay-t1-over', { accountId: accT1, amount: 10, method: 'cash' }),
    err => err.code === 'failed-precondition' || err.code === 'invalid-argument'
  )

  // Finalizar ocupación T1
  await call('waiter', 'finishOccupancy', 'finish-t1', { accountId: accT1 })
  assert.equal((await data('nightclubTables/T1')).status, 'available')

  console.log('PASS: Todos los tests negativos y de permisos aprobados con éxito.')

  console.log('=== TEST 3: COMPATIBILIDAD CON RONDAS INMEDIATAS EN BARRA (settleRound) Y REEMBOLSO ===')
  const barAcc = (await call('waiter', 'openAccount', 'bar-acc-1', { target: { type: 'bar', displayName: 'Cliente Barra' } })).accountId
  const barSale = await call('waiter', 'settleRound', 'bar-settle-1', {
    accountId: barAcc,
    items: [{ productId: 'cerveza', quantity: 1 }],
    payment: { method: 'cash', amount: 25 },
  })
  assert.equal(barSale.total, 25)
  assert.equal((await data(`nightclubPayments/${barSale.paymentId}`)).amount, 25)

  // Reembolso por administración
  const refunded = await call('admin', 'refundRound', 'refund-bar-1', {
    accountId: barAcc,
    roundId: barSale.roundId,
    reason: 'Cliente canceló el trago antes de prepararse',
  })
  assert.equal(refunded.status, 'refunded')
  assert.equal((await data(`nightclubPayments/${barSale.paymentId}`)).status, 'refunded')

  // Finalizar ocupación cuenta de barra
  await call('waiter', 'finishOccupancy', 'finish-bar-acc', { accountId: barAcc })
  assert.equal((await data(`nightclubAccounts/${barAcc}`)).status, 'closed')

  // Cierre final del turno
  await call('admin', 'closeShift', 'close-qa-final', {
    shiftId: shift2Id,
    countedCash: 125, // 100 float + 25 cash from T1 (bar sale was 25 cash then refunded -25)
  })
  console.log('PASS: settleRound y refundRound probados con éxito.')
} finally {
  await deleteApp(app)
}
