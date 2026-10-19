import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { subscribeToNightclubFirestoreDataset } from '../../src/modules/nightclub/data/nightclubFirestoreDataset.ts'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantId = `nightclub-dataset-${suffix}`
const userId = `reader-${suffix}`
const environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `nightclub-dataset-${suffix}`)
const admin = getFirestore(app)
const root = admin.doc(`tenants/${tenantId}`)
const snapshots = []
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const value = snapshots.at(-1)
    if (value && predicate(value)) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Tiempo agotado esperando: ${label}`)
}
const seed = async () => {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  await root.collection('members').doc(userId).set({ uid: userId, tenantId, roleId: 'admin', status: 'active', branchIds: ['branch-1', 'branch-2'] })
  await root.collection('nightclubAccounts').doc('cashbox-2-account').set({ id: 'cashbox-2-account', tenantId, branchId: 'branch-1', cashboxId: 'cashbox-2', locationId: 'cashbox-2', openedAt: '2026-10-12T20:00:00.000Z', openedBy: 'cashier', status: 'open', subtotal: 120, serviceTarget: { type: 'bar' } })
  await root.collection('nightclubRounds').doc('cashbox-2-round').set({ id: 'cashbox-2-round', tenantId, branchId: 'branch-1', accountId: 'cashbox-2-account', sequence: 1, createdAt: '2026-10-12T20:01:00.000Z', status: 'ready', items: [{ id: 'beer-line', productId: 'beer', name: 'Cerveza', quantity: 2, unitPrice: 60, lineTotal: 120 }] })
  await root.collection('nightclubPayments').doc('cashbox-2-payment').set({ id: 'cashbox-2-payment', tenantId, branchId: 'branch-1', accountId: 'cashbox-2-account', roundId: 'cashbox-2-round', amount: 120, refundedAmount: 0, method: 'qr', status: 'paid', paidAt: '2026-10-12T20:02:00.000Z' })
  await root.collection('nightclubAccounts').doc('branch-2-account').set({ id: 'branch-2-account', tenantId, branchId: 'branch-2', cashboxId: 'cashbox-1', locationId: 'cashbox-1', openedAt: '2026-10-12T21:00:00.000Z', openedBy: 'cashier', status: 'open', subtotal: 90, serviceTarget: { type: 'bar' } })
  await root.collection('nightclubRounds').doc('branch-2-round').set({ id: 'branch-2-round', tenantId, branchId: 'branch-2', accountId: 'branch-2-account', sequence: 1, createdAt: '2026-10-12T21:01:00.000Z', status: 'ready', items: [{ id: 'gin-line', productId: 'gin', name: 'Gin', quantity: 1, unitPrice: 90, lineTotal: 90 }] })
}

try {
  await seed()
  const client = environment.authenticatedContext(userId).firestore()
  let error = null
  let subscription = subscribeToNightclubFirestoreDataset(client, tenantId, 'branch-1', data => snapshots.push(data), value => { error = value })
  const branchOne = await waitFor(data => data.accounts.length === 1 && data.accounts[0].rounds.length === 1 && data.accounts[0].payments.length === 1, 'cuenta, ronda y pago Caja 2')
  assert.equal(error, null)
  assert.equal(branchOne.accounts[0].id, 'cashbox-2-account')
  assert.equal(branchOne.accounts[0].cashboxId, 'cashbox-2')
  assert.equal(branchOne.accounts[0].rounds[0].id, 'cashbox-2-round')
  assert.equal(branchOne.accounts[0].rounds[0].items[0].quantity, 2)
  assert.equal(branchOne.accounts[0].payments[0].method, 'qr')
  assert.equal(branchOne.products.length, 0)
  assert.equal(branchOne.accounts.some(account => account.id === 'branch-2-account'), false)
  console.log('PASS Caja 2 y su ronda llegan desde Firestore y se transforman para la experiencia compartida')

  await root.collection('nightclubAccounts').doc('cashbox-2-account').update({ subtotal: 180 })
  await root.collection('nightclubPayments').doc('cashbox-2-payment').update({ refundedAmount: 30, status: 'partially_refunded' })
  const updated = await waitFor(data => data.accounts[0]?.subtotal === 180 && data.accounts[0]?.payments[0]?.refundedAmount === 30, 'actualizacion de listener')
  assert.equal(updated.accounts[0].rounds[0].items[0].lineTotal, 120)
  assert.equal(updated.accounts[0].payments[0].status, 'partially_refunded')
  console.log('PASS El listener actualiza cuenta y pago sin recargar datos demo')

  subscription.unsubscribe()
  snapshots.length = 0
  subscription = subscribeToNightclubFirestoreDataset(client, tenantId, 'branch-2', data => snapshots.push(data), value => { error = value })
  const branchTwo = await waitFor(data => data.accounts.length === 1 && data.accounts[0].id === 'branch-2-account' && data.accounts[0].rounds.length === 1, 'cambio de sucursal')
  assert.equal(error, null)
  assert.equal(branchTwo.accounts[0].cashboxId, 'cashbox-1')
  assert.equal(branchTwo.accounts.some(account => account.id === 'cashbox-2-account'), false)
  assert.equal(branchTwo.products.length, 0)
  console.log('PASS El cambio de sucursal limpia Caja 2 y publica solo los datos de la sucursal nueva')
  subscription.unsubscribe()
} finally {
  await environment.cleanup()
  await deleteApp(app)
}
