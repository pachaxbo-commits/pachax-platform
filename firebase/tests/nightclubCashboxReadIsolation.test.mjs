import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { createRequire } from 'node:module'
import { canStartNightclubFinancialRead, resolveNightclubFinancialReadScope, subscribeCashboxScopedCollection } from '../../src/modules/nightclub/data/nightclubFinancialSubscriptions.ts'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantId = `cashbox-read-${suffix}`
const otherTenantId = `cashbox-read-other-${suffix}`
const collections = ['nightclubAccounts', 'nightclubPayments', 'nightclubRounds', 'nightclubShifts', 'nightclubCashMovements', 'nightclubCommissionPayments', 'nightclubCommissions']
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `cashbox-read-${suffix}`)
const admin = getFirestore(app)
const tenant = id => admin.doc(`tenants/${id}`)
let checks = 0
const pass = label => { checks++; console.log(`PASS ${label}`) }
const waitFor = async (predicate, label) => {
  const end = Date.now() + 5000
  while (Date.now() < end) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  assert.fail(`Timeout esperando ${label}`)
}

try {
  const template = getTemplate('nightclub_lounge')
  await env.withSecurityRulesDisabled(async () => {
    for (const id of [tenantId, otherTenantId]) {
      await tenant(id).set({ tenantId: id, businessType: 'nightclub_lounge', configuration: template.defaults })
      for (const role of template.roles) await tenant(id).collection('roles').doc(role.id).set({ ...role, tenantId: id })
    }
    const members = [
      ['owner', { roleId: 'owner', cashboxIds: undefined }],
      ['admin', { roleId: 'admin', cashboxIds: undefined }],
      ['cashier1', { roleId: 'cashier', cashboxIds: ['cashbox-1'] }],
      ['cashierBoth', { roleId: 'cashier', cashboxIds: ['cashbox-1', 'cashbox-2'] }],
      ['cashierNone', { roleId: 'cashier', cashboxIds: [] }],
      ['legacy', { roleId: 'cashier', cashboxIds: undefined }],
      ['inactive', { roleId: 'cashier', status: 'disabled', cashboxIds: ['cashbox-1'] }],
    ]
    for (const [uid, setup] of members) {
      const member = { uid, tenantId, status: 'active', branchIds: ['main'], ...setup }
      if (setup.cashboxIds === undefined) delete member.cashboxIds
      await tenant(tenantId).collection('members').doc(uid).set(member)
    }
    for (const col of collections) {
      for (const box of ['cashbox-1', 'cashbox-2']) {
        await tenant(tenantId).collection(col).doc(`${col}-${box}`).set({ id: `${col}-${box}`, tenantId, branchId: 'main', cashboxId: box, shiftId: `shift-${box}`, accountId: `account-${box}`, amount: 10, status: 'open' })
      }
      await tenant(tenantId).collection(col).doc(`${col}-unknown-box`).set({ id: `${col}-unknown-box`, tenantId, branchId: 'main', shiftId: 'legacy-shift', amount: 3, status: 'open' })
    }
    await tenant(tenantId).collection('nightclubAccounts').doc('account-other-branch').set({ id: 'account-other-branch', tenantId, branchId: 'branch-2', cashboxId: 'cashbox-1', status: 'open' })
    await tenant(otherTenantId).collection('members').doc('external').set({ uid: 'external', tenantId: otherTenantId, roleId: 'owner', status: 'active', branchIds: ['main'] })
    await tenant(otherTenantId).collection('nightclubAccounts').doc('foreign-account').set({ id: 'foreign-account', tenantId: otherTenantId, branchId: 'main', cashboxId: 'cashbox-1' })
  })

  const dbFor = uid => env.authenticatedContext(uid).firestore()
  for (const col of collections) {
    const restrictedDb = dbFor('cashier1')
    await assertSucceeds(getDoc(doc(restrictedDb, `tenants/${tenantId}/${col}/${col}-cashbox-1`)))
    await assertFails(getDoc(doc(restrictedDb, `tenants/${tenantId}/${col}/${col}-cashbox-2`)))
    await assertFails(getDoc(doc(restrictedDb, `tenants/${tenantId}/${col}/${col}-unknown-box`)))
  }
  pass('GET Caja 1 permitido y Caja 2/desconocida denegadas en las 7 colecciones financieras auditadas')

  for (const col of ['nightclubAccounts', 'nightclubPayments']) {
    const db = dbFor('cashier1'), ref = collection(db, `tenants/${tenantId}/${col}`)
    await assertSucceeds(getDocs(query(ref, where('branchId', '==', 'main'), where('cashboxId', '==', 'cashbox-1'))))
    await assertFails(getDocs(query(ref, where('branchId', '==', 'main'))))
    await assertFails(getDocs(query(ref, where('branchId', '==', 'main'), where('cashboxId', 'in', ['cashbox-1', 'cashbox-2']))))
  }
  pass('queries de Caja 1 pasan; consultas de sucursal o que incluyen Caja 2 fallan')

  for (const uid of ['owner', 'admin']) {
    const db = dbFor(uid)
    for (const col of ['nightclubAccounts', 'nightclubPayments', 'nightclubRounds', 'nightclubShifts', 'nightclubCashMovements', 'nightclubCommissionPayments', 'nightclubCommissions']) {
      await assertSucceeds(getDoc(doc(db, `tenants/${tenantId}/${col}/${col}-cashbox-1`)))
      await assertSucceeds(getDoc(doc(db, `tenants/${tenantId}/${col}/${col}-cashbox-2`)))
      await assertSucceeds(getDoc(doc(db, `tenants/${tenantId}/${col}/${col}-unknown-box`)))
    }
  }
  const legacyDb = dbFor('legacy')
  await assertSucceeds(getDoc(doc(legacyDb, `tenants/${tenantId}/nightclubAccounts/nightclubAccounts-cashbox-2`)))
  await assertSucceeds(getDocs(query(collection(legacyDb, `tenants/${tenantId}/nightclubAccounts`), where('branchId', '==', 'main'))))
  pass('owner/admin mantienen acceso de sucursal y membresía legacy sin cashboxIds conserva el acceso histórico')

  const noneDb = dbFor('cashierNone')
  await assertFails(getDoc(doc(noneDb, `tenants/${tenantId}/nightclubAccounts/nightclubAccounts-cashbox-1`)))
  await assertFails(getDocs(query(collection(noneDb, `tenants/${tenantId}/nightclubAccounts`), where('branchId', '==', 'main'), where('cashboxId', '==', 'cashbox-1'))))
  await assertFails(getDoc(doc(dbFor('inactive'), `tenants/${tenantId}/nightclubAccounts/nightclubAccounts-cashbox-1`)))
  await assertFails(getDoc(doc(dbFor('cashier1'), `tenants/${tenantId}/nightclubAccounts/account-other-branch`)))
  await assertFails(getDoc(doc(dbFor('admin'), `tenants/${tenantId}/nightclubAccounts/account-other-branch`)))
  await assertFails(getDoc(doc(dbFor('cashier1'), `tenants/${otherTenantId}/nightclubAccounts/foreign-account`)))
  await assertFails(getDoc(doc(env.authenticatedContext(`outsider-${suffix}`).firestore(), `tenants/${tenantId}/nightclubAccounts/nightclubAccounts-cashbox-1`)))
  pass('cashboxIds vacío, miembro inactivo, usuario externo y tenant ajeno fallan cerrados')

  let emptyRows = null
  assert.equal(canStartNightclubFinancialRead({ kind: 'unresolved' }), false)
  assert.equal(canStartNightclubFinancialRead({ kind: 'restricted', cashboxIds: [] }), false)
  assert.equal(canStartNightclubFinancialRead({ kind: 'unrestricted' }), true)
  assert.deepEqual(resolveNightclubFinancialReadScope({ status: 'active', roleId: 'cashier' }), { kind: 'unrestricted' })
  assert.deepEqual(resolveNightclubFinancialReadScope({ status: 'active', roleId: 'cashier', cashboxIds: [] }), { kind: 'restricted', cashboxIds: [] })
  assert.deepEqual(resolveNightclubFinancialReadScope({ status: 'active', roleId: 'owner', cashboxIds: [] }), { kind: 'unrestricted' })
  assert.deepEqual(resolveNightclubFinancialReadScope({ status: 'disabled', roleId: 'cashier' }), { kind: 'unresolved' })
  const stopEmpty = subscribeCashboxScopedCollection({
    db: dbFor('cashierNone'), path: ['tenants', tenantId, 'nightclubAccounts'], branchId: 'main', cashboxIds: [],
    mapDocument: (id, data) => ({ id, ...data }), listener: rows => { emptyRows = rows },
  })
  assert.deepEqual(emptyRows, [])
  stopEmpty()
  pass('alcance pendiente o lista vacía no abre listeners; unrestricted conserva listener global')

  let latest = null, listenerError = null
  const watcherDb = dbFor('cashierBoth')
  let stop = subscribeCashboxScopedCollection({
    db: watcherDb, path: ['tenants', tenantId, 'nightclubAccounts'], branchId: 'main', cashboxIds: ['cashbox-1', 'cashbox-2'],
    mapDocument: (id, data) => ({ id, ...data }),
    listener: rows => { latest = rows.map(row => row.id).sort() }, onError: error => { listenerError = error },
  })
  await waitFor(() => latest !== null || listenerError !== null, 'listener inicial Caja 1 y Caja 2')
  assert.ifError(listenerError)
  assert.deepEqual(latest, ['nightclubAccounts-cashbox-1', 'nightclubAccounts-cashbox-2'])
  await tenant(tenantId).collection('nightclubAccounts').doc('nightclubAccounts-cashbox-2').update({ cashboxId: 'cashbox-other' })
  await waitFor(() => Array.isArray(latest) && latest.length === 1, 'query removal after document leaves authorized box set')
  assert.deepEqual(latest, ['nightclubAccounts-cashbox-1'])
  await tenant(tenantId).collection('nightclubAccounts').doc('nightclubAccounts-cashbox-2').update({ cashboxId: 'cashbox-2' })
  await waitFor(() => Array.isArray(latest) && latest.length === 2, 'query re-add after document returns to authorized box set')
  pass('listener de alcance explícito entrega únicamente las dos cajas asignadas')

  let authorizedIds = ['cashbox-1', 'cashbox-2']
  let memberReady = false
  const stopMember = onSnapshot(doc(watcherDb, `tenants/${tenantId}/members/cashierBoth`), snapshot => {
    if (!snapshot.exists()) return
    const nextIds = snapshot.data().cashboxIds
    if (memberReady && JSON.stringify(nextIds) !== JSON.stringify(authorizedIds)) {
      authorizedIds = nextIds
      stop()
      latest = [] // mirrors the controller's synchronous presentation clear before replacing listeners
      listenerError = null
      stop = subscribeCashboxScopedCollection({
        db: watcherDb, path: ['tenants', tenantId, 'nightclubAccounts'], branchId: 'main', cashboxIds: authorizedIds,
        mapDocument: (id, data) => ({ id, ...data }),
        listener: rows => { latest = rows.map(row => row.id).sort() }, onError: error => { listenerError = error },
      })
    }
    memberReady = true
  })
  await waitFor(() => memberReady, 'membresía inicial del listener')
  await tenant(tenantId).collection('members').doc('cashierBoth').update({ cashboxIds: ['cashbox-1'] })
  await waitFor(() => Array.isArray(latest) && latest.length === 1 && latest[0] === 'nightclubAccounts-cashbox-1', 'listener actualizado tras revocación')
  assert.ifError(listenerError)
  await assertFails(getDoc(doc(watcherDb, `tenants/${tenantId}/nightclubAccounts/nightclubAccounts-cashbox-2`)))
  stopMember(); stop()
  pass('cambio realtime de asignación cancela Caja 2, limpia estado anterior y reconsulta solo Caja 1')

  assert.equal(checks, 7)
  console.log(`Nightclub cashbox read isolation: ${checks}/7 checks PASS`)
} finally {
  await env.cleanup()
  await deleteApp(app)
}
