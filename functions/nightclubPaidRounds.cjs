const { HttpsError } = require('firebase-functions/v2/https')
const { id } = require('./authorization.cjs')
const { consumeNightclubLocationStock, reverseNightclubLocationStock, restoreNightclubLineAllocations } = require('./nightclubLocationConsumption.cjs')
const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const cents = value => Math.round(value * 100)
const fail = message => { throw new HttpsError('failed-precondition', message) }

/** Runs inside nightclubCommand's tenant-scoped, idempotent transaction. */
async function applyPaidRoundCommand({ tx, root, actor, branchId, activeShiftId, operationId, type, payload, now }) {
  const accountId = id(payload.accountId)
  const accountRef = root.collection('nightclubAccounts').doc(accountId)
  const accountSnap = await tx.get(accountRef)
  if (!accountSnap.exists || accountSnap.data().branchId !== branchId) fail('Cuenta no encontrada en esta sucursal.')
  const account = accountSnap.data()
  // Multi-cashbox accounts retain their original shift even when the operator changes box.
  if (!account.locationId && account.shiftId !== activeShiftId) fail('La cuenta pertenece a otro turno.')
  const direct = account.serviceTarget?.type === 'bar' || account.serviceTarget?.type === 'customer'
  if (direct && (account.tableId || account.serviceTarget.tableId || account.orderType && account.orderType !== 'BAR')) fail('Un pedido en barra no puede estar vinculado a una mesa.')
  if (account.serviceTarget?.type === 'table' && account.orderType && account.orderType !== 'TABLE') fail('El tipo de pedido no coincide con la mesa.')
  if (type === 'settleRound') {
    if (account.status !== 'open' || cents(account.balance || 0) !== 0) fail('La ocupaciÃ³n necesita regularizar su saldo anterior antes de nuevos pedidos.')
    const shift = await tx.get(root.collection('nightclubShifts').doc(id(account.shiftId)))
    if (shift.data()?.status !== 'open') fail('No hay turno abierto.')
    const drafts = payload.items
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 50 || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) throw new HttpsError('invalid-argument', 'Pedido invÃ¡lido.')
    const productIds = [...new Set(drafts.map(item => id(item.productId)))]
    const productSnaps = await Promise.all(productIds.map(productId => tx.get(root.collection('nightclubProducts').doc(productId))))
    for (let i = 0; i < productSnaps.length; i++) {
      const snap = productSnaps[i]
      if (!snap.exists || snap.data().branchId !== branchId) {
        throw new HttpsError('not-found', `Producto ${productIds[i]} no encontrado.`)
      }
      const pData = snap.data()
      if (pData.active === false || pData.isActive === false) {
        throw new HttpsError('failed-precondition', `El producto ${pData.name || productIds[i]} no está activo.`)
      }
    }
    const products = new Map(productSnaps.map((snap, index) => [productIds[index], snap.data()]))
    const requirements = new Map()
    let total = 0
    const items = drafts.map((draft, index) => {
      const product = products.get(draft.productId)
      if (!Number.isFinite(product.price) || product.price <= 0) fail('Producto sin precio positivo; registra una cortesía aparte.')
      // Bottle presentations resolve their physical inventory in the location
      // consumer. Keep the inventory id here as well so they pass the same
      // catalogue validation as recipe-backed products.
      const recipe = product.inventoryMode === 'none' ? [] : product.recipe?.length ? product.recipe : product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : product.bottlePresentation?.inventoryId ? [{ inventoryId: product.bottlePresentation.inventoryId, quantity: 1 }] : []
      if (product.inventoryMode !== 'none' && !recipe.length) fail('El producto necesita inventario configurado.')
      for (const part of recipe) {
        if (!Number.isFinite(part.quantity) || part.quantity <= 0) fail('Receta invÃ¡lida.')
        const inventoryId = id(part.inventoryId)
        requirements.set(inventoryId, (requirements.get(inventoryId) || 0) + part.quantity * draft.quantity)
      }
      const lineTotal = money(product.price * draft.quantity)
      total += lineTotal
      return { id: `${operationId}_${index}`, productId: draft.productId, name: product.name, quantity: draft.quantity, unitPrice: product.price, lineTotal, preparationArea: product.preparationArea || 'Barra' }
    })
    total = money(total)
    const payment = payload.payment || {}
    if (!['cash', 'qr', 'card', 'mixed'].includes(payment.method)) throw new HttpsError('invalid-argument', 'MÃ©todo de pago invÃ¡lido.')
    const cashAmount = payment.method === 'cash' ? total : payment.method === 'mixed' ? money(payment.cashAmount || 0) : 0
    const qrAmount = payment.method === 'qr' ? total : payment.method === 'mixed' ? money(payment.qrAmount || 0) : 0
    const cardAmount = payment.method === 'card' ? total : payment.method === 'mixed' ? money(payment.cardAmount || 0) : 0
    if ([cashAmount, qrAmount, cardAmount].some(value => !Number.isFinite(value) || value < 0) || cents(cashAmount + qrAmount + cardAmount) !== cents(total) || payment.amount !== undefined && cents(payment.amount) !== cents(total)) fail('El pago debe cubrir exactamente esta ronda.')
    const received = payment.received === undefined ? cashAmount : money(payment.received)
    if (!Number.isFinite(received) || received < cashAmount) fail('Efectivo recibido insuficiente.')
    const inventoryIds = [...requirements.keys()]
    const inventoryRefs = inventoryIds.map(inventoryId => root.collection('nightclubInventory').doc(inventoryId))
    const stocks = account.locationId ? [] : await Promise.all(inventoryRefs.map(ref => tx.get(ref)))
    if (!account.locationId) stocks.forEach((snap, index) => { if (!snap.exists || snap.data().branchId !== branchId || !Number.isFinite(snap.data().current) || snap.data().current < requirements.get(inventoryIds[index])) fail('Stock insuficiente o insumo no configurado.') })
    const roundId = `round_${operationId}`, paymentId = `payment_${operationId}`
    const hasBar = items.some(item => item.preparationArea !== 'Directo')
    const locationConsumption = account.locationId ? await consumeNightclubLocationStock({ tx, root, actor, branchId, operationId, account, roundId, products, drafts, now }) : null
    tx.create(root.collection('nightclubRounds').doc(roundId), { id: roundId, operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, cashboxId: account.cashboxId || null, locationId: account.locationId || null, accountId, tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null, sequence: (account.roundCount || 0) + 1, items: items.map(item => { const fifoAllocations = locationConsumption?.lineAllocations.filter(allocation => allocation.itemId === item.id) || []; const product = products.get(item.productId); return { ...item, ...(locationConsumption ? { costAtSale: fifoAllocations.reduce((sum, allocation) => sum + allocation.costTotal, 0), fifoAllocations, physicalReturnEligible: fifoAllocations.length > 0 && fifoAllocations.every(allocation => allocation.unit === 'unit') && !product?.bottlePresentation && fifoAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0) === item.quantity } : {}) } }), total, status: hasBar ? 'pending' : 'ready', authorization: 'payment', paymentId, createdAt: now, paidAt: now, sentAt: now, readyAt: hasBar ? null : now, createdBy: actor.uid, paidBy: actor.uid })
    tx.create(root.collection('nightclubPayments').doc(paymentId), { id: paymentId, operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, cashboxId: account.cashboxId || null, locationId: account.locationId || null, accountId, roundId, status: 'confirmed', method: payment.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: money(received - cashAmount), createdAt: now, actorUid: actor.uid })
    stocks.forEach((snap, index) => {
      const inventoryId = inventoryIds[index], quantity = requirements.get(inventoryId), previous = snap.data().current
      tx.update(inventoryRefs[index], { current: money(previous - quantity), updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${inventoryId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, inventoryId, quantity: -quantity, previous, current: money(previous - quantity), type: 'sale', actorUid: actor.uid, createdAt: now })
    })
    if (cashAmount > 0) tx.create(root.collection('nightclubCashMovements').doc(`cash_${operationId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, cashboxId: account.cashboxId || null, locationId: account.locationId || null, accountId, roundId, type: 'sale', amount: cashAmount, actorUid: actor.uid, createdAt: now })
    tx.update(accountRef, { subtotal: money((account.subtotal || 0) + total), paidTotal: money((account.paidTotal || 0) + total), balance: 0, roundCount: (account.roundCount || 0) + 1, updatedAt: now })
    return { accountId, roundId, paymentId, total, status: hasBar ? 'pending' : 'ready' }
  }
  if (type === 'finishOccupancy') {
    if (account.status !== 'open' || cents(account.balance || 0) !== 0) fail('La mesa tiene saldo o ya estÃ¡ cerrada.')
    const rounds = await tx.get(root.collection('nightclubRounds').where('accountId', '==', accountId))
    if (rounds.docs.some(snap => !['delivered', 'cancelled'].includes(snap.data().status))) fail('Hay pedidos pendientes de entrega.')
    const tableRef = account.serviceTarget?.type === 'table' ? root.collection('nightclubTables').doc(id(account.serviceTarget.tableId)) : null
    if (tableRef) {
      const table = await tx.get(tableRef)
      if (table.data()?.activeAccountId !== accountId) fail('La mesa no coincide con la ocupaciÃ³n.')
      tx.update(tableRef, { status: 'available', activeAccountId: null, updatedAt: now })
    }
    tx.update(accountRef, { status: 'closed', closedAt: now, closedBy: actor.uid, updatedAt: now })
    return { accountId, status: 'closed' }
  }
  const roundId = id(payload.roundId), roundRef = root.collection('nightclubRounds').doc(roundId), roundSnap = await tx.get(roundRef)
  if (!roundSnap.exists || roundSnap.data().branchId !== branchId || roundSnap.data().accountId !== accountId) fail('Pedido no encontrado en esta mesa.')
  const round = roundSnap.data()
  if (type === 'advanceRound') {
    if (!['payment', 'courtesy'].includes(round.authorization) || !['pending', 'preparing'].includes(round.status)) fail('Solo se preparan pedidos autorizados.')
    const status = round.status === 'pending' ? 'preparing' : 'ready'
    tx.update(roundRef, { status, [status === 'preparing' ? 'startedAt' : 'readyAt']: now, [status === 'preparing' ? 'startedBy' : 'readyBy']: actor.uid })
    return { accountId, roundId, status }
  }
  if (type === 'deliverRound') {
    if (!['payment', 'courtesy'].includes(round.authorization) || round.status !== 'ready') fail('El pedido todavÃ­a no estÃ¡ listo.')
    tx.update(roundRef, { status: 'delivered', deliveredAt: now, deliveredBy: actor.uid })
    return { accountId, roundId, status: 'delivered' }
  }
  if (type !== 'refundRound') fail('Comando desconocido.')
  if (String(payload.reason || '').trim().length < 4) throw new HttpsError('invalid-argument', 'Indica el motivo del reembolso.')
  if (round.authorization !== 'payment' || ['delivered', 'cancelled'].includes(round.status)) fail('La devoluciÃ³n requiere revisiÃ³n fÃ­sica o ya fue procesada.')
  const paymentRef = root.collection('nightclubPayments').doc(id(round.paymentId)), payment = await tx.get(paymentRef)
  if (!['confirmed', 'partially_refunded'].includes(payment.data()?.status) || payment.data()?.roundId !== roundId) fail('Pago no disponible para reembolso.')
  if (account.locationId && Array.isArray(payload.items) && payload.items.length) {
    const byId = new Map(round.items.map(item => [item.id, item])); const used = new Set(); let amount = 0
    const physicalRestorations = []
    for (const line of payload.items) {
      const item = byId.get(id(line.itemId)); const quantity = Number(line.quantity)
      if (!item || used.has(item.id) || !Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity - Number(item.refundedQuantity || 0)) fail('La cantidad a devolver no es v?lida.')
      if (line.returnToStock === true) {
        if (item.physicalReturnEligible !== true || !Array.isArray(item.fifoAllocations)) fail('Esta línea no es elegible para devolución física automática.')
        let pending = quantity
        for (const allocation of item.fifoAllocations) {
          if (pending <= 0) break
          const available = Number(allocation.quantity || 0) - Number(allocation.physicallyRestoredQuantity || 0)
          const restored = Math.min(pending, available)
          if (restored > 0) { physicalRestorations.push({ ...allocation, quantity: restored, itemId: item.id }); pending -= restored }
        }
        if (pending > 0) fail('La cantidad ya fue restaurada físicamente o no tiene lotes completos.')
      }
      used.add(item.id); amount = money(amount + money(item.lineTotal / item.quantity * quantity))
    }
    if (amount > money(Number(payment.data().amount || round.total) - Number(payment.data().refundedAmount || 0))) fail('El importe excede lo efectivamente cobrado.')
    const physical = await restoreNightclubLineAllocations({ tx, root, actor, branchId, operationId, account: { ...account, id: accountId }, roundId, restorations: physicalRestorations, now })
    const nextItems = round.items.map(item => { const line = payload.items.find(value => value.itemId === item.id); if (!line) return item; const refundedQuantity = Number(item.refundedQuantity || 0) + Number(line.quantity); const fifoAllocations = item.fifoAllocations?.map(allocation => ({ ...allocation, physicallyRestoredQuantity: Number(allocation.physicallyRestoredQuantity || 0) + physicalRestorations.filter(value => value.itemId === item.id && value.lotId === allocation.lotId).reduce((sum, value) => sum + value.quantity, 0) })); return { ...item, ...(fifoAllocations ? { fifoAllocations } : {}), refundedQuantity, physicallyRestoredQuantity: Number(item.physicallyRestoredQuantity || 0) + physicalRestorations.filter(value => value.itemId === item.id).reduce((sum, value) => sum + value.quantity, 0), status: refundedQuantity === item.quantity ? 'returned' : 'partially_returned', returnedAt: now, returnedBy: actor.uid, returnReason: payload.reason.trim() } }); const completed = nextItems.every(item => Number(item.refundedQuantity || 0) >= item.quantity); const cashRefund = money(Number(payment.data().cashAmount || 0) * amount / Number(payment.data().amount || round.total)); const refundRef = root.collection('nightclubRefunds').doc('refund_' + operationId)
    tx.create(refundRef, { id: refundRef.id, operationId, tenantId: actor.tenantId, branchId, accountId, roundId, cashboxId: account.cashboxId || null, locationId: account.locationId, shiftId: account.shiftId, amount, paymentMethod: payment.data().method, cashAmount: cashRefund, items: payload.items, reason: payload.reason.trim(), physicalStockRestored: physical.restored, physicalRestorations, actorUid: actor.uid, createdAt: now }); tx.update(paymentRef, { status: completed ? 'refunded' : 'partially_refunded', refundedAmount: money(Number(payment.data().refundedAmount || 0) + amount) }); tx.update(roundRef, { items: nextItems, refundedAmount: money(Number(round.refundedAmount || 0) + amount), status: completed ? 'cancelled' : round.status }); tx.update(accountRef, { subtotal: money((account.subtotal || 0) - amount), paidTotal: money((account.paidTotal || 0) - amount), balance: 0, updatedAt: now }); if (cashRefund > 0) tx.create(root.collection('nightclubCashMovements').doc('refund_' + operationId), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, cashboxId: account.cashboxId || null, locationId: account.locationId, accountId, roundId, type: 'refund', amount: -cashRefund, actorUid: actor.uid, createdAt: now }); return { accountId, roundId, status: completed ? 'refunded' : 'partial_refund', amount, physicalStockRestored: physical.restored }
  }
  if (account.locationId) {
    const physical = await require('./nightclubLocationConsumption.cjs').reverseNightclubLocationStock({ tx, root, actor, branchId, operationId, account: { ...account, id: accountId }, roundId, reason: payload.reason.trim(), returnToStock: payload.returnToStock === true, now })
    tx.update(paymentRef, { status: 'refunded', refundedAt: now, refundedBy: actor.uid, refundReason: payload.reason.trim(), physicalStockRestored: physical.restored }); tx.update(roundRef, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.uid, cancellationReason: payload.reason.trim(), physicalStockRestored: physical.restored }); tx.update(accountRef, { subtotal: money((account.subtotal || 0) - round.total), paidTotal: money((account.paidTotal || 0) - round.total), balance: 0, updatedAt: now }); return { accountId, roundId, status: 'refunded', amount: round.total, physicalStockRestored: physical.restored }
  }
  const movements = await tx.get(root.collection('nightclubInventoryMovements').where('roundId', '==', roundId).where('type', '==', 'sale'))
  const stockRefs = movements.docs.map(snap => root.collection('nightclubInventory').doc(id(snap.data().inventoryId)))
  const stocks = await Promise.all(stockRefs.map(ref => tx.get(ref)))
  stocks.forEach(snap => { if (!snap.exists) fail('Falta un insumo; requiere revisiÃ³n manual.') })
  movements.docs.forEach((snap, index) => {
    const previous = stocks[index].data().current, quantity = -snap.data().quantity, current = money(previous + quantity)
    tx.update(stockRefs[index], { current, updatedAt: now })
    tx.create(root.collection('nightclubInventoryMovements').doc(`refund_${roundId}_${snap.data().inventoryId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, inventoryId: snap.data().inventoryId, quantity, previous, current, type: 'reversal', reason: payload.reason.trim(), actorUid: actor.uid, createdAt: now })
  })
  tx.update(paymentRef, { status: 'refunded', refundedAt: now, refundedBy: actor.uid, refundReason: payload.reason.trim() })
  tx.update(roundRef, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.uid, cancellationReason: payload.reason.trim() })
  if (payment.data().cashAmount > 0) tx.create(root.collection('nightclubCashMovements').doc(`refund_${roundId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, cashboxId: account.cashboxId || null, locationId: account.locationId || null, accountId, roundId, type: 'refund', amount: -payment.data().cashAmount, actorUid: actor.uid, createdAt: now })
  tx.update(accountRef, { subtotal: money((account.subtotal || 0) - round.total), paidTotal: money((account.paidTotal || 0) - round.total), balance: 0, updatedAt: now })
  return { accountId, roundId, status: 'refunded', amount: round.total }
}

module.exports = { applyPaidRoundCommand }
