import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const { executeNightclubCommand } = require('./nightclub.cjs')

const suffix = Date.now().toString(36)
const tenantId = `line_fifo_${suffix}`
const app = initializeApp({ projectId: 'demo-pachax-platform' }, `line_fifo_${suffix}`)
const db = getFirestore(app)
const root = db.doc(`tenants/${tenantId}`)
const call = (operationId, payload) => executeNightclubCommand(db, {
  auth: { uid: 'waiter' },
  data: { tenantId, branchId: 'main', commandType: 'settleRound', operationId, payload },
})
const document = async (collection, id) => (await root.collection(collection).doc(id).get()).data()
const movementTotal = async roundId => {
  const snapshot = await root.collection('nightclubInventoryMovements').where('roundId', '==', roundId).get()
  return snapshot.docs.filter(doc => doc.data().reason === 'Venta POS FIFO').reduce((sum, doc) => sum + Math.abs(Number(doc.data().quantity || 0)), 0)
}

async function addAccount(id, locationId) {
  await root.collection('nightclubAccounts').doc(id).set({
    id, branchId: 'main', locationId, cashboxId: locationId, shiftId: 'shift', status: 'open',
    serviceTarget: { type: 'bar' }, orderType: 'BAR', subtotal: 0, paidTotal: 0, balance: 0, roundCount: 0,
  })
}

async function addInventory(locationId, inventoryId, quantity, lots) {
  await root.collection('nightclubInventoryBalances').doc(`${locationId}:${inventoryId}`).set({
    locationId, inventoryId, availableQuantity: quantity,
  })
  for (const lot of lots) {
    await root.collection('nightclubInventoryLots').doc(lot.id).set({
      locationId, inventoryId, remainingQuantity: lot.quantity, status: 'available',
      unitCost: lot.cost, receivedAt: lot.receivedAt,
    })
  }
}

