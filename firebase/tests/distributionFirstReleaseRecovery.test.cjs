// Emulators only: exercise the tenant processor, closed-day protection and
// recovery after a transient failure without creating production data.
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const path = require('node:path')
const functionsRequire = createRequire(path.resolve(__dirname, '../../functions/package.json'))
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185'
const { initializeApp } = functionsRequire('firebase-admin/app')
const { getFirestore } = functionsRequire('firebase-admin/firestore')
const { processCommand, dayKey } = functionsRequire('./operations.cjs')

const projectId = 'demo-pachax-platform'
const app = initializeApp({ projectId }, `distribution-recovery-${Date.now()}`)
const db = getFirestore(app)
const tenantId = `distribution-recovery-${Date.now()}`
const actor = `owner-${tenantId}`
const root = db.doc(`tenants/${tenantId}`)
let checks = 0
const pass = (message) => { checks += 1; console.log(`PASS ${message}`) }

async function enqueue(id, type, payload) {
  const ref = root.collection('distOperations').doc(id)
  await ref.set({
    id, tenantId, branchId: 'main', createdBy: actor,
    createdAt: new Date().toISOString(), type, payload, status: 'queued',
  })
  return ref
}

async function run(ref, database = db) {
  await processCommand(database, ref)
  return (await ref.get()).data()
}

async function main() {
try {
  await root.set({
    tenantId,
    businessType: 'route_distribution',
    configuration: { features: { sales: true, credits: true, inventory: true, dispatch: true, routes: true, settings: true, users: true, reports: true, cash: true } },
  })
  await root.collection('members').doc(actor).set({
    uid: actor, tenantId, roleId: 'owner', status: 'active', branchIds: ['main'], routeIds: [], displayName: 'QA Owner',
  })

  const saleLikeExpense = await enqueue('expense-before-close', 'expense', { concept: 'QA release', amount: 10 })
  const failureDb = {
    runTransaction: async () => { throw new Error('simulated transient Firestore interruption') },
    doc: (...args) => db.doc(...args),
    collection: (...args) => db.collection(...args),
  }
  await assert.rejects(() => run(saleLikeExpense, failureDb), /simulated transient/)
  assert.equal((await saleLikeExpense.get()).data().status, 'queued')
  pass('un fallo transitorio deja la operación pendiente y recuperable')

  const processedExpense = await run(saleLikeExpense)
  assert.equal(processedExpense.status, 'confirmed')
  assert.equal((await root.collection('distExpenses').doc(saleLikeExpense.id).get()).exists, true)
  await run(saleLikeExpense)
  assert.equal((await root.collection('distExpenses').get()).size, 1)
  pass('reintento confirma una sola vez y no duplica el efecto')

  const today = dayKey()
  const close = await enqueue('administrative-close', 'closure', { mode: 'administrative', dayKey: today, declaredCash: 0 })
  const closed = await run(close)
  assert.equal(closed.status, 'confirmed')
  assert.equal((await root.collection('distAdministrativeDays').doc(today).get()).data().status, 'closed')
  pass('el cierre crea el marcador transaccional de jornada cerrada')

  const afterClose = await enqueue('expense-after-close', 'expense', { concept: 'Debe rechazarse', amount: 20 })
  const rejected = await run(afterClose)
  assert.equal(rejected.status, 'rejected')
  assert.match(rejected.error, /ya fue cerrada/)
  assert.equal((await root.collection('distExpenses').get()).size, 1)
  assert.equal((await root.collection('distAdministrativeDays').doc(today).get()).data().status, 'closed')
  pass('operación financiera posterior al cierre se rechaza sin mutación')

  console.log(`${checks}/${checks} comprobaciones de recuperación Distribution aprobadas`)
} finally {
  await app.delete()
}
}
main().catch(error => { console.error(error); process.exitCode = 1 })
