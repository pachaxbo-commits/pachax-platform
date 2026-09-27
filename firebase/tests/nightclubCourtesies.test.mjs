import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('QA permitido solo en demo-pachax-platform.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const { nightclubCourtesyGateway } = require('./nightclubCourtesies.cjs')
const suffix = Date.now().toString(36)
const tenantId = `courtesy_${suffix}`
const ownerUid = `courtesy_owner_${suffix}`
const cashierUids = [`courtesy_cashier_a_${suffix}`, `courtesy_cashier_b_${suffix}`]
const outsiderUid = `courtesy_outsider_${suffix}`
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `courtesy-test-${suffix}`)
const db = getFirestore(app)
const root = db.doc(`tenants/${tenantId}`)
// The courtesy gateway is not exported to production yet; exercise its transaction directly.
async function call(uid, data) {
  try {
    return { status: 200, result: await nightclubCourtesyGateway(db, { auth: { uid }, data: { tenantId, ...data } }) }
  } catch (error) {
    return { status: 400, error: { status: String(error.code || 'unknown').toUpperCase().replaceAll('-', '_') } }
  }
}

try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId] of [[ownerUid, 'owner'], ...cashierUids.map(uid => [uid, 'cashier'])]) await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status: 'active', branchIds: ['main'] })
  assert.equal((await call(ownerUid, { action: 'initialize', operationId: 'init' })).status, 200)
  const now = new Date()
  const anchor = new Date(now.getTime() - 60_000).toISOString()
  const save = await call(ownerUid, { action: 'saveMember', operationId: 'member', member: { id: 'carlos', name: 'Carlos', active: true, quota: 1, policy: { anchorAt: anchor, windowDays: 7, repeatDays: 7 } } })
  assert.equal(save.status, 200)
  const stateRef = root.collection('nightclubState').doc('current')
  await stateRef.update({ products: [{ id: 'ron', name: 'Ron', category: 'Botellas', price: 200, preparationArea: 'Barra', stockUnits: 1, recipe: [{ inventoryId: 'ron-stock', quantity: 1 }] }], inventory: [{ id: 'ron-stock', name: 'Ron', unit: 'unit', current: 1, minimum: 0, unitCost: 45 }], shift: { id: 'shift', status: 'open', openedAt: now.toISOString(), openingFloat: 100, openedBy: ownerUid } })
  const [a, b] = await Promise.all(cashierUids.map((uid, index) => call(uid, { action: 'register', operationId: `deliver-${index}`, draft: { memberId: 'carlos', productId: 'ron', quantity: 1 } })))
  assert.equal([a, b].filter(result => result.status === 200).length, 1, JSON.stringify([a, b]))
  const state = (await stateRef.get()).data()
  assert.equal(state.inventory[0].current, 0)
  assert.equal(state.courtesies.length, 1)
  assert.equal(state.inventoryMovements.length, 1)
  assert.equal(state.inventoryMovements[0].type, 'member_courtesy')
  console.log('PASS concurrencia: dos cajeros, una sola entrega y un solo descuento')
  const winnerUid = a.status === 200 ? cashierUids[0] : cashierUids[1]
  const replay = await call(winnerUid, { action: 'register', operationId: a.status === 200 ? 'deliver-0' : 'deliver-1', draft: { memberId: 'carlos', productId: 'ron', quantity: 1 } })
  assert.equal(replay.status, 200)
  assert.equal(replay.result.replayed, true)
  console.log('PASS idempotencia de entrega')
  assert.equal((await call(cashierUids[0], { action: 'cancel', operationId: 'cancel-by-cashier', courtesyId: state.courtesies[0].id })).error.status, 'PERMISSION_DENIED')
  assert.equal((await call(outsiderUid, { action: 'read' })).error.status, 'PERMISSION_DENIED')
  console.log('PASS permisos tenant y anulación restringida')
  const cashierDb = env.authenticatedContext(cashierUids[0]).firestore()
  const outsiderDb = env.authenticatedContext(outsiderUid).firestore()
  await assertFails(getDoc(doc(cashierDb, `tenants/${tenantId}/nightclubState/current`)))
  await assertFails(setDoc(doc(cashierDb, `tenants/${tenantId}/nightclubState/current`), { inventory: [] }))
  await assertFails(getDoc(doc(outsiderDb, `tenants/${tenantId}/nightclubState/current`)))
  console.log('PASS reglas: estado agregado no expuesto a clientes y escrituras directas denegadas')
  const cancelled = await call(ownerUid, { action: 'cancel', operationId: 'cancel-owner', courtesyId: state.courtesies[0].id })
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled))
  const after = (await stateRef.get()).data()
  assert.equal(after.inventory[0].current, 1)
  assert.equal(after.courtesies[0].status, 'cancelled')
  assert.deepEqual(after.inventoryMovements.map(item => item.type), ['member_courtesy', 'courtesy_reversal'])
  console.log('PASS anulación atómica con restitución y auditoría')
} finally {
  await env.cleanup()
  await deleteApp(app)
}
