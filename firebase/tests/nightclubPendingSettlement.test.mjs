import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantId = `nightclub-pending-settle-${suffix}`
const owner = `owner-${suffix}`, cashier = `cashier-${suffix}`, denied = `denied-${suffix}`, cashierOne = `cashier-one-${suffix}`
const app = initializeApp({ projectId }, `pending-settle-${suffix}`)
const db = getFirestore(app), auth = getAuth(app), root = db.doc(`tenants/${tenantId}`)
const pass = value => console.log(`PASS ${value}`)
async function token(uid) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }) })
  assert.equal(response.ok, true)
  return (await response.json()).idToken
}
async function command(idToken, commandType, operationId, payload, branchId = 'main') {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId, branchId, commandType, operationId, payload } }) })
  return { response, body: await response.json() }
}
async function openPending(idToken, key, quantity = 3) {
  const opened = await command(idToken, 'openAccount', `open-${key}`, { target: { type: 'bar', displayName: 'Cliente prueba' } })
  assert.equal(opened.response.ok, true)
  const accountId = opened.body.result.accountId
  const pending = await command(idToken, 'createPendingRound', `pending-${key}`, { accountId, items: [{ productId: 'beer', quantity }] })
  assert.equal(pending.response.ok, true)
  return { accountId, roundId: pending.body.result.roundId }
}
try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  await root.collection('members').doc(owner).set({ uid: owner, tenantId, roleId: 'owner', status: 'active', branchIds: ['main'] })
  await root.collection('members').doc(cashier).set({ uid: cashier, tenantId, roleId: 'cashier', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-2'] })
  await root.collection('members').doc(cashierOne).set({ uid: cashierOne, tenantId, roleId: 'cashier', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-1'] })
  await root.collection('members').doc(denied).set({ uid: denied, tenantId, roleId: 'restricted', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-2'] })
  for (const number of [1, 2, 3, 4]) {
    await root.collection('nightclubCashboxes').doc(`cashbox-${number}`).set({ id: `cashbox-${number}`, tenantId, branchId: 'main', locationId: `cashbox-${number}`, active: true })
    await root.collection('nightclubShifts').doc(`shift-${number}`).set({ id: `shift-${number}`, tenantId, branchId: 'main', cashboxId: `cashbox-${number}`, locationId: `cashbox-${number}`, status: 'open' })
  }
  for (const [uid, number] of [[owner, 2], [cashier, 2], [cashierOne, 1], [denied, 2]]) await root.collection('nightclubOperatorContexts').doc(uid).set({ id: uid, tenantId, userId: uid, branchId: 'main', cashboxId: `cashbox-${number}`, locationId: `cashbox-${number}`, activeShiftId: `shift-${number}` })
  await root.collection('nightclubProducts').doc('beer').set({ id: 'beer', tenantId, branchId: 'main', name: 'Cerveza', price: 100, active: true, inventoryMode: 'recipe', preparationArea: 'Barra', recipe: [{ inventoryId: 'beer-stock', quantity: 1, unit: 'unit' }] })
  for (const [number, quantity] of [[1,20],[2,30],[3,10],[4,15]]) {
    const locationId=`cashbox-${number}`
    await root.collection('nightclubInventoryBalances').doc(`${locationId}:beer-stock`).set({ id: `${locationId}:beer-stock`, tenantId, branchId: 'main', locationId, inventoryId: 'beer-stock', availableQuantity: quantity, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: 'unit', updatedAt: '2026-01-01T00:00:00.000Z' })
    await root.collection('nightclubInventoryLots').doc(`lot-${number}`).set({ id: `lot-${number}`, tenantId, branchId: 'main', locationId, inventoryId: 'beer-stock', remainingQuantity: quantity, receivedQuantity: quantity, unitCost: 40 + number, receivedAt: `2026-01-0${number}T00:00:00.000Z`, status: 'available' })
  }
  const ownerToken = await token(owner), cashierToken = await token(cashier), cashierOneToken = await token(cashierOne), deniedToken = await token(denied)
  const first = await openPending(cashierToken, 'cash')
  const initialRound = (await root.collection('nightclubRounds').doc(first.roundId).get()).data()
  assert.equal(initialRound.total, 300); assert.equal(initialRound.authorization, 'account_charge')
  const settled = await command(cashierToken, 'settlePendingRound', 'settle-cash', { accountId: first.accountId, roundId: first.roundId, payment: { method: 'cash', received: 350 } })
  assert.equal(settled.response.ok, true); assert.equal(settled.body.result.roundId, first.roundId)
  const round = (await root.collection('nightclubRounds').doc(first.roundId).get()).data()
  const payment = (await root.collection('nightclubPayments').doc(settled.body.result.paymentId).get()).data()
  assert.equal(round.authorization, 'payment'); assert.equal(round.paymentId, payment.id); assert.equal(round.items[0].id, initialRound.items[0].id); assert.equal(round.items[0].fifoAllocations[0].itemId, initialRound.items[0].id)
  assert.deepEqual({ amount: payment.amount, cash: payment.cashAmount, change: payment.change }, { amount: 300, cash: 300, change: 50 })
  assert.equal((await root.collection('nightclubInventoryBalances').doc('cashbox-2:beer-stock').get()).data().availableQuantity, 27)
  for (const [number, quantity] of [[1,20],[3,10],[4,15]]) assert.equal((await root.collection('nightclubInventoryBalances').doc(`cashbox-${number}:beer-stock`).get()).data().availableQuantity, quantity)
  assert.equal((await root.collection('nightclubCashMovements').where('roundId', '==', first.roundId).get()).size, 1)
  pass('liquida la misma ronda, descuenta FIFO solo de Caja 2 y registra efectivo/cambio')
  const retry = await command(cashierToken, 'settlePendingRound', 'settle-cash', { accountId: first.accountId, roundId: first.roundId, payment: { method: 'cash', received: 350 } })
  assert.equal(retry.response.ok, true); assert.equal(retry.body.result.paymentId, payment.id)
  assert.equal((await root.collection('nightclubPayments').where('roundId', '==', first.roundId).get()).size, 1)
  assert.equal((await root.collection('nightclubInventoryBalances').doc('cashbox-2:beer-stock').get()).data().availableQuantity, 27)
  const concurrent = await command(cashierToken, 'settlePendingRound', 'settle-cash-other', { accountId: first.accountId, roundId: first.roundId, payment: { method: 'cash', received: 300 } })
  assert.equal(concurrent.response.ok, false)
  pass('idempotencia y segundo cobro de la misma ronda se rechazan')
  const qr = await openPending(cashierToken, 'qr', 1)
  assert.equal((await command(cashierToken, 'settlePendingRound', 'settle-qr-no-confirm', { accountId: qr.accountId, roundId: qr.roundId, payment: { method: 'qr' } })).response.ok, false)
  assert.equal((await command(cashierToken, 'settlePendingRound', 'settle-qr', { accountId: qr.accountId, roundId: qr.roundId, payment: { method: 'qr', confirmed: true } })).response.ok, true)
  const mixed = await openPending(cashierToken, 'mixed', 1)
  const mixedReply = await command(cashierToken, 'settlePendingRound', 'settle-mixed', { accountId: mixed.accountId, roundId: mixed.roundId, payment: { method: 'mixed', cashAmount: 20, qrAmount: 30, cardAmount: 50, received: 25, confirmed: true } })
  assert.equal(mixedReply.response.ok, true)
  assert.deepEqual(Object.fromEntries(Object.entries((await root.collection('nightclubPayments').doc(mixedReply.body.result.paymentId).get()).data()).filter(([key]) => ['cashAmount','qrAmount','cardAmount','change'].includes(key))), { cashAmount: 20, qrAmount: 30, cardAmount: 50, change: 5 })
  pass('QR requiere confirmaci�n y el pago mixto registra cada componente')
  const billFirst = await openPending(cashierToken, 'bill-first', 1)
  const requestBill = await command(ownerToken, 'requestBill', 'bill-first-request', { accountId: billFirst.accountId })
  assert.equal(requestBill.response.ok, true, JSON.stringify(requestBill.body))
  assert.equal((await command(cashierToken, 'recordPayment', 'bill-first-payment', { accountId: billFirst.accountId, amount: 100, method: 'cash', received: 100 })).response.ok, false)
  assert.equal((await root.collection('nightclubPayments').where('accountId', '==', billFirst.accountId).get()).empty, true)
  const billFirstSettlement = await command(cashierToken, 'settlePendingRound', 'bill-first-settlement', { accountId: billFirst.accountId, roundId: billFirst.roundId, payment: { method: 'cash', received: 100 } })
  assert.equal(billFirstSettlement.response.ok, true)
  assert.equal((await root.collection('nightclubAccounts').doc(billFirst.accountId).get()).data().balance, 0)
  pass('account-level payment is blocked until pending rounds are settled')
  const accountPaid = await openPending(cashierToken, 'account-paid-first', 1)
  await root.collection('nightclubAccounts').doc(accountPaid.accountId).update({ subtotal: 200, paidTotal: 100, balance: 100 })
  await root.collection('nightclubPayments').doc('legacy-account-payment').set({ id: 'legacy-account-payment', tenantId, branchId: 'main', accountId: accountPaid.accountId, status: 'confirmed', amount: 100, cashAmount: 100, method: 'cash' })
  const duplicateAcrossPaymentPaths = await command(cashierToken, 'settlePendingRound', 'settle-after-account-payment', { accountId: accountPaid.accountId, roundId: accountPaid.roundId, payment: { method: 'cash', received: 100 } })
  assert.equal(duplicateAcrossPaymentPaths.response.ok, false)
  assert.equal((await root.collection('nightclubPayments').where('accountId', '==', accountPaid.accountId).get()).size, 1)
  assert.equal((await root.collection('nightclubRounds').doc(accountPaid.roundId).get()).data().authorization, 'account_charge')
  pass('previous account-level payment cannot be charged again through round settlement')
  const prepared = await openPending(cashierToken, 'prepared', 1)
  const prepResult = await command(ownerToken, 'advanceRound', 'prepare-before-round-settlement', { accountId: prepared.accountId, roundId: prepared.roundId })
  assert.equal(prepResult.response.ok, true)
  assert.equal(prepResult.body.result.status, 'preparing')
  const preparedSettlement = await command(cashierToken, 'settlePendingRound', 'settle-prepared-round', { accountId: prepared.accountId, roundId: prepared.roundId, payment: { method: 'card', confirmed: true } })
  assert.equal(preparedSettlement.response.ok, true)
  assert.equal((await root.collection('nightclubRounds').doc(prepared.roundId).get()).data().status, 'preparing')
  pass('liquidar una ronda que ya entró a preparación conserva su estado de Barra')
  const wrongBox = await openPending(cashierToken, 'wrong-box', 1)
  assert.equal((await command(cashierOneToken, 'settlePendingRound', 'settle-wrong-box', { accountId: wrongBox.accountId, roundId: wrongBox.roundId, payment: { method: 'card', confirmed: true } })).response.ok, false)
  assert.equal((await command(deniedToken, 'settlePendingRound', 'settle-denied', { accountId: wrongBox.accountId, roundId: wrongBox.roundId, payment: { method: 'card', confirmed: true } })).response.ok, false)
  assert.equal((await root.collection('nightclubPayments').where('roundId', '==', wrongBox.roundId).get()).empty, true)
  pass('caja ajena y usuario sin sales.create no generan pagos')
  const concurrentRound = await openPending(cashierToken, 'concurrent', 1)
  const [firstAttempt, secondAttempt] = await Promise.all([
    command(cashierToken, 'settlePendingRound', 'settle-concurrent-a', { accountId: concurrentRound.accountId, roundId: concurrentRound.roundId, payment: { method: 'card', confirmed: true } }),
    command(cashierToken, 'settlePendingRound', 'settle-concurrent-b', { accountId: concurrentRound.accountId, roundId: concurrentRound.roundId, payment: { method: 'card', confirmed: true } }),
  ])
  assert.equal([firstAttempt.response.ok, secondAttempt.response.ok].filter(Boolean).length, 1)
  assert.equal((await root.collection('nightclubPayments').where('roundId', '==', concurrentRound.roundId).get()).size, 1)
  pass('dos operadores lógicos no pueden cobrar dos veces la misma ronda pendiente')
  await root.collection('nightclubInventoryBalances').doc('cashbox-2:beer-stock').update({ availableQuantity: 0 })
  const insufficient = await openPending(cashierToken, 'stock', 1)
  assert.equal((await command(cashierToken, 'settlePendingRound', 'settle-stock', { accountId: insufficient.accountId, roundId: insufficient.roundId, payment: { method: 'card', confirmed: true } })).response.ok, false)
  assert.equal((await root.collection('nightclubPayments').where('roundId', '==', insufficient.roundId).get()).empty, true)
  assert.equal((await root.collection('nightclubRounds').doc(insufficient.roundId).get()).data().authorization, 'account_charge')
  pass('stock insuficiente no deja pago ni consumo parcial')
} finally { await deleteApp(app) }
