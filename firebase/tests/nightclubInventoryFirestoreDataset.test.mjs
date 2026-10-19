import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { subscribeToNightclubFirestoreDataset } from '../../src/modules/nightclub/data/nightclubFirestoreDataset.ts'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantA = `nightclub-inventory-a-${suffix}`, tenantB = `nightclub-inventory-b-${suffix}`
const userA = `inventory-reader-${suffix}`
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `nightclub-inventory-${suffix}`)
const admin = getFirestore(app)
const root = tenantId => admin.doc(`tenants/${tenantId}`)
const snapshots = []
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const value = snapshots.at(-1)
    if (value && predicate(value)) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  console.error('LAST_DATASET', snapshots.at(-1) && JSON.stringify({
    locations: snapshots.at(-1).locations?.length, cashboxes: snapshots.at(-1).cashboxes?.length,
    inventory: snapshots.at(-1).inventory?.length, balances: snapshots.at(-1).inventoryBalances?.length,
    lots: snapshots.at(-1).inventoryLots?.length, movements: snapshots.at(-1).inventoryMovements?.length,
    bottles: snapshots.at(-1).openBottles?.length, transfers: snapshots.at(-1).transfers?.length,
  }))
  throw new Error(`Tiempo agotado esperando: ${label}`)
}
const write = (tenantId, collectionName, id, value) => root(tenantId).collection(collectionName).doc(id).set({ id, tenantId, ...value })
async function seedTenant(tenantId, branchId, locations) {
  const template = getTemplate('nightclub_lounge')
  await root(tenantId).set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root(tenantId).collection('roles').doc(role.id).set({ ...role, tenantId })
  await write(tenantId, 'nightclubInventory', 'beer', { branchId, name: 'Cerveza', unit: 'unit', current: 0, minimum: 5 })
  for (const [id, quantity] of Object.entries(locations)) {
    await write(tenantId, 'nightclubLocations', id, { branchId, type: id === 'warehouse-general' ? 'warehouse' : 'cashbox', name: id, active: true })
    if (id !== 'warehouse-general') await write(tenantId, 'nightclubCashboxes', id, { branchId, locationId: id, name: id, active: true, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' })
    await write(tenantId, 'nightclubInventoryBalances', `${id}:beer`, { branchId, locationId: id, inventoryId: 'beer', availableQuantity: quantity, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 5, unit: 'unit', updatedAt: '2026-10-15T00:00:00.000Z' })
    await write(tenantId, 'nightclubInventoryLots', `${id}-beer-lot`, { branchId, locationId: id, inventoryId: 'beer', receivedQuantity: quantity, remainingQuantity: quantity, unitCost: id === 'warehouse-general' ? 10 : 12, receivedAt: '2026-10-01T00:00:00.000Z', sourceType: 'purchase', status: 'available' })
  }
  await write(tenantId, 'nightclubInventoryMovements', 'move-beer', { branchId, locationId: 'warehouse-general', inventoryId: 'beer', quantity: 100, previous: 0, current: 100, unit: 'unit', type: 'restock', actor: userA, at: '2026-10-15T00:00:00.000Z', lotAllocations: [{ lotId: 'warehouse-general-beer-lot', quantity: 100, unitCost: 10 }] })
  await write(tenantId, 'nightclubOpenBottles', 'open-rum', { branchId, locationId: 'cashbox-2', inventoryId: 'rum', lotId: 'rum-lot', capacityMl: 750, remainingMl: 500, openedAt: '2026-10-15T00:00:00.000Z', openedBy: userA, status: 'open' })
  await write(tenantId, 'nightclubTransfers', 'transfer-pending', { branchId, sourceLocationId: 'warehouse-general', destinationLocationId: 'cashbox-2', mode: 'pending_receipt', status: 'in_transit', lines: [{ inventoryId: 'beer', quantity: 5, unit: 'unit', lotAllocations: [{ lotId: 'warehouse-general-beer-lot', quantity: 5, unitCost: 10 }] }], createdAt: '2026-10-15T00:00:00.000Z' })
  await write(tenantId, 'nightclubTransfers', 'transfer-received', { branchId, sourceLocationId: 'warehouse-general', destinationLocationId: 'cashbox-1', mode: 'immediate', status: 'received', lines: [], createdAt: '2026-10-15T00:00:00.000Z', receivedAt: '2026-10-15T00:01:00.000Z' })
}

try {
  await seedTenant(tenantA, 'branch-1', { 'warehouse-general': 100, 'cashbox-1': 20, 'cashbox-2': 30, 'cashbox-3': 10, 'cashbox-4': 15 })
  await root(tenantA).collection('nightclubInventoryBalances').doc('warehouse-general:beer-branch-2').set({ id: 'warehouse-general:beer-branch-2', tenantId: tenantA, branchId: 'branch-2', locationId: 'warehouse-general', inventoryId: 'beer-branch-2', availableQuantity: 7, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: 'unit', updatedAt: '2026-10-15T00:00:00.000Z' })
  await seedTenant(tenantB, 'branch-1', { 'warehouse-general': 99 })
  await root(tenantA).collection('members').doc(userA).set({ uid: userA, tenantId: tenantA, roleId: 'admin', status: 'active', branchIds: ['branch-1'] })
  const client = env.authenticatedContext(userA).firestore()

  for (const name of ['nightclubLocations', 'nightclubInventoryBalances', 'nightclubInventoryLots', 'nightclubInventoryMovements', 'nightclubOpenBottles', 'nightclubTransfers']) {
    await assertSucceeds(getDocs(query(collection(client, 'tenants', tenantA, name), where('branchId', '==', 'branch-1'))))
  }
  await assertFails(getDoc(doc(client, 'tenants', tenantB, 'nightclubInventoryBalances', 'warehouse-general:beer')))
  await assertFails(getDoc(doc(client, 'tenants', tenantA, 'nightclubInventoryBalances', 'warehouse-general:beer-branch-2')))
  const anonymousInventoryClient = env.authenticatedContext(`without-inventory-${suffix}`).firestore()
  await assertFails(getDocs(query(collection(anonymousInventoryClient, 'tenants', tenantA, 'nightclubInventoryBalances'), where('branchId', '==', 'branch-1'))))
  console.log('PASS reglas: lectura inventario autorizada; tenant ajeno rechazado')

  let error = null
  const subscription = subscribeToNightclubFirestoreDataset(client, tenantA, 'branch-1', value => snapshots.push(value), value => { error = value; console.error('PROVIDER_ERROR', value.message) }, { includeInventory: true })
  const dataset = await waitFor(value => value.locations?.length === 5 && value.inventoryBalances?.length === 5 && value.inventoryLots?.length === 5 && value.inventoryMovements?.length === 1 && value.openBottles?.length === 1 && value.transfers?.length === 2, 'dataset de inventario completo')
  assert.equal(error, null)
  assert.deepEqual(Object.fromEntries(dataset.inventoryBalances.map(balance => [balance.locationId, balance.availableQuantity])), { 'warehouse-general': 100, 'cashbox-1': 20, 'cashbox-2': 30, 'cashbox-3': 10, 'cashbox-4': 15 })
  assert.equal(dataset.inventoryLots.find(lot => lot.locationId === 'warehouse-general').unitCost, 10)
  assert.equal(dataset.openBottles[0].remainingMl, 500)
  assert.equal(dataset.transfers.some(transfer => transfer.status === 'in_transit'), true)
  assert.equal(dataset.transfers.some(transfer => transfer.status === 'received'), true)
  console.log('PASS provider: depósito, cuatro cajas, lotes, costos, movimientos, botellas y transferencias aislados')

  await root(tenantA).collection('nightclubInventoryBalances').doc('cashbox-2:beer').update({ availableQuantity: 31 })
  const updated = await waitFor(value => value.inventoryBalances?.find(balance => balance.locationId === 'cashbox-2')?.availableQuantity === 31, 'actualización de saldo por listener')
  assert.equal(updated.inventoryBalances.filter(balance => balance.locationId === 'cashbox-2').length, 1)
  console.log('PASS listener: actualiza Caja 2 sin duplicar saldos')
  subscription.unsubscribe()
  await root(tenantA).collection('members').doc(userA).update({ branchIds: ['branch-1', 'branch-2'] })
  snapshots.length = 0
  const branchTwo = subscribeToNightclubFirestoreDataset(client, tenantA, 'branch-2', value => snapshots.push(value), value => { error = value }, { includeInventory: true })
  const changedContext = await waitFor(value => value.inventoryBalances?.length === 1 && value.inventoryBalances[0].inventoryId === 'beer-branch-2', 'cambio de contexto de sucursal')
  assert.equal(changedContext.locations?.length, 0)
  assert.equal(changedContext.inventoryLots?.length, 0)
  assert.equal(changedContext.transfers?.length, 0)
  console.log('PASS cambio de sucursal: no conserva depósito ni cajas del contexto anterior')
  branchTwo.unsubscribe()
  const snapshotCount = snapshots.length
  await root(tenantA).collection('nightclubInventoryBalances').doc('warehouse-general:beer-branch-2').update({ availableQuantity: 8 })
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(snapshots.length, snapshotCount)
  console.log('PASS cleanup: las suscripciones canceladas no publican datos posteriores')
} finally {
  await env.cleanup()
  await deleteApp(app)
}






