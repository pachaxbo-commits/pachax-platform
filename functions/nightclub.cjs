const { HttpsError } = require('firebase-functions/v2/https')
const { createHash } = require('node:crypto')
const { tenantActor, hasPermission, id } = require('./authorization.cjs')
const { applyPaidRoundCommand } = require('./nightclubPaidRounds.cjs')

const permissions = {
  openShift: 'cash.close',
  closeShift: 'cash.close',
  openAccount: 'orders.manage',
  addRound: 'orders.manage',
  settleRound: 'sales.create',
  advanceRound: 'orders.manage',
  deliverRound: 'orders.manage',
  requestBill: 'orders.manage',
  reopenBill: 'orders.manage',
  recordPayment: 'sales.create',
  finishOccupancy: 'orders.manage',
  refundRound: 'settings.manage',
  cancelRound: 'orders.manage',
  inventoryMovement: 'inventory.manage',
  saveZone: 'orders.manage',
  deleteZone: 'orders.manage',
  saveTable: 'orders.manage',
  deleteTable: 'orders.manage',
  saveProduct: 'products.manage',
  saveInventory: 'inventory.manage',
  saveCustomer: 'customers.read',
}

const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const cents = value => Math.round(value * 100)
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

async function executeNightclubCommand(db, request) {
  const input = request.data || {}, type = input.commandType || input.action, permission = permissions[type]
  if (!permission) throw new HttpsError('invalid-argument', 'Comando Nightclub no reconocido.')
  const operationId = id(input.operationId), actor = await tenantActor(db, request, permission)
  if (actor.tenant.businessType !== 'nightclub_lounge') throw new HttpsError('failed-precondition', 'La empresa no usa la plantilla Nightclub.')
  const branchId = id(input.branchId), payload = input.payload || {}, requestHash = fingerprint({ type, branchId, payload })
  const root = actor.root, operationRef = root.collection('nightclubOperations').doc(operationId), now = new Date().toISOString()
  return db.runTransaction(async tx => {
    const [stored, tenant, member] = await Promise.all([tx.get(operationRef), tx.get(root), tx.get(root.collection('members').doc(actor.uid))])
    if (stored.exists) {
      const previous = stored.data()
      if (previous.actorUid !== actor.uid || previous.requestHash !== requestHash) throw new HttpsError('already-exists', 'operationId ya pertenece a otra solicitud.')
      return previous.result
    }
    if (!hasPermission(tenant.data(), member.data(), permission)) throw new HttpsError('permission-denied', 'Permiso revocado.')
    if (!member.data().branchIds?.includes(branchId)) throw new HttpsError('permission-denied', 'Sucursal no autorizada.')

    // Validaciones estrictas por rol según especificación
    if (type === 'advanceRound' && !['owner', 'admin', 'bar'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Barra puede preparar pedidos.')
    }
    if (type === 'deliverRound' && !['owner', 'admin', 'waiter', 'service'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Servicio puede entregar pedidos.')
    }
    if (type === 'finishOccupancy' && !['owner', 'admin', 'waiter', 'service'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Servicio puede cerrar mesas.')
    }
    if (type === 'refundRound' && !['owner', 'admin'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración puede reembolsar.')
    }
    if (type === 'recordPayment' && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden registrar pagos.')
    }
    if (type === 'reopenBill' && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden reabrir la cuenta.')
    }
    if (['saveZone', 'deleteZone', 'saveTable', 'deleteTable'].includes(type) && !['owner', 'admin'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración puede configurar zonas y mesas.')
    }
    if (['saveProduct', 'saveInventory', 'inventoryMovement'].includes(type) && !['owner', 'admin', 'inventory'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Inventario o Administración pueden gestionar productos e insumos.')
    }
    if (['openShift', 'closeShift'].includes(type) && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden gestionar turnos.')
    }

    const result = await applyCommand({ db, tx, root, actor, branchId, operationId, type, payload, now })
    tx.create(operationRef, { operationId, tenantId: actor.tenantId, branchId, actorUid: actor.uid, type, requestHash, status: 'confirmed', createdAt: now, result })
    tx.create(root.collection('nightclubAudit').doc(), { operationId, tenantId: actor.tenantId, branchId, actorUid: actor.uid, type, resourceId: result.accountId || result.roundId || result.shiftId || result.movementId || result.zoneId || result.tableId || result.productId || result.customerId || null, createdAt: now })
    return result
  })
}

async function applyCommand(context) {
  const { tx, root, actor, branchId, operationId, type, payload, now } = context
  const stateRef = root.collection('nightclubOperationalState').doc(branchId)

  // 1. Apertura de Turno
  if (type === 'openShift') {
    const state = await tx.get(stateRef)
    if (state.data()?.activeShiftId) throw new HttpsError('failed-precondition', 'Ya existe un turno abierto.')
    const shiftId = `shift_${operationId}`, openingFloat = amount(payload.openingFloat), ref = root.collection('nightclubShifts').doc(shiftId)
    tx.create(ref, { id: shiftId, tenantId: actor.tenantId, branchId, status: 'open', openingFloat, openedAt: now, openedBy: actor.uid })
    tx.set(stateRef, { activeShiftId: shiftId, updatedAt: now }, { merge: true })
    return { shiftId }
  }

  // 2. Operaciones que no requieren turno activo (CRUD de configuración básica)
  if (type === 'saveZone') {
    const zone = payload.zone || payload
    const zoneId = id(zone.id || `zone_${operationId}`)
    const zoneRef = root.collection('nightclubZones').doc(zoneId)
    const data = {
      id: zoneId,
      tenantId: actor.tenantId,
      branchId,
      name: text(zone.name, 100),
      sortOrder: Number(zone.sortOrder) || 0,
      updatedAt: now,
    }
    tx.set(zoneRef, data, { merge: true })
    return { zoneId, zone: data }
  }

  if (type === 'deleteZone') {
    const zoneId = id(payload.id)
    const tables = await tx.get(root.collection('nightclubTables').where('zoneId', '==', zoneId))
    if (!tables.empty) throw new HttpsError('failed-precondition', 'No se puede eliminar una zona con mesas asignadas.')
    tx.delete(root.collection('nightclubZones').doc(zoneId))
    return { zoneId }
  }

  if (type === 'saveTable') {
    const table = payload.table || payload
    const tableId = id(table.id || `table_${operationId}`)
    const tableRef = root.collection('nightclubTables').doc(tableId)
    const existing = await tx.get(tableRef)
    const data = {
      id: tableId,
      tenantId: actor.tenantId,
      branchId,
      name: text(table.name, 100),
      zoneId: id(table.zoneId || 'general'),
      capacity: Number(table.capacity) || 4,
      status: existing.exists ? existing.data().status : (table.status || 'available'),
      activeAccountId: existing.exists ? (existing.data().activeAccountId || null) : null,
      updatedAt: now,
    }
    tx.set(tableRef, data, { merge: true })
    return { tableId, table: data }
  }

  if (type === 'deleteTable') {
    const tableId = id(payload.id)
    const tableRef = root.collection('nightclubTables').doc(tableId)
    const table = await tx.get(tableRef)
    if (table.exists && table.data().activeAccountId) {
      throw new HttpsError('failed-precondition', 'No se puede eliminar una mesa ocupada.')
    }
    tx.delete(tableRef)
    return { tableId }
  }

  if (type === 'saveProduct') {
    const p = payload.product || payload
    const productId = id(p.id || `prod_${operationId}`)
    const productRef = root.collection('nightclubProducts').doc(productId)
    const data = {
      id: productId,
      tenantId: actor.tenantId,
      branchId,
      name: text(p.name, 100),
      category: text(p.category || 'General', 50),
      price: amount(p.price),
      preparationArea: p.preparationArea === 'Directo' ? 'Directo' : 'Barra',
      stockUnits: Number(p.stockUnits) || 0,
      inventoryMode: ['unit', 'recipe', 'none'].includes(p.inventoryMode) ? p.inventoryMode : 'recipe',
      active: p.active !== false,
      ...(p.inventoryId ? { inventoryId: id(p.inventoryId) } : {}),
      ...(Array.isArray(p.recipe) ? { recipe: p.recipe } : {}),
      ...(p.bottlePresentation ? { bottlePresentation: p.bottlePresentation } : {}),
      ...(p.commission ? { commission: p.commission } : {}),
      updatedAt: now,
    }
    tx.set(productRef, data, { merge: true })
    return { productId, product: data }
  }

  if (type === 'saveInventory') {
    const item = payload.item || payload
    const inventoryId = id(item.id || `inv_${operationId}`)
    const invRef = root.collection('nightclubInventory').doc(inventoryId)
    const existing = await tx.get(invRef)
    const current = item.current !== undefined ? amount(item.current) : (existing.exists ? existing.data().current : 0)
    const data = {
      id: inventoryId,
      tenantId: actor.tenantId,
      branchId,
      name: text(item.name, 100),
      unit: ['unit', 'ml', 'g', 'l', 'kg'].includes(item.unit) ? item.unit : 'unit',
      displayUnit: item.displayUnit || item.unit || 'unit',
      current,
      minimum: Number(item.minimum) || 0,
      unitCost: Number(item.unitCost) || 0,
      category: item.category || 'Insumos',
      bottleCapacityMl: Number(item.bottleCapacityMl) || 0,
      openBottleMl: Number(item.openBottleMl) || 0,
      linkedProductIds: Array.isArray(item.linkedProductIds) ? item.linkedProductIds : [],
      updatedAt: now,
    }
    tx.set(invRef, data, { merge: true })
    return { inventoryId, item: data }
  }

  if (type === 'saveCustomer') {
    const c = payload.customer || payload
    const customerId = id(c.id || `cust_${operationId}`)
    const custRef = root.collection('nightclubCustomers').doc(customerId)
    const existing = await tx.get(custRef)
    const data = {
      id: customerId,
      tenantId: actor.tenantId,
      branchId,
      name: text(c.name, 100),
      phone: typeof c.phone === 'string' ? c.phone.trim() : '',
      birthday: typeof c.birthday === 'string' ? c.birthday.trim() : '',
      notes: typeof c.notes === 'string' ? c.notes.trim() : '',
      active: c.active !== false,
      visits: existing.exists ? (existing.data().visits || 0) : (Number(c.visits) || 0),
      totalSpent: existing.exists ? (existing.data().totalSpent || 0) : (Number(c.totalSpent) || 0),
      updatedAt: now,
    }
    tx.set(custRef, data, { merge: true })
    return { customerId, customer: data }
  }

  // 3. Operaciones que requieren turno activo
  const state = await tx.get(stateRef), activeShiftId = state.data()?.activeShiftId
  if (!activeShiftId) throw new HttpsError('failed-precondition', 'No hay turno activo.')

  // Rondas cobradas de barra inmediata y reembolsos
  if (['settleRound', 'refundRound'].includes(type)) {
    return applyPaidRoundCommand({ ...context, activeShiftId })
  }

  // Apertura de Cuenta (Mesa o Barra)
  if (type === 'openAccount') {
    const target = payload.target
    if (!target || !['table', 'customer', 'bar'].includes(target.type)) throw new HttpsError('invalid-argument', 'Destino inválido.')
    let tableRef, storedTarget = target
    if (target.type === 'table') {
      tableRef = root.collection('nightclubTables').doc(id(target.tableId))
      const table = await tx.get(tableRef)
      if (!table.exists || table.data().branchId !== branchId || table.data().activeAccountId || table.data().status !== 'available') {
        throw new HttpsError('aborted', 'La mesa ya no está disponible.')
      }
    } else {
      if ('tableId' in target || (target.displayName !== undefined && (typeof target.displayName !== 'string' || target.displayName.trim().length > 100))) {
        throw new HttpsError('invalid-argument', 'Un pedido en barra no puede incluir una mesa ni un nombre inválido.')
      }
      storedTarget = { type: 'bar', ...(target.displayName?.trim() ? { displayName: target.displayName.trim() } : {}), ...(target.customerId ? { customerId: id(target.customerId) } : {}) }
    }
    const accountId = `account_${operationId}`, ref = root.collection('nightclubAccounts').doc(accountId)
    const value = { id: accountId, tenantId: actor.tenantId, branchId, shiftId: activeShiftId, serviceTarget: storedTarget, orderType: storedTarget.type === 'table' ? 'TABLE' : 'BAR', status: 'open', subtotal: 0, paidTotal: 0, balance: 0, roundCount: 0, openedAt: now, openedBy: actor.uid }
    tx.create(ref, value)
    if (tableRef) tx.update(tableRef, { activeAccountId: accountId, status: 'occupied', updatedAt: now })
    return { accountId }
  }

  // Flujo Canónico: Agregar Ronda sin exigir pago inmediato
  if (type === 'addRound') {
    const accountId = id(payload.accountId), accountRef = root.collection('nightclubAccounts').doc(accountId)
    const accountSnap = await tx.get(accountRef)
    if (!accountSnap.exists || accountSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cuenta no encontrada.')
    const account = accountSnap.data()
    if (account.status !== 'open') throw new HttpsError('aborted', 'La cuenta ya no acepta rondas.')
    const drafts = payload.items
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 50 || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) {
      throw new HttpsError('invalid-argument', 'Pedido inválido.')
    }
    const productIds = [...new Set(drafts.map(item => id(item.productId)))]
    const productSnaps = await Promise.all(productIds.map(productId => tx.get(root.collection('nightclubProducts').doc(productId))))
    const products = new Map(productSnaps.map((snap, index) => [productIds[index], snap.data()]))
    const requirements = new Map()
    let total = 0
    const lines = drafts.map((draft, index) => {
      const product = products.get(draft.productId)
      if (!product || product.branchId !== branchId || product.active === false || !Number.isFinite(product.price) || product.price < 0) {
        throw new HttpsError('invalid-argument', 'Producto inválido o sin precio configurado.')
      }
      const recipe = product.inventoryMode === 'none' ? [] : (product.recipe?.length ? product.recipe : (product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : (product.bottlePresentation?.inventoryId ? [{ inventoryId: product.bottlePresentation.inventoryId, quantity: 1 }] : [])))
      for (const part of recipe) {
        if (!Number.isFinite(part.quantity) || part.quantity <= 0) throw new HttpsError('invalid-argument', 'Receta inválida.')
        const inventoryId = id(part.inventoryId)
        requirements.set(inventoryId, (requirements.get(inventoryId) || 0) + part.quantity * draft.quantity)
      }
      const lineTotal = money(product.price * draft.quantity)
      total += lineTotal
      return {
        id: `${operationId}_${index}`,
        productId: draft.productId,
        name: product.name,
        quantity: draft.quantity,
        unitPrice: product.price,
        lineTotal,
        preparationArea: product.preparationArea || 'Barra',
      }
    })
    total = money(total)
    const inventoryIds = [...requirements.keys()]
    const inventoryRefs = inventoryIds.map(inventoryId => root.collection('nightclubInventory').doc(inventoryId))
    const stocks = await Promise.all(inventoryRefs.map(ref => tx.get(ref)))
    stocks.forEach((snap, index) => {
      if (!snap.exists || snap.data().branchId !== branchId || !Number.isFinite(snap.data().current) || snap.data().current < requirements.get(inventoryIds[index])) {
        throw new HttpsError('aborted', `Stock insuficiente o insumo no configurado: ${snap.data()?.name || inventoryIds[index]}.`)
      }
    })
    const roundId = `round_${operationId}`
    const hasBar = lines.some(item => item.preparationArea !== 'Directo')
    const status = hasBar ? 'pending' : 'ready'
    const consumption = []
    stocks.forEach((snap, index) => {
      const inventoryId = inventoryIds[index]
      const quantity = requirements.get(inventoryId)
      const previous = snap.data().current
      const current = money(previous - quantity)
      tx.update(inventoryRefs[index], { current, updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${inventoryId}`), {
        id: `${operationId}_${inventoryId}`,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        accountId,
        roundId,
        inventoryId,
        quantity: -quantity,
        previous,
        current,
        type: 'sale',
        actorUid: actor.uid,
        createdAt: now,
      })
      consumption.push({ inventoryId, quantity })
    })
    tx.create(root.collection('nightclubRounds').doc(roundId), {
      id: roundId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      accountId,
      tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null,
      sequence: (account.roundCount || 0) + 1,
      items: lines,
      consumption,
      total,
      status,
      authorization: 'account_charge',
      createdAt: now,
      sentAt: now,
      readyAt: hasBar ? null : now,
      createdBy: actor.uid,
      customerId: payload.customerId || null,
      serviceStaffId: payload.serviceStaffId || null,
    })
    tx.update(accountRef, {
      subtotal: money((account.subtotal || 0) + total),
      balance: money((account.balance || 0) + total),
      roundCount: (account.roundCount || 0) + 1,
      updatedAt: now,
    })
    return { accountId, roundId, total, status }
  }

  // Barra: Pendiente -> Preparando -> Listo
  if (type === 'advanceRound') {
    const accountId = id(payload.accountId), roundId = id(payload.roundId)
    const ref = root.collection('nightclubRounds').doc(roundId)
    const round = await tx.get(ref)
    if (!round.exists || round.data().branchId !== branchId || round.data().accountId !== accountId) {
      throw new HttpsError('aborted', 'Ronda no encontrada en esta cuenta.')
    }
    const r = round.data()
    if (!['payment', 'account_charge', 'courtesy'].includes(r.authorization) || !['pending', 'preparing'].includes(r.status)) {
      throw new HttpsError('failed-precondition', 'Solo se preparan pedidos autorizados pendientes o en preparación.')
    }
    const next = r.status === 'pending' ? 'preparing' : 'ready'
    tx.update(ref, {
      status: next,
      [next === 'preparing' ? 'startedAt' : 'readyAt']: now,
      [next === 'preparing' ? 'startedBy' : 'readyBy']: actor.uid,
      updatedAt: now,
    })
    return { accountId, roundId, status: next }
  }

  // Servicio: Listo -> Entregado
  if (type === 'deliverRound') {
    const accountId = id(payload.accountId), roundId = id(payload.roundId)
    const ref = root.collection('nightclubRounds').doc(roundId)
    const round = await tx.get(ref)
    if (!round.exists || round.data().branchId !== branchId || round.data().accountId !== accountId) {
      throw new HttpsError('aborted', 'Ronda no encontrada en esta cuenta.')
    }
    const r = round.data()
    if (!['payment', 'account_charge', 'courtesy'].includes(r.authorization) || r.status !== 'ready') {
      throw new HttpsError('failed-precondition', 'El pedido todavía no está listo para entrega.')
    }
    tx.update(ref, {
      status: 'delivered',
      deliveredAt: now,
      deliveredBy: actor.uid,
      updatedAt: now,
    })
    return { accountId, roundId, status: 'delivered' }
  }

  // Solicitar o Reabrir Cuenta
  if (type === 'requestBill' || type === 'reopenBill') {
    const accountId = id(payload.accountId), ref = root.collection('nightclubAccounts').doc(accountId)
    const snap = await tx.get(ref)
    const expected = type === 'requestBill' ? 'open' : 'bill_requested'
    if (!snap.exists || snap.data().branchId !== branchId || snap.data().status !== expected) {
      throw new HttpsError('aborted', 'La cuenta cambió de estado.')
    }
    const status = type === 'requestBill' ? 'bill_requested' : 'open'
    tx.update(ref, { status, updatedAt: now })
    const target = snap.data().serviceTarget
    if (target?.type === 'table') {
      tx.update(root.collection('nightclubTables').doc(id(target.tableId)), { status: status === 'open' ? 'occupied' : 'bill_requested', updatedAt: now })
    }
    return { accountId, status }
  }

  // Registro de Pagos (Parciales o Totales) en Caja
  if (type === 'recordPayment') {
    const accountId = id(payload.accountId)
    const ref = root.collection('nightclubAccounts').doc(accountId)
    const snap = await tx.get(ref)
    if (!snap.exists || snap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cuenta no encontrada.')
    if (snap.data().status !== 'bill_requested') throw new HttpsError('aborted', 'La cuenta no está por cobrar.')
    const balance = amount(snap.data().balance)
    if (balance <= 0) throw new HttpsError('failed-precondition', 'La cuenta no tiene saldo pendiente.')
    const paid = amount(payload.amount)
    const method = text(payload.method, 20)
    if (paid <= 0 || paid > balance || !['cash', 'qr', 'card', 'mixed'].includes(method)) {
      throw new HttpsError('invalid-argument', 'Pago inválido.')
    }
    const cashAmount = amount(method === 'cash' ? paid : method === 'mixed' ? payload.cashAmount || 0 : 0)
    const qrAmount = amount(method === 'qr' ? paid : method === 'mixed' ? payload.qrAmount || 0 : 0)
    const cardAmount = amount(method === 'card' ? paid : method === 'mixed' ? payload.cardAmount || 0 : 0)
    if (money(cashAmount + qrAmount + cardAmount) !== paid) {
      throw new HttpsError('invalid-argument', 'El desglose del pago no coincide.')
    }
    const received = amount(payload.received ?? cashAmount)
    if (received < cashAmount) throw new HttpsError('invalid-argument', 'Efectivo recibido insuficiente.')
    const remaining = money(balance - paid)
    const paymentId = `payment_${operationId}`
    tx.create(root.collection('nightclubPayments').doc(paymentId), {
      id: paymentId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      accountId,
      status: 'confirmed',
      method,
      amount: paid,
      cashAmount,
      qrAmount,
      cardAmount,
      received,
      change: money(received - cashAmount),
      createdAt: now,
      actorUid: actor.uid,
    })
    if (cashAmount > 0) {
      const movementId = `cash_${operationId}`
      tx.create(root.collection('nightclubCashMovements').doc(movementId), {
        id: movementId,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        accountId,
        type: 'sale',
        amount: cashAmount,
        actorUid: actor.uid,
        createdAt: now,
      })
    }
    tx.update(ref, {
      paidTotal: money((snap.data().paidTotal || 0) + paid),
      balance: remaining,
      updatedAt: now,
    })
    return { accountId, paymentId, amount: paid, balance: remaining }
  }

  // Finalizar Ocupación: saldo 0 + rondas entregadas/anuladas -> liberar mesa
  if (type === 'finishOccupancy') {
    const accountId = id(payload.accountId)
    const accountRef = root.collection('nightclubAccounts').doc(accountId)
    const account = await tx.get(accountRef)
    if (!account.exists || account.data().branchId !== branchId) {
      throw new HttpsError('aborted', 'Cuenta no encontrada.')
    }
    const acc = account.data()
    if (!['open', 'bill_requested'].includes(acc.status) || cents(acc.balance || 0) !== 0) {
      throw new HttpsError('failed-precondition', 'La mesa tiene saldo o ya está cerrada.')
    }
    const rounds = await tx.get(root.collection('nightclubRounds').where('accountId', '==', accountId))
    if (rounds.docs.some(snap => !['delivered', 'cancelled'].includes(snap.data().status))) {
      throw new HttpsError('failed-precondition', 'Hay pedidos pendientes de entrega.')
    }
    const target = acc.serviceTarget
    if (target?.type === 'table') {
      const tableRef = root.collection('nightclubTables').doc(id(target.tableId))
      const table = await tx.get(tableRef)
      if (table.data()?.activeAccountId !== accountId) {
        throw new HttpsError('failed-precondition', 'La mesa no coincide con la ocupación.')
      }
      tx.update(tableRef, { status: 'available', activeAccountId: null, updatedAt: now })
    }
    tx.update(accountRef, { status: 'closed', closedAt: now, closedBy: actor.uid, updatedAt: now })
    return { accountId, status: 'closed' }
  }

  // Anulación de Ronda No Cobrada
  if (type === 'cancelRound') {
    const roundId = id(payload.roundId)
    const ref = root.collection('nightclubRounds').doc(roundId)
    const round = await tx.get(ref)
    if (!round.exists || round.data().branchId !== branchId) throw new HttpsError('not-found', 'Ronda no encontrada.')
    if (round.data().status === 'cancelled') return { roundId, status: 'cancelled' }
    text(payload.reason, 200)
    const accountRef = root.collection('nightclubAccounts').doc(round.data().accountId)
    const account = await tx.get(accountRef)
    if ((account.data()?.paidTotal || 0) > 0 && account.data()?.balance < round.data().total) {
      throw new HttpsError('failed-precondition', 'No se anula directamente una ronda ya cobrada. Usa reembolso.')
    }
    const refs = (round.data().consumption || []).map(row => root.collection('nightclubInventory').doc(row.inventoryId))
    const stocks = await Promise.all(refs.map(r => tx.get(r)))
    refs.forEach((stockRef, index) => {
      const consumed = round.data().consumption[index]
      const before = stocks[index].data().current
      const current = money(before + consumed.quantity)
      tx.update(stockRef, { current, updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${stockRef.id}`), {
        operationId,
        inventoryId: stockRef.id,
        quantity: consumed.quantity,
        previous: before,
        current,
        type: 'reversal',
        reason: payload.reason,
        actorUid: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
        branchId,
      })
    })
    const total = money(round.data().total || round.data().items.reduce((sum, row) => sum + row.lineTotal, 0))
    tx.update(ref, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: actor.uid,
      cancellationReason: payload.reason,
      updatedAt: now,
    })
    tx.update(accountRef, {
      subtotal: money(Math.max(0, (account.data().subtotal || 0) - total)),
      balance: money(Math.max(0, (account.data().balance || 0) - total)),
      updatedAt: now,
    })
    return { roundId, status: 'cancelled' }
  }

  // Movimiento Manual de Inventario
  if (type === 'inventoryMovement') {
    const inventoryId = id(payload.inventoryId), ref = root.collection('nightclubInventory').doc(inventoryId)
    const snap = await tx.get(ref), quantity = Number(payload.quantity)
    if (!snap.exists || snap.data().branchId !== branchId || !Number.isFinite(quantity) || quantity === 0 || snap.data().current + quantity < 0) {
      throw new HttpsError('invalid-argument', 'Movimiento inválido.')
    }
    const current = money(snap.data().current + quantity), movementId = `movement_${operationId}`
    tx.update(ref, { current, updatedAt: now })
    tx.create(root.collection('nightclubInventoryMovements').doc(movementId), {
      id: movementId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      inventoryId,
      quantity,
      previous: snap.data().current,
      current,
      type: text(payload.movementType, 30),
      reason: text(payload.reason, 200),
      actorUid: actor.uid,
      createdAt: now,
    })
    return { movementId, current }
  }

  // Cierre de Turno Ciego
  if (type === 'closeShift') {
    const shiftId = id(payload.shiftId)
    if (shiftId !== activeShiftId) throw new HttpsError('aborted', 'El turno cambió.')
    const open = await tx.get(root.collection('nightclubAccounts').where('shiftId', '==', shiftId).where('status', 'in', ['open', 'bill_requested']))
    if (!open.empty) throw new HttpsError('failed-precondition', 'Existen cuentas con saldo.')
    if (payload.countedCash === '' || payload.countedCash == null) throw new HttpsError('invalid-argument', 'Ingresa el efectivo contado.')
    const countedCash = amount(payload.countedCash)
    const shiftRef = root.collection('nightclubShifts').doc(shiftId)
    const [shift, movements, payments] = await Promise.all([
      tx.get(shiftRef),
      tx.get(root.collection('nightclubCashMovements').where('shiftId', '==', shiftId)),
      tx.get(root.collection('nightclubPayments').where('shiftId', '==', shiftId)),
    ])
    if (!shift.exists || shift.data().status !== 'open' || shift.data().branchId !== branchId) throw new HttpsError('aborted', 'El turno cambió.')
    const expectedCents = Math.round((amount(shift.data().openingFloat) + Number.EPSILON) * 100) + movements.docs.reduce((tot, doc) => {
      const movement = doc.data()
      if (movement.method && movement.method !== 'cash') return tot
      const value = Number(movement.amount)
      if (!Number.isFinite(value)) throw new HttpsError('failed-precondition', 'Existe un movimiento de caja inválido.')
      const c = Math.round((Math.abs(value) + Number.EPSILON) * 100)
      return tot + (movement.type === 'expense' ? -c : movement.type === 'refund' ? -c : movement.type === 'sale' || movement.type === 'income' ? c : 0)
    }, 0)
    const differenceCents = Math.round((countedCash + Number.EPSILON) * 100) - expectedCents
    if (differenceCents < 0) throw new HttpsError('failed-precondition', `La caja tiene un faltante de Bs ${(Math.abs(differenceCents) / 100).toFixed(2)}. Corrige el arqueo antes de cerrar.`)
    const cashSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().cashAmount || 0), 0))
    const qrSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().qrAmount || 0), 0))
    const cardSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().cardAmount || 0), 0))
    const incomeTotal = money(movements.docs.filter(doc => doc.data().type === 'income').reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const expenseTotal = money(movements.docs.filter(doc => doc.data().type === 'expense').reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const cashIncome = money(movements.docs.filter(doc => (doc.data().type === 'income' || doc.data().type === 'sale') && (!doc.data().method || doc.data().method === 'cash')).reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const cashOutflow = money(movements.docs.filter(doc => doc.data().type === 'expense' && (!doc.data().method || doc.data().method === 'cash')).reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const totalSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const difference = differenceCents / 100
    tx.update(shiftRef, { status: 'closed', countedCash, expectedCash: expectedCents / 100, difference, reconciliationStatus: differenceCents === 0 ? 'balanced' : 'surplus', totalSales, cashSales, qrSales, cardSales, incomeTotal, expenseTotal, cashIncome, cashOutflow, closedAt: now, closedBy: actor.uid })
    tx.set(stateRef, { activeShiftId: null, updatedAt: now }, { merge: true })
    return { shiftId, countedCash, expectedCash: expectedCents / 100, difference, openingFloat: shift.data().openingFloat }
  }

  throw new HttpsError('failed-precondition', 'Comando no implementado o sin política habilitada.')
}

module.exports = { executeNightclubCommand }
