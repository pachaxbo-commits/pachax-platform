const { HttpsError } = require('firebase-functions/v2/https')
const round = value => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
const fail = message => { throw new HttpsError('aborted', message) }
const unitFactor = unit => unit === 'l' || unit === 'kg' ? 1000 : 1

/**
 * Reads every affected document before issuing a write. Firestore then retries
 * this whole operation atomically if a sale races with another sale/transfer.
 */
async function consumeNightclubLocationStock({ tx, root, actor, branchId, operationId, account, roundId, products, drafts, now }) {
  const locationId = account.locationId
  if (!locationId) return null
  const regular = new Map(), liquid = new Map(), lineRequirements = []
  const add = (map, inventoryId, quantity) => map.set(inventoryId, round((map.get(inventoryId) || 0) + quantity))
  for (const [draftIndex, draft] of drafts.entries()) {
    const product = products.get(draft.productId)
    if (!product) fail('Producto no disponible.')
    if (product.bottlePresentation) {
      const presentation = product.bottlePresentation
      if (presentation.kind === 'pour') add(liquid, presentation.inventoryId, Number(presentation.millilitres || 0) * draft.quantity)
      else {
        add(regular, presentation.inventoryId, draft.quantity)
        // A closed bottle is a sellable line too. Keep its FIFO allocation on
        // the originating order item instead of only in the aggregated stock
        // total, just like a one-ingredient recipe.
        lineRequirements.push({ itemId: `${operationId}_${draftIndex}`, productId: draft.productId, inventoryId: presentation.inventoryId, quantity: draft.quantity, unit: 'unit' })
      }
      continue
    }
    const recipe = product.inventoryMode === 'none' ? [] : product.recipe?.length ? product.recipe : product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1, unit: 'unit' }] : []
    for (const part of recipe) {
      const quantity = Number(part.quantity) * draft.quantity * unitFactor(part.unit)
      if (!Number.isFinite(quantity) || quantity <= 0) fail('Receta inválida.')
      add(part.unit === 'ml' || part.unit === 'l' ? liquid : regular, part.inventoryId, quantity); if (!(part.unit === 'ml' || part.unit === 'l')) lineRequirements.push({ itemId: `${operationId}_${draftIndex}`, productId: draft.productId, inventoryId: part.inventoryId, quantity, unit: part.unit || 'unit' })
    }
  }
  const inventoryIds = [...new Set([...regular.keys(), ...liquid.keys()])]
  const balances = new Map(), lotsByInventory = new Map(), inventoryById = new Map(), openByInventory = new Map()
  // All reads happen before the first tx.create/update/set below.
  for (const inventoryId of inventoryIds) {
    const [balance, lots, inventory, opens] = await Promise.all([
      tx.get(root.collection('nightclubInventoryBalances').doc(`${locationId}:${inventoryId}`)),
      tx.get(root.collection('nightclubInventoryLots').where('locationId', '==', locationId).where('inventoryId', '==', inventoryId).where('status', '==', 'available')),
      liquid.has(inventoryId) ? tx.get(root.collection('nightclubInventory').doc(inventoryId)) : Promise.resolve(null),
      liquid.has(inventoryId) ? tx.get(root.collection('nightclubOpenBottles').where('locationId', '==', locationId).where('inventoryId', '==', inventoryId).where('status', '==', 'open')) : Promise.resolve(null),
    ])
    if (!balance.exists) fail('Stock insuficiente en la caja asignada.')
    balances.set(inventoryId, balance)
    lotsByInventory.set(inventoryId, lots.docs.filter(doc => Number(doc.data().remainingQuantity || 0) > 0).sort((a, b) => String(a.data().receivedAt).localeCompare(String(b.data().receivedAt)) || a.id.localeCompare(b.id)))
    if (inventory) inventoryById.set(inventoryId, inventory)
    if (opens) openByInventory.set(inventoryId, opens.docs.sort((a, b) => String(a.data().openedAt).localeCompare(String(b.data().openedAt)) || a.id.localeCompare(b.id)))
  }
  const lotChanges = new Map(), balanceChanges = new Map(), openChanges = [], opened = [], movements = []
  const reserveLots = (inventoryId, quantity) => {
    const lots = lotsByInventory.get(inventoryId) || []; let pending = quantity, cost = 0; const allocations = []
    for (const lot of lots) {
      if (pending <= 0) break
      const already = lotChanges.get(lot.id)?.used || 0
      const available = round(Number(lot.data().remainingQuantity || 0) - already)
      if (available <= 0) continue
      const used = Math.min(pending, available)
      lotChanges.set(lot.id, { ref: lot.ref, data: lot.data(), used: round(already + used) })
      allocations.push({ lotId: lot.id, quantity: used, unitCost: Number(lot.data().unitCost || 0) })
      cost += used * Number(lot.data().unitCost || 0); pending = round(pending - used)
    }
    if (pending > 0) fail('No hay lotes FIFO suficientes en la caja asignada.')
    return { allocations, cost: round(cost) }
  }
  const takeBalance = (inventoryId, quantity) => {
    const current = balanceChanges.has(inventoryId) ? balanceChanges.get(inventoryId).current : Number(balances.get(inventoryId).data().availableQuantity || 0)
    if (current < quantity) fail('Stock insuficiente en la caja asignada.')
    balanceChanges.set(inventoryId, { previous: Number(balances.get(inventoryId).data().availableQuantity || 0), current: round(current - quantity) })
  }
  let costTotal = 0
  const lineAllocations = []
  for (const requirement of lineRequirements) { takeBalance(requirement.inventoryId, requirement.quantity); const allocation = reserveLots(requirement.inventoryId, requirement.quantity); costTotal += allocation.cost; const allocations = allocation.allocations.map(value => ({ ...value, itemId: requirement.itemId, productId: requirement.productId, inventoryId: requirement.inventoryId, locationId, unit: requirement.unit, costTotal: round(value.quantity * value.unitCost) })); lineAllocations.push(...allocations); movements.push({ inventoryId: requirement.inventoryId, quantity: -requirement.quantity, reason: 'Venta POS FIFO', allocations, cost: allocation.cost, suffix: `item_${requirement.itemId}_${requirement.inventoryId}` }) }
  for (const [inventoryId, millilitres] of liquid) {
    let pending = millilitres
    for (const bottle of openByInventory.get(inventoryId) || []) {
      if (pending <= 0) break
      const used = Math.min(pending, Number(bottle.data().remainingMl || 0)); if (used <= 0) continue
      openChanges.push({ ref: bottle.ref, remaining: round(Number(bottle.data().remainingMl) - used) }); pending = round(pending - used)
    }
    const capacity = Number(inventoryById.get(inventoryId)?.data()?.bottleCapacityMl || 0)
    if (pending > 0 && !capacity) fail('La botella no tiene mililitros configurados.')
    while (pending > 0) {
      takeBalance(inventoryId, 1); const allocation = reserveLots(inventoryId, 1); costTotal += allocation.cost
      const used = Math.min(pending, capacity), remaining = round(capacity - used)
      opened.push({ inventoryId, remaining, capacity, allocation, suffix: `${pending}` }); pending = round(pending - used)
      movements.push({ inventoryId, quantity: -1, reason: 'Venta POS FIFO', allocations: allocation.allocations, cost: allocation.cost, suffix: `open_${opened.length}` })
    }
    movements.push({ inventoryId, quantity: -millilitres, reason: 'Consumo parcial POS', allocations: [], cost: 0, suffix: 'pour', type: 'pour' })
  }
  for (const change of lotChanges.values()) { const remaining = round(Number(change.data.remainingQuantity || 0) - change.used); tx.update(change.ref, { remainingQuantity: remaining, status: remaining === 0 ? 'consumed' : 'available', updatedAt: now }) }
  for (const [inventoryId, change] of balanceChanges) tx.update(balances.get(inventoryId).ref, { availableQuantity: change.current, updatedAt: now })
  for (const change of openChanges) tx.update(change.ref, { remainingMl: change.remaining, status: change.remaining === 0 ? 'empty' : 'open', updatedAt: now })
  for (const bottle of opened) { const ref = root.collection('nightclubOpenBottles').doc(`open_${operationId}_${bottle.inventoryId}_${bottle.suffix}`); tx.create(ref, { id: ref.id, tenantId: actor.tenantId, branchId, locationId, cashboxId: account.cashboxId || null, inventoryId: bottle.inventoryId, lotId: bottle.allocation.allocations[0]?.lotId || null, capacityMl: bottle.capacity, remainingMl: bottle.remaining, openedAt: now, openedBy: actor.uid, status: bottle.remaining === 0 ? 'empty' : 'open' }) }
  for (const movement of movements) { const balance = balances.get(movement.inventoryId).data(); const ref = root.collection('nightclubInventoryMovements').doc(`location_${operationId}_${movement.inventoryId}_${movement.suffix}`); tx.create(ref, { id: ref.id, operationId, tenantId: actor.tenantId, branchId, cashboxId: account.cashboxId || null, locationId, shiftId: account.shiftId, accountId: account.id, roundId, inventoryId: movement.inventoryId, quantity: movement.quantity, previous: Number(balance.availableQuantity || 0), current: balanceChanges.get(movement.inventoryId)?.current ?? Number(balance.availableQuantity || 0), type: movement.type || 'sale', reason: movement.reason, actorUid: actor.uid, createdAt: now, lotAllocations: movement.allocations, costAmount: movement.cost }) }
  return { locationId, costTotal: round(costTotal), lineAllocations }
}

