import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')

const suffix = Date.now().toString(36)
const tenantId = `nightclub-context-${suffix}`
const operatorA = `operator-a-${suffix}`
const operatorB = `operator-b-${suffix}`
const supervisor = `supervisor-${suffix}`
const denied = `denied-${suffix}`
const app = initializeApp({ projectId }, `nightclub-context-${suffix}`)
const admin = getFirestore(app)
const auth = getAuth(app)
const root = admin.doc(`tenants/${tenantId}`)
const pass = label => console.log(`PASS ${label}`)

async function signIn(uid) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert.equal(response.ok, true)
  return (await response.json()).idToken
}

async function command(token, operationId, cashboxId, confirmPending = false) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId, branchId: 'main', operationId, commandType: 'selectCashbox', payload: { cashboxId, confirmPending } } }),
  })
  return { response, body: await response.json() }
}

const environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId, cashboxIds] of [[operatorA, 'cashier', ['cashbox-1']], [operatorB, 'cashier', ['cashbox-2']], [supervisor, 'admin', ['cashbox-1', 'cashbox-2', 'cashbox-3', 'cashbox-4']], [denied, 'waiter', []]]) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
    await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status: 'active', branchIds: ['main'], cashboxIds })
  }
  for (const number of [1, 2, 3, 4]) {
    const cashboxId = `cashbox-${number}`
    await root.collection('nightclubCashboxes').doc(cashboxId).set({ id: cashboxId, tenantId, branchId: 'main', locationId: cashboxId, name: `Caja ${number}`, active: true })
    await root.collection('nightclubLocations').doc(cashboxId).set({ id: cashboxId, tenantId, branchId: 'main', type: 'cashbox', active: true })
  }
  await root.collection('nightclubShifts').doc('shift-closed-2').set({ id: 'shift-closed-2', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', status: 'closed' })
  await root.collection('nightclubAccounts').doc('pending-cashbox-1').set({ id: 'pending-cashbox-1', tenantId, branchId: 'main', cashboxId: 'cashbox-1', locationId: 'cashbox-1', status: 'open', serviceTarget: { type: 'bar' }, subtotal: 100 })

  const tokenA = await signIn(operatorA)
  const tokenB = await signIn(operatorB)
  const tokenSupervisor = await signIn(supervisor)
  const tokenDenied = await signIn(denied)

  const selectedA = await command(tokenA, 'select-a-1', 'cashbox-1')
  assert.equal(selectedA.response.ok, true)
  assert.equal((await root.collection('nightclubOperatorContexts').doc(operatorA).get()).data().locationId, 'cashbox-1')
  pass('Operador A obtiene Caja 1 y su ubicación física')

  const selectedB = await command(tokenB, 'select-b-2', 'cashbox-2')
  assert.equal(selectedB.response.ok, true)
  const contextB = (await root.collection('nightclubOperatorContexts').doc(operatorB).get()).data()
  assert.equal(contextB.cashboxId, 'cashbox-2')
  assert.equal(contextB.activeShiftId, null)
  pass('Operador B obtiene Caja 2 y un turno cerrado se representa sin turno activo')

  const forbidden = await command(tokenA, 'select-a-2', 'cashbox-2')
  assert.equal(forbidden.response.ok, false)
  assert.equal(forbidden.body.error.status, 'PERMISSION_DENIED')
  assert.equal((await root.collection('nightclubOperatorContexts').doc(operatorA).get()).data().cashboxId, 'cashbox-1')
  pass('Operador A no puede seleccionar Caja 2 mediante el gateway')

  for (const number of [1, 2, 3, 4]) {
    assert.equal((await command(tokenSupervisor, `select-supervisor-${number}`, `cashbox-${number}`)).response.ok, true)
  }
  assert.equal((await root.collection('nightclubOperatorContexts').doc(supervisor).get()).data().cashboxId, 'cashbox-4')
  assert.equal((await root.collection('nightclubAccounts').doc('pending-cashbox-1').get()).data().cashboxId, 'cashbox-1')
  pass('Supervisor cambia entre cajas autorizadas sin trasladar cuentas pendientes')

  const deniedReply = await command(tokenDenied, 'select-denied-1', 'cashbox-1')
  assert.equal(deniedReply.response.ok, false)
  assert.equal(deniedReply.body.error.status, 'PERMISSION_DENIED')
  pass('Usuario sin permiso de caja no obtiene contexto privilegiado')

  const clientA = environment.authenticatedContext(operatorA).firestore()
  const clientB = environment.authenticatedContext(operatorB).firestore()
  await assertSucceeds(getDoc(doc(clientA, 'tenants', tenantId, 'nightclubOperatorContexts', operatorA)))
  await assertFails(getDoc(doc(clientA, 'tenants', tenantId, 'nightclubOperatorContexts', operatorB)))
  await assertSucceeds(getDoc(doc(clientB, 'tenants', tenantId, 'nightclubOperatorContexts', operatorB)))
  pass('Las reglas permiten únicamente leer el contexto propio')

  await root.collection('nightclubOperatorContexts').doc(operatorA).update({ branchId: 'other-branch' })
  await assertFails(getDoc(doc(clientA, 'tenants', tenantId, 'nightclubOperatorContexts', operatorA)))
  pass('Las reglas rechazan el contexto propio cuando pertenece a otra sucursal')
} finally {
  await environment.cleanup()
  await deleteApp(app)
}