const { HttpsError } = require('firebase-functions/v2/https')
const {
  planNightclubInventoryConsumption,
  calculateNightclubStockUpdates,
  applyNightclubStockUpdates,
  prepareNightclubInventoryReversal,
  applyNightclubInventoryReversal,
} = require('./nightclubInventoryHelper.cjs')

const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Identificador inválido.')
  }
  return value
}
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
  if (direct && (account.tableId || account.serviceTarget.tableId || (account.orderType && account.orderType !== 'BAR'))) fail('Un pedido en barra no puede estar vinculado a una mesa.')
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

    let sellerStaffId = payload.sellerStaffId || payload.serviceStaffId || null
    if (sellerStaffId) {
      sellerStaffId = id(sellerStaffId)
      const staffSnap = await tx.get(root.collection('members').doc(sellerStaffId))
      if (!staffSnap.exists || staffSnap.data().status !== 'active' || !['waiter', 'service'].includes(staffSnap.data().roleId || staffSnap.data().role)) {
        fail('El mesero especificado no está activo o no es válido.')
      }
    }

    const requirementsMap = planNightclubInventoryConsumption(products, drafts, branchId)
    const inventoryIds = [...requirementsMap.keys()]
    const inventoryRefs = inventoryIds.map(inventoryId => root.collection('nightclubInventory').doc(inventoryId))
    const stocks = await Promise.all(inventoryRefs.map(ref => tx.get(ref)))
    const stocksMap = new Map(inventoryIds.map((invId, idx) => [invId, stocks[idx]]))
    const stockUpdates = calculateNightclubStockUpdates(stocksMap, requirementsMap, branchId)

    let total = 0
    const commissionCreations = []
    const items = drafts.map((draft, index) => {
      const product = products.get(draft.productId)
      const lineTotal = money(product.price * draft.quantity)
      total += lineTotal
      let commissionSnapshot = null
      if (sellerStaffId && product.commission?.enabled && Number(product.commission.value) > 0) {
        commissionSnapshot = {
          type: product.commission.type || 'percentage',
          value: Number(product.commission.value),
        }
      }
      const itemId = `${operationId}_${index}`
      if (commissionSnapshot) {
        const commAmount = money(commissionSnapshot.type === 'percentage' ? lineTotal * commissionSnapshot.value / 100 : commissionSnapshot.value * draft.quantity)
        commissionCreations.push({
          itemId,
          productId: product.id,
          productName: product.name,
          staffId: sellerStaffId,
          quantity: draft.quantity,
          saleAmount: lineTotal,
          type: commissionSnapshot.type,
          value: commissionSnapshot.value,
          amount: commAmount,
        })
      }
      return { id: itemId, productId: draft.productId, name: product.name, quantity: draft.quantity, unitPrice: product.price, lineTotal, preparationArea: product.preparationArea || 'Barra', ...(commissionSnapshot ? { commissionSnapshot } : {}) }
    })
    total = money(total)
    const payment = payload.payment || {}
    if (!['cash', 'qr', 'card', 'mixed'].includes(payment.method)) throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    const cashAmount = payment.method === 'cash' ? total : payment.method === 'mixed' ? money(payment.cashAmount || 0) : 0
    const qrAmount = payment.method === 'qr' ? total : payment.method === 'mixed' ? money(payment.qrAmount || 0) : 0
    const cardAmount = payment.method === 'card' ? total : payment.method === 'mixed' ? money(payment.cardAmount || 0) : 0
    if ([cashAmount, qrAmount, cardAmount].some(value => !Number.isFinite(value) || value < 0) || cents(cashAmount + qrAmount + cardAmount) !== cents(total) || (payment.amount !== undefined && cents(payment.amount) !== cents(total))) fail('El pago debe cubrir exactamente esta ronda.')
    const received = payment.received === undefined ? cashAmount : money(payment.received)
    if (!Number.isFinite(received) || received < cashAmount) fail('Efectivo recibido insuficiente.')

    const roundId = `round_${operationId}`, paymentId = `payment_${operationId}`
    const hasBar = items.some(item => item.preparationArea !== 'Directo')
    const consumption = applyNightclubStockUpdates(
      tx,
      root,
      actor,
      branchId,
      account.shiftId,
      accountId,
      roundId,
      operationId,
      now,
      stockUpdates
    )

    tx.create(root.collection('nightclubRounds').doc(roundId), { id: roundId, operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null, sequence: (account.roundCount || 0) + 1, items, consumption, total, status: hasBar ? 'pending' : 'ready', authorization: 'payment', paymentId, createdAt: now, paidAt: now, sentAt: now, readyAt: hasBar ? null : now, createdBy: actor.uid, paidBy: actor.uid, sellerStaffId })
    for (const comm of commissionCreations) {
      const commId = `commission:${roundId}:${comm.itemId}`
      tx.create(root.collection('nightclubCommissions').doc(commId), {
        id: commId,
        tenantId: actor.tenantId,
        branchId,
        accountId,
        roundId,
        itemId: comm.itemId,
        productId: comm.productId,
        productName: comm.productName,
        staffId: comm.staffId,
        quantity: comm.quantity,
        saleAmount: comm.saleAmount,
        type: comm.type,
        value: comm.value,
        amount: comm.amount,
        paidAmount: 0,
        status: 'earned',
        earnedAt: now,
        shiftId: account.shiftId,
        createdAt: now,
      })
    }
    tx.create(root.collection('nightclubPayments').doc(paymentId), { id: paymentId, operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, status: 'confirmed', method: payment.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: money(received - cashAmount), createdAt: now, actorUid: actor.uid })
    if (cashAmount > 0) tx.create(root.collection('nightclubCashMovements').doc(`cash_${operationId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, type: 'sale', amount: cashAmount, actorUid: actor.uid, createdAt: now })
    tx.update(accountRef, { subtotal: money((account.subtotal || 0) + total), paidTotal: money((account.paidTotal || 0) + total), balance: 0, roundCount: (account.roundCount || 0) + 1, updatedAt: now })
    return { accountId, roundId, paymentId, total, status: hasBar ? 'pending' : 'ready' }
  }

  if (type === 'refundRound') {
    if (String(payload.reason || '').trim().length < 4) throw new HttpsError('invalid-argument', 'Indica el motivo del reembolso.')
    const roundId = id(payload.roundId), roundRef = root.collection('nightclubRounds').doc(roundId), roundSnap = await tx.get(roundRef)
    if (!roundSnap.exists || roundSnap.data().branchId !== branchId || roundSnap.data().accountId !== accountId) fail('Pedido no encontrado en esta mesa.')
    const round = roundSnap.data()
    if (round.authorization !== 'payment' || ['delivered', 'cancelled'].includes(round.status)) fail('La devolución requiere revisión física o ya fue procesada.')
    const paymentRef = root.collection('nightclubPayments').doc(id(round.paymentId)), payment = await tx.get(paymentRef)
    if (payment.data()?.status !== 'confirmed' || payment.data()?.roundId !== roundId) fail('Pago no disponible para reembolso.')
    const itemsToRevert = await prepareNightclubInventoryReversal(tx, root, branchId, roundId)
    const roundComms = await tx.get(
      root.collection('nightclubCommissions')
        .where('roundId', '==', roundId)
        .where('branchId', '==', branchId)
    )
    applyNightclubInventoryReversal(
      tx,
      root,
      actor,
      branchId,
      account.shiftId,
      accountId,
      roundId,
      operationId,
      now,
      payload.reason.trim(),
      itemsToRevert
    )
    tx.update(paymentRef, { status: 'refunded', refundedAt: now, refundedBy: actor.uid, refundReason: payload.reason.trim() })
    tx.update(roundRef, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.uid, cancellationReason: payload.reason.trim() })
    for (const cDoc of roundComms.docs) {
      const c = cDoc.data()
      if (c.status !== 'paid') {
        tx.update(cDoc.ref, { status: 'void', voidedAt: now, voidReason: payload.reason.trim(), updatedAt: now })
      }
    }
    if (payment.data().cashAmount > 0) tx.create(root.collection('nightclubCashMovements').doc(`refund_${roundId}`), { operationId, tenantId: actor.tenantId, branchId, shiftId: account.shiftId, accountId, roundId, type: 'refund', amount: -payment.data().cashAmount, actorUid: actor.uid, createdAt: now })
    tx.update(accountRef, { subtotal: money((account.subtotal || 0) - round.total), paidTotal: money((account.paidTotal || 0) - round.total), balance: 0, updatedAt: now })
    return { accountId, roundId, status: 'refunded', amount: round.total }
  }

  fail('Comando desconocido.')
}

module.exports = { applyPaidRoundCommand }
