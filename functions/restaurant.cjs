const { HttpsError } = require('firebase-functions/v2/https')
const { createHash } = require('node:crypto')
const { tenantActor, hasPermission, id } = require('./authorization.cjs')

const permissions = {
  openShift: 'cash.close',
  closeShift: 'cash.close',
  openTableOrder: 'orders.manage',
  addOrder: 'sales.create',
  addProduct: 'orders.manage',
  advanceStatus: 'orders.manage',
  advanceItemStatus: 'orders.manage',
  cancelOrder: 'orders.manage',
  cancelOrderItem: 'orders.manage',
  updateTableStatus: 'orders.manage',
  requestBill: 'orders.manage',
  reopenBill: 'orders.manage',
  recordPayment: 'sales.create',
  floorAction: 'settings.manage',
  saveProduct: 'products.manage',
}

const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const amount = value => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new HttpsError('invalid-argument', 'Monto inválido.')
  return money(number)
}
const text = (value, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpsError('invalid-argument', 'Texto inválido.')
  return value.trim()
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

async function executeRestaurantCommand(db, request) {
  const input = request.data || {}
  const type = input.commandType || input.action
  const permission = permissions[type]
  if (!permission) throw new HttpsError('invalid-argument', 'Comando Restaurante no reconocido.')

  const operationId = id(input.operationId)
  const actor = await tenantActor(db, request, permission)
  if (actor.tenant.businessType !== 'restaurant_pos') {
    throw new HttpsError('failed-precondition', 'La empresa no usa la plantilla Restaurante.')
  }

  const branchId = id(input.branchId || 'main')
  const payload = input.payload || {}
  const requestHash = fingerprint({ type, branchId, payload })
  const root = actor.root
  const operationRef = root.collection('restaurantOperations').doc(operationId)
  const now = new Date().toISOString()

  return db.runTransaction(async tx => {
    const [stored, tenant, member] = await Promise.all([
      tx.get(operationRef),
      tx.get(root),
      tx.get(root.collection('members').doc(actor.uid)),
    ])

    if (stored.exists) {
      const previous = stored.data()
      if (previous.actorUid !== actor.uid || previous.requestHash !== requestHash) {
        throw new HttpsError('already-exists', 'operationId ya pertenece a otra solicitud.')
      }
      return previous.result
    }

    if (!hasPermission(tenant.data(), member.data(), permission)) {
      throw new HttpsError('permission-denied', 'Permiso revocado.')
    }
    if (!member.data().branchIds?.includes(branchId)) {
      throw new HttpsError('permission-denied', 'Sucursal no autorizada.')
    }

    const result = await applyRestaurantCommand({ db, tx, root, actor, branchId, operationId, type, payload, now })

    tx.create(operationRef, {
      operationId,
      tenantId: actor.tenantId,
      branchId,
      actorUid: actor.uid,
      type,
      requestHash,
      status: 'confirmed',
      createdAt: now,
      result,
    })

    tx.create(root.collection('restaurantAudit').doc(), {
      operationId,
      tenantId: actor.tenantId,
      branchId,
      actorUid: actor.uid,
      type,
      resourceId: result.orderId || result.tableId || result.shiftId || result.paymentId || result.sectorId || null,
      createdAt: now,
    })

    return result
  })
}

async function applyRestaurantCommand(context) {
  const { db, tx, root, actor, branchId, operationId, type, payload, now } = context
  const stateRef = root.collection('restaurantOperationalState').doc(branchId)

  // 1. Iniciar Turno (Caja)
  if (type === 'openShift') {
    const state = await tx.get(stateRef)
    if (state.data()?.activeShiftId) throw new HttpsError('failed-precondition', 'Ya existe un turno abierto.')
    const shiftId = `shift_${operationId}`
    const openingFloat = amount(payload.openingFloat || 0)
    const ref = root.collection('restaurantShifts').doc(shiftId)
    const shiftData = {
      id: shiftId,
      tenantId: actor.tenantId,
      branchId,
      status: 'open',
      openingFloat,
      openedAt: now,
      openedBy: actor.uid,
    }
    tx.create(ref, shiftData)
    tx.set(stateRef, { activeShiftId: shiftId, updatedAt: now }, { merge: true })
    return { shiftId, openingFloat, openedAt: now, openedBy: actor.uid }
  }

  // 2. Administrar Salón (Sectores y Mesas)
  if (type === 'floorAction') {
    return applyFloorAction({ tx, root, actor, branchId, action: payload.action, now })
  }

  // 3. Crear / Guardar Producto
  if (type === 'saveProduct') {
    const p = payload.product || payload
    if (!p || typeof p.name !== 'string' || !p.name.trim()) throw new HttpsError('invalid-argument', 'Producto inválido.')
    const productId = id(p.id || `prod_${operationId}`)
    const productRef = root.collection('products').doc(productId)
    const productData = {
      id: productId,
      tenantId: actor.tenantId,
      branchId,
      name: text(p.name, 100),
      categoryId: p.categoryId ? id(p.categoryId) : 'cat-general',
      price: amount(p.price),
      preparationArea: p.preparationArea || 'Cocina',
      availability: p.availability || 'available',
      isActive: p.isActive !== false,
      isVisible: p.isVisible !== false,
      sortOrder: Number(p.sortOrder) || 0,
      image: p.image || '',
      updatedAt: now,
      createdAt: p.createdAt || now,
    }
    tx.set(productRef, productData, { merge: true })
    return { productId, product: productData }
  }

  // Comandos operativos que requieren turno activo
  const state = await tx.get(stateRef)
  const activeShiftId = state.data()?.activeShiftId
  if (!activeShiftId && type !== 'closeShift') {
    throw new HttpsError('failed-precondition', 'No hay turno activo. Inicia un turno para continuar.')
  }

  // 4. Cerrar Turno (Caja)
  if (type === 'closeShift') {
    if (!activeShiftId) throw new HttpsError('failed-precondition', 'No hay turno activo.')
    const shiftId = id(payload.shiftId || activeShiftId)
    if (shiftId !== activeShiftId) throw new HttpsError('aborted', 'El turno cambió.')

    // Verificar cuentas pendientes
    const openOrders = await tx.get(
      root.collection('restaurantOrders')
        .where('shiftId', '==', shiftId)
        .where('paymentStatus', '==', 'pending')
    )
    const activePending = openOrders.docs.filter(doc => doc.data().status !== 'cancelled')
    if (activePending.length > 0) {
      throw new HttpsError('failed-precondition', `Existen ${activePending.length} cuentas con saldo pendiente. Cobra o anula los pedidos abiertos antes de cerrar caja.`)
    }

    if (payload.countedCash === '' || payload.countedCash == null) {
      throw new HttpsError('invalid-argument', 'Ingresa el efectivo contado.')
    }
    const countedCash = amount(payload.countedCash)
    const shiftRef = root.collection('restaurantShifts').doc(shiftId)
    const [shiftSnap, movementsSnap, paymentsSnap] = await Promise.all([
      tx.get(shiftRef),
      tx.get(root.collection('restaurantCashMovements').where('shiftId', '==', shiftId)),
      tx.get(root.collection('restaurantPayments').where('shiftId', '==', shiftId)),
    ])
    if (!shiftSnap.exists || shiftSnap.data().status !== 'open') {
      throw new HttpsError('aborted', 'El turno no está abierto.')
    }

    const shiftData = shiftSnap.data()
    const openingFloat = amount(shiftData.openingFloat || 0)

    let cashSales = 0, qrSales = 0, cardSales = 0
    for (const doc of paymentsSnap.docs) {
      const p = doc.data()
      if (p.method === 'cash') cashSales = money(cashSales + amount(p.amount))
      else if (p.method === 'qr') qrSales = money(qrSales + amount(p.amount))
      else if (p.method === 'card') cardSales = money(cardSales + amount(p.amount))
      else if (p.method === 'mixed') {
        cashSales = money(cashSales + amount(p.cashAmount || 0))
        qrSales = money(qrSales + amount(p.qrAmount || 0))
        cardSales = money(cardSales + amount(p.cardAmount || 0))
      }
    }

    let cashIncome = 0, cashOutflow = 0
    for (const doc of movementsSnap.docs) {
      const m = doc.data()
      if (!m.method || m.method === 'cash') {
        if (m.type === 'income') cashIncome = money(cashIncome + amount(m.amount))
        else if (m.type === 'expense' || m.type === 'refund') cashOutflow = money(cashOutflow + amount(m.amount))
      }
    }

    const expectedCash = money(openingFloat + cashSales + cashIncome - cashOutflow)
    const difference = money(countedCash - expectedCash)
    const totalSales = money(cashSales + qrSales + cardSales)

    tx.update(shiftRef, {
      status: 'closed',
      countedCash,
      expectedCash,
      difference,
      reconciliationStatus: difference === 0 ? 'balanced' : difference > 0 ? 'surplus' : 'deficit',
      totalSales,
      cashSales,
      qrSales,
      cardSales,
      cashIncome,
      cashOutflow,
      closedAt: now,
      closedBy: actor.uid,
      reconciliation: {
        countedCash,
        difference,
      },
    })

    tx.set(stateRef, { activeShiftId: null, updatedAt: now }, { merge: true })
    return { shiftId, countedCash, expectedCash, difference, totalSales }
  }

  // 5. Abrir Cuenta en Mesa (Salón)
  if (type === 'openTableOrder') {
    const tableId = id(payload.tableId)
    const tableRef = root.collection('restaurantTables').doc(tableId)
    const tableSnap = await tx.get(tableRef)
    if (!tableSnap.exists) throw new HttpsError('not-found', 'Mesa no encontrada.')
    const tableData = tableSnap.data()
    if (tableData.active === false || tableData.archivedAt) {
      throw new HttpsError('failed-precondition', 'La mesa está desactivada o archivada.')
    }
    if (tableData.activeOrderId || tableData.status === 'occupied' || tableData.status === 'bill_requested') {
      throw new HttpsError('aborted', 'La mesa ya tiene una orden activa.')
    }

    const orderId = `order_${operationId}`
    const diners = Math.max(1, Number(payload.diners) || 2)
    const orderDoc = {
      id: orderId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      displayNumber: payload.displayNumber || `#${orderId.slice(-4).toUpperCase()}`,
      tableId,
      tableInfo: tableData.name,
      status: 'pending',
      accountStatus: 'open',
      paymentStatus: 'pending',
      paymentMethod: null,
      expectedPaymentMethod: null,
      orderSource: 'local',
      fulfillmentType: 'table',
      items: [],
      total: 0,
      productSubtotal: 0,
      payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
      diners,
      customerId: payload.customerId || null,
      customerName: payload.customerName?.trim() || null,
      customerPhone: payload.customerPhone?.trim() || null,
      createdAt: now,
      createdBy: actor.uid,
      openedAt: now,
      openedBy: actor.uid,
    }

    tx.create(root.collection('restaurantOrders').doc(orderId), orderDoc)
    tx.update(tableRef, {
      status: 'occupied',
      activeOrderId: orderId,
      diners,
      openedAt: now,
      openedBy: actor.uid,
      updatedAt: now,
    })

    return { orderId, tableId, order: orderDoc }
  }

  // 6. Crear Orden Directa / POS
  if (type === 'addOrder') {
    const rawOrder = payload.order || payload
    if (!rawOrder || typeof rawOrder !== 'object') throw new HttpsError('invalid-argument', 'Orden requerida.')
    const orderId = id(rawOrder.id || `order_${operationId}`)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const existing = await tx.get(orderRef)
    if (existing.exists) return { orderId, order: existing.data() }

    let tableRef = null
    let tableData = null
    if (rawOrder.tableId) {
      tableRef = root.collection('restaurantTables').doc(id(rawOrder.tableId))
      const tableSnap = await tx.get(tableRef)
      if (tableSnap.exists) tableData = tableSnap.data()
    }

    const items = Array.isArray(rawOrder.items) ? rawOrder.items.map(item => ({
      id: item.id || `line_${operationId}_${Math.random().toString(36).slice(2, 7)}`,
      productId: item.productId || '',
      name: text(item.name || 'Producto', 100),
      basePrice: amount(item.basePrice || item.price || 0),
      quantity: Math.max(1, Number(item.quantity) || 1),
      lineTotal: money(amount(item.basePrice || item.price || 0) * Math.max(1, Number(item.quantity) || 1)),
      modifiers: item.modifiers || { note: '', extras: [], options: [] },
      status: item.status || 'pending',
      createdAt: now,
    })) : []

    const calculatedTotal = money(items.reduce((sum, item) => sum + item.lineTotal, 0))
    const total = money(rawOrder.total != null ? amount(rawOrder.total) : calculatedTotal)

    const orderDoc = {
      ...rawOrder,
      id: orderId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      displayNumber: rawOrder.displayNumber || `#${orderId.slice(-4).toUpperCase()}`,
      status: rawOrder.status || 'pending',
      accountStatus: rawOrder.accountStatus || 'open',
      paymentStatus: rawOrder.paymentStatus || 'pending',
      paymentMethod: rawOrder.paymentMethod || null,
      expectedPaymentMethod: rawOrder.expectedPaymentMethod || null,
      orderSource: rawOrder.orderSource || 'local',
      fulfillmentType: rawOrder.fulfillmentType || (tableData ? 'table' : 'pickup'),
      tableId: tableData ? tableData.id : rawOrder.tableId || null,
      tableInfo: tableData ? tableData.name : rawOrder.tableInfo || null,
      items,
      total,
      productSubtotal: total,
      createdAt: rawOrder.createdAt || now,
      createdBy: rawOrder.createdBy || actor.uid,
    }

    tx.create(orderRef, orderDoc)
    if (tableRef && tableData) {
      tx.update(tableRef, {
        status: 'occupied',
        activeOrderId: orderId,
        openedAt: now,
        openedBy: actor.uid,
        updatedAt: now,
      })
    }

    return { orderId, order: orderDoc }
  }

  // 7. Añadir Productos a Pedido Existente
  if (type === 'addProduct') {
    const orderId = id(payload.orderId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const order = orderSnap.data()
    if (order.paymentStatus === 'paid' || order.status === 'cancelled' || order.accountStatus === 'closed') {
      throw new HttpsError('failed-precondition', 'El pedido no está disponible para agregar productos.')
    }

    const inputItems = Array.isArray(payload.input?.items)
      ? payload.input.items
      : payload.input?.productId
        ? [payload.input]
        : Array.isArray(payload.items)
          ? payload.items
          : []
    if (!inputItems.length) throw new HttpsError('invalid-argument', 'No se especificaron productos.')

    const newLines = []
    for (const item of inputItems) {
      const productId = id(item.productId)
      const quantity = Math.max(1, Number(item.quantity) || 1)
      const productDoc = await tx.get(root.collection('products').doc(productId))
      const pData = productDoc.exists ? productDoc.data() : null
      const unitPrice = pData ? amount(pData.price) : amount(item.price || item.unitPrice || 0)
      const name = pData?.name || item.name || 'Producto'
      const lineTotal = money(unitPrice * quantity)
      newLines.push({
        id: `line_${operationId}_${Math.random().toString(36).slice(2, 7)}`,
        productId,
        name,
        basePrice: unitPrice,
        quantity,
        lineTotal,
        modifiers: { note: item.note?.trim() || '', extras: [], options: [] },
        status: 'pending',
        createdAt: now,
      })
    }

    const addedSubtotal = money(newLines.reduce((sum, line) => sum + line.lineTotal, 0))
    const newTotal = money(order.total + addedSubtotal)
    const newSubtotal = money((order.productSubtotal || order.total) + addedSubtotal)

    tx.update(orderRef, {
      items: [...(order.items || []), ...newLines],
      total: newTotal,
      productSubtotal: newSubtotal,
      status: 'pending',
      updatedAt: now,
    })

    return { orderId, addedItems: newLines, total: newTotal }
  }

  // 8. Avanzar Estado de Cocina / KDS
  if (type === 'advanceStatus') {
    const orderId = id(payload.orderId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const current = orderSnap.data().status
    const transition = { pending: 'preparing', preparing: 'ready', ready: 'delivered' }
    const next = payload.status || transition[current]
    if (!next) throw new HttpsError('aborted', 'El pedido no puede avanzar de estado.')

    const timePatch = {}
    if (next === 'preparing') timePatch.startedAt = now
    if (next === 'ready') timePatch.readyAt = now
    if (next === 'delivered') timePatch.deliveredAt = now

    const updatedItems = (orderSnap.data().items || []).map(item => ({
      ...item,
      status: next === 'delivered' ? 'delivered' : next === 'ready' && item.status !== 'delivered' ? 'ready' : item.status === 'pending' ? 'preparing' : item.status,
    }))

    tx.update(orderRef, {
      status: next,
      items: updatedItems,
      ...timePatch,
      updatedAt: now,
      updatedBy: actor.uid,
    })

    return { orderId, status: next }
  }

  // 9. Avanzar Estado de Línea Individual
  if (type === 'advanceItemStatus') {
    const orderId = id(payload.orderId)
    const itemId = id(payload.itemId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const items = orderSnap.data().items || []
    const targetItem = items.find(it => it.id === itemId)
    if (!targetItem) throw new HttpsError('not-found', 'Línea no encontrada.')

    const transition = { pending: 'preparing', preparing: 'ready', ready: 'delivered' }
    const next = payload.status || transition[targetItem.status || 'pending']
    if (!next) throw new HttpsError('aborted', 'La línea no puede avanzar de estado.')

    const nextItems = items.map(it => it.id === itemId ? { ...it, status: next } : it)
    const allDelivered = nextItems.length > 0 && nextItems.every(it => it.status === 'delivered')
    const allReadyOrDelivered = nextItems.length > 0 && nextItems.every(it => ['ready', 'delivered'].includes(it.status || 'pending'))

    const nextOrderStatus = allDelivered ? 'delivered' : allReadyOrDelivered ? 'ready' : orderSnap.data().status === 'pending' ? 'preparing' : orderSnap.data().status

    tx.update(orderRef, {
      items: nextItems,
      status: nextOrderStatus,
      updatedAt: now,
      updatedBy: actor.uid,
    })

    return { orderId, itemId, itemStatus: next, orderStatus: nextOrderStatus }
  }

  // 10. Anular Pedido Completo
  if (type === 'cancelOrder') {
    const orderId = id(payload.orderId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const order = orderSnap.data()
    if (order.paymentStatus === 'paid') throw new HttpsError('failed-precondition', 'No se puede anular un pedido cobrado.')
    if (order.status === 'cancelled') return { orderId, status: 'cancelled' }

    let tableRef = null
    let tableSnap = null
    if (order.tableId) {
      tableRef = root.collection('restaurantTables').doc(order.tableId)
      tableSnap = await tx.get(tableRef)
    }

    tx.update(orderRef, {
      status: 'cancelled',
      accountStatus: 'closed',
      cancelledAt: now,
      cancelledBy: actor.uid,
      cancelledReason: payload.reason ? text(payload.reason, 200) : 'Anulado por operador',
      updatedAt: now,
    })

    if (tableRef && tableSnap?.exists && tableSnap.data().activeOrderId === orderId) {
      tx.update(tableRef, {
        status: 'available',
        activeOrderId: null,
        openedAt: null,
        openedBy: null,
        diners: null,
        updatedAt: now,
      })
    }

    return { orderId, status: 'cancelled' }
  }

  // 11. Anular Ítem de Pedido
  if (type === 'cancelOrderItem') {
    const orderId = id(payload.orderId)
    const itemId = id(payload.itemId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const order = orderSnap.data()
    if (order.paymentStatus === 'paid' || order.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'No se puede anular ítems de un pedido cerrado o cancelado.')
    }

    const items = order.items || []
    const target = items.find(it => it.id === itemId)
    if (!target) throw new HttpsError('not-found', 'Ítem no encontrado.')

    const remainingItems = items.filter(it => it.id !== itemId)
    const newTotal = money(remainingItems.reduce((sum, it) => sum + (it.lineTotal || 0), 0))

    tx.update(orderRef, {
      items: remainingItems,
      total: newTotal,
      productSubtotal: newTotal,
      updatedAt: now,
    })

    return { orderId, itemId, total: newTotal }
  }

  // 12. Actualizar Estado de Mesa
  if (type === 'updateTableStatus') {
    const tableId = id(payload.tableId)
    const nextStatus = text(payload.status, 30)
    if (!['available', 'occupied', 'bill_requested', 'reserved'].includes(nextStatus)) {
      throw new HttpsError('invalid-argument', 'Estado de mesa inválido.')
    }
    const tableRef = root.collection('restaurantTables').doc(tableId)
    const tableSnap = await tx.get(tableRef)
    if (!tableSnap.exists) throw new HttpsError('not-found', 'Mesa no encontrada.')

    tx.update(tableRef, { status: nextStatus, updatedAt: now })
    return { tableId, status: nextStatus }
  }

  // 13. Pedir Cuenta / Reabrir Cuenta
  if (type === 'requestBill' || type === 'reopenBill') {
    const isRequest = type === 'requestBill'
    const tableId = payload.tableId ? id(payload.tableId) : null
    let orderId = payload.orderId ? id(payload.orderId) : null

    let tableRef = null
    let tableSnap = null
    if (tableId) {
      tableRef = root.collection('restaurantTables').doc(tableId)
      tableSnap = await tx.get(tableRef)
      if (tableSnap.exists && !orderId && tableSnap.data().activeOrderId) {
        orderId = tableSnap.data().activeOrderId
      }
    }

    let orderRef = null
    let orderSnap = null
    if (orderId) {
      orderRef = root.collection('restaurantOrders').doc(orderId)
      orderSnap = await tx.get(orderRef)
    }

    if (tableRef && tableSnap?.exists) {
      tx.update(tableRef, { status: isRequest ? 'bill_requested' : 'occupied', updatedAt: now })
    }

    if (orderRef && orderSnap?.exists) {
      tx.update(orderRef, { accountStatus: isRequest ? 'bill_requested' : 'open', updatedAt: now })
    }

    return { tableId, orderId, status: isRequest ? 'bill_requested' : 'occupied' }
  }

  // 14. Cobro / Pago de Pedido
  if (type === 'recordPayment') {
    const orderId = id(payload.orderId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const order = orderSnap.data()
    if (order.paymentStatus === 'paid' || order.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'La cuenta no está disponible para cobrar.')
    }

    let tableRef = null
    let tableSnap = null
    if (order.tableId) {
      tableRef = root.collection('restaurantTables').doc(order.tableId)
      tableSnap = await tx.get(tableRef)
    }

    const total = money(order.total)
    const method = text(payload.method, 20)
    if (!['cash', 'qr', 'card', 'mixed'].includes(method)) {
      throw new HttpsError('invalid-argument', 'Método de pago no reconocido.')
    }

    const cashAmount = amount(method === 'cash' ? total : method === 'mixed' ? payload.cashAmount || 0 : 0)
    const qrAmount = amount(method === 'qr' ? total : method === 'mixed' ? payload.qrAmount || 0 : 0)
    const cardAmount = amount(method === 'card' ? total : method === 'mixed' ? payload.cardAmount || 0 : 0)

    if (money(cashAmount + qrAmount + cardAmount) !== total) {
      throw new HttpsError('invalid-argument', 'El desglose del pago no coincide con el total.')
    }

    const received = amount(payload.received ?? (method === 'cash' ? total : cashAmount))
    if (received < cashAmount) {
      throw new HttpsError('invalid-argument', 'Efectivo recibido insuficiente.')
    }
    const change = money(received - cashAmount)

    const paymentId = `payment_${operationId}`
    const paymentRecord = {
      id: paymentId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: order.shiftId || activeShiftId,
      orderId,
      method,
      amount: total,
      cashAmount,
      qrAmount,
      cardAmount,
      received,
      change,
      createdAt: now,
      actorUid: actor.uid,
    }
    tx.create(root.collection('restaurantPayments').doc(paymentId), paymentRecord)

    if (cashAmount > 0) {
      const movementId = `cash_${operationId}`
      tx.create(root.collection('restaurantCashMovements').doc(movementId), {
        id: movementId,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: order.shiftId || activeShiftId,
        orderId,
        type: 'sale',
        method: 'cash',
        amount: cashAmount,
        actorUid: actor.uid,
        createdAt: now,
      })
    }

    const paymentEntry = {
      id: paymentId,
      method: method === 'mixed' ? 'cash' : method,
      amount: total,
      received,
      change,
      createdAt: now,
      createdBy: actor.uid,
    }

    tx.update(orderRef, {
      paymentStatus: 'paid',
      paymentMethod: method,
      payment: { method, cashAmount, qrAmount, cardAmount, cashReceived: received, change },
      payments: [paymentEntry],
      paidAt: now,
      paidBy: actor.uid,
      closedAt: now,
      accountStatus: 'closed',
      updatedAt: now,
    })

    if (tableRef && tableSnap?.exists && tableSnap.data().activeOrderId === orderId) {
      tx.update(tableRef, {
        status: 'available',
        activeOrderId: null,
        openedAt: null,
        openedBy: null,
        diners: null,
        updatedAt: now,
      })
    }

    return { orderId, paymentId, total, change }
  }

  throw new HttpsError('invalid-argument', 'Comando Restaurante no implementado.')
}

async function applyFloorAction({ tx, root, actor, branchId, action, now }) {
  if (!action || typeof action.type !== 'string') throw new HttpsError('invalid-argument', 'Acción de plano inválida.')

  const clean = val => (val || '').trim().replace(/\s+/g, ' ')
  const key = val => clean(val).toLowerCase()

  const [sectorsSnap, tablesSnap] = await Promise.all([
    tx.get(root.collection('restaurantSectors')),
    tx.get(root.collection('restaurantTables')),
  ])

  const sectors = sectorsSnap.docs.map(doc => doc.data())
  const tables = tablesSnap.docs.map(doc => doc.data())

  if (action.type === 'sector.create') {
    const sectorId = id(action.id)
    if (sectors.some(s => s.id === sectorId)) throw new HttpsError('already-exists', 'Sector ya existe.')
    const name = clean(action.name)
    if (!name) throw new HttpsError('invalid-argument', 'El nombre del sector es requerido.')
    if (sectors.some(s => s.active !== false && key(s.name) === key(name))) {
      throw new HttpsError('already-exists', 'Ya existe un sector con ese nombre.')
    }
    const maxSort = sectors.reduce((max, s) => Math.max(max, s.sortOrder || 0), -1)
    const newSector = {
      id: sectorId,
      tenantId: actor.tenantId,
      branchId,
      name,
      description: clean(action.description || ''),
      sortOrder: maxSort + 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    tx.create(root.collection('restaurantSectors').doc(sectorId), newSector)
    return { ok: true, sectorId }
  }

  if (action.type === 'sector.update') {
    const sectorId = id(action.id)
    const current = sectors.find(s => s.id === sectorId && s.active !== false)
    if (!current) throw new HttpsError('not-found', 'Sector no encontrado.')
    const name = clean(action.name)
    if (!name) throw new HttpsError('invalid-argument', 'El nombre del sector es requerido.')
    if (sectors.some(s => s.id !== sectorId && s.active !== false && key(s.name) === key(name))) {
      throw new HttpsError('already-exists', 'Ya existe un sector con ese nombre.')
    }
    tx.update(root.collection('restaurantSectors').doc(sectorId), {
      name,
      description: clean(action.description || ''),
      updatedAt: now,
    })
    return { ok: true, sectorId }
  }

  if (action.type === 'sector.archive') {
    const sectorId = id(action.id)
    const current = sectors.find(s => s.id === sectorId && s.active !== false)
    if (!current) throw new HttpsError('not-found', 'Sector no encontrado.')
    const activeMembers = tables.filter(t => t.sectorId === sectorId && !t.archivedAt && t.active !== false)
    if (activeMembers.length > 0 && !action.transferToId) {
      throw new HttpsError('failed-precondition', `El sector contiene ${activeMembers.length} mesas activas. Transfiérelas a otro sector primero.`)
    }
    if (action.transferToId) {
      const destId = id(action.transferToId)
      if (destId === sectorId) throw new HttpsError('invalid-argument', 'Selecciona otro sector para transferir.')
      for (const t of activeMembers) {
        tx.update(root.collection('restaurantTables').doc(t.id), { sectorId: destId, updatedAt: now })
      }
    }
    tx.update(root.collection('restaurantSectors').doc(sectorId), { active: false, updatedAt: now })
    return { ok: true, sectorId }
  }

  if (action.type === 'table.create') {
    const tableId = id(action.id)
    if (tables.some(t => t.id === tableId && !t.archivedAt)) throw new HttpsError('already-exists', 'Mesa ya existe.')
    const name = clean(action.name)
    if (!name) throw new HttpsError('invalid-argument', 'El nombre de la mesa es requerido.')
    if (tables.some(t => !t.archivedAt && t.active !== false && key(t.name) === key(name))) {
      throw new HttpsError('already-exists', 'Ya existe una mesa con ese nombre.')
    }
    const sectorId = id(action.sectorId)
    const sector = sectors.find(s => s.id === sectorId && s.active !== false)
    if (!sector) throw new HttpsError('not-found', 'Sector no encontrado.')

    const capacity = Math.max(1, Math.min(100, Number(action.capacity) || 4))
    const maxSort = tables.filter(t => t.sectorId === sectorId).reduce((max, t) => Math.max(max, t.sortOrder || 0), -1)

    const newTable = {
      id: tableId,
      tenantId: actor.tenantId,
      branchId,
      name,
      capacity,
      sectorId,
      shape: action.shape || 'square',
      active: action.active !== false,
      status: 'available',
      sortOrder: maxSort + 1,
      createdAt: now,
      updatedAt: now,
    }
    tx.create(root.collection('restaurantTables').doc(tableId), newTable)
    return { ok: true, tableId }
  }

  if (action.type === 'table.update') {
    const tableId = id(action.id)
    const current = tables.find(t => t.id === tableId && !t.archivedAt)
    if (!current) throw new HttpsError('not-found', 'Mesa no encontrada.')
    const name = clean(action.name)
    if (!name) throw new HttpsError('invalid-argument', 'El nombre de la mesa es requerido.')
    if (tables.some(t => t.id !== tableId && !t.archivedAt && t.active !== false && key(t.name) === key(name))) {
      throw new HttpsError('already-exists', 'Ya existe una mesa con ese nombre.')
    }
    const sectorId = id(action.sectorId)
    const capacity = Math.max(1, Math.min(100, Number(action.capacity) || 4))

    if (action.active === false && (current.status === 'occupied' || current.status === 'bill_requested' || current.activeOrderId)) {
      throw new HttpsError('failed-precondition', 'No puedes desactivar una mesa con pedidos activos.')
    }

    tx.update(root.collection('restaurantTables').doc(tableId), {
      name,
      capacity,
      sectorId,
      shape: action.shape || current.shape || 'square',
      active: action.active !== false,
      updatedAt: now,
    })
    return { ok: true, tableId }
  }

  if (action.type === 'table.archive') {
    const tableId = id(action.id)
    const current = tables.find(t => t.id === tableId && !t.archivedAt)
    if (!current) throw new HttpsError('not-found', 'Mesa no encontrada.')
    if (current.status === 'occupied' || current.status === 'bill_requested' || current.activeOrderId) {
      throw new HttpsError('failed-precondition', 'No puedes archivar una mesa con pedidos activos.')
    }
    tx.update(root.collection('restaurantTables').doc(tableId), {
      active: false,
      archivedAt: now,
      updatedAt: now,
    })
    return { ok: true, tableId }
  }

  if (action.type === 'sector.reorder' || action.type === 'table.reorder') {
    const isSector = action.type === 'sector.reorder'
    const targetId = id(action.id)
    const direction = action.direction === -1 ? -1 : 1
    const list = isSector
      ? sectors.filter(s => s.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      : tables.filter(t => !t.archivedAt && t.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

    const idx = list.findIndex(item => item.id === targetId)
    if (idx < 0) throw new HttpsError('not-found', 'Elemento no encontrado para reordenar.')
    const swapIdx = idx + direction
    if (swapIdx >= 0 && swapIdx < list.length) {
      const a = list[idx]
      const b = list[swapIdx]
      const colName = isSector ? 'restaurantSectors' : 'restaurantTables'
      tx.update(root.collection(colName).doc(a.id), { sortOrder: b.sortOrder ?? swapIdx, updatedAt: now })
      tx.update(root.collection(colName).doc(b.id), { sortOrder: a.sortOrder ?? idx, updatedAt: now })
    }
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', 'Acción de plano no reconocida.')
}

module.exports = { executeRestaurantCommand }