try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  await root.collection('members').doc('waiter').set({ uid: 'waiter', tenantId, roleId: 'waiter', status: 'active', branchIds: ['main'] })
  await root.collection('nightclubShifts').doc('shift').set({ id: 'shift', branchId: 'main', status: 'open' })

  await Promise.all(['one', 'two', 'three', 'four', 'five', 'six', 'pour', 'bad', 'cashbox-two'].map(id => addAccount(id, id === 'cashbox-two' ? 'cashbox-2' : 'cashbox-1')))
  await Promise.all([
    addInventory('cashbox-1', 'beer', 9.25, [
      { id: 'beer-old', quantity: 1, cost: 10, receivedAt: '2026-01-01T00:00:00Z' },
      { id: 'beer-new', quantity: 8.25, cost: 20, receivedAt: '2026-01-02T00:00:00Z' },
    ]),
    addInventory('cashbox-1', 'lime', 10, [{ id: 'lime-lot', quantity: 10, cost: 3, receivedAt: '2026-01-01T00:00:00Z' }]),
    addInventory('cashbox-1', 'shared', 4, [{ id: 'shared-lot', quantity: 4, cost: 4, receivedAt: '2026-01-01T00:00:00Z' }]),
    addInventory('cashbox-1', 'scarce', 1, [{ id: 'scarce-lot', quantity: 1, cost: 7, receivedAt: '2026-01-01T00:00:00Z' }]),
    addInventory('cashbox-1', 'rum', 1, [{ id: 'rum-lot', quantity: 1, cost: 40, receivedAt: '2026-01-01T00:00:00Z' }]),
    addInventory('cashbox-2', 'beer', 3, [{ id: 'beer-cashbox-2', quantity: 3, cost: 30, receivedAt: '2026-01-01T00:00:00Z' }]),
  ])
  await root.collection('nightclubInventory').doc('rum').set({ branchId: 'main', bottleCapacityMl: 1000 })
  const product = (id, price, recipe) => root.collection('nightclubProducts').doc(id).set({ branchId: 'main', name: id, active: true, price, preparationArea: 'Directo', recipe })
  await Promise.all([
    product('beer', 100, [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }]),
    product('beer-quarter', 25, [{ inventoryId: 'beer', quantity: 0.25, unit: 'unit' }]),
    product('combo', 150, [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }, { inventoryId: 'lime', quantity: 2, unit: 'unit' }]),
    product('shared-a', 20, [{ inventoryId: 'shared', quantity: 0.5, unit: 'unit' }]),
    product('shared-b', 20, [{ inventoryId: 'shared', quantity: 0.5, unit: 'unit' }]),
    product('scarce', 30, [{ inventoryId: 'scarce', quantity: 1, unit: 'unit' }]),
    product('bad-recipe', 40, [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }, { inventoryId: 'lime', quantity: 99, unit: 'unit' }]),
  ])
  await root.collection('nightclubProducts').doc('rum-shot').set({ branchId: 'main', name: 'rum-shot', active: true, price: 50, preparationArea: 'Barra', bottlePresentation: { kind: 'pour', inventoryId: 'rum', millilitres: 150 } })

  // 1–3, 6–7, 11–12: two order lines consume FIFO lots independently and persist exact allocations.
  const first = await call('line-primary', { accountId: 'one', items: [{ productId: 'beer', quantity: 1 }, { productId: 'beer', quantity: 2 }], payment: { method: 'qr', amount: 300 } })
  const firstRound = await document('nightclubRounds', first.roundId)
  assert.deepEqual(firstRound.items[0].fifoAllocations.map(value => value.lotId), ['beer-old'])
  assert.deepEqual(firstRound.items[1].fifoAllocations.map(value => value.lotId), ['beer-new'])
  assert.equal(firstRound.items.flatMap(item => item.fifoAllocations).reduce((sum, value) => sum + value.quantity, 0), 3)
  assert.equal(firstRound.items.reduce((sum, item) => sum + item.costAtSale, 0), 50)
  assert.equal(await movementTotal(first.roundId), 3)
  console.log('PASS 1–3, 6–7, 11–12: líneas, lotes, costo y movimientos coinciden')

  // 4–5: shared ingredient and multi-ingredient recipe retain allocations per originating line.
  const recipes = await call('line-recipes', { accountId: 'two', items: [{ productId: 'combo', quantity: 1 }, { productId: 'shared-a', quantity: 1 }, { productId: 'shared-b', quantity: 1 }], payment: { method: 'card', amount: 190 } })
  const recipeRound = await document('nightclubRounds', recipes.roundId)
  assert.equal(recipeRound.items[0].fifoAllocations.length, 2)
  assert.deepEqual(new Set(recipeRound.items[0].fifoAllocations.map(value => value.inventoryId)), new Set(['beer', 'lime']))
  assert.equal(recipeRound.items[1].fifoAllocations[0].itemId, recipeRound.items[1].id)
  assert.equal(recipeRound.items[2].fifoAllocations[0].itemId, recipeRound.items[2].id)
  console.log('PASS 4–5: ingrediente compartido y receta multiinsumo quedan por línea')

  // Fractional quantities retain the three-decimal stock precision used by the domain.
  const fraction = await call('line-fraction', { accountId: 'three', items: [{ productId: 'beer-quarter', quantity: 1 }], payment: { method: 'cash', amount: 25 } })
  const fractionRound = await document('nightclubRounds', fraction.roundId)
  assert.equal(fractionRound.items[0].fifoAllocations[0].quantity, 0.25)
  assert.equal((await document('nightclubInventoryBalances', 'cashbox-1:beer')).availableQuantity, 5)
  console.log('PASS especial: cantidad fraccionaria conserva precisión')

  // An operation retry returns the existing round and does not consume again.
  const retry = await call('line-primary', { accountId: 'one', items: [{ productId: 'beer', quantity: 1 }, { productId: 'beer', quantity: 2 }], payment: { method: 'qr', amount: 300 } })
  assert.equal(retry.roundId, first.roundId)
  assert.equal((await document('nightclubInventoryBalances', 'cashbox-1:beer')).availableQuantity, 5)
  console.log('PASS 8: reintento idempotente no descuenta dos veces')

  // A pour remains compatible with open-bottle handling; it must not manufacture historic FIFO line data.
  const pour = await call('line-pour', { accountId: 'pour', items: [{ productId: 'rum-shot', quantity: 1 }], payment: { method: 'cash', amount: 50 } })
  const openBottles = await root.collection('nightclubOpenBottles').where('locationId', '==', 'cashbox-1').where('inventoryId', '==', 'rum').get()
  assert.equal(openBottles.docs[0].data().remainingMl, 850)
  assert.equal((await document('nightclubRounds', pour.roundId)).items[0].fifoAllocations.length, 0)
  console.log('PASS especial: botella abierta consume exactamente 150 ml sin inventar trazabilidad cerrada')

  // Insufficient multi-ingredient stock writes neither a round nor a partial stock movement.
  const beforeBadBeer = (await document('nightclubInventoryBalances', 'cashbox-1:beer')).availableQuantity
  await assert.rejects(() => call('line-bad', { accountId: 'bad', items: [{ productId: 'bad-recipe', quantity: 1 }], payment: { method: 'cash', amount: 40 } }))
  assert.equal((await document('nightclubInventoryBalances', 'cashbox-1:beer')).availableQuantity, beforeBadBeer)
  assert.equal((await root.collection('nightclubRounds').where('operationId', '==', 'line-bad').get()).empty, true)
  console.log('PASS especial: insuficiencia no deja consumos parciales')

  // 9: only one concurrent sale can reserve the final unit.
  const concurrent = await Promise.allSettled([
    call('line-concurrent-a', { accountId: 'four', items: [{ productId: 'scarce', quantity: 1 }], payment: { method: 'cash', amount: 30 } }),
    call('line-concurrent-b', { accountId: 'five', items: [{ productId: 'scarce', quantity: 1 }], payment: { method: 'cash', amount: 30 } }),
  ])
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await document('nightclubInventoryBalances', 'cashbox-1:scarce')).availableQuantity, 0)
  console.log('PASS 9: concurrencia no produce sobreventa ni saldo negativo')

  // 10: a different cashbox consumes only its own balance and lot.
  const beforeCashboxOne = (await document('nightclubInventoryBalances', 'cashbox-1:beer')).availableQuantity
  const isolated = await call('line-cashbox-two', { accountId: 'cashbox-two', items: [{ productId: 'beer', quantity: 1 }], payment: { method: 'qr', amount: 100 } })
  const isolatedRound = await document('nightclubRounds', isolated.roundId)
  assert.equal(isolatedRound.items[0].fifoAllocations[0].lotId, 'beer-cashbox-2')
  assert.equal((await document('nightclubInventoryBalances', 'cashbox-1:beer')).availableQuantity, beforeCashboxOne)
  assert.equal((await document('nightclubInventoryBalances', 'cashbox-2:beer')).availableQuantity, 2)
  console.log('PASS 10: Caja 1 y Caja 2 conservan inventarios independientes')

  // Historical rounds remain untouched: no line allocations are fabricated retroactively.
  await root.collection('nightclubRounds').doc('historical').set({ id: 'historical', items: [{ id: 'old-line', productId: 'beer' }] })
  assert.equal((await document('nightclubRounds', 'historical')).items[0].fifoAllocations, undefined)
  console.log('PASS especial: ventas históricas no reciben trazabilidad inventada')

  console.log('PASS nightclubLineFifo: todos los escenarios persistidos en Firestore')
} finally {
  await deleteApp(app)
}

