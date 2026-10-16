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
} finally {
  await deleteApp(app)
}