/** Restores only goods explicitly confirmed as physically returned. Financial refunds never add stock by themselves. */
async function reverseNightclubLocationStock({ tx, root, actor, branchId, operationId, account, roundId, reason, returnToStock, now }) {
  const movements = await tx.get(root.collection('nightclubInventoryMovements').where('roundId', '==', roundId).where('locationId', '==', account.locationId).where('type', '==', 'sale'))
  if (!returnToStock) return { restored: false, movementCount: movements.size }
  const sources = movements.docs.map(movement => ({ movement, source: movement.data() })).filter(({ source }) => source.reason === 'Venta POS FIFO')
  const balanceRefs = [...new Map(sources.map(({ source }) => [source.inventoryId, root.collection('nightclubInventoryBalances').doc(`${account.locationId}:${source.inventoryId}`)])).entries()]
  const balances = new Map(await Promise.all(balanceRefs.map(async ([inventoryId, ref]) => [inventoryId, await tx.get(ref)])))
  const allocationRefs = [...new Map(sources.flatMap(({ source }) => (source.lotAllocations || []).map(allocation => [allocation.lotId, root.collection('nightclubInventoryLots').doc(allocation.lotId)]))).entries()]
  const lots = new Map(await Promise.all(allocationRefs.map(async ([lotId, ref]) => [lotId, await tx.get(ref)])))
  for (const [, balance] of balances) if (!balance.exists) fail('No existe el saldo físico original.')
  for (const [, lot] of lots) if (!lot.exists || lot.data().locationId !== account.locationId) fail('No se puede restaurar el lote original.')
  const adjusted = new Map()
  for (const { source } of sources) for (const allocation of source.lotAllocations || []) adjusted.set(allocation.lotId, round((adjusted.get(allocation.lotId) || 0) + Number(allocation.quantity)))
  for (const [lotId, quantity] of adjusted) { const lot = lots.get(lotId); tx.update(lot.ref, { remainingQuantity: round(Number(lot.data().remainingQuantity || 0) + quantity), status: 'available', updatedAt: now }) }
  for (const [inventoryId, balance] of balances) { const quantity = sources.filter(({ source }) => source.inventoryId === inventoryId).reduce((sum, { source }) => sum + Math.abs(Number(source.quantity || 0)), 0); const previous = Number(balance.data().availableQuantity || 0); tx.update(balance.ref, { availableQuantity: round(previous + quantity), updatedAt: now }); for (const { movement, source } of sources.filter(({ source }) => source.inventoryId === inventoryId)) { const ref = root.collection('nightclubInventoryMovements').doc(`reverse_${operationId}_${movement.id}`); tx.create(ref, { id: ref.id, operationId, tenantId: actor.tenantId, branchId, cashboxId: account.cashboxId || null, locationId: account.locationId, shiftId: account.shiftId, accountId: account.id, roundId, inventoryId, quantity: Math.abs(Number(source.quantity || 0)), previous, current: round(previous + quantity), type: 'reversal', reason, actorUid: actor.uid, createdAt: now, originalMovementId: movement.id, lotAllocations: source.lotAllocations || [], costAmount: source.costAmount || 0 }) } }
  return { restored: sources.length > 0, movementCount: movements.size }
}

