import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 8185,
    rules: fs.readFileSync('firebase/firestore.rules', 'utf8'),
  },
})
const tenantId = `distribution-pause-${Date.now()}`
const actor = 'pause-test-owner'
const root = `tenants/${tenantId}`
const operation = (id) => ({
  id,
  tenantId,
  branchId: 'main',
  createdBy: actor,
  createdAt: new Date().toISOString(),
  type: 'sale',
  payload: {},
  status: 'queued',
})

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, root), { businessType: 'route_distribution' })
    await setDoc(doc(db, root, 'members', actor), {
      status: 'active', roleId: 'owner', branchIds: ['main'],
    })
  })
  const client = env.authenticatedContext(actor).firestore()
  const queuedRef = doc(client, root, 'distOperations', 'queued-before-pause')

  await assertSucceeds(setDoc(queuedRef, operation('queued-before-pause')))
  console.log('PASS: falta de control mantiene habilitada la compatibilidad')

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), root, 'distOperationControl', 'intake'), {
      accepting: false,
      reason: 'release-break-glass-test',
    })
  })
  await assertFails(setDoc(doc(client, root, 'distOperations', 'during-pause'), operation('during-pause')))
  console.log('PASS: pausa bloquea la creación de operaciones nuevas')

  const queued = await getDoc(queuedRef)
  assert.equal(queued.data().status, 'queued')
  console.log('PASS: operación previamente encolada conserva su estado')

  await assertFails(setDoc(doc(client, root, 'distOperationControl', 'intake'), { accepting: true }))
  console.log('PASS: cliente no puede modificar el control de emergencia')

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), root, 'distOperationControl', 'intake'), { accepting: true })
  })
  await assertSucceeds(setDoc(doc(client, root, 'distOperations', 'after-resume'), operation('after-resume')))
  console.log('PASS: restaurar accepting=true reanuda nuevas operaciones')
} finally {
  await env.cleanup()
}
