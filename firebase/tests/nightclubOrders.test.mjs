import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('QA permitido solo en demo-pachax-platform.')
}
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { getTemplate } = require('./generated/templates.js')
const { executeNightclubCommand } = require('./nightclub.cjs')
const { manageMember } = require('./tenants.cjs')
const rulesEnv = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })

const suffix = Date.now().toString(36)
const tenantId = `orders_${suffix}`
const otherTenantId = `other_${suffix}`
const app = initializeApp({ projectId }, `nightclub-orders-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
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
  await root.collection('branches').doc('main').set({ id: 'main', tenantId, active: true })
  await root.update({ name: 'Nightclub orders QA' })
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
    err => err.code === 'aborted' || err.code === 'failed-precondition'
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

  console.log('=== TEST 4: N3A FLUJO CANÓNICO RESERVAS + RELACIONADORES + ENTRADAS + LOUNGES ===')
  // Abrir turno 3 para validar que ventas de entradas/lounges NO alteran el efectivo de turno
  const shift3Op = await call('admin', 'openShift', 'shift-qa-3', { openingFloat: 500 })
  const shift3Id = shift3Op.shiftId
  assert.ok(shift3Id)

  // Configurar Mesas VIP1 y VIP2
  await root.collection('nightclubTables').doc('VIP1').set({ id: 'VIP1', branchId: 'main', name: 'Mesa VIP1', capacity: 6, status: 'available' })
  await root.collection('nightclubTables').doc('VIP2').set({ id: 'VIP2', branchId: 'main', name: 'Mesa VIP2', capacity: 8, status: 'available' })

  // 1. Crear reserva para VIP1 en fecha F
  const dateF = '2026-11-20'
  const res1 = await call('cashier', 'saveReservation', 'res-vip1-op', {
    draft: { tableId: 'VIP1', customerName: 'Juan Pérez', time: '22:30', guests: 4, reservationDate: dateF, phone: '70012345' }
  })
  assert.ok(res1.reservationId)
  const res1Doc = await data(`nightclubReservations/${res1.reservationId}`)
  assert.equal(res1Doc.status, 'confirmed')
  assert.equal(res1Doc.customerName, 'Juan Pérez')
  assert.equal(res1Doc.reservationDate, dateF)
  const tableVip1 = await data('nightclubTables/VIP1')
  assert.equal(tableVip1.status, 'reserved')
  assert.equal(tableVip1.reservationName, 'Juan Pérez')

  // 2. Intentar segunda reserva VIP1 para la misma fecha -> rechazo
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'res-vip1-second', {
      draft: { tableId: 'VIP1', customerName: 'Pedro Gómez', time: '23:00', guests: 2, reservationDate: dateF }
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && err.message.includes('reserva')
  )

  // 3. Llegada de reserva: status -> arrived, cuenta abierta automáticamente, mesa ocupada
  const arriveRes = await call('waiter', 'arriveReservation', 'arrive-vip1-op', {
    reservationId: res1.reservationId
  })
  assert.ok(arriveRes.accountId)
  const res1ArrivedDoc = await data(`nightclubReservations/${res1.reservationId}`)
  assert.equal(res1ArrivedDoc.status, 'arrived')
  assert.ok(res1ArrivedDoc.arrivedAt)
  const accVip1 = await data(`nightclubAccounts/${arriveRes.accountId}`)
  assert.equal(accVip1.status, 'open')
  assert.equal(accVip1.tableId, 'VIP1')
  const tableVip1Arrived = await data('nightclubTables/VIP1')
  assert.equal(tableVip1Arrived.status, 'occupied')
  assert.equal(tableVip1Arrived.activeAccountId, arriveRes.accountId)

  // 4. Crear relacionador "Carlos"
  const promoterCarlos = await call('admin', 'savePromoter', 'prom-carlos-op', {
    promoter: { name: 'Carlos', phone: '78912345', joinedAt: dateF, active: true }
  })
  assert.ok(promoterCarlos.promoterId)
  const carlosDoc = await data(`nightclubPromoters/${promoterCarlos.promoterId}`)
  assert.equal(carlosDoc.name, 'Carlos')
  assert.equal(carlosDoc.active, true)

  // Crear jornada/evento abierto
  const eventOp = await call('admin', 'savePromoterEvent', 'event-fiesta-op', {
    event: { name: 'Fiesta Retro', date: dateF, status: 'open' }
  })
  assert.ok(eventOp.eventId)

  // 5. Registrar venta de 10 entradas a Bs 50: total = 500, no crea movimiento de caja
  const saleOp = await call('cashier', 'saveTicketSale', 'sale-carlos-10', {
    sale: {
      promoterId: promoterCarlos.promoterId,
      eventId: eventOp.eventId,
      eventName: 'Fiesta Retro',
      eventDate: dateF,
      ticketType: 'General',
      quantity: 10,
      unitPrice: 50,
      status: 'paid'
    }
  })
  assert.ok(saleOp.saleId)
  const saleDoc = await data(`nightclubPromoterTicketSales/${saleOp.saleId}`)
  assert.equal(saleDoc.total, 500)
  assert.equal(saleDoc.status, 'paid')
  assert.equal(saleDoc.quantity, 10)
  assert.equal(saleDoc.unitPrice, 50)

  // Verificar que NO se modificó la caja ni el turno
  const shiftAfterTickets = await data(`nightclubShifts/${shift3Id}`)
  assert.equal(shiftAfterTickets.cashIncome || 0, 0)
  assert.equal(shiftAfterTickets.totalSales || 0, 0)
  const cashMovements1 = await root.collection('nightclubCashMovements').where('shiftId', '==', shift3Id).get()
  assert.equal(cashMovements1.size, 0)

  // 6. Registrar reserva de lounge VIP2 a Bs 800 por Carlos:
  // - mesa VIP2 queda reservada
  // - no permite otra reserva de salón para VIP2
  // - no crea movimiento de caja
  const loungeOp = await call('cashier', 'saveLoungeSale', 'lounge-carlos-vip2', {
    loungeSale: {
      promoterId: promoterCarlos.promoterId,
      reservationDate: dateF,
      loungeId: 'VIP2',
      agreedPrice: 800,
      status: 'reserved'
    }
  })
  assert.ok(loungeOp.loungeSaleId)
  const loungeDoc = await data(`nightclubPromoterLoungeSales/${loungeOp.loungeSaleId}`)
  assert.equal(loungeDoc.status, 'reserved')
  assert.equal(loungeDoc.agreedPrice, 800)

  const tableVip2 = await data('nightclubTables/VIP2')
  assert.equal(tableVip2.status, 'reserved')

  // No permite otra reserva de salón para VIP2 en la misma fecha
  await assert.rejects(
    () => call('cashier', 'saveLoungeSale', 'lounge-vip2-second', {
      loungeSale: {
        promoterId: promoterCarlos.promoterId,
        reservationDate: dateF,
        loungeId: 'VIP2',
        agreedPrice: 800,
        status: 'reserved'
      }
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && (err.message.includes('reservada') || err.message.includes('disponible'))
  )

  // No permite reserva estándar para VIP2 en la misma fecha (disponibilidad unificada)
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'res-vip2-clash', {
      draft: { tableId: 'VIP2', customerName: 'Otro Cliente', time: '23:00', guests: 4, reservationDate: dateF }
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && (err.message.includes('reservada') || err.message.includes('reserva'))
  )

  // 7. Marcar lounge como pagado: status -> paid, no crea movimiento de caja de turno
  const markPaidRes = await call('cashier', 'markLoungePaid', 'lounge-vip2-pay', {
    loungeSaleId: loungeOp.loungeSaleId
  })
  assert.equal(markPaidRes.status, 'paid')
  const loungePaidDoc = await data(`nightclubPromoterLoungeSales/${loungeOp.loungeSaleId}`)
  assert.equal(loungePaidDoc.status, 'paid')
  assert.ok(loungePaidDoc.paidAt)

  // Verificar que el turno y la caja permanecen sin cambios
  const shiftAfterLounge = await data(`nightclubShifts/${shift3Id}`)
  assert.equal(shiftAfterLounge.cashIncome || 0, 0)
  assert.equal(shiftAfterLounge.totalSales || 0, 0)
  const cashMovements2 = await root.collection('nightclubCashMovements').where('shiftId', '==', shift3Id).get()
  assert.equal(cashMovements2.size, 0)

  // 8. Repetir venta de entrada con mismo operationId: debe ser idempotente
  const repeatSale = await call('cashier', 'saveTicketSale', 'sale-carlos-10', {
    sale: {
      promoterId: promoterCarlos.promoterId,
      eventId: eventOp.eventId,
      eventName: 'Fiesta Retro',
      eventDate: dateF,
      ticketType: 'General',
      quantity: 10,
      unitPrice: 50,
      status: 'paid'
    }
  })
  assert.equal(repeatSale.saleId, saleOp.saleId)
  assert.deepEqual(repeatSale, saleOp)

  const ticketSalesCount = await root.collection('nightclubPromoterTicketSales').where('operationId', '==', 'sale-carlos-10').get()
  assert.equal(ticketSalesCount.size, 1)

  console.log('PASS: Flujo canónico N3A completado con éxito.')

  console.log('=== TEST 5: N3A SUITE NEGATIVA Y DE PERMISOS ===')
  // 1. Tenant A no puede leer/modificar reservas ni relacionadores de Tenant B
  await assert.rejects(
    () => call('intruder', 'saveReservation', 'neg-intruder-res', {
      draft: { tableId: 'VIP1', customerName: 'Intruso', time: '22:00', guests: 2, reservationDate: dateF }
    }, otherTenantId),
    err => err.code === 'failed-precondition' || err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('intruder', 'savePromoter', 'neg-intruder-prom', {
      promoter: { name: 'Fake Promoter' }
    }, otherTenantId),
    err => err.code === 'failed-precondition' || err.code === 'permission-denied'
  )

  // 2. Branch A no mezcla reservas con Branch B
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'neg-branch-res', {
      draft: { tableId: 'VIP1', customerName: 'Branch B Customer', time: '22:00', guests: 2, reservationDate: dateF }
    }, tenantId, 'branch-b'),
    err => err.code === 'permission-denied'
  )

  // 3. No se puede reservar con fecha inválida
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'neg-invalid-date', {
      draft: { tableId: 'VIP2', customerName: 'Test', time: '22:00', guests: 2, reservationDate: 'invalid-date' }
    }),
    err => err.code === 'invalid-argument'
  )

  // 4. No se puede reservar con hora inválida
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'neg-invalid-time', {
      draft: { tableId: 'VIP2', customerName: 'Test', time: '25:99', guests: 2, reservationDate: dateF }
    }),
    err => err.code === 'invalid-argument'
  )

  // 5. No se puede reservar para más personas que la capacidad de la mesa (VIP2 capacidad = 8)
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'neg-over-capacity', {
      draft: { tableId: 'VIP2', customerName: 'Test', time: '22:00', guests: 50, reservationDate: '2026-11-21' }
    }),
    err => err.code === 'invalid-argument' && (err.message.includes('personas') || err.message.includes('capacidad'))
  )

  // 6. No se puede reservar una mesa ocupada (VIP1 ocupada por llegada anterior)
  await assert.rejects(
    () => call('cashier', 'saveReservation', 'neg-occupied-res', {
      draft: { tableId: 'VIP1', customerName: 'Test', time: '22:00', guests: 2, reservationDate: dateF }
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && err.message.includes('cuenta activa')
  )

  // 7. No se puede vender entrada para evento cerrado
  const closedEventOp = await call('admin', 'savePromoterEvent', 'event-closed-op', {
    event: { name: 'Evento Pasado', date: '2026-10-01', status: 'closed' }
  })
  assert.ok(closedEventOp.eventId)
  await assert.rejects(
    () => call('cashier', 'saveTicketSale', 'neg-closed-event-sale', {
      sale: {
        promoterId: promoterCarlos.promoterId,
        eventId: closedEventOp.eventId,
        eventName: 'Evento Pasado',
        eventDate: '2026-10-01',
        ticketType: 'VIP',
        quantity: 2,
        unitPrice: 100,
        status: 'paid'
      }
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && err.message.includes('cerrada')
  )

  // 8. No se puede registrar venta para relacionador inactivo
  const inactivePromoter = await call('admin', 'savePromoter', 'prom-inactive-op', {
    promoter: { name: 'Inactivo', phone: '00000', joinedAt: dateF, active: false }
  })
  await assert.rejects(
    () => call('cashier', 'saveTicketSale', 'neg-inactive-prom-sale', {
      sale: {
        promoterId: inactivePromoter.promoterId,
        eventId: eventOp.eventId,
        eventName: 'Fiesta Retro',
        eventDate: dateF,
        ticketType: 'General',
        quantity: 1,
        unitPrice: 50,
        status: 'pending'
      }
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && err.message.includes('inactiv')
  )

  // 9. No se puede marcar lounge como pagado dos veces
  await assert.rejects(
    () => call('cashier', 'markLoungePaid', 'lounge-vip2-pay-again', {
      loungeSaleId: loungeOp.loungeSaleId
    }),
    err => (err.code === 'aborted' || err.code === 'failed-precondition') && err.message.includes('ya se encuentra pagado')
  )

  // 10. Mesero no puede crear ni editar relacionadores (requiere settings.manage / owner|admin)
  await assert.rejects(
    () => call('waiter', 'savePromoter', 'neg-waiter-promoter', {
      promoter: { name: 'Promoter by Waiter' }
    }),
    err => err.code === 'permission-denied'
  )

  // 11. Consumos de relacionador: registrar cortesía/consumo no afecta caja ni ventas
  const consumptionOp = await call('admin', 'savePromoterConsumption', 'cons-carlos-1', {
    consumption: {
      promoterId: promoterCarlos.promoterId,
      date: dateF,
      concept: 'Cortesía de bienvenida',
      amount: 120,
      kind: 'courtesy',
      notes: 'Autorizado por gerencia'
    }
  })
  assert.ok(consumptionOp.consumptionId)
  const consDoc = await data(`nightclubPromoterConsumptions/${consumptionOp.consumptionId}`)
  assert.equal(consDoc.amount, 120)
  assert.equal(consDoc.kind, 'courtesy')

  // Finalizar cuenta de VIP1 (abierta por llegada de reserva) para permitir cierre de turno limpio
  await call('waiter', 'finishOccupancy', 'finish-vip1-qa', { accountId: arriveRes.accountId })

  // Cierre final del turno 3 sin alteraciones de caja
  await call('admin', 'closeShift', 'close-qa-shift3', {
    shiftId: shift3Id,
    countedCash: 500, // exact 500 opening float, as no ticket/lounge/consumption touched cash
  })
  console.log('PASS: Suite negativa N3A y control de permisos aprobados con éxito.')

  console.log('=== TEST 6: CIERRE FUNCIONAL N3B (FLUJO CANÓNICO) ===')
  // 1. Abrir Turno 4 con Bs 300
  const shift4Op = await call('cashier', 'openShift', 'shift-op-4', { openingFloat: 300 })
  const shift4Id = shift4Op.shiftId
  assert.ok(shift4Id)

  // 2. Movimientos de caja: ingreso (+150), egreso (-50 hielo), ingreso QR (+200 no afecta cash físico)
  await call('cashier', 'recordCashMovement', 'mov-income-1', {
    type: 'income',
    method: 'cash',
    amount: 150,
    description: 'Ingreso inicial extra'
  })
  await call('cashier', 'recordCashMovement', 'mov-expense-1', {
    type: 'expense',
    method: 'cash',
    amount: 50,
    description: 'Compra de hielo',
    category: 'supplies'
  })
  await call('cashier', 'recordCashMovement', 'mov-qr-1', {
    type: 'income',
    method: 'qr',
    amount: 200,
    description: 'Ingreso QR que no altera efectivo físico'
  })

  // 3. Registrar botella física: 10 botellas cerradas de 750 ml, costo 180, precio botella 350, vaso 35 (comisión mesero Bs 5 por botella)
  await call('admin', 'saveBottleInventory', 'bottle-jw-op', {
    draft: {
      id: 'inv-whisky',
      name: 'Johnnie Walker Black',
      category: 'Licores',
      closedBottles: 10,
      minimum: 2,
      capacityMl: 750,
      capacityUnit: 'ml',
      cost: 180,
      sellBottle: true,
      bottlePrice: 350,
      sellPour: true,
      pourMl: 50,
      pourPrice: 35,
      bottleCommissionEnabled: true,
      bottleCommissionType: 'fixed',
      bottleCommissionValue: 5,
    }
  })
  const whiskyInv = await data('nightclubInventory/inv-whisky')
  assert.equal(whiskyInv.current, 10)
  assert.equal(whiskyInv.openBottleMl, 0)
  assert.equal(whiskyInv.bottleCapacityMl, 750)
  const whiskyBottleProd = await data('nightclubProducts/presentation:inv-whisky:bottle')
  assert.equal(whiskyBottleProd.price, 350)
  assert.equal(whiskyBottleProd.commission.value, 5)

  // 4. Abrir 1 botella: cerradas 10 -> 9, openBottleMl: 750
  await call('bar', 'openBottle', 'open-jw-1', { inventoryId: 'inv-whisky' })
  const openedWhisky = await data('nightclubInventory/inv-whisky')
  assert.equal(openedWhisky.current, 9)
  assert.equal(openedWhisky.openBottleMl, 750)

  // 5. Salida de botella abierta (100 ml por merma): openBottleMl pasa a 650
  await call('bar', 'bottleExit', 'exit-jw-1', {
    inventoryId: 'inv-whisky',
    millilitres: 100,
    exitType: 'waste',
    reason: 'Derrame en barra'
  })
  const exitWhisky = await data('nightclubInventory/inv-whisky')
  assert.equal(exitWhisky.openBottleMl, 650)

  // 6. Crear socio con cupo 2 botellas/semana
  await call('admin', 'saveMember', 'member-juan-op', {
    member: {
      id: 'member-juan',
      name: 'Juan Socio VIP',
      phone: '70011223',
      quota: 2,
      repeatDays: 7,
      windowDays: 7,
      active: true,
    }
  })
  const memberJuan = await data('nightclubMembers/member-juan')
  assert.equal(memberJuan.name, 'Juan Socio VIP')
  assert.equal(memberJuan.quota, 2)

  // 7. Registrar cortesía de 1 botella para el socio: stock cerrado de 9 a 8, caja no se altera
  await call('admin', 'registerCourtesy', 'courtesy-juan-1', {
    draft: {
      memberId: 'member-juan',
      productId: 'presentation:inv-whisky:bottle',
      quantity: 1,
      beneficiary: 'Juan Socio VIP',
      note: 'Cortesía de apertura',
    }
  })
  const courtesyDoc = await data('nightclubCourtesies/courtesy_courtesy-juan-1')
  assert.equal(courtesyDoc.status, 'active')
  assert.equal(courtesyDoc.quantity, 1)
  const invAfterCourtesy = await data('nightclubInventory/inv-whisky')
  assert.equal(invAfterCourtesy.current, 8)

  // 8. Anular cortesía: stock cerrado regresa de 8 a 9
  await call('admin', 'cancelCourtesy', 'cancel-courtesy-juan-1', {
    courtesyId: 'courtesy_courtesy-juan-1'
  })
  const cancelledCourtesy = await data('nightclubCourtesies/courtesy_courtesy-juan-1')
  assert.equal(cancelledCourtesy.status, 'cancelled')
  const invAfterCancel = await data('nightclubInventory/inv-whisky')
  assert.equal(invAfterCancel.current, 9)

  // 9. Asignar cliente a mesa abierta y vender botella con comisión a mesero
  await root.collection('nightclubTables').doc('VIP3').set({ id: 'VIP3', branchId: 'main', name: 'Mesa VIP3', status: 'available' })
  const openVip3 = await call('waiter', 'openAccount', 'acc-vip3-op', { target: { type: 'table', tableId: 'VIP3' } })
  const accVip3Id = openVip3.accountId

  await root.collection('nightclubCustomers').doc('cust-carlos').set({
    id: 'cust-carlos',
    branchId: 'main',
    name: 'Carlos Cliente',
    phone: '78899000',
    active: true
  })
  await call('waiter', 'assignCustomer', 'assign-carlos-vip3', { accountId: accVip3Id, customerId: 'cust-carlos' })
  const vip3AccDoc = await data(`nightclubAccounts/${accVip3Id}`)
  assert.equal(vip3AccDoc.customerId, 'cust-carlos')

  const roundVip3 = await call('waiter', 'addRound', 'round-vip3-op', {
    accountId: accVip3Id,
    items: [{ productId: 'presentation:inv-whisky:bottle', quantity: 1 }],
    serviceStaffId: 'waiter'
  })
  const commKey = `commission:${roundVip3.roundId}:item_0`
  const commPending = await data(`nightclubCommissions/${commKey}`)
  assert.equal(commPending.status, 'pending')
  assert.equal(commPending.amount, 5)
  assert.equal(commPending.staffId, 'waiter')

  // Pagar cuenta: comisión pasa de pending a earned
  await call('waiter', 'requestBill', 'bill-vip3-op', { accountId: accVip3Id })
  await call('cashier', 'recordPayment', 'pay-vip3-op', { accountId: accVip3Id, amount: 350, method: 'cash' })
  const commEarned = await data(`nightclubCommissions/${commKey}`)
  assert.equal(commEarned.status, 'earned')

  await call('bar', 'advanceRound', 'prep-vip3-op', { accountId: accVip3Id, roundId: roundVip3.roundId })
  await call('bar', 'advanceRound', 'ready-vip3-op', { accountId: accVip3Id, roundId: roundVip3.roundId })
  await call('waiter', 'deliverRound', 'del-vip3-op', { accountId: accVip3Id, roundId: roundVip3.roundId })
  await call('waiter', 'finishOccupancy', 'finish-vip3-op', { accountId: accVip3Id })

  // 10. Pago de comisiones en efectivo: se descuenta de caja (-5) y comisión pasa a 'paid'
  const payCommRes = await call('admin', 'payCommissions', 'pay-comm-waiter-1', {
    draft: {
      staffId: 'waiter',
      amount: 5,
      method: 'cash',
      commissionIds: [commKey]
    }
  })
  const commPaid = await data(`nightclubCommissions/${commKey}`)
  assert.equal(commPaid.status, 'paid')
  const commPaymentDoc = await data(`nightclubCommissionPayments/${payCommRes.paymentId}`)
  assert.equal(commPaymentDoc.amount, 5)
  assert.equal(commPaymentDoc.method, 'cash')
  const commCashMov = await data(`nightclubCashMovements/comm_${payCommRes.paymentId}`)
  assert.equal(commCashMov.type, 'expense')
  assert.equal(commCashMov.amount, 5)
  assert.equal(commCashMov.category, 'commissions')

  // 11. Actualizar estado de convivencia de cliente a 'yellow' y registrar incidente privado
  await call('admin', 'setCustomerStatus', 'status-cust-op', { customerId: 'cust-carlos', status: 'yellow' })
  const updatedCust = await data('nightclubCustomers/cust-carlos')
  assert.equal(updatedCust.convivenciaStatus, 'yellow')

  const incOp = await call('admin', 'saveCustomerIncident', 'inc-carlos-op', {
    incident: {
      customerId: 'cust-carlos',
      date: '2026-10-16',
      severity: 'medium',
      description: 'Discusión en el lounge'
    }
  })
  const incDoc = await data(`nightclubCustomerIncidents/${incOp.incidentId}`)
  assert.equal(incDoc.severity, 'medium')
  assert.equal(incDoc.customerId, 'cust-carlos')

  // 12. Cerrar turno 4 y verificar expectedCash:
  // float (300) + income (150) - expense (50) + venta mesa VIP3 (350) - pago comisiones (5) = 745
  await call('cashier', 'closeShift', 'close-shift4-op', { shiftId: shift4Id, countedCash: 745 })
  const closedShift4 = await data(`nightclubShifts/${shift4Id}`)
  assert.equal(closedShift4.expectedCash, 745)
  assert.equal(closedShift4.status, 'closed')
  console.log('PASS: Test 6 (Flujo canónico N3B) completado exitosamente.')

  console.log('=== TEST 7: SUITE NEGATIVA N3B Y CONTROL DE INTEGRIDAD ===')
  // 1. Movimiento de caja con turno cerrado
  await assert.rejects(
    () => call('cashier', 'recordCashMovement', 'neg-cash-closed-shift', {
      type: 'income',
      method: 'cash',
      amount: 100,
      description: 'Sin turno'
    }),
    err => err.code === 'failed-precondition' && err.message.includes('turno')
  )

  // Abrir turno para pruebas negativas de caja y stock
  const shift5Op = await call('cashier', 'openShift', 'shift-op-5', { openingFloat: 100 })
  const shift5Id = shift5Op.shiftId

  // 2. Movimiento de caja con amount <= 0 o centavos inválidos
  await assert.rejects(
    () => call('cashier', 'recordCashMovement', 'neg-cash-negative', {
      type: 'expense',
      method: 'cash',
      amount: -10,
      description: 'Inválido'
    }),
    err => err.code === 'invalid-argument'
  )
  await assert.rejects(
    () => call('cashier', 'recordCashMovement', 'neg-cash-fraction', {
      type: 'expense',
      method: 'cash',
      amount: 10.005,
      description: 'Fracciones inválidas'
    }),
    err => err.code === 'invalid-argument'
  )

  // 3. Abrir botella sin stock cerrado
  await root.collection('nightclubInventory').doc('inv-empty-bottle').set({
    id: 'inv-empty-bottle',
    branchId: 'main',
    name: 'Botella Vacía',
    current: 0,
    openBottleMl: 0,
    bottleCapacityMl: 750
  })
  await assert.rejects(
    () => call('bar', 'openBottle', 'neg-open-no-stock', { inventoryId: 'inv-empty-bottle' }),
    err => err.code === 'failed-precondition' && err.message.includes('botellas cerradas')
  )

  // 4. Salida de botella abierta con ml > disponibles (tenemos 650 ml de whisky)
  await assert.rejects(
    () => call('bar', 'bottleExit', 'neg-exit-exceed', {
      inventoryId: 'inv-whisky',
      millilitres: 700,
      exitType: 'waste',
      reason: 'Excede'
    }),
    err => err.code === 'failed-precondition' && err.message.includes('suficiente')
  )

  // 5. Socio inactivo no puede recibir cortesía
  await call('admin', 'saveMember', 'member-inactive-op', {
    member: {
      id: 'member-inactive',
      name: 'Socio Inactivo',
      phone: '77777777',
      quota: 2,
      repeatDays: 7,
      windowDays: 7,
      active: false,
    }
  })
  await assert.rejects(
    () => call('admin', 'registerCourtesy', 'neg-inactive-member-courtesy', {
      draft: {
        memberId: 'member-inactive',
        productId: 'presentation:inv-whisky:bottle',
        quantity: 1
      }
    }),
    err => err.code === 'failed-precondition' && err.message.includes('inactivo')
  )

  // 6. Cortesía que supera cupo de período
  // El socio Juan ya tiene quota = 2 botellas/semana. Registramos 2 cortesías válidas de 1 unidad:
  await call('admin', 'registerCourtesy', 'courtesy-quota-1', {
    draft: { memberId: 'member-juan', productId: 'presentation:inv-whisky:bottle', quantity: 1 }
  })
  await call('admin', 'registerCourtesy', 'courtesy-quota-2', {
    draft: { memberId: 'member-juan', productId: 'presentation:inv-whisky:bottle', quantity: 1 }
  })
  // La 3ra cortesía en la misma semana debe ser rechazada por exceder cupo
  await assert.rejects(
    () => call('admin', 'registerCourtesy', 'neg-exceed-quota', {
      draft: { memberId: 'member-juan', productId: 'presentation:inv-whisky:bottle', quantity: 1 }
    }),
    err => err.code === 'failed-precondition' && err.message.includes('Cupo de cortesías superado')
  )

  // 7. Anular cortesía ya anulada
  await call('admin', 'cancelCourtesy', 'cancel-quota-1', {
    courtesyId: 'courtesy_courtesy-quota-1'
  })
  await assert.rejects(
    () => call('admin', 'cancelCourtesy', 'neg-cancel-again', {
      courtesyId: 'courtesy_courtesy-quota-1'
    }),
    err => err.code === 'failed-precondition' && err.message.includes('ya está anulada')
  )

  // 8. Venta de botella sin mesero no genera comisión
  await root.collection('nightclubTables').doc('VIP4').set({ id: 'VIP4', branchId: 'main', name: 'Mesa VIP4', status: 'available' })
  const openVip4 = await call('waiter', 'openAccount', 'acc-vip4-op', { target: { type: 'table', tableId: 'VIP4' } })
  const roundVip4 = await call('waiter', 'addRound', 'round-vip4-no-staff', {
    accountId: openVip4.accountId,
    items: [{ productId: 'presentation:inv-whisky:bottle', quantity: 1 }],
    // No serviceStaffId
  })
  const commVip4 = await data(`nightclubCommissions/commission:${roundVip4.roundId}:item_0`)
  assert.equal(commVip4, undefined) // no commission created

  // 9. Pagar comisión ya pagada
  await assert.rejects(
    () => call('admin', 'payCommissions', 'neg-pay-paid-comm', {
      draft: {
        staffId: 'waiter',
        amount: 5,
        method: 'cash',
        commissionIds: [commKey] // already paid in Test 6
      }
    }),
    err => err.code === 'failed-precondition' && (err.message.includes('supera el saldo pendiente') || err.message.includes('pendiente'))
  )

  // 10. Mesero intentando registrar incidencias -> permission-denied
  await assert.rejects(
    () => call('waiter', 'saveCustomerIncident', 'neg-waiter-inc', {
      incident: { customerId: 'cust-carlos', date: '2026-10-16', severity: 'low', description: 'Test' }
    }),
    err => err.code === 'permission-denied'
  )

  // 11. Mesero intentando crear o editar socios -> permission-denied
  await assert.rejects(
    () => call('waiter', 'saveMember', 'neg-waiter-member', {
      member: { name: 'Hack Member', phone: '111', quota: 5, active: true }
    }),
    err => err.code === 'permission-denied'
  )

  // Limpieza de mesa VIP4 y cierre de turno 5
  await call('waiter', 'cancelRound', 'cancel-vip4-qa', { roundId: roundVip4.roundId, reason: 'QA' })
  await call('waiter', 'finishOccupancy', 'finish-vip4-qa', { accountId: openVip4.accountId })
  await call('cashier', 'closeShift', 'close-shift5-op', { shiftId: shift5Id, countedCash: 100 })

  console.log('PASS: Test 7 (Suite negativa N3B) completado exitosamente.')

  console.log('=== TEST 8: N3B.1 INVENTARIO FÍSICO, SNAPSHOTS, REVERSIONES Y PERMISOS ESTRICTOS ===')
  const shift8Op = await call('cashier', 'openShift', 'shift8-op', { openingFloat: 100 })
  const shift8Id = shift8Op.shiftId
  assert.ok(shift8Id)

  // Mesa VIP8 y barra para pedidos
  await root.collection('nightclubTables').doc('VIP8').set({ id: 'VIP8', branchId: 'main', name: 'Mesa VIP8', status: 'available' })

  // Setup Caso A y B: Tequila
  await root.collection('nightclubInventory').doc('inv-tequila').set({
    id: 'inv-tequila',
    branchId: 'main',
    name: 'Tequila Don Julio',
    category: 'Licores',
    unit: 'unit',
    current: 10,
    openBottleMl: 500,
    bottleCapacityMl: 750,
  })
  await root.collection('nightclubProducts').doc('tequila-botella').set({
    id: 'tequila-botella',
    branchId: 'main',
    name: 'Tequila Don Julio - Botella',
    category: 'Licores',
    price: 350,
    active: true,
    preparationArea: 'Directo',
    inventoryMode: 'recipe',
    recipe: [{ inventoryId: 'inv-tequila', quantity: 1, unit: 'unit' }],
  })
  await root.collection('nightclubProducts').doc('tequila-shot').set({
    id: 'tequila-shot',
    branchId: 'main',
    name: 'Tequila Don Julio - Shot',
    category: 'Licores',
    price: 35,
    active: true,
    preparationArea: 'Directo',
    inventoryMode: 'recipe',
    recipe: [{ inventoryId: 'inv-tequila', quantity: 50, unit: 'ml' }],
  })

  // CASO A: Venta de botella cerrada (unit='unit') -> resta 1 botella cerrada, openBottleMl intacto
  const openVip8A = await call('waiter', 'openAccount', 'acc-vip8a-op', { target: { type: 'table', tableId: 'VIP8' } })
  const round8A = await call('waiter', 'addRound', 'round8a-op', {
    accountId: openVip8A.accountId,
    items: [{ productId: 'tequila-botella', quantity: 1 }],
  })
  assert.equal(round8A.status, 'ready')
  const stockTequilaAfterA = await data('nightclubInventory/inv-tequila')
  assert.equal(stockTequilaAfterA.current, 9, 'Debe restar 1 botella cerrada')
  assert.equal(stockTequilaAfterA.openBottleMl, 500, 'openBottleMl debe permanecer intacto')
  const movA = await data(`nightclubInventoryMovements/round8a-op_inv-tequila`)
  assert.equal(movA.closedBottlesBefore, 10)
  assert.equal(movA.closedBottlesAfter, 9)
  assert.equal(movA.openBottleMlBefore, 500)
  assert.equal(movA.openBottleMlAfter, 500)
  assert.equal(movA.consumedQuantity, 1)
  assert.equal(movA.consumedUnit, 'unit')

  // CASO B: Venta shot (unit='ml') usando openBottleMl existente -> resta ml, botellas cerradas intactas
  const round8B = await call('waiter', 'addRound', 'round8b-op', {
    accountId: openVip8A.accountId,
    items: [{ productId: 'tequila-shot', quantity: 1 }],
  })
  assert.equal(round8B.status, 'ready')
  const stockTequilaAfterB = await data('nightclubInventory/inv-tequila')
  assert.equal(stockTequilaAfterB.current, 9, 'Botellas cerradas deben permanecer intactas')
  assert.equal(stockTequilaAfterB.openBottleMl, 450, 'openBottleMl debe descontar 50 ml')
  const movB = await data(`nightclubInventoryMovements/round8b-op_inv-tequila`)
  assert.equal(movB.closedBottlesBefore, 9)
  assert.equal(movB.closedBottlesAfter, 9)
  assert.equal(movB.openBottleMlBefore, 500)
  assert.equal(movB.openBottleMlAfter, 450)
  assert.equal(movB.consumedQuantity, 50)
  assert.equal(movB.consumedUnit, 'ml')

  // Limpiar mesa VIP8 para siguientes casos
  await call('waiter', 'cancelRound', 'cancel8b-op', { roundId: round8B.roundId, reason: 'Test setup' })
  await call('waiter', 'cancelRound', 'cancel8a-op', { roundId: round8A.roundId, reason: 'Test setup' })
  await call('waiter', 'finishOccupancy', 'finish-vip8a-op', { accountId: openVip8A.accountId })

  // CASO C: Venta shot que agota openBottleMl y abre siguiente botella automáticamente
  // Insumo Ron: 3 botellas cerradas, 30 ml abiertos, capacidad 750 ml
  await root.collection('nightclubInventory').doc('inv-rum').set({
    id: 'inv-rum',
    branchId: 'main',
    name: 'Ron Flor de Caña',
    category: 'Licores',
    unit: 'unit',
    current: 3,
    openBottleMl: 30,
    bottleCapacityMl: 750,
  })
  await root.collection('nightclubProducts').doc('rum-shot').set({
    id: 'rum-shot',
    branchId: 'main',
    name: 'Ron Shot 50ml',
    category: 'Licores',
    price: 30,
    active: true,
    preparationArea: 'Directo',
    inventoryMode: 'recipe',
    recipe: [{ inventoryId: 'inv-rum', quantity: 50, unit: 'ml' }],
  })
  const openVip8C = await call('waiter', 'openAccount', 'acc-vip8c-op', { target: { type: 'table', tableId: 'VIP8' } })
  const round8C = await call('waiter', 'addRound', 'round8c-op', {
    accountId: openVip8C.accountId,
    items: [{ productId: 'rum-shot', quantity: 1 }],
  })
  assert.equal(round8C.status, 'ready')
  const stockRumAfterC = await data('nightclubInventory/inv-rum')
  assert.equal(stockRumAfterC.current, 2, 'Debe abrir 1 botella cerrada (3 -> 2)')
  assert.equal(stockRumAfterC.openBottleMl, 730, 'openBottleMl debe ser 30 + 750 - 50 = 730 ml')
  const movC = await data(`nightclubInventoryMovements/round8c-op_inv-rum`)
  assert.equal(movC.closedBottlesBefore, 3)
  assert.equal(movC.closedBottlesAfter, 2)
  assert.equal(movC.openBottleMlBefore, 30)
  assert.equal(movC.openBottleMlAfter, 730)
  assert.equal(movC.consumedQuantity, 50)
  assert.equal(movC.consumedUnit, 'ml')

  // CASO D: Cancelación de ronda restaura snapshot físico exacto
  await call('waiter', 'cancelRound', 'cancel8c-op', { roundId: round8C.roundId, reason: 'Devolución mesa' })
  const stockRumAfterCancel = await data('nightclubInventory/inv-rum')
  assert.equal(stockRumAfterCancel.current, 3, 'Debe restaurar 3 botellas cerradas')
  assert.equal(stockRumAfterCancel.openBottleMl, 30, 'Debe restaurar exactamente los 30 ml abiertos')
  const revC = await data(`nightclubInventoryMovements/reversal_cancel8c-op_inv-rum`)
  assert.equal(revC.type, 'reversal')
  assert.equal(revC.current, 3)
  assert.equal(revC.closedBottlesAfter, 3)
  assert.equal(revC.openBottleMlAfter, 30)
  await call('waiter', 'finishOccupancy', 'finish-vip8c-op', { accountId: openVip8C.accountId })

  // CASO E: Intento de cancelar ronda cuando hubo movimiento posterior incompatible -> rechaza
  await root.collection('nightclubInventory').doc('inv-vodka').set({
    id: 'inv-vodka',
    branchId: 'main',
    name: 'Vodka Absolut',
    category: 'Licores',
    unit: 'unit',
    current: 5,
    openBottleMl: 700,
    bottleCapacityMl: 750,
  })
  await root.collection('nightclubProducts').doc('vodka-shot').set({
    id: 'vodka-shot',
    branchId: 'main',
    name: 'Vodka Shot',
    category: 'Licores',
    price: 25,
    active: true,
    preparationArea: 'Directo',
    inventoryMode: 'recipe',
    recipe: [{ inventoryId: 'inv-vodka', quantity: 50, unit: 'ml' }],
  })
  const openVip8E = await call('waiter', 'openAccount', 'acc-vip8e-op', { target: { type: 'table', tableId: 'VIP8' } })
  // Ronda 1: vende 50 ml (openBottleMl: 700 -> 650)
  const round8E1 = await call('waiter', 'addRound', 'round8e1-op', {
    accountId: openVip8E.accountId,
    items: [{ productId: 'vodka-shot', quantity: 1 }],
  })
  assert.equal((await data('nightclubInventory/inv-vodka')).openBottleMl, 650)

  // Ronda 2: vende 50 ml posteriores (openBottleMl: 650 -> 600)
  const round8E2 = await call('waiter', 'addRound', 'round8e2-op', {
    accountId: openVip8E.accountId,
    items: [{ productId: 'vodka-shot', quantity: 1 }],
  })
  assert.equal((await data('nightclubInventory/inv-vodka')).openBottleMl, 600)

  // Intentar cancelar Ronda 1 teniendo movimientos posteriores en inv-vodka
  await assert.rejects(
    () => call('waiter', 'cancelRound', 'cancel-round8e1-neg', { roundId: round8E1.roundId, reason: 'Error cliente' }),
    err => err.code === 'failed-precondition' && err.message.includes('El inventario tuvo movimientos posteriores; requiere revisión manual.')
  )
  // Verificar que el inventario no fue corrompido
  const stockVodkaSafe = await data('nightclubInventory/inv-vodka')
  assert.equal(stockVodkaSafe.current, 5)
  assert.equal(stockVodkaSafe.openBottleMl, 600)

  // Limpiar Ronda 2 (última) y luego Ronda 1 en orden inverso
  await call('waiter', 'cancelRound', 'cancel8e2-ok', { roundId: round8E2.roundId, reason: 'Limpieza LIFO' })
  assert.equal((await data('nightclubInventory/inv-vodka')).openBottleMl, 650)
  await call('waiter', 'cancelRound', 'cancel8e1-ok', { roundId: round8E1.roundId, reason: 'Limpieza Ronda 1' })
  assert.equal((await data('nightclubInventory/inv-vodka')).openBottleMl, 700)
  await call('waiter', 'finishOccupancy', 'finish-vip8e-op', { accountId: openVip8E.accountId })

  // CASO F: sellerStaffId inexistente o inactivo -> rechaza
  const openVip8F = await call('waiter', 'openAccount', 'acc-vip8f-op', { target: { type: 'table', tableId: 'VIP8' } })
  await assert.rejects(
    () => call('waiter', 'addRound', 'round8f-invalid-seller', {
      accountId: openVip8F.accountId,
      items: [{ productId: 'vodka-shot', quantity: 1 }],
      sellerStaffId: 'staff-inexistente',
    }),
    err => err.code === 'failed-precondition' && err.message.includes('mesero')
  )
  // Crear miembro con rol no permitido (cajero)
  await root.collection('members').doc('member-cashier-seller').set({
    uid: 'member-cashier-seller',
    tenantId,
    roleId: 'cashier',
    status: 'active',
    branchIds: ['main'],
  })
  await assert.rejects(
    () => call('waiter', 'addRound', 'round8f-non-waiter-seller', {
      accountId: openVip8F.accountId,
      items: [{ productId: 'vodka-shot', quantity: 1 }],
      sellerStaffId: 'member-cashier-seller',
    }),
    err => err.code === 'failed-precondition' && err.message.includes('mesero')
  )
  // Crear mesero inactivo
  await root.collection('members').doc('waiter-inactive').set({
    uid: 'waiter-inactive',
    tenantId,
    roleId: 'waiter',
    status: 'inactive',
    branchIds: ['main'],
  })
  await assert.rejects(
    () => call('waiter', 'addRound', 'round8f-inactive-seller', {
      accountId: openVip8F.accountId,
      items: [{ productId: 'vodka-shot', quantity: 1 }],
      sellerStaffId: 'waiter-inactive',
    }),
    err => err.code === 'failed-precondition' && err.message.includes('mesero')
  )
  await call('waiter', 'finishOccupancy', 'finish-vip8f-op', { accountId: openVip8F.accountId })

  // CASO G: Mesero / Cajero intentando operaciones reservadas a Administración -> permission-denied
  // setCustomerStatus
  await assert.rejects(
    () => call('waiter', 'setCustomerStatus', 'neg-waiter-status', { customerId: 'cust-carlos', status: 'red' }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('cashier', 'setCustomerStatus', 'neg-cashier-status', { customerId: 'cust-carlos', status: 'red' }),
    err => err.code === 'permission-denied'
  )
  // cancelCourtesy
  await assert.rejects(
    () => call('waiter', 'cancelCourtesy', 'neg-waiter-cancel-courtesy', { courtesyId: 'courtesy_test' }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('cashier', 'cancelCourtesy', 'neg-cashier-cancel-courtesy', { courtesyId: 'courtesy_test' }),
    err => err.code === 'permission-denied'
  )
  // payCommissions
  await assert.rejects(
    () => call('waiter', 'payCommissions', 'neg-waiter-pay-comm', { draft: { staffId: 'waiter', amount: 10 } }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('cashier', 'payCommissions', 'neg-cashier-pay-comm', { draft: { staffId: 'waiter', amount: 10 } }),
    err => err.code === 'permission-denied'
  )

  // VALIDACIÓN CROSS-BRANCH: Clientes de otra sucursal
  await root.collection('nightclubCustomers').doc('cust-other-branch').set({
    id: 'cust-other-branch',
    tenantId,
    branchId: 'branch-2',
    name: 'Cliente Sucursal 2',
    active: true,
  })
  await assert.rejects(
    () => call('admin', 'setCustomerStatus', 'neg-cross-branch-cust', { customerId: 'cust-other-branch', status: 'red' }),
    err => err.code === 'not-found' && err.message.includes('esta sucursal')
  )
  await assert.rejects(
    () => call('admin', 'saveCustomerIncident', 'neg-cross-branch-inc', {
      incident: { customerId: 'cust-other-branch', date: '2026-10-16', severity: 'low', description: 'Incidente cross-branch' }
    }),
    err => err.code === 'not-found' && err.message.includes('esta sucursal')
  )

  // VALIDACIÓN DE CATEGORÍA CANÓNICA EN GASTOS DE CAJA
  await assert.rejects(
    () => call('cashier', 'recordCashMovement', 'neg-invalid-expense-cat', {
      movement: { type: 'expense', amount: 50, method: 'cash', description: 'Gasto inválido', category: 'categoria_falsa' }
    }),
    err => err.code === 'invalid-argument' && err.message.includes('Categoría de gasto inválida')
  )
  const validCommExpense = await call('cashier', 'recordCashMovement', 'pos-comm-expense', {
    movement: { type: 'expense', amount: 25, method: 'cash', description: 'Pago comisión turno', category: 'commissions' }
  })
  assert.equal(validCommExpense.movement.category, 'commissions')

  // Cierre de turno 8
  await call('cashier', 'closeShift', 'close-shift8-op', { shiftId: shift8Id, countedCash: 75 })

  console.log('PASS: Test 8 (N3B.1 Inventario físico, snapshots, reversiones y permisos) completado exitosamente.')

  console.log('=== TEST 9: INTEGRIDAD ECONÓMICA, MÉTODOS DE CAJA, PERMISOS ESTRICTOS Y PRODUCTOS INACTIVOS ===')
  // Test Negativo: Intentar crear miembro con custom role vía flujo REAL (createMember) -> DENIED / invalid-argument
  await assert.rejects(
    () => manageMember(db, auth, {
      auth: { uid: 'admin' },
      data: {
        action: 'createMember',
        tenantId,
        operationId: 'create-custom-lead-op',
        displayName: 'Lead Service Custom',
        email: 'lead.custom@club.bo',
        password: 'SecurePassword123!',
        roleId: 'custom:lead_service',
        nightclubPermissions: ['floor.view', 'floor.create', 'floor.edit'],
      },
    }),
    err => err.code === 'invalid-argument' && err.message.includes('Rol no válido')
  )

  // Setup additional members: partner, supervisor, and builtin waiter with customized nightclubPermissions
  await root.collection('members').doc('partner').set({
    uid: 'partner',
    tenantId,
    roleId: 'partner',
    status: 'active',
    branchIds: ['main'],
  })
  await root.collection('members').doc('supervisor').set({
    uid: 'supervisor',
    tenantId,
    roleId: 'supervisor',
    status: 'active',
    branchIds: ['main'],
  })
  await root.collection('members').doc('waiter-custom').set({
    uid: 'waiter-custom',
    tenantId,
    roleId: 'waiter',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: ['floor.view', 'accounts.view', 'accounts.create', 'accounts.edit', 'pos.view', 'pos.create'],
  })
  await root.collection('members').doc('waiter-restricted').set({
    uid: 'waiter-restricted',
    tenantId,
    roleId: 'waiter',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: ['floor.view'],
  })
  await root.collection('members').doc('waiter-empty').set({
    uid: 'waiter-empty',
    tenantId,
    roleId: 'waiter',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: [],
  })
  // Regresión authorization: Presencia de campo permissions en membership NO otorga bypass a rol no autorizado
  await root.collection('members').doc('waiter-bypass').set({
    uid: 'waiter-bypass',
    tenantId,
    roleId: 'waiter',
    status: 'active',
    branchIds: ['main'],
    permissions: ['settings.manage'],
    nightclubPermissions: ['accounts.view'],
  })
  await assert.rejects(
    () => call('waiter-bypass', 'saveZone', 'neg-bypass-zone', {
      draft: { name: 'Zona No Autorizada' },
    }),
    err => err.code === 'permission-denied'
  )

  // 1. Iniciar Turno 9 con Bs 100
  const shift9Op = await call('cashier', 'openShift', 'shift9-op', { openingFloat: 100 })
  const shift9Id = shift9Op.shiftId
  assert.ok(shift9Id)

  // 2. Configurar mesa, producto activo e inactivo
  await root.collection('nightclubTables').doc('T-TEST9').set({
    id: 'T-TEST9',
    branchId: 'main',
    name: 'Mesa Test 9',
    status: 'available',
  })
  await root.collection('nightclubProducts').doc('prod-active-9').set({
    id: 'prod-active-9',
    branchId: 'main',
    name: 'Ron Activo',
    price: 30,
    active: true,
    inventoryMode: 'none',
  })
  await root.collection('nightclubProducts').doc('prod-inactive-9').set({
    id: 'prod-inactive-9',
    branchId: 'main',
    name: 'Ron Inactivo',
    price: 30,
    active: false,
    inventoryMode: 'none',
  })

  // TEST 8 REQUERIDO: waiter-restricted (solo floor.view) llamadas directas a openAccount, addRound, deliverRound, finishOccupancy -> DENIED
  await assert.rejects(
    () => call('waiter-restricted', 'openAccount', 'neg-wr-open', { target: { type: 'table', tableId: 'T-TEST9' } }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-restricted', 'addRound', 'neg-wr-add', { accountId: 'acc-placeholder', items: [{ productId: 'prod-active-9', quantity: 1 }] }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-restricted', 'deliverRound', 'neg-wr-del', { accountId: 'acc-placeholder', roundId: 'r-placeholder' }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-restricted', 'finishOccupancy', 'neg-wr-fin', { accountId: 'acc-placeholder' }),
    err => err.code === 'permission-denied'
  )

  // TEST 9 REQUERIDO: waiter-empty (nightclubPermissions: []) -> ZERO permisos -> llamadas directas DENIED
  await assert.rejects(
    () => call('waiter-empty', 'openAccount', 'neg-we-open', { target: { type: 'table', tableId: 'T-TEST9' } }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-empty', 'addRound', 'neg-we-add', { accountId: 'acc-placeholder', items: [{ productId: 'prod-active-9', quantity: 1 }] }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-empty', 'deliverRound', 'neg-we-del', { accountId: 'acc-placeholder', roundId: 'r-placeholder' }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-empty', 'finishOccupancy', 'neg-we-fin', { accountId: 'acc-placeholder' }),
    err => err.code === 'permission-denied'
  )

  await root.collection('nightclubTables').doc('T-CUSTOM9').set({
    id: 'T-CUSTOM9',
    branchId: 'main',
    name: 'Mesa Custom 9',
    status: 'available',
  })

  // TEST 10 REQUERIDO: waiter-custom con floor.view, accounts.view, accounts.create, accounts.edit, pos.view, pos.create
  // Puede abrir cuenta, agregar ronda y entregar
  const accCustomOp = await call('waiter-custom', 'openAccount', 'acc-custom-op', { target: { type: 'table', tableId: 'T-CUSTOM9' } })
  const accCustomId = accCustomOp.accountId
  assert.ok(accCustomId)

  const roundCustomOp = await call('waiter-custom', 'addRound', 'round-custom-op', {
    accountId: accCustomId,
    items: [{ productId: 'prod-active-9', quantity: 1 }],
  })
  assert.ok(roundCustomOp.roundId)

  // waiter-custom NO tiene bar.edit, por lo que no puede avanzar la ronda
  await assert.rejects(
    () => call('waiter-custom', 'advanceRound', 'neg-waiter-custom-adv', {
      accountId: accCustomId,
      roundId: roundCustomOp.roundId,
    }),
    err => err.code === 'permission-denied'
  )

  // Barra prepara la ronda para que waiter-custom con accounts.edit pueda entregarla
  await call('bar', 'advanceRound', 'prep-custom-op', { accountId: accCustomId, roundId: roundCustomOp.roundId })
  await call('bar', 'advanceRound', 'ready-custom-op', { accountId: accCustomId, roundId: roundCustomOp.roundId })

  await call('waiter-custom', 'deliverRound', 'del-custom-op', {
    accountId: accCustomId,
    roundId: roundCustomOp.roundId,
  })

  // waiter-custom NO puede tocar caja, inventario, usuarios ni refund
  await assert.rejects(
    () => call('waiter-custom', 'recordPayment', 'neg-waiter-custom-pay', {
      accountId: accCustomId,
      amount: 30,
      paymentMethod: 'cash',
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-custom', 'recordCashMovement', 'neg-waiter-custom-cash', {
      movement: { type: 'income', amount: 30, method: 'cash', description: 'Intento de caja' },
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-custom', 'closeShift', 'neg-waiter-custom-shift', {
      shiftId: shift9Id,
      countedCash: 100,
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-custom', 'saveInventory', 'neg-waiter-custom-inv', {
      inventory: { name: 'Insumo' },
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('waiter-custom', 'refundRound', 'neg-waiter-custom-ref', {
      roundId: roundCustomOp.roundId,
      reason: 'Reembolso no autorizado',
    }),
    err => err.code === 'permission-denied'
  )

  // Cancelar la ronda de prueba como admin para restaurar saldo a 0 y permitir finishOccupancy
  await call('admin', 'cancelRound', 'cancel-custom-op', { roundId: roundCustomOp.roundId, reason: 'Limpieza test' })
  await call('waiter-custom', 'finishOccupancy', 'finish-custom-op', { accountId: accCustomId })

  // 3. Abrir cuenta acc9 con usuario waiter legacy (sin matriz explícita)
  const acc9Op = await call('waiter', 'openAccount', 'acc9-op', { target: { type: 'table', tableId: 'T-TEST9' } })
  const acc9Id = acc9Op.accountId
  assert.ok(acc9Id)

  // 4. addRound: rechazo de producto inactivo y producto inexistente
  await assert.rejects(
    () => call('waiter', 'addRound', 'neg-round-inactive', {
      accountId: acc9Id,
      items: [{ productId: 'prod-inactive-9', quantity: 1 }],
    }),
    err => err.code === 'failed-precondition' && err.message.includes('no está activo')
  )
  await assert.rejects(
    () => call('waiter', 'addRound', 'neg-round-nonexistent', {
      accountId: acc9Id,
      items: [{ productId: 'prod-ghost-xyz', quantity: 1 }],
    }),
    err => err.code === 'not-found' && err.message.includes('no encontrado')
  )

  // 5. settleRound: rechazo de producto inactivo y producto inexistente
  await assert.rejects(
    () => call('waiter', 'settleRound', 'neg-settle-inactive', {
      accountId: acc9Id,
      items: [{ productId: 'prod-inactive-9', quantity: 1 }],
      payment: { method: 'cash' },
    }),
    err => err.code === 'failed-precondition' && err.message.includes('no está activo')
  )
  await assert.rejects(
    () => call('waiter', 'settleRound', 'neg-settle-nonexistent', {
      accountId: acc9Id,
      items: [{ productId: 'prod-ghost-xyz', quantity: 1 }],
      payment: { method: 'cash' },
    }),
    err => err.code === 'not-found' && err.message.includes('no encontrado')
  )

  // 6. saveCustomer: Denegado a roles sin sales.create (partner, supervisor) y permitido a waiter
  await assert.rejects(
    () => call('partner', 'saveCustomer', 'neg-partner-cust', {
      customer: { id: 'cust-p', name: 'Cliente Partner' }
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('supervisor', 'saveCustomer', 'neg-sup-cust', {
      customer: { id: 'cust-s', name: 'Cliente Sup' }
    }),
    err => err.code === 'permission-denied'
  )
  const savedCust = await call('waiter', 'saveCustomer', 'pos-waiter-cust', {
    customer: { id: 'cust-w9', name: 'Cliente Waiter 9', phone: '70099900' }
  })
  assert.equal(savedCust.customer.name, 'Cliente Waiter 9')

  // 7. recordCashMovement: Validación estricta de method
  // Sin método -> rechazado
  await assert.rejects(
    () => call('cashier', 'recordCashMovement', 'neg-cash-no-method', {
      movement: { type: 'income', amount: 40, description: 'Sin método' }
    }),
    err => err.code === 'invalid-argument' && err.message.includes('Método de pago inválido')
  )
  // Método inválido -> rechazado
  await assert.rejects(
    () => call('cashier', 'recordCashMovement', 'neg-cash-bogus-method', {
      movement: { type: 'income', amount: 40, method: 'bitcoin', description: 'Método desconocido' }
    }),
    err => err.code === 'invalid-argument' && err.message.includes('Método de pago inválido')
  )

  // Método 'other' válido -> aceptado y persistido con method: 'other'
  const otherIncome = await call('cashier', 'recordCashMovement', 'pos-cash-other-mov', {
    movement: { type: 'income', amount: 50, method: 'other', description: 'Depósito bancario transfer' }
  })
  assert.equal(otherIncome.movement.method, 'other')
  assert.equal(otherIncome.movement.amount, 50)

  // 8. Cerrar cuenta acc9Id para permitir closeShift
  await call('waiter', 'finishOccupancy', 'finish-acc9-op', { accountId: acc9Id })

  // 9. closeShift: El movimiento 'other' NO debe alterar el efectivo físico esperado (debe seguir siendo Bs 100)
  const close9 = await call('cashier', 'closeShift', 'close-shift9-op', { shiftId: shift9Id, countedCash: 100 })
  assert.equal(close9.expectedCash, 100, 'El efectivo esperado debe ser exactamente Bs 100 ya que other no altera caja física')
  assert.equal(close9.countedCash, 100)
  assert.equal(close9.difference, 0)

  // 10. SEGURIDAD CREATE vs EDIT, INVENTARIO, BOTELLAS, LEGACY Y MATRIZ VACÍA
  // Seeding de miembros especializados
  await root.collection('members').doc('inv-prod-create').set({
    uid: 'inv-prod-create',
    tenantId,
    roleId: 'inventory',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: ['products.view', 'products.create'],
  })
  await root.collection('members').doc('inv-prod-edit').set({
    uid: 'inv-prod-edit',
    tenantId,
    roleId: 'inventory',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: ['products.view', 'products.edit'],
  })
  await root.collection('members').doc('inv-item-create').set({
    uid: 'inv-item-create',
    tenantId,
    roleId: 'inventory',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: ['inventory.view', 'inventory.create'],
  })
  await root.collection('members').doc('inv-item-edit').set({
    uid: 'inv-item-edit',
    tenantId,
    roleId: 'inventory',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: ['inventory.view', 'inventory.edit'],
  })
  await root.collection('members').doc('inv-legacy').set({
    uid: 'inv-legacy',
    tenantId,
    roleId: 'inventory',
    status: 'active',
    branchIds: ['main'],
  })
  await root.collection('members').doc('inv-empty').set({
    uid: 'inv-empty',
    tenantId,
    roleId: 'inventory',
    status: 'active',
    branchIds: ['main'],
    nightclubPermissions: [],
  })

  // TEST 6: PRODUCTS CREATE vs EDIT
  // inv-prod-create puede crear producto nuevo
  const newProd = await call('inv-prod-create', 'saveProduct', 'op-create-prod-10', {
    product: { id: 'prod-new-10', name: 'Ron Añejo Nuevo', price: 40 }
  })
  assert.equal(newProd.product.name, 'Ron Añejo Nuevo')
  assert.equal((await data('nightclubProducts/prod-new-10')).name, 'Ron Añejo Nuevo')

  // inv-prod-create NO puede modificar producto existente (falta products.edit)
  await assert.rejects(
    () => call('inv-prod-create', 'saveProduct', 'neg-inv-edit-prod', {
      product: { id: 'prod-active-9', name: 'Ron Modificado Sin Permiso', price: 50 }
    }),
    err => err.code === 'permission-denied'
  )

  // inv-prod-edit puede modificar producto existente
  const editedProd = await call('inv-prod-edit', 'saveProduct', 'op-edit-prod-10', {
    product: { id: 'prod-new-10', name: 'Ron Añejo Editado', price: 45 }
  })
  assert.equal(editedProd.product.name, 'Ron Añejo Editado')
  assert.equal((await data('nightclubProducts/prod-new-10')).name, 'Ron Añejo Editado')

  // inv-prod-edit NO puede crear producto nuevo (falta products.create)
  await assert.rejects(
    () => call('inv-prod-edit', 'saveProduct', 'neg-inv-create-prod', {
      product: { id: 'prod-unauth-new', name: 'Producto No Permitido', price: 30 }
    }),
    err => err.code === 'permission-denied'
  )

  // TEST 7: INVENTORY CREATE vs EDIT (payload.item)
  // inv-item-create puede crear inventario nuevo
  const newInv = await call('inv-item-create', 'saveInventory', 'op-create-inv-10', {
    item: { id: 'inv-item-10', name: 'Limones Nuevos', unit: 'unit', current: 50 }
  })
  assert.equal(newInv.item.name, 'Limones Nuevos')
  assert.equal((await data('nightclubInventory/inv-item-10')).name, 'Limones Nuevos')

  // inv-item-create NO puede editar inventario existente (falta inventory.edit)
  await assert.rejects(
    () => call('inv-item-create', 'saveInventory', 'neg-inv-edit-item', {
      item: { id: 'inv-cerveza', name: 'Cerveza Modificada Sin Permiso' }
    }),
    err => err.code === 'permission-denied'
  )

  // inv-item-edit puede editar inventario existente
  const editedInv = await call('inv-item-edit', 'saveInventory', 'op-edit-inv-10', {
    item: { id: 'inv-item-10', name: 'Limones Editados', current: 40 }
  })
  assert.equal(editedInv.item.name, 'Limones Editados')
  assert.equal((await data('nightclubInventory/inv-item-10')).current, 40)

  // inv-item-edit NO puede crear inventario nuevo (falta inventory.create)
  await assert.rejects(
    () => call('inv-item-edit', 'saveInventory', 'neg-inv-create-item', {
      item: { id: 'inv-unauth-new', name: 'Insumo No Permitido' }
    }),
    err => err.code === 'permission-denied'
  )

  // TEST 8: BOTTLE INVENTORY CREATE vs EDIT (payload.draft + colección nightclubInventory)
  // inv-item-create puede crear botella nueva
  const newBottle = await call('inv-item-create', 'saveBottleInventory', 'op-create-bottle-10', {
    draft: {
      id: 'inv-bottle-10',
      name: 'Whisky 12 Años',
      category: 'Licores',
      closedBottles: 5,
      cost: 120,
      capacityMl: 750,
      sellBottle: true,
      bottlePrice: 350
    }
  })
  assert.equal(newBottle.item.name, 'Whisky 12 Años')
  assert.equal((await data('nightclubInventory/inv-bottle-10')).name, 'Whisky 12 Años')

  // inv-item-create NO puede editar botella existente (falta inventory.edit)
  await assert.rejects(
    () => call('inv-item-create', 'saveBottleInventory', 'neg-inv-edit-bottle', {
      draft: { id: 'inv-bottle-10', name: 'Whisky Modificado Sin Permiso', closedBottles: 4, cost: 120, capacityMl: 750 }
    }),
    err => err.code === 'permission-denied'
  )

  // inv-item-edit puede editar botella existente
  const editedBottle = await call('inv-item-edit', 'saveBottleInventory', 'op-edit-bottle-10', {
    draft: {
      id: 'inv-bottle-10',
      name: 'Whisky 12 Años Reserva',
      category: 'Licores',
      closedBottles: 5,
      cost: 130,
      capacityMl: 750,
      sellBottle: true,
      bottlePrice: 380
    }
  })
  assert.equal(editedBottle.item.name, 'Whisky 12 Años Reserva')
  assert.equal((await data('nightclubInventory/inv-bottle-10')).name, 'Whisky 12 Años Reserva')

  // inv-item-edit NO puede crear botella nueva (falta inventory.create)
  await assert.rejects(
    () => call('inv-item-edit', 'saveBottleInventory', 'neg-inv-create-bottle', {
      draft: { id: 'inv-bottle-unauth', name: 'Tequila No Permitido', closedBottles: 3, cost: 100, capacityMl: 750 }
    }),
    err => err.code === 'permission-denied'
  )

  // TEST 9: LEGACY REGRESSION (inventory sin matriz explícita = undefined)
  const legacyProd = await call('inv-legacy', 'saveProduct', 'op-legacy-prod-10', {
    product: { id: 'prod-legacy-10', name: 'Vino Tinto', price: 50 }
  })
  assert.equal(legacyProd.product.name, 'Vino Tinto')

  const legacyInv = await call('inv-legacy', 'saveInventory', 'op-legacy-inv-10', {
    item: { id: 'inv-legacy-10', name: 'Hielo', unit: 'unit', current: 100 }
  })
  assert.equal(legacyInv.item.name, 'Hielo')

  const legacyBottle = await call('inv-legacy', 'saveBottleInventory', 'op-legacy-bottle-10', {
    draft: { id: 'inv-bottle-legacy-10', name: 'Gin Clásico', category: 'Licores', closedBottles: 4, cost: 90, capacityMl: 750, sellBottle: true, bottlePrice: 280 }
  })
  assert.equal(legacyBottle.item.name, 'Gin Clásico')

  // TEST 10: EMPTY MATRIX REGRESSION (inventory con matriz explícita vacía = [])
  await assert.rejects(
    () => call('inv-empty', 'saveProduct', 'neg-empty-prod-10', {
      product: { id: 'prod-empty-fail', name: 'Prod Fallido' }
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('inv-empty', 'saveInventory', 'neg-empty-inv-10', {
      item: { id: 'inv-empty-fail', name: 'Inv Fallido' }
    }),
    err => err.code === 'permission-denied'
  )
  await assert.rejects(
    () => call('inv-empty', 'saveBottleInventory', 'neg-empty-bottle-10', {
      draft: { id: 'inv-bottle-fail', name: 'Bottle Fallido', cost: 10, capacityMl: 750 }
    }),
    err => err.code === 'permission-denied'
  )

  console.log('PASS: Test 9 (Integridad económica, métodos de caja, permisos estrictos y productos inactivos) completado exitosamente.')

  console.log('=== TEST 10: MULTI-CASHBOX FINANCIAL ATTRIBUTION & ISOLATION ===')
  // 1. Configurar multi-caja y shifts independientes
  await root.collection('nightclubCashboxes').doc('cashbox-1').set({
    id: 'cashbox-1',
    branchId: 'main',
    name: 'Caja 1 - Principal',
    locationId: 'loc-bar-1',
  })
  await root.collection('nightclubCashboxes').doc('cashbox-2').set({
    id: 'cashbox-2',
    branchId: 'main',
    name: 'Caja 2 - Terraza',
    locationId: 'loc-bar-2',
  })
  await root.collection('nightclubLocations').doc('loc-bar-1').set({
    id: 'loc-bar-1',
    branchId: 'main',
    name: 'Barra 1',
  })
  await root.collection('nightclubLocations').doc('loc-bar-2').set({
    id: 'loc-bar-2',
    branchId: 'main',
    name: 'Barra Terraza',
  })

  // Global shift
  await root.collection('nightclubOperationalState').doc('main').set({
    activeShiftId: 'shift-global',
  }, { merge: true })
  await root.collection('nightclubShifts').doc('shift-global').set({
    id: 'shift-global',
    tenantId,
    branchId: 'main',
    status: 'open',
    openingFloat: 500,
    openedAt: new Date().toISOString(),
    openedBy: 'admin',
  })

  // Cashbox shifts
  await root.collection('nightclubShifts').doc('shift-1').set({
    id: 'shift-1',
    tenantId,
    branchId: 'main',
    status: 'open',
    cashboxId: 'cashbox-1',
    locationId: 'loc-bar-1',
    openingFloat: 100,
    openedAt: new Date().toISOString(),
    openedBy: 'cashier',
  })
  await root.collection('nightclubShifts').doc('shift-2').set({
    id: 'shift-2',
    tenantId,
    branchId: 'main',
    status: 'open',
    cashboxId: 'cashbox-2',
    locationId: 'loc-bar-2',
    openingFloat: 200,
    openedAt: new Date().toISOString(),
    openedBy: 'cashier',
  })

  // Set cashier in Caja 2
  await root.collection('nightclubOperatorContexts').doc('cashier').set({
    uid: 'cashier',
    tenantId,
    branchId: 'main',
    cashboxId: 'cashbox-2',
    locationId: 'loc-bar-2',
    activeShiftId: 'shift-2',
    updatedAt: new Date().toISOString(),
  })

  // 2. Abrir cuenta bajo Caja 2
  const accOp2 = await call('cashier', 'openAccount', 'op-acc-cb2', { target: { type: 'bar', displayName: 'Cliente Terraza' } })
  const acc2Id = accOp2.accountId
  assert.ok(acc2Id)
  const acc2Data = await data('nightclubAccounts/' + acc2Id)
  assert.equal(acc2Data.shiftId, 'shift-2')
  assert.equal(acc2Data.cashboxId, 'cashbox-2')
  assert.equal(acc2Data.locationId, 'loc-bar-2')

  // Agregar ronda y solicitar cuenta
  await call('waiter', 'addRound', 'op-round-cb2', { accountId: acc2Id, items: [{ productId: 'prod-active-9', quantity: 2 }] })
  await call('waiter', 'requestBill', 'op-bill-cb2', { accountId: acc2Id })

  // Registrar pago en efectivo bajo Caja 2
  const payOp2 = await call('cashier', 'recordPayment', 'op-pay-cb2', { accountId: acc2Id, amount: 60, method: 'cash' })
  assert.ok(payOp2.paymentId)
  const pay2Data = await data('nightclubPayments/' + payOp2.paymentId)
  assert.equal(pay2Data.shiftId, 'shift-2')
  assert.equal(pay2Data.cashboxId, 'cashbox-2')
  assert.equal(pay2Data.locationId, 'loc-bar-2')

  const mov2Data = await data('nightclubCashMovements/cash_op-pay-cb2')
  assert.equal(mov2Data.shiftId, 'shift-2')
  assert.equal(mov2Data.cashboxId, 'cashbox-2')
  assert.equal(mov2Data.locationId, 'loc-bar-2')

  // Verificar ZERO pagos o movimientos financieros bajo shift-global
  const globalPays = await root.collection('nightclubPayments').where('shiftId', '==', 'shift-global').get()
  assert.equal(globalPays.docs.length, 0)
  const globalMovs = await root.collection('nightclubCashMovements').where('shiftId', '==', 'shift-global').get()
  assert.equal(globalMovs.docs.length, 0)

  // 3. CROSS CASHBOX PAYMENT DENIED
  const accCrossOp = await call('cashier', 'openAccount', 'op-acc-cross', { target: { type: 'bar', displayName: 'Cross Acc' } })
  await call('waiter', 'addRound', 'op-round-cross', { accountId: accCrossOp.accountId, items: [{ productId: 'prod-active-9', quantity: 1 }] })
  await call('waiter', 'requestBill', 'op-bill-cross', { accountId: accCrossOp.accountId })

  // Cambiar operator context a Caja 1
  await root.collection('nightclubOperatorContexts').doc('cashier').set({
    uid: 'cashier',
    tenantId,
    branchId: 'main',
    cashboxId: 'cashbox-1',
    locationId: 'loc-bar-1',
    activeShiftId: 'shift-1',
    updatedAt: new Date().toISOString(),
  })

  // Intentar cobrar cuenta de Caja 2 estando en Caja 1 -> DENIED
  await assert.rejects(
    () => call('cashier', 'recordPayment', 'op-pay-cross-fail', { accountId: accCrossOp.accountId, amount: 30, method: 'cash' }),
    err => err.code === 'permission-denied'
  )

  const crossAccData = await data('nightclubAccounts/' + accCrossOp.accountId)
  assert.equal(crossAccData.balance, 30)
  assert.equal(crossAccData.paidTotal, 0)

  // Volver a Caja 2 -> Pago exitoso
  await root.collection('nightclubOperatorContexts').doc('cashier').set({
    uid: 'cashier',
    tenantId,
    branchId: 'main',
    cashboxId: 'cashbox-2',
    locationId: 'loc-bar-2',
    activeShiftId: 'shift-2',
    updatedAt: new Date().toISOString(),
  })
  const payCrossOk = await call('cashier', 'recordPayment', 'op-pay-cross-ok', { accountId: accCrossOp.accountId, amount: 30, method: 'cash' })
  assert.ok(payCrossOk.paymentId)

  // 4. MANUAL CASH MOVEMENT TEST
  const movExpOp = await call('cashier', 'recordCashMovement', 'op-mov-exp', {
    amount: 45,
    type: 'expense',
    method: 'cash',
    description: 'Compra hielo adicional',
    category: 'cleaning',
  })
  const movExpData = await data('nightclubCashMovements/cash_mov_op-mov-exp')
  assert.equal(movExpData.shiftId, 'shift-2')
  assert.equal(movExpData.cashboxId, 'cashbox-2')
  assert.equal(movExpData.locationId, 'loc-bar-2')

  // 5. RESERVATION ARRIVAL MULTI-CASHBOX TEST
  await root.collection('nightclubTables').doc('T-RES-10').set({
    id: 'T-RES-10',
    branchId: 'main',
    name: 'Mesa Reserva 10',
    status: 'available',
  })
  await root.collection('nightclubReservations').doc('RES-10').set({
    id: 'RES-10',
    branchId: 'main',
    tableId: 'T-RES-10',
    customerName: 'Cliente VIP Reserva',
    status: 'confirmed',
    guests: 4,
  })
  const arriveOp = await call('cashier', 'arriveReservation', 'op-arrive-res10', { id: 'RES-10' })
  const resAccData = await data('nightclubAccounts/' + arriveOp.accountId)
  assert.equal(resAccData.shiftId, 'shift-2')
  assert.equal(resAccData.cashboxId, 'cashbox-2')
  assert.equal(resAccData.locationId, 'loc-bar-2')

  // 6. COMMISSION PAYMENT SHIFT TEST
  // Asignar comision a mesero
  await root.collection('nightclubCommissions').doc('comm-test-10').set({
    id: 'comm-test-10',
    tenantId,
    branchId: 'main',
    staffId: 'waiter',
    amount: 25,
    paidAmount: 0,
    status: 'earned',
    createdAt: new Date().toISOString(),
  })
    await root.collection('nightclubOperatorContexts').doc('admin').set({
    uid: 'admin',
    tenantId,
    branchId: 'main',
    cashboxId: 'cashbox-2',
    locationId: 'loc-bar-2',
    activeShiftId: 'shift-2',
    updatedAt: new Date().toISOString(),
  })
  const commPayOp = await call('admin', 'payCommissions', 'op-pay-comm-10', {
    draft: {
      staffId: 'waiter',
      amount: 25,
      method: 'cash',
      commissionIds: ['comm-test-10'],
    }
  })
  assert.ok(commPayOp.paymentId)
  const commPayData = await data('nightclubCommissionPayments/' + commPayOp.paymentId)
  assert.equal(commPayData.shiftId, 'shift-2')
  assert.equal(commPayData.cashboxId, 'cashbox-2')
  assert.equal(commPayData.locationId, 'loc-bar-2')

  const commMovData = await data('nightclubCashMovements/comm_' + commPayOp.paymentId)
  assert.equal(commMovData.shiftId, 'shift-2')
  assert.equal(commMovData.cashboxId, 'cashbox-2')
  assert.equal(commMovData.locationId, 'loc-bar-2')

  console.log('PASS: Test 10 (Multi-cashbox financial attribution & isolation) completado exitosamente.')

  // ==================================================================
  console.log('=== TEST 11: PAY COMMISSIONS EXIGE TURNO MULTI-CAJA ABIERTO ===')
  await root.collection('nightclubOperationalState').doc('main').set({ activeShiftId: 'shift-global' }, { merge: true })
  await root.collection('nightclubShifts').doc('shift-global').set({ status: 'open' }, { merge: true })
  await root.collection('nightclubShifts').doc('shift-2c').set({
    id: 'shift-2c', tenantId, branchId: 'main', status: 'closed',
    cashboxId: 'cashbox-2', locationId: 'loc-bar-2', openingFloat: 0,
    openedAt: new Date().toISOString(), openedBy: 'admin',
  })
  await root.collection('nightclubOperatorContexts').doc('admin').set({
    uid: 'admin', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'loc-bar-2',
    activeShiftId: 'shift-2c', updatedAt: new Date().toISOString(),
  })
  await root.collection('nightclubCommissions').doc('comm-test-11').set({
    id: 'comm-test-11', tenantId, branchId: 'main', staffId: 'waiter', amount: 15, paidAmount: 0,
    status: 'earned', createdAt: new Date().toISOString(),
  })
  const commDraft11 = { draft: { staffId: 'waiter', amount: 15, method: 'cash', commissionIds: ['comm-test-11'] } }
  await assert.rejects(
    () => call('admin', 'payCommissions', 'op-pay-comm-11-fail', commDraft11),
    err => err.code === 'failed-precondition',
  )
  assert.equal((await root.collection('nightclubCommissionPayments').doc('compay_op-pay-comm-11-fail').get()).exists, false)
  assert.equal((await root.collection('nightclubCashMovements').doc('comm_compay_op-pay-comm-11-fail').get()).exists, false)
  assert.equal((await data('nightclubCommissions/comm-test-11')).paidAmount, 0)
  const globalCommPays = await root.collection('nightclubCommissionPayments').where('shiftId', '==', 'shift-global').get()
  assert.equal(globalCommPays.docs.length, 0)

  // Turno de la caja abierto correctamente -> pago permitido y atribuido a shift-2c
  await root.collection('nightclubShifts').doc('shift-2c').set({ status: 'open' }, { merge: true })
  const commPay11 = await call('admin', 'payCommissions', 'op-pay-comm-11-ok', commDraft11)
  const commPay11Data = await data('nightclubCommissionPayments/' + commPay11.paymentId)
  assert.equal(commPay11Data.shiftId, 'shift-2c')
  assert.equal(commPay11Data.cashboxId, 'cashbox-2')
  assert.equal(commPay11Data.locationId, 'loc-bar-2')
  const commMov11 = await data('nightclubCashMovements/comm_' + commPay11.paymentId)
  assert.equal(commMov11.shiftId, 'shift-2c')
  assert.equal(commMov11.cashboxId, 'cashbox-2')
  assert.equal(commMov11.locationId, 'loc-bar-2')
  console.log('PASS: Test 11 (payCommissions con turno multi-caja cerrado denegado y atribución correcta) completado.')

  // ==================================================================
  console.log('=== TEST 12: NO SE PUEDE CERRAR EL TURNO GLOBAL DESDE UNA CAJA ===')
  await root.collection('nightclubShifts').doc('shift-2d').set({
    id: 'shift-2d', tenantId, branchId: 'main', status: 'open',
    cashboxId: 'cashbox-2', locationId: 'loc-bar-2', openingFloat: 50,
    openedAt: new Date().toISOString(), openedBy: 'cashier',
  })
  await root.collection('nightclubOperatorContexts').doc('cashier').set({
    uid: 'cashier', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'loc-bar-2',
    activeShiftId: 'shift-2d', updatedAt: new Date().toISOString(),
  })
  await assert.rejects(
    () => call('cashier', 'closeShift', 'op-close-global-from-cb2', { shiftId: 'shift-global', countedCash: 100000 }),
    err => err.code === 'permission-denied',
  )
  assert.equal((await data('nightclubShifts/shift-global')).status, 'open')
  assert.equal((await data('nightclubShifts/shift-2d')).status, 'open')
  assert.equal((await data('nightclubOperationalState/main')).activeShiftId, 'shift-global')

  const close2d = await call('cashier', 'closeShift', 'op-close-2d', { shiftId: 'shift-2d', countedCash: 50 })
  assert.equal(close2d.shiftId, 'shift-2d')
  assert.equal((await data('nightclubShifts/shift-2d')).status, 'closed')
  assert.equal((await data('nightclubShifts/shift-global')).status, 'open')
  assert.equal((await data('nightclubOperatorContexts/cashier')).activeShiftId, null)
  console.log('PASS: Test 12 (cierre global desde caja denegado; cierre de caja activa permitido) completado.')

  // ==================================================================
  console.log('=== TEST 13: NO SE PUEDE CERRAR OTRA CAJA ===')
  await root.collection('nightclubShifts').doc('shift-2e').set({
    id: 'shift-2e', tenantId, branchId: 'main', status: 'open',
    cashboxId: 'cashbox-2', locationId: 'loc-bar-2', openingFloat: 0,
    openedAt: new Date().toISOString(), openedBy: 'cashier',
  })
  await root.collection('nightclubOperatorContexts').doc('cashier').set({
    uid: 'cashier', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'loc-bar-2',
    activeShiftId: 'shift-2e', updatedAt: new Date().toISOString(),
  })
  const shift1Before = await data('nightclubShifts/shift-1')
  assert.equal(shift1Before.status, 'open')
  await assert.rejects(
    () => call('cashier', 'closeShift', 'op-close-shift1-from-cb2', { shiftId: 'shift-1', countedCash: 100000 }),
    err => err.code === 'permission-denied',
  )
  assert.deepEqual(await data('nightclubShifts/shift-1'), shift1Before)
  console.log('PASS: Test 13 (cierre de otra caja denegado sin modificar su turno) completado.')

  // ==================================================================
  console.log('=== TEST 14: CIERRE LEGACY SIN CONTEXTO DE CAJA ===')
  await root.collection('members').doc('legacyCashier').set({
    uid: 'legacyCashier', tenantId, roleId: 'cashier', status: 'active', branchIds: ['main'],
  })
  await root.collection('nightclubShifts').doc('shift-legacy').set({
    id: 'shift-legacy', tenantId, branchId: 'main', status: 'open', openingFloat: 0,
    openedAt: new Date().toISOString(), openedBy: 'legacyCashier',
  })
  await root.collection('nightclubOperationalState').doc('main').set({ activeShiftId: 'shift-legacy' }, { merge: true })
  const closeLegacy = await call('legacyCashier', 'closeShift', 'op-close-legacy', { shiftId: 'shift-legacy', countedCash: 0 })
  assert.equal(closeLegacy.shiftId, 'shift-legacy')
  assert.equal((await data('nightclubShifts/shift-legacy')).status, 'closed')
  assert.equal((await data('nightclubOperationalState/main')).activeShiftId, null)
  console.log('PASS: Test 14 (cierre legacy sin caja compatible) completado.')

  // ==================================================================
  console.log('=== TEST 15: ASIGNACIÓN DE CAJAS Y AUTORIZACIÓN ACTUALIZADA ===')
  for (const [cashboxId, locationId, name] of [['cashbox-1', 'loc-bar-1', 'Caja 1'], ['cashbox-2', 'loc-bar-2', 'Caja 2']]) {
    await root.collection('nightclubCashboxes').doc(cashboxId).set({ id: cashboxId, tenantId, branchId: 'main', locationId, name, active: true })
    await root.collection('nightclubLocations').doc(locationId).set({ id: locationId, tenantId, branchId: 'main', type: 'cashbox', linkedCashboxId: cashboxId, name, active: true })
  }
  const manage = (uid, data, tId = tenantId) => manageMember(db, auth, { auth: { uid }, data: { tenantId: tId, ...data } })
  const assigned = await manage('admin', {
    action: 'createMember', operationId: `assigned-${suffix}`, email: `assigned-${suffix}@example.test`,
    password: 'EmulatorOnly123!', displayName: 'Cashier assigned', roleId: 'cashier', branchIds: ['main'], cashboxIds: ['cashbox-1'],
  })
  let assignedMember = await root.collection('members').doc(assigned.uid).get()
  assert.deepEqual(assignedMember.data().cashboxIds, ['cashbox-1'])
  console.log('PASS: createMember persiste la asignación de Caja 1.')

  await manage('admin', { action: 'updateMember', uid: assigned.uid, displayName: 'Cashier assignment retained' })
  assignedMember = await root.collection('members').doc(assigned.uid).get()
  assert.deepEqual(assignedMember.data().cashboxIds, ['cashbox-1'])
  await manage('admin', { action: 'updateMember', uid: assigned.uid, cashboxIds: ['cashbox-2'] })
  assignedMember = await root.collection('members').doc(assigned.uid).get()
  assert.deepEqual(assignedMember.data().cashboxIds, ['cashbox-2'])
  await manage('admin', { action: 'updateMember', uid: assigned.uid, cashboxIds: [] })
  assignedMember = await root.collection('members').doc(assigned.uid).get()
  assert.deepEqual(assignedMember.data().cashboxIds, [])
  await manage('admin', { action: 'updateMember', uid: assigned.uid, cashboxIds: null })
  assignedMember = await root.collection('members').doc(assigned.uid).get()
  assert.equal(Object.hasOwn(assignedMember.data(), 'cashboxIds'), false)
  console.log('PASS: updateMember cambia, restringe a ninguna caja y elimina explícitamente la restricción.')

  await assert.rejects(() => manage('admin', {
    action: 'createMember', operationId: `invalid-box-${suffix}`, email: `invalid-box-${suffix}@example.test`,
    password: 'EmulatorOnly123!', displayName: 'Invalid assignment', roleId: 'cashier', branchIds: ['main'], cashboxIds: ['missing-box'],
  }), error => error.code === 'invalid-argument')
  await assert.rejects(() => auth.getUserByEmail(`invalid-box-${suffix}@example.test`), error => error.code === 'auth/user-not-found')
  await assert.rejects(() => manage('admin', {
    action: 'createMember', operationId: `duplicate-box-${suffix}`, email: `duplicate-box-${suffix}@example.test`,
    password: 'EmulatorOnly123!', displayName: 'Duplicate assignment', roleId: 'cashier', branchIds: ['main'], cashboxIds: ['cashbox-1', 'cashbox-1'],
  }), error => error.code === 'invalid-argument')
  await assert.rejects(() => manage('waiter', { action: 'updateMember', uid: assigned.uid, cashboxIds: ['cashbox-2'] }), error => error.code === 'permission-denied')
  await assert.rejects(() => manage('cashier', { action: 'updateMember', uid: 'cashier', cashboxIds: ['cashbox-2'] }), error => error.code === 'permission-denied')
  await assert.rejects(() => manage('intruder', { action: 'updateMember', uid: assigned.uid, cashboxIds: ['cashbox-2'] }), error => error.code === 'permission-denied')
  await root.collection('nightclubCashboxes').doc('inactive-box').set({ id: 'inactive-box', tenantId, branchId: 'main', locationId: 'loc-inactive', active: false })
  await assert.rejects(() => manage('admin', { action: 'updateMember', uid: assigned.uid, cashboxIds: ['inactive-box'] }), error => error.code === 'invalid-argument')
  await root.collection('nightclubCashboxes').doc('foreign-box').set({ id: 'foreign-box', tenantId: otherTenantId, branchId: 'main', locationId: 'foreign-location', active: true })
  await assert.rejects(() => manage('admin', { action: 'updateMember', uid: assigned.uid, cashboxIds: ['foreign-box'] }), error => error.code === 'invalid-argument')
  await root.collection('branches').doc('other-branch').set({ id: 'other-branch', tenantId, active: true })
  await root.collection('nightclubCashboxes').doc('other-branch-box').set({ id: 'other-branch-box', tenantId, branchId: 'other-branch', locationId: 'loc-other', active: true })
  await assert.rejects(() => manage('admin', { action: 'updateMember', uid: assigned.uid, cashboxIds: ['other-branch-box'] }), error => error.code === 'invalid-argument')
  await root.collection('members').doc('partialSupervisor').set({ uid: 'partialSupervisor', tenantId, roleId: 'supervisor', status: 'active', branchIds: ['main'], nightclubPermissions: ['special.manageUsers'] })
  await assert.rejects(() => manage('partialSupervisor', { action: 'updateMember', uid: assigned.uid, cashboxIds: null }), error => error.code === 'permission-denied')
  await root.collection('members').doc('waiter').update({ status: 'disabled' })
  await assert.rejects(() => manage('waiter', { action: 'updateMember', uid: assigned.uid, cashboxIds: [] }), error => error.code === 'permission-denied')
  await root.collection('members').doc('waiter').update({ status: 'active' })
  console.log('PASS: asignaciones inválidas, caja inactiva, sucursal no autorizada, waiter y tenant ajeno son rechazados; Auth no crea usuarios huérfanos.')

  // A stale Caja 2 operatorContext cannot authorize payment after membership is reduced to Caja 1.
  await root.collection('members').doc('cashier').update({ cashboxIds: ['cashbox-1'] })
  await root.collection('nightclubAccounts').doc('assignment-cross-account').set({
    id: 'assignment-cross-account', tenantId, branchId: 'main', status: 'bill_requested', cashboxId: 'cashbox-2',
    locationId: 'loc-bar-2', shiftId: 'shift-2', subtotal: 30, paidTotal: 0, balance: 30,
  })
  await assert.rejects(() => call('cashier', 'recordPayment', 'assignment-cross-payment', { accountId: 'assignment-cross-account', amount: 30, method: 'cash' }), error => error.code === 'permission-denied')
  assert.equal((await data('nightclubAccounts/assignment-cross-account')).balance, 30)
  assert.equal((await root.collection('nightclubPayments').doc('payment_assignment-cross-payment').get()).exists, false)
  assert.equal((await root.collection('nightclubCashMovements').doc('cash_assignment-cross-payment').get()).exists, false)
  await assert.rejects(() => call('cashier', 'selectCashbox', 'assignment-select-box2', { cashboxId: 'cashbox-2' }), error => error.code === 'permission-denied')
  await assert.rejects(() => call('cashier', 'openCashboxShift', 'assignment-open-box2', { cashboxId: 'cashbox-2', openingFloat: 50 }), error => error.code === 'permission-denied')
  await root.collection('nightclubOperatorContexts').doc('cashier').set({ uid: 'cashier', tenantId, branchId: 'main', cashboxId: 'cashbox-1', locationId: 'loc-bar-1', activeShiftId: 'shift-1' })
  await root.collection('nightclubAccounts').doc('assignment-authorized-account').set({
    id: 'assignment-authorized-account', tenantId, branchId: 'main', status: 'bill_requested', cashboxId: 'cashbox-1',
    locationId: 'loc-bar-1', shiftId: 'shift-1', subtotal: 20, paidTotal: 0, balance: 20,
  })
  const allowedAssignedPayment = await call('cashier', 'recordPayment', 'assignment-authorized-payment', { accountId: 'assignment-authorized-account', amount: 20, method: 'cash' })
  assert.ok(allowedAssignedPayment.paymentId)
  assert.equal((await data(`nightclubAccounts/${'assignment-authorized-account'}`)).balance, 0)
  console.log('PASS: operatorContext Caja 2 obsoleto no autoriza selección, apertura ni cobro; cobro en Caja 1 sí funciona y el intento rechazado no genera escrituras.')

  // Rules currently scope these financial reads by role and branch, not membership.cashboxIds.
  const restricted = root.collection('members').doc('cashier')
  await restricted.update({ cashboxIds: ['cashbox-1'] })
  const readDb = rulesEnv.authenticatedContext('cashier').firestore()
  await assertSucceeds(getDoc(doc(readDb, `tenants/${tenantId}/nightclubAccounts/assignment-cross-account`)))
  await assertSucceeds(getDoc(doc(readDb, `tenants/${tenantId}/nightclubPayments/${payCrossOk.paymentId}`)))
  await assertSucceeds(getDocs(query(collection(readDb, `tenants/${tenantId}/nightclubAccounts`), where('branchId', '==', 'main'))))
  await assertSucceeds(getDocs(query(collection(readDb, `tenants/${tenantId}/nightclubPayments`), where('branchId', '==', 'main'))))
  console.log('READ SCOPE: cashier limitado a Caja 1 todavía puede leer cuentas y pagos de Caja 2 por reglas actuales de rol+sucursal.')

} finally {
  await rulesEnv.cleanup()
  await deleteApp(app)
}
