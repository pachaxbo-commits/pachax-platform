const { HttpsError } = require('firebase-functions/v2/https')
const { id } = require('./authorization.cjs')
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
  if (account.shiftId !== activeShiftId) fail('La cuenta pertenece a otro turno.')
  const direct = account.serviceTarget?.type === 'bar' || account.serviceTarget?.type === 'customer'
  if (direct && (account.tableId || account.serviceTarget.tableId || account.orderType && account.orderType !== 'BAR')) fail('Un pedido en barra no puede estar vinculado a una mesa.')
  if (account.serviceTarget?.type === 'table' && account.orderType && account.orderType !== 'TABLE') fail('El tipo de pedido no coincide con la mesa.')
  if (type === 'settleRound') {
    if (account.status !== 'open' || cents(account.balance || 0) !== 0) fail('La ocupación necesita regularizar su saldo anterior antes de nuevos pedidos.')
    const shift = await tx.get(root.collection('nightclubShifts').doc(id(account.shiftId)))
    if (shift.data()?.status !== 'open') fail('No hay turno abierto.')
    const drafts = payload.items
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 50 || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) throw new HttpsError('invalid-argument', 'Pedido inválido.')
    const productIds = [...new Set(drafts.map(item => id(item.productId)))]
    const productSnaps = await Promise.all(productIds.map(productId => tx.get(root.collection('nightclubProducts').doc(productId))))
    const products = new Map(productSnaps.map((snap, index) => [productIds[index], snap.data()]))
    const requirements = new Map()
    let total = 0
    const items = drafts.map((draft, index) => {
      const product = products.get(draft.productId)
      if (!product || product.branchId !== branchId || product.active === false || !Number.isFinite(product.price) || product.price <= 0) fail('Producto sin precio positivo; registra una cortesía aparte.')
      const recipe = product.inventoryMode === 'none' ? [] : product.recipe?.length ? product.recipe : product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : []
      if (product.inventoryMode !== 'none' && !recipe.length) fail('El producto necesita inventario configurado.')
      for (const part of recipe) {
        if (!Number.isFinite(part.quantity) || part.quantity <= 0) fail('Receta inválida.')
        const inventoryId = id(part.inventoryId)
        requirements.set(inventoryId, (requirements.get(inventoryId) || 0) + part.quantity * draft.quantity)
      }
      const lineTotal = money(product.price * draft.quantity)
      total += lineTotal
      return { id: `${operationId}_${index}`, productId: draft.productId, name: product.name, quantity: draft.quantity, unitPrice: product.price, lineTotal, preparationArea: product.preparationArea || 'Barra' }
    })
    total = money(total)
    const payment = payload.payment || {}
    if (!['cash', 'qr', 'card', 'mixed'].includes(payment.method)) throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    const cashAmount = payment.method === 'cash' ? total : payment.method === 'mixed' ? money(payment.cashAmount || 0) : 0
    const qrAmount = payment.method === 'qr' ? total : payment.method === 'mixed' ? money(payment.qrAmount || 0) : 0
    const cardAmount = payment.method === 'card' ? total : payment.method === 'mixed' ? money(payment.cardAmount || 0) : 0
    if ([cashAmount, qrAmount, cardAmount].some(value => !Number.isFinite(value) || value < 0) || cents(cashAmount + qrAmount + cardAmount) !== cents(total) || payment.amount !== undefined && cents(payment.amount) !== cents(total)) fail('El pago debe cubrir exactamente esta ronda.')
    const received = payment.received === undefined ? cashAmount : money(payment.received)
    if (!Number.isFinite(received) || received < cashAmount) fail('Efectivo recibido insuficiente.')
    const inventoryIds = [...requirements.keys()]
    const inventoryRefs = inventoryIds.map(inventoryId => root.collection('nightclubInventory').doc(inventoryId))
    const stocks = await Promise.all(inventoryRefs.map(ref => tx.get(ref)))
    stocks.forEach((snap, index) => { if (!snap.exists || snap.data().branchId !== branchId || !Number.isFinite(snap.data().current) || snap.data().current < requirements.get(inventoryIds[index])) fail('Stock insuficiente o insumo no configurado.') })
    const roundId = `round_${operationId}`, paymentId = `payment_${operationId}`
    const hasBar = items.some(item => item.preparationArea !== 'Directo')
    tx.create(root.collection('nightclubRounds').doc(roundId), { id: roundId, operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null, sequence: (account.roundCount || 0) + 1, items, total, status: hasBar ? 'pending' : 'ready', authorization: 'payment', paymentId, createdAt: now, paidAt: now, sentAt: now, readyAt: hasBar ? null : now, createdBy: actor.uid, paidBy: actor.uid })
    tx.create(root.collection('nightclubPayments').doc(paymentId), { id: paymentId, operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, status: 'confirmed', method: payment.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: money(received - cashAmount), createdAt: now, actorUid: actor.uid })
    stocks.forEach((snap, index) => {
      const inventoryId = inventoryIds[index], quantity = requirements.get(inventoryId), previous = snap.data().current
      tx.update(inventoryRefs[index], { current: money(previous - quantity), updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${inventoryId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, inventoryId, quantity: -quantity, previous, current: money(previous - quantity), type: 'sale', actorUid: actor.uid, createdAt: now })
    })
    if (cashAmount > 0) tx.create(root.collection('nightclubCashMovements').doc(`cash_${operationId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, type: 'sale', amount: cashAmount, actorUid: actor.uid, createdAt: now })
    tx.update(accountRef, { subtotal: money((account.subtotal || 0) + total), paidTotal: money((account.paidTotal || 0) + total), balance: 0, roundCount: (account.roundCount || 0) + 1, updatedAt: now })
    return { accountId, roundId, paymentId, total, status: hasBar ? 'pending' : 'ready' }
  }
  if (type === 'finishOccupancy') {
    if (account.status !== 'open' || cents(account.balance || 0) !== 0) fail('La mesa tiene saldo o ya está cerrada.')
    const rounds = await tx.get(root.collection('nightclubRounds').where('accountId', '==', accountId))
    if (rounds.docs.some(snap => !['delivered', 'cancelled'].includes(snap.data().status))) fail('Hay pedidos pendientes de entrega.')
    const tableRef = account.serviceTarget?.type === 'table' ? root.collection('nightclubTables').doc(id(account.serviceTarget.tableId)) : null
    if (tableRef) {
      const table = await tx.get(tableRef)
      if (table.data()?.activeAccountId !== accountId) fail('La mesa no coincide con la ocupación.')
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
    if (!['payment', 'courtesy'].includes(round.authorization) || round.status !== 'ready') fail('El pedido todavía no está listo.')
    tx.update(roundRef, { status: 'delivered', deliveredAt: now, deliveredBy: actor.uid })
    return { accountId, roundId, status: 'delivered' }
  }
  if (type !== 'refundRound') fail('Comando desconocido.')
  if (String(payload.reason || '').trim().length < 4) throw new HttpsError('invalid-argument', 'Indica el motivo del reembolso.')
  if (round.authorization !== 'payment' || ['delivered', 'cancelled'].includes(round.status)) fail('La devolución requiere revisión física o ya fue procesada.')
  const paymentRef = root.collection('nightclubPayments').doc(id(round.paymentId)), payment = await tx.get(paymentRef)
  if (payment.data()?.status !== 'confirmed' || payment.data()?.roundId !== roundId) fail('Pago no disponible para reembolso.')
  const movements = await tx.get(root.collection('nightclubInventoryMovements').where('roundId', '==', roundId).where('type', '==', 'sale'))
  const stockRefs = movements.docs.map(snap => root.collection('nightclubInventory').doc(id(snap.data().inventoryId)))
  const stocks = await Promise.all(stockRefs.map(ref => tx.get(ref)))
  stocks.forEach(snap => { if (!snap.exists) fail('Falta un insumo; requiere revisión manual.') })
  movements.docs.forEach((snap, index) => {
    const previous = stocks[index].data().current, quantity = -snap.data().quantity, current = money(previous + quantity)
    tx.update(stockRefs[index], { current, updatedAt: now })
    tx.create(root.collection('nightclubInventoryMovements').doc(`refund_${roundId}_${snap.data().inventoryId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, inventoryId: snap.data().inventoryId, quantity, previous, current, type: 'reversal', reason: payload.reason.trim(), actorUid: actor.uid, createdAt: now })
  })
  tx.update(paymentRef, { status: 'refunded', refundedAt: now, refundedBy: actor.uid, refundReason: payload.reason.trim() })
  tx.update(roundRef, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.uid, cancellationReason: payload.reason.trim() })
  if (payment.data().cashAmount > 0) tx.create(root.collection('nightclubCashMovements').doc(`refund_${roundId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, type: 'refund', amount: -payment.data().cashAmount, actorUid: actor.uid, createdAt: now })
  tx.update(accountRef, { subtotal: money((account.subtotal || 0) - round.total), paidTotal: money((account.paidTotal || 0) - round.total), balance: 0, updatedAt: now })
  return { accountId, roundId, status: 'refunded', amount: round.total }
}

module.exports = { applyPaidRoundCommand }
