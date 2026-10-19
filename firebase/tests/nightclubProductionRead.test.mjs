import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc } from 'firebase/firestore'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantA = `nightclub-read-a-${suffix}`, tenantB = `nightclub-read-b-${suffix}`, userA = `reader-a-${suffix}`
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `nightclub-read-${suffix}`), admin = getFirestore(app)
let checks = 0
const pass = message => { checks++; console.log(`PASS ${message}`) }
const root = tenantId => admin.doc(`tenants/${tenantId}`)
async function seed(tenantId, branchId, accountId) {
  const template = getTemplate('nightclub_lounge')
  await root(tenantId).set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root(tenantId).collection('roles').doc(role.id).set({ ...role, tenantId })
  await root(tenantId).collection('nightclubAccounts').doc(accountId).set({ id: accountId, tenantId, branchId, status: 'open', openedAt: '2026-10-12T00:00:00.000Z', openedBy: 'cashier', subtotal: 120, serviceTarget: { type: 'bar' } })
  await root(tenantId).collection('nightclubRounds').doc(`round-${accountId}`).set({ id: `round-${accountId}`, tenantId, branchId, accountId, sequence: 1, status: 'ready', total: 120, items: [{ id: 'line-1', name: 'Cerveza', quantity: 1, unitPrice: 120, lineTotal: 120 }] })
}
try {
  await seed(tenantA, 'branch-1', 'account-a1'); await seed(tenantA, 'branch-2', 'account-a2'); await seed(tenantB, 'branch-1', 'account-b1')
  await root(tenantA).collection('members').doc(userA).set({ uid: userA, tenantId: tenantA, roleId: 'admin', status: 'active', branchIds: ['branch-1'] })
  const db = env.authenticatedContext(userA).firestore()
  await assertSucceeds(getDoc(doc(db, 'tenants', tenantA, 'nightclubAccounts', 'account-a1'))); pass('Tenant A / sucursal 1 lee su cuenta')
  await assertSucceeds(getDoc(doc(db, 'tenants', tenantA, 'nightclubRounds', 'round-account-a1'))); pass('Tenant A / sucursal 1 lee su ronda')
  await assertFails(getDoc(doc(db, 'tenants', tenantB, 'nightclubAccounts', 'account-b1'))); pass('Tenant A no lee Tenant B')
  await assertFails(getDoc(doc(db, 'tenants', tenantA, 'nightclubAccounts', 'account-a2'))); pass('Sucursal no autorizada se rechaza')
  const noMember = env.authenticatedContext(`no-member-${suffix}`).firestore()
  await assertFails(getDoc(doc(noMember, 'tenants', tenantA, 'nightclubAccounts', 'account-a1'))); await assertFails(getDoc(doc(noMember, 'tenants', tenantA, 'nightclubRounds', 'round-account-a1'))); pass('Usuario sin membresía activa no lee cuentas ni rondas')
  assert.equal(checks, 5)
} finally { await env.cleanup(); await deleteApp(app) }
