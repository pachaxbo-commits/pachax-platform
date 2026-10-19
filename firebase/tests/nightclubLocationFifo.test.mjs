import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const { executeNightclubCommand } = require('./nightclub.cjs')
const suffix = `${Date.now().toString(36)}-fifo`
const tenantId = `location_${suffix}`
const app = initializeApp({ projectId }, `nightclub-location-${suffix}`)
const db = getFirestore(app)
const root = db.doc(`tenants/${tenantId}`)
const call = (uid, commandType, operationId, payload = {}) => executeNightclubCommand(db, { auth: { uid }, data: { tenantId, branchId: 'main', commandType, operationId, payload } })
const doc = async (collection, id) => (await root.collection(collection).doc(id).get()).data()
const setBalance = (locationId, inventoryId, availableQuantity) => root.collection('nightclubInventoryBalances').doc(`${locationId}:${inventoryId}`).set({ id: `${locationId}:${inventoryId}`, branchId: 'main', locationId, inventoryId, availableQuantity, inTransitQuantity: 0 })
const setLot = (id, locationId, inventoryId, remainingQuantity, unitCost, receivedAt) => root.collection('nightclubInventoryLots').doc(id).set({ id, branchId: 'main', locationId, inventoryId, remainingQuantity, receivedQuantity: remainingQuantity, unitCost, receivedAt, status: 'available' })
const account = (id, locationId, shiftId = 'shift-box-1') => root.collection('nightclubAccounts').doc(id).set({ id, branchId: 'main', status: 'open', serviceTarget: { type: 'bar' }, orderType: 'BAR', cashboxId: locationId === 'warehouse-general' ? null : locationId, locationId, shiftId, subtotal: 0, paidTotal: 0, balance: 0, roundCount: 0 })
const pay = (accountId, productId, operationId) => call('waiter', 'settleRound', operationId, { accountId, items: [{ productId, quantity: 1 }], payment: { method: 'qr', amount: 100 } })

