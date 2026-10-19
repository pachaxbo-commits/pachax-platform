import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { subscribeToNightclubFirestoreDataset } from '../../src/modules/nightclub/data/nightclubFirestoreDataset.ts'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantId = `nightclub-context-dataset-${suffix}`
const uid = `cashier-${suffix}`
const otherUid = `cashier-other-${suffix}`
const environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `nightclub-context-dataset-${suffix}`)
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

try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  await root.collection('members').doc(uid).set({ uid, tenantId, roleId: 'cashier', status: 'active', branchIds: ['main', 'other-branch'], cashboxIds: ['cashbox-2', 'cashbox-3'] })
  await root.collection('members').doc(otherUid).set({ uid: otherUid, tenantId, roleId: 'cashier', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-1'] })
  for (const number of [1, 2, 3, 4]) await root.collection('nightclubCashboxes').doc(`cashbox-${number}`).set({ id: `cashbox-${number}`, tenantId, branchId: 'main', locationId: `cashbox-${number}`, name: `Caja ${number}`, active: true })
  await root.collection('nightclubShifts').doc('shift-2').set({ id: 'shift-2', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', status: 'open', openingFloat: 100 })
  await root.collection('nightclubOperatorContexts').doc(uid).set({ id: uid, tenantId, userId: uid, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', activeShiftId: 'shift-2' })
  await root.collection('nightclubOperatorContexts').doc(otherUid).set({ id: otherUid, tenantId, userId: otherUid, branchId: 'main', cashboxId: 'cashbox-1', locationId: 'cashbox-1', activeShiftId: null })
  await root.collection('nightclubAccounts').doc('account-2').set({ id: 'account-2', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', status: 'open', serviceTarget: { type: 'bar' }, subtotal: 100 })
  await root.collection('nightclubAccounts').doc('account-1').set({ id: 'account-1', tenantId, branchId: 'main', cashboxId: 'cashbox-1', locationId: 'cashbox-1', status: 'open', serviceTarget: { type: 'bar' }, subtotal: 200 })

  const client = environment.authenticatedContext(uid).firestore()
  const subscription = subscribeToNightclubFirestoreDataset(client, tenantId, 'main', data => snapshots.push(data), error => { throw error }, { operatorUid: uid, includeCashboxContext: true })
  const first = await waitFor(data => data.operatorContexts?.[0]?.cashboxId === 'cashbox-2' && data.shift?.id === 'shift-2' && data.cashboxes?.length === 4, 'contexto inicial Caja 2')
  assert.equal(first.operatorContexts?.[0]?.locationId, 'cashbox-2')
  assert.equal(first.shift?.status, 'open')
  assert.equal(first.accounts.some(account => account.id === 'account-1'), true)
  console.log('PASS Provider recibe contexto autoritativo Caja 2, ubicación y turno')

  await root.collection('nightclubOperatorContexts').doc(uid).update({ cashboxId: 'cashbox-3', locationId: 'cashbox-3', activeShiftId: null })
  const changed = await waitFor(data => data.operatorContexts?.[0]?.cashboxId === 'cashbox-3' && data.shift === null, 'cambio de Caja 3')
  assert.equal(changed.operatorContexts?.[0]?.locationId, 'cashbox-3')
  console.log('PASS Listener limpia el turno anterior y publica Caja 3 sin datos demo')

  await root.collection('nightclubOperatorContexts').doc(uid).update({ branchId: 'other-branch' })
  const branchChanged = await waitFor(data => (data.operatorContexts?.length ?? 0) === 0 && data.shift === null, 'limpieza al cambiar de sucursal')
  assert.equal(branchChanged.operatorContexts?.length, 0)
  console.log('PASS Listener limpia el contexto al cambiar de sucursal')
  subscription.unsubscribe()

  const otherSnapshots = []
  const otherClient = environment.authenticatedContext(otherUid).firestore()
  const otherSubscription = subscribeToNightclubFirestoreDataset(otherClient, tenantId, 'main', data => otherSnapshots.push(data), error => { throw error }, { operatorUid: otherUid, includeCashboxContext: true })
  const otherDeadline = Date.now() + 8_000
  while (Date.now() < otherDeadline && otherSnapshots.at(-1)?.operatorContexts?.[0]?.cashboxId !== 'cashbox-1') await new Promise(resolve => setTimeout(resolve, 25))
  const otherContext = otherSnapshots.at(-1)
  assert.equal(otherContext?.operatorContexts?.[0]?.cashboxId, 'cashbox-1')
  assert.equal(otherContext?.shift, null)
  console.log('PASS Nueva sesión no conserva el contexto ni turno del usuario anterior')
  otherSubscription.unsubscribe()
} finally {
  await environment.cleanup()
  await deleteApp(app)
}