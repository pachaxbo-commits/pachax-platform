import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
const tenantId = `nightclub-context-rules-${Date.now().toString(36)}`
const memberUid = `member-${tenantId}`
const outsiderUid = `outsider-${tenantId}`
const environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })

try {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'tenants', tenantId), { tenantId, businessType: 'nightclub_lounge' })
    await setDoc(doc(db, 'tenants', tenantId, 'members', memberUid), { uid: memberUid, tenantId, status: 'active', roleId: 'cashier', branchIds: ['main'] })
  })
  const member = environment.authenticatedContext(memberUid).firestore()
  const outsider = environment.authenticatedContext(outsiderUid).firestore()
  const contextRef = doc(member, 'tenants', tenantId, 'nightclubOperatorContexts', memberUid)
  assert.equal((await assertSucceeds(getDoc(contextRef))).exists(), false)
  await assertFails(getDoc(doc(outsider, 'tenants', tenantId, 'nightclubOperatorContexts', outsiderUid)))
  await assertFails(getDocs(collection(member, 'tenants', tenantId, 'nightclubOperatorContexts')))
  await assertFails(setDoc(contextRef, { branchId: 'main' }))
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tenants', tenantId, 'nightclubOperatorContexts', memberUid), { branchId: 'main' })
  })
  await assertSucceeds(getDoc(contextRef))
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tenants', tenantId, 'nightclubOperatorContexts', memberUid), { branchId: 'other-branch' })
  })
  await assertFails(getDoc(contextRef))
  console.log('PASS Nightclub context Rules: missing self GET requires active membership; existing context requires branch; list/write denied')
} finally {
  await environment.cleanup()
}