try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId] of [['waiter', 'waiter'], ['admin', 'admin']]) await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status: 'active', branchIds: ['main'] })
  await root.collection('nightclubOperationalState').doc('main').set({ activeShiftId: 'legacy-shift' })
  await root.collection('nightclubShifts').doc('legacy-shift').set({ id: 'legacy-shift', branchId: 'main', status: 'open' })
  for (const locationId of ['warehouse-general', 'cashbox-1', 'cashbox-2', 'cashbox-3', 'cashbox-4']) await root.collection('nightclubLocations').doc(locationId).set({ id: locationId, branchId: 'main', type: locationId === 'warehouse-general' ? 'warehouse' : 'cashbox', active: true })
  for (const number of [1, 2, 3, 4]) { const id = `cashbox-${number}`; await root.collection('nightclubCashboxes').doc(id).set({ id, branchId: 'main', locationId: id, active: true }); await root.collection('nightclubShifts').doc(`shift-box-${number}`).set({ id: `shift-box-${number}`, branchId: 'main', cashboxId: id, locationId: id, status: 'open' }) }

  // 1: ml from an opened bottle, exact remaining ml and original FIFO lot.
  await root.collection('nightclubInventory').doc('cola').set({ branchId: 'main', bottleCapacityMl: 1000 })
  await root.collection('nightclubProducts').doc('cola-glass').set({ branchId: 'main', name: 'Vaso cola', active: true, price: 100, preparationArea: 'Barra', recipe: [{ inventoryId: 'cola', quantity: 150, unit: 'ml' }] })
  await setBalance('cashbox-1', 'cola', 2); await setLot('cola-lot', 'cashbox-1', 'cola', 2, 12, '2026-01-01T00:00:00.000Z'); await account('ml-account', 'cashbox-1')
  const mlSale = await pay('ml-account', 'cola-glass', 'ml-sale')
  const opened = (await root.collection('nightclubOpenBottles').where('locationId', '==', 'cashbox-1').where('inventoryId', '==', 'cola').get()).docs[0].data()
  assert.equal(opened.remainingMl, 850); assert.equal(opened.lotId, 'cola-lot'); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-1:cola')).availableQuantity, 1); assert.equal((await doc('nightclubInventoryLots', 'cola-lot')).remainingQuantity, 1)
  const mlMoves = await root.collection('nightclubInventoryMovements').where('roundId', '==', mlSale.roundId).get(); assert.equal(mlMoves.docs.some(item => item.data().type === 'pour' && item.data().quantity === -150), true)
  console.log('PASS ml: botella abierta, lote y 150 ml exactos')

  // 2: multi-ingredient recipe is atomic and stores both movements.
  await root.collection('nightclubProducts').doc('combo').set({ branchId: 'main', name: 'Combo', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'meat', quantity: 180, unit: 'g' }, { inventoryId: 'potato', quantity: 120, unit: 'g' }] })
  for (const id of ['meat', 'potato']) { await root.collection('nightclubInventory').doc(id).set({ branchId: 'main' }); await setBalance('cashbox-1', id, 500); await setLot(`${id}-lot`, 'cashbox-1', id, 500, 0.05, '2026-01-02T00:00:00.000Z') }
  await account('recipe-account', 'cashbox-1'); const recipeSale = await pay('recipe-account', 'combo', 'recipe-sale'); const recipeMoves = await root.collection('nightclubInventoryMovements').where('roundId', '==', recipeSale.roundId).where('type', '==', 'sale').get()
  assert.equal(recipeMoves.size, 2); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-1:meat')).availableQuantity, 320); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-1:potato')).availableQuantity, 380)
  console.log('PASS receta multiple: ambos ingredientes persisten atomicos')

  // 3: FIFO allocations retain lot cost.
  await root.collection('nightclubProducts').doc('fifo-product').set({ branchId: 'main', name: 'FIFO', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'fifo', quantity: 2, unit: 'unit' }] }); await root.collection('nightclubInventory').doc('fifo').set({ branchId: 'main' }); await setBalance('cashbox-1', 'fifo', 3); await setLot('fifo-old', 'cashbox-1', 'fifo', 1, 10, '2026-01-01T00:00:00.000Z'); await setLot('fifo-new', 'cashbox-1', 'fifo', 2, 20, '2026-01-03T00:00:00.000Z'); await account('fifo-account', 'cashbox-1')
  const fifoSale = await pay('fifo-account', 'fifo-product', 'fifo-sale'); const fifoMove = (await root.collection('nightclubInventoryMovements').where('roundId', '==', fifoSale.roundId).where('type', '==', 'sale').get()).docs[0].data(); assert.deepEqual(fifoMove.lotAllocations.map(item => [item.lotId, item.quantity]), [['fifo-old', 1], ['fifo-new', 1]]); assert.equal(fifoMove.costAmount, 30)
  console.log('PASS FIFO: lotes por costo y asignacion persistida')

  // 4: insufficient second ingredient rolls the whole transaction back.
  await root.collection('nightclubProducts').doc('short-product').set({ branchId: 'main', name: 'Insuficiente', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'enough', quantity: 1, unit: 'unit' }, { inventoryId: 'missing', quantity: 2, unit: 'unit' }] }); for (const [id, qty] of [['enough', 1], ['missing', 1]]) { await root.collection('nightclubInventory').doc(id).set({ branchId: 'main' }); await setBalance('cashbox-1', id, qty); await setLot(`${id}-lot`, 'cashbox-1', id, qty, 1, '2026-01-04T00:00:00.000Z') }; await account('short-account', 'cashbox-1')
  await assert.rejects(() => pay('short-account', 'short-product', 'short-sale'), error => error.code === 'aborted'); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-1:enough')).availableQuantity, 1); assert.equal((await root.collection('nightclubRounds').where('accountId', '==', 'short-account').get()).empty, true)
  console.log('PASS insuficiencia: sin ronda ni consumo parcial')

  // 5 and 6: only one concurrent sale/transfer can take the final source unit.
  await root.collection('nightclubProducts').doc('race-product').set({ branchId: 'main', name: 'Carrera', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'race', quantity: 1, unit: 'unit' }] }); await root.collection('nightclubInventory').doc('race').set({ branchId: 'main' }); await setBalance('warehouse-general', 'race', 1); await setLot('race-lot', 'warehouse-general', 'race', 1, 7, '2026-01-05T00:00:00.000Z'); await account('race-a', 'warehouse-general', 'legacy-shift'); await account('race-b', 'warehouse-general', 'legacy-shift')
  const concurrent = await Promise.allSettled([pay('race-a', 'race-product', 'race-sale-a'), pay('race-b', 'race-product', 'race-sale-b')]); assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await doc('nightclubInventoryBalances', 'warehouse-general:race')).availableQuantity, 0)
  console.log('PASS concurrencia: ultimo lote no se sobrevende')

  // 6: a transfer dispatch and a sale race on one source lot; just one may claim it.
  await root.collection('nightclubProducts').doc('transfer-race-product').set({ branchId: 'main', name: 'Carrera transferencia', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'transfer-race', quantity: 1, unit: 'unit' }] }); await root.collection('nightclubInventory').doc('transfer-race').set({ branchId: 'main' }); await setBalance('warehouse-general', 'transfer-race', 1); await setLot('transfer-race-lot', 'warehouse-general', 'transfer-race', 1, 9, '2026-01-06T00:00:00.000Z'); await account('transfer-race-account', 'warehouse-general', 'legacy-shift')
  const transferRequest = await call('admin', 'requestTransfer', 'transfer-race-request', { transfer: { sourceLocationId: 'warehouse-general', destinationLocationId: 'cashbox-4', mode: 'immediate', lines: [{ inventoryId: 'transfer-race', quantity: 1, unit: 'unit', lotAllocations: [{ lotId: 'transfer-race-lot', quantity: 1, unitCost: 9 }] }] } })
  const saleAndTransfer = await Promise.allSettled([pay('transfer-race-account', 'transfer-race-product', 'transfer-race-sale'), call('admin', 'dispatchTransfer', 'transfer-race-dispatch', { transferId: transferRequest.transferId })]); assert.equal(saleAndTransfer.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await doc('nightclubInventoryBalances', 'warehouse-general:transfer-race')).availableQuantity, 0); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-4:transfer-race'))?.availableQuantity || 0, saleAndTransfer[1].status === 'fulfilled' ? 1 : 0)
  console.log('PASS venta y transferencia concurrentes: no hay doble salida ni saldo negativo')

  // 7: location isolation includes all four cashboxes and warehouse.
  await root.collection('nightclubProducts').doc('isolated').set({ branchId: 'main', name: 'Aislado', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'isolate', quantity: 1, unit: 'unit' }] }); await root.collection('nightclubInventory').doc('isolate').set({ branchId: 'main' }); for (const locationId of ['warehouse-general', 'cashbox-1', 'cashbox-2', 'cashbox-3', 'cashbox-4']) { await setBalance(locationId, 'isolate', 1); await setLot(`isolate-${locationId}`, locationId, 'isolate', 1, 5, `2026-01-0${locationId === 'warehouse-general' ? 1 : locationId.at(-1)}T00:00:00.000Z`) }; await account('isolation-account', 'cashbox-2', 'shift-box-2'); await pay('isolation-account', 'isolated', 'isolation-sale'); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-2:isolate')).availableQuantity, 0); for (const locationId of ['warehouse-general', 'cashbox-1', 'cashbox-3', 'cashbox-4']) assert.equal((await doc('nightclubInventoryBalances', `${locationId}:isolate`)).availableQuantity, 1)
  console.log('PASS aislamiento: Caja 1-4 y almacen no se mezclan')

  // 8, 9 and 11: financial vs physical refund, original lot, and retry idempotency.
  await root.collection('nightclubProducts').doc('returnable').set({ branchId: 'main', name: 'Retornable', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'returnable-stock', quantity: 1, unit: 'unit' }] }); await root.collection('nightclubInventory').doc('returnable-stock').set({ branchId: 'main' }); await setBalance('cashbox-3', 'returnable-stock', 2); await setLot('return-old', 'cashbox-3', 'returnable-stock', 1, 11, '2026-01-01T00:00:00.000Z'); await setLot('return-new', 'cashbox-3', 'returnable-stock', 1, 13, '2026-01-02T00:00:00.000Z')
  await account('financial-refund', 'cashbox-3', 'shift-box-3'); const financial = await pay('financial-refund', 'returnable', 'financial-sale'); await call('admin', 'refundRound', 'financial-refund-op', { accountId: 'financial-refund', roundId: financial.roundId, reason: 'No retorno', returnToStock: false }); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-3:returnable-stock')).availableQuantity, 1)
  await account('physical-refund', 'cashbox-3', 'shift-box-3'); const physical = await pay('physical-refund', 'returnable', 'physical-sale'); await Promise.all([call('admin', 'refundRound', 'physical-refund-op', { accountId: 'physical-refund', roundId: physical.roundId, reason: 'Producto cerrado', returnToStock: true }), call('admin', 'refundRound', 'physical-refund-op', { accountId: 'physical-refund', roundId: physical.roundId, reason: 'Producto cerrado', returnToStock: true })]); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-3:returnable-stock')).availableQuantity, 1); assert.equal((await doc('nightclubInventoryLots', 'return-new')).remainingQuantity, 1); assert.equal((await root.collection('nightclubInventoryMovements').where('roundId', '==', physical.roundId).where('type', '==', 'reversal').get()).size, 1)
  console.log('PASS devoluciones: financiera no restaura; fisica idempotente conserva lote')

  // 10: operator context may change box; pending account keeps original location and shift.
  await root.collection('nightclubOperatorContexts').doc('waiter').set({ id: 'waiter', branchId: 'main', cashboxId: 'cashbox-1', locationId: 'cashbox-1', activeShiftId: 'shift-box-1' }); await account('pending-account', 'cashbox-1', 'shift-box-1'); await call('admin', 'selectCashbox', 'admin-select-two', { cashboxId: 'cashbox-2' }); const pending = await doc('nightclubAccounts', 'pending-account'); assert.equal(pending.locationId, 'cashbox-1'); assert.equal(pending.shiftId, 'shift-box-1')
  console.log('PASS cambio de caja: cuenta pendiente conserva caja y turno')

  await root.collection('nightclubProducts').doc('beer-partial').set({ branchId: 'main', name: 'Cerveza cerrada', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'beer-partial-stock', quantity: 1, unit: 'unit' }] })
  await root.collection('nightclubProducts').doc('snack-partial').set({ branchId: 'main', name: 'Snack cerrado', active: true, price: 50, preparationArea: 'Directo', recipe: [{ inventoryId: 'snack-partial-stock', quantity: 1, unit: 'unit' }] })
  for (const [inventoryId, quantity, cost] of [['beer-partial-stock', 8, 8], ['snack-partial-stock', 3, 3]]) { await root.collection('nightclubInventory').doc(inventoryId).set({ branchId: 'main' }); await setBalance('cashbox-2', inventoryId, quantity); await setLot(inventoryId + '-old', 'cashbox-2', inventoryId, quantity, cost, '2026-02-01T00:00:00.000Z') }
  await account('partial-account', 'cashbox-2', 'shift-box-2')
  const partialSale = await call('waiter', 'settleRound', 'partial-sale', { accountId: 'partial-account', items: [{ productId: 'beer-partial', quantity: 3 }, { productId: 'snack-partial', quantity: 1 }], payment: { method: 'mixed', cashAmount: 150, qrAmount: 200, cardAmount: 0, amount: 350 } })
  const partialRound = await doc('nightclubRounds', partialSale.roundId)
  const beerLine = partialRound.items.find(item => item.productId === 'beer-partial'), snackLine = partialRound.items.find(item => item.productId === 'snack-partial')
  const firstPartial = await call('admin', 'refundRound', 'partial-one', { accountId: 'partial-account', roundId: partialSale.roundId, reason: 'Devuelve una', items: [{ itemId: beerLine.id, quantity: 1, returnToStock: false }] })
  assert.equal(firstPartial.amount, 100); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-2:beer-partial-stock')).availableQuantity, 6); assert.equal((await doc('nightclubInventoryLots', 'beer-partial-stock-old')).remainingQuantity, 6); assert.equal((await doc('nightclubRounds', partialSale.roundId)).items.find(item => item.id === beerLine.id).refundedQuantity, 1)
  assert.equal((await doc('nightclubRounds', partialSale.roundId)).status, 'ready'); assert.equal((await doc('nightclubPayments', partialSale.paymentId)).refundedAmount, 100); assert.equal((await root.collection('nightclubRefunds').where('roundId', '==', partialSale.roundId).get()).size, 1); console.log('PASS parcial aislado: Bs 100 de Bs 350'); if (process.env.PARTIAL_ONLY === '1') { await deleteApp(app); process.exit(0) }
  const financialPartial = await call('admin', 'refundRound', 'partial-financial', { accountId: 'partial-account', roundId: partialSale.roundId, reason: 'Solo dinero', items: [{ itemId: beerLine.id, quantity: 1, returnToStock: false }, { itemId: snackLine.id, quantity: 1, returnToStock: false }] })
  assert.equal(financialPartial.amount, 150); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-2:beer-partial-stock')).availableQuantity, 6); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-2:snack-partial-stock')).availableQuantity, 2)
  await assert.rejects(() => call('admin', 'refundRound', 'partial-excess', { accountId: 'partial-account', roundId: partialSale.roundId, reason: 'Excede cantidad', items: [{ itemId: beerLine.id, quantity: 3, returnToStock: false }] }), error => error.code === 'failed-precondition')
  const [remainingA, remainingB] = await Promise.allSettled([call('admin', 'refundRound', 'partial-rest-a', { accountId: 'partial-account', roundId: partialSale.roundId, reason: 'Resto final', items: [{ itemId: beerLine.id, quantity: 1, returnToStock: true }] }), call('admin', 'refundRound', 'partial-rest-b', { accountId: 'partial-account', roundId: partialSale.roundId, reason: 'Resto final', items: [{ itemId: beerLine.id, quantity: 1, returnToStock: true }] })])
  assert.equal([remainingA, remainingB].filter(result => result.status === 'fulfilled').length, 1)
  const finalRound = await doc('nightclubRounds', partialSale.roundId), finalPayment = await doc('nightclubPayments', partialSale.paymentId)
  assert.equal(finalRound.status, 'cancelled'); assert.equal(finalPayment.status, 'refunded'); assert.equal(finalPayment.refundedAmount, 350); assert.equal((await doc('nightclubInventoryBalances', 'cashbox-2:beer-partial-stock')).availableQuantity, 7)
  await assert.rejects(() => call('admin', 'refundRound', 'partial-again', { accountId: 'partial-account', roundId: partialSale.roundId, reason: 'Doble devolucion', items: [{ itemId: beerLine.id, quantity: 1, returnToStock: true }] }), error => error.code === 'failed-precondition')
  assert.equal((await root.collection('nightclubRefunds').where('roundId', '==', partialSale.roundId).get()).size, 3)
  console.log('PASS devoluciones parciales: unidades, lineas mixtas, efectivo/QR, lotes, limites, concurrencia y resto')

} finally { await deleteApp(app) }