/** Restores only explicitly selected, closed-product allocations from a round line. */
async function restoreNightclubLineAllocations({ tx, root, actor, branchId, operationId, account, roundId, restorations, now }) {
  const byLot = new Map(), byInventory = new Map()
  for (const restoration of restorations) {
    byLot.set(restoration.lotId, (byLot.get(restoration.lotId) || 0) + restoration.quantity)
    byInventory.set(restoration.inventoryId, (byInventory.get(restoration.inventoryId) || 0) + restoration.quantity)
  }
  const lots = new Map(await Promise.all([...byLot.keys()].map(async lotId => [lotId, await tx.get(root.collection('nightclubInventoryLots').doc(lotId))])))
  const balances = new Map(await Promise.all([...byInventory.keys()].map(async inventoryId => [inventoryId, await tx.get(root.collection('nightclubInventoryBalances').doc(`${account.locationId}:${inventoryId}`))])))
  for (const [lotId, lot] of lots) if (!lot.exists || lot.data().locationId !== account.locationId) fail(`No se puede restaurar el lote original ${lotId}.`)
  for (const [inventoryId, balance] of balances) if (!balance.exists) fail(`No existe el saldo físico original de ${inventoryId}.`)
  for (const [lotId, quantity] of byLot) { const lot = lots.get(lotId); tx.update(lot.ref, { remainingQuantity: round(Number(lot.data().remainingQuantity || 0) + quantity), status: 'available', updatedAt: now }) }
  for (const [inventoryId, quantity] of byInventory) {
    const balance = balances.get(inventoryId), previous = Number(balance.data().availableQuantity || 0), current = round(previous + quantity)
    tx.update(balance.ref, { availableQuantity: current, updatedAt: now })
    const allocations = restorations.filter(value => value.inventoryId === inventoryId)
    const ref = root.collection('nightclubInventoryMovements').doc(`partial_reverse_${operationId}_${inventoryId}`)
    tx.create(ref, { id: ref.id, operationId, tenantId: actor.tenantId, branchId, cashboxId: account.cashboxId || null, locationId: account.locationId, shiftId: account.shiftId, accountId: account.id, roundId, inventoryId, quantity, previous, current, type: 'reversal', reason: 'Devolución física parcial', actorUid: actor.uid, createdAt: now, lotAllocations: allocations, costAmount: round(allocations.reduce((sum, value) => sum + value.quantity * Number(value.unitCost || 0), 0)) })
  }
  return { restored: restorations.length > 0, restorations }
}
module.exports = { consumeNightclubLocationStock, reverseNightclubLocationStock, restoreNightclubLineAllocations }
