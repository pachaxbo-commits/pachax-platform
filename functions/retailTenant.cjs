const { HttpsError } = require('firebase-functions/v2/https')
const { createHash } = require('node:crypto')
const { authenticated, id, hasPermission } = require('./authorization.cjs')
const { adjustProductUsage } = require('./commercialCapabilities.cjs')

const MONEY_LIMIT = 9_000_000_000
const validMinor = value => Number.isSafeInteger(value) && value >= 0 && value <= MONEY_LIMIT
const roundMinor = value => Math.round(value + Number.EPSILON)
const text = (value, label, max = 120, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpsError('invalid-argument', `${label} no válido.`)
  return value.trim()
}
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

async function retailActor(db, request, permissions, branchId) {
  const uid = authenticated(request), tenantId = id(request.data?.tenantId)
  const root = db.doc(`tenants/${tenantId}`)
  const [tenantSnap, memberSnap, platformSnap] = await Promise.all([
    root.get(), root.collection('members').doc(uid).get(), db.doc(`platformOperators/${uid}`).get(),
  ])
  const tenant = tenantSnap.data(), member = memberSnap.data()
  if (platformSnap.data()?.active === true) throw new HttpsError('permission-denied', 'Utiliza una sesión de soporte auditada.')
  if (!tenant || tenant.businessType !== 'gelateria_weight_cafe' || !member || !permissions.some(permission => hasPermission(tenant, member, permission))) {
    throw new HttpsError('permission-denied', 'No tienes permiso para operar Comercio en esta empresa.')
  }
  if (member.status !== 'active' || member.tenantId !== tenantId || !member.branchIds?.includes(branchId)) {
    throw new HttpsError('permission-denied', 'Membresía o sucursal no autorizada.')
  }
  return { uid, tenantId, root, tenant, member, branchId }
}

function requireCurrentPermission(tenant, member, permission, branchId) {
  if (!hasPermission(tenant, member, permission) || !member.branchIds?.includes(branchId)) {
    throw new HttpsError('permission-denied', 'El permiso o la sucursal ya no están autorizados.')
  }
}

function normalizeProduct(raw, tenantId, branchId, actorUid, now, productId) {
  const soldBy = raw.soldBy
  if (!['unit', 'weight'].includes(soldBy)) throw new HttpsError('invalid-argument', 'Selecciona venta por unidad o por peso.')
  if (!validMinor(raw.priceMinor) || raw.priceMinor <= 0) throw new HttpsError('invalid-argument', 'Precio inválido.')
  const sku = text(raw.sku, 'SKU', 48, true)
  const category = text(raw.category, 'Categoría', 60)
  return {
    id: productId, tenantId, branchId, name: text(raw.name, 'Nombre de producto', 100),
    category, sku, soldBy, priceMinor: raw.priceMinor, stockBase: 0,
    stockUnit: soldBy === 'weight' ? 'g' : 'unit', minStock: 0,
    active: true, createdAt: now, updatedAt: now, createdBy: actorUid,
  }
}

async function load(db, request) {
  const branchId = id(request.data?.branchId || 'main')
  const actor = await retailActor(db, request, ['sales.read', 'inventory.read', 'reports.read', 'cash.close'], branchId)
  const { root, tenantId } = actor
  const [productsSnap, archivedProductsSnap, stateSnap, salesSnap] = await Promise.all([
    root.collection('retailProducts').where('branchId', '==', branchId).where('active', '==', true).limit(201).get(),
    root.collection('retailProducts').where('branchId', '==', branchId).where('active', '==', false).limit(201).get(),
    root.collection('retailOperationalState').doc(branchId).get(),
    hasPermission(actor.tenant, actor.member, 'reports.read')
      ? root.collection('retailSales').where('branchId', '==', branchId).orderBy('createdAt', 'desc').limit(50).get()
      : Promise.resolve(null),
  ])
  if (productsSnap.size > 200) throw new HttpsError('resource-exhausted', 'El catálogo supera el límite de carga. Filtra o archiva productos antes de operar.')
  const shiftId = stateSnap.data()?.activeShiftId || null
  let shift = null
  if (shiftId && hasPermission(actor.tenant, actor.member, 'cash.close')) {
    const snap = await root.collection('retailShifts').doc(id(shiftId)).get()
    if (snap.exists && snap.data().status === 'open' && snap.data().tenantId === tenantId && snap.data().branchId === branchId) shift = { id: snap.id, ...snap.data() }
  } else if (shiftId) shift = { id: shiftId, status: 'open' }
  return {
    products: productsSnap.docs.map(doc => doc.data()).filter(product => product.active !== false),
    archivedProducts: archivedProductsSnap.docs.slice(0, 200).map(doc => doc.data()),
    archivedProductsComplete: archivedProductsSnap.size <= 200,
    activeShift: shift,
    recentSales: salesSnap ? salesSnap.docs.map(doc => doc.data()) : [],
    historyLimit: 50,
    historyComplete: false,
  }
}

async function mutate(db, request) {
  const commandType = text(request.data?.commandType, 'Operación', 40)
  const operationId = id(request.data?.operationId)
  const branchId = id(request.data?.branchId || 'main')
  const payload = request.data?.payload || {}
  const requirements = {
    saveProduct: ['products.manage'],
    archiveProduct: ['products.manage'],
    restoreProduct: ['products.manage'],
    adjustStock: ['inventory.manage'],
    openShift: ['cash.close'],
    recordSale: ['sales.create'],
    recordCashMovement: ['cash.close'],
    closeShift: ['cash.close'],
  }
  const permission = requirements[commandType]
  if (!permission) throw new HttpsError('invalid-argument', 'Operación de Comercio no reconocida.')
  const actor = await retailActor(db, request, permission, branchId)
  const { root, uid, tenantId } = actor
  const opRef = root.collection('retailOperations').doc(operationId)
  const hash = fingerprint({ commandType, branchId, payload })
  const now = new Date().toISOString()

  return db.runTransaction(async tx => {
    const [opSnap, tenantSnap, memberSnap] = await Promise.all([
      tx.get(opRef), tx.get(root), tx.get(root.collection('members').doc(uid)),
    ])
    const tenant = tenantSnap.data(), member = memberSnap.data()
    requireCurrentPermission(tenant, member, permission[0], branchId)
    if (opSnap.exists) {
      const prior = opSnap.data()
      if (prior.actorUid !== uid || prior.requestHash !== hash) throw new HttpsError('already-exists', 'La operación ya fue usada con otros datos.')
      return prior.result
    }

    const stateRef = root.collection('retailOperationalState').doc(branchId)
    const result = await applyMutation({ tx, root, tenant, tenantId, uid, branchId, operationId, commandType, payload, now, stateRef, permission: permission[0] })
    tx.create(opRef, { operationId, tenantId, branchId, actorUid: uid, commandType, requestHash: hash, result, createdAt: now })
    tx.create(root.collection('auditLogs').doc(), {
      tenantId, branchId, actorUid: uid, actorType: 'tenant', action: `retail.${commandType}`,
      resource: 'retail', resourceId: result.productId || result.saleId || result.shiftId || result.movementId || operationId,
      after: { status: result.status || 'confirmed', ...(result.archived ? { archived: true } : {}), ...(result.reason ? { reason: result.reason } : {}) }, createdAt: now,
    })
    return result
  })
}

async function applyMutation({ tx, root, tenant, tenantId, uid, branchId, operationId, commandType, payload, now, stateRef }) {
  const stateSnap = await tx.get(stateRef)
  const state = stateSnap.data() || {}
  const activeShiftId = state.activeShiftId || null
  const shiftRef = activeShiftId ? root.collection('retailShifts').doc(id(activeShiftId)) : null

  if (commandType === 'saveProduct') {
    const productId = payload.productId ? id(payload.productId) : `retail_${operationId}`
    const ref = root.collection('retailProducts').doc(productId)
    const existing = await tx.get(ref)
    if (existing.exists && (existing.data().tenantId !== tenantId || existing.data().branchId !== branchId)) throw new HttpsError('permission-denied', 'Producto no autorizado en esta sucursal.')
    const product = normalizeProduct(payload, tenantId, branchId, uid, now, productId)
    if (existing.exists) {
      product.stockBase = existing.data().stockBase
      product.createdAt = existing.data().createdAt
      product.createdBy = existing.data().createdBy
    }
    const wasActive = existing.exists && existing.data().active !== false
    await adjustProductUsage(tx, root, tenant, Number(product.active !== false) - Number(wasActive))
    tx.set(ref, product)
    return { productId, status: 'saved' }
  }

  if (commandType === 'archiveProduct') {
    const productId = id(payload.productId)
    const reason = text(payload.reason, 'Motivo de archivo', 160)
    const ref = root.collection('retailProducts').doc(productId)
    const productSnap = await tx.get(ref)
    if (!productSnap.exists || productSnap.data().tenantId !== tenantId || productSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Producto no encontrado en esta sucursal.')
    }
    const product = productSnap.data()
    if (product.active === false) return { productId, status: 'already_archived', archived: false, reason }
    await adjustProductUsage(tx, root, tenant, -1)
    tx.update(ref, { active: false, archivedAt: now, archivedBy: uid, archiveReason: reason, updatedAt: now })
    return { productId, status: 'archived', archived: true, reason }
  }

  if (commandType === 'restoreProduct') {
    const productId = id(payload.productId)
    const ref = root.collection('retailProducts').doc(productId)
    const productSnap = await tx.get(ref)
    if (!productSnap.exists || productSnap.data().tenantId !== tenantId || productSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Producto no encontrado en esta sucursal.')
    }
    if (productSnap.data().active !== false) return { productId, status: 'already_active', restored: false }
    await adjustProductUsage(tx, root, tenant, 1)
    tx.update(ref, { active: true, archivedAt: null, archivedBy: null, archiveReason: null, updatedAt: now })
    return { productId, status: 'restored', restored: true }
  }

  if (commandType === 'adjustStock') {
    const productId = id(payload.productId), delta = payload.delta
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) throw new HttpsError('invalid-argument', 'El ajuste debe ser un entero distinto de cero; gramos o unidades según el producto.')
    const ref = root.collection('retailProducts').doc(productId), productSnap = await tx.get(ref)
    if (!productSnap.exists || productSnap.data().tenantId !== tenantId || productSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Producto no encontrado en esta sucursal.')
    const product = productSnap.data(), next = product.stockBase + delta
    if (!Number.isSafeInteger(product.stockBase) || next < 0) throw new HttpsError('failed-precondition', 'El ajuste dejaría existencias negativas o inconsistentes.')
    tx.update(ref, { stockBase: next, updatedAt: now })
    const movementId = `inv_${operationId}`
    tx.create(root.collection('retailInventoryMovements').doc(movementId), { id: movementId, tenantId, branchId, productId, productName: product.name, unit: product.stockUnit, delta, before: product.stockBase, after: next, reason: text(payload.reason, 'Motivo', 160), actorUid: uid, createdAt: now })
    return { productId, movementId, stockBase: next, status: 'adjusted' }
  }

  if (commandType === 'openShift') {
    if (activeShiftId) throw new HttpsError('failed-precondition', 'Ya hay un turno abierto para esta caja.')
    if (!validMinor(payload.openingFloatMinor)) throw new HttpsError('invalid-argument', 'Fondo inicial inválido.')
    const shiftId = `retail_shift_${operationId}`
    const shift = { id: shiftId, tenantId, branchId, status: 'open', openingFloatMinor: payload.openingFloatMinor, cashSalesMinor: 0, cashInMinor: 0, cashOutMinor: 0, salesCount: 0, openedBy: uid, openedAt: now }
    tx.create(root.collection('retailShifts').doc(shiftId), shift)
    tx.set(stateRef, { activeShiftId: shiftId, updatedAt: now }, { merge: true })
    return { shiftId, status: 'open' }
  }

  if (commandType === 'recordSale') {
    if (!activeShiftId || !shiftRef) throw new HttpsError('failed-precondition', 'Abre una caja antes de vender.')
    const shiftSnap = await tx.get(shiftRef)
    if (!shiftSnap.exists || shiftSnap.data().status !== 'open') throw new HttpsError('failed-precondition', 'La caja no está abierta.')
    const rawItems = Array.isArray(payload.items) ? payload.items : []
    if (!rawItems.length || rawItems.length > 40) throw new HttpsError('invalid-argument', 'La venta debe tener entre 1 y 40 productos.')
    const uniqueIds = [...new Set(rawItems.map(item => id(item?.productId)))]
    const snaps = await Promise.all(uniqueIds.map(productId => tx.get(root.collection('retailProducts').doc(productId))))
    const products = new Map(snaps.filter(snap => snap.exists).map(snap => [snap.id, snap.data()]))
    const quantities = new Map(), lines = []
    let totalMinor = 0
    for (const item of rawItems) {
      const productId = id(item.productId), product = products.get(productId)
      if (!product || product.tenantId !== tenantId || product.branchId !== branchId || product.active === false) throw new HttpsError('failed-precondition', 'Un producto ya no está disponible en esta sucursal.')
      const quantity = item.quantity
      const validQuantity = product.soldBy === 'weight' ? Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1_000_000 : Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10_000
      if (!validQuantity) throw new HttpsError('invalid-argument', product.soldBy === 'weight' ? 'El peso debe indicarse en gramos enteros.' : 'La cantidad debe ser un número entero positivo.')
      const base = product.soldBy === 'weight' ? quantity : quantity
      quantities.set(productId, (quantities.get(productId) || 0) + base)
      const lineTotalMinor = product.soldBy === 'weight' ? roundMinor(product.priceMinor * quantity / 1000) : product.priceMinor * quantity
      if (!validMinor(lineTotalMinor)) throw new HttpsError('invalid-argument', 'Importe de línea inválido.')
      totalMinor += lineTotalMinor
      lines.push({ productId, name: product.name, soldBy: product.soldBy, quantity, unit: product.stockUnit, priceMinor: product.priceMinor, lineTotalMinor })
    }
    if (!validMinor(totalMinor) || totalMinor <= 0) throw new HttpsError('invalid-argument', 'Total de venta inválido.')
    for (const [productId, quantity] of quantities) {
      const product = products.get(productId), nextStock = product.stockBase - quantity
      if (!Number.isSafeInteger(product.stockBase) || nextStock < 0) throw new HttpsError('failed-precondition', `Existencias insuficientes para ${product.name}.`)
      tx.update(root.collection('retailProducts').doc(productId), { stockBase: nextStock, updatedAt: now })
      const movementId = `sale_${operationId}_${productId}`
      tx.create(root.collection('retailInventoryMovements').doc(movementId), { id: movementId, tenantId, branchId, productId, productName: product.name, unit: product.stockUnit, delta: -quantity, before: product.stockBase, after: nextStock, reason: 'Venta', saleId: `retail_sale_${operationId}`, actorUid: uid, createdAt: now })
    }
    const method = payload.method
    if (!['cash', 'qr', 'mixed'].includes(method)) throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    const cashMinor = method === 'cash' ? totalMinor : method === 'mixed' ? payload.cashMinor : 0
    const qrMinor = method === 'qr' ? totalMinor : method === 'mixed' ? payload.qrMinor : 0
    if (!validMinor(cashMinor) || !validMinor(qrMinor) || cashMinor + qrMinor !== totalMinor) throw new HttpsError('invalid-argument', 'El desglose del pago no coincide con la venta.')
    const cashReceivedMinor = payload.cashReceivedMinor ?? cashMinor
    if (!validMinor(cashReceivedMinor) || cashReceivedMinor < cashMinor) throw new HttpsError('invalid-argument', 'El efectivo recibido no cubre la parte pagada en efectivo.')
    const changeMinor = cashReceivedMinor - cashMinor
    const saleId = `retail_sale_${operationId}`
    const sale = { id: saleId, tenantId, branchId, shiftId: activeShiftId, lines, totalMinor, method, cashMinor, qrMinor, cashReceivedMinor, changeMinor, createdBy: uid, createdAt: now }
    tx.create(root.collection('retailSales').doc(saleId), sale)
    const shift = shiftSnap.data()
    tx.update(shiftRef, { cashSalesMinor: shift.cashSalesMinor + cashMinor, salesCount: shift.salesCount + 1, updatedAt: now })
    return { saleId, totalMinor, changeMinor, status: 'paid' }
  }

  if (commandType === 'recordCashMovement') {
    if (!activeShiftId || !shiftRef) throw new HttpsError('failed-precondition', 'Abre una caja antes de registrar movimientos.')
    const shiftSnap = await tx.get(shiftRef)
    if (!shiftSnap.exists || shiftSnap.data().status !== 'open') throw new HttpsError('failed-precondition', 'La caja no está abierta.')
    if (!['income', 'expense'].includes(payload.type) || !validMinor(payload.amountMinor) || payload.amountMinor <= 0) throw new HttpsError('invalid-argument', 'Movimiento o importe inválido.')
    const shift = shiftSnap.data(), movementId = `cash_${operationId}`
    const nextOut = shift.cashOutMinor + (payload.type === 'expense' ? payload.amountMinor : 0)
    const expected = shift.openingFloatMinor + shift.cashSalesMinor + shift.cashInMinor + (payload.type === 'income' ? payload.amountMinor : 0) - nextOut
    if (expected < 0) throw new HttpsError('failed-precondition', 'El egreso supera el efectivo disponible.')
    tx.create(root.collection('retailCashMovements').doc(movementId), { id: movementId, tenantId, branchId, shiftId: activeShiftId, type: payload.type, amountMinor: payload.amountMinor, reason: text(payload.reason, 'Motivo', 160), actorUid: uid, createdAt: now })
    tx.update(shiftRef, { cashInMinor: shift.cashInMinor + (payload.type === 'income' ? payload.amountMinor : 0), cashOutMinor: nextOut, updatedAt: now })
    return { movementId, expectedCashMinor: expected, status: 'recorded' }
  }

  if (commandType === 'closeShift') {
    if (!activeShiftId || !shiftRef) throw new HttpsError('failed-precondition', 'No hay una caja abierta.')
    if (!validMinor(payload.countedCashMinor)) throw new HttpsError('invalid-argument', 'El efectivo contado no es válido.')
    const shiftSnap = await tx.get(shiftRef)
    if (!shiftSnap.exists || shiftSnap.data().status !== 'open') throw new HttpsError('failed-precondition', 'El turno ya está cerrado.')
    const shift = shiftSnap.data(), expectedCashMinor = shift.openingFloatMinor + shift.cashSalesMinor + shift.cashInMinor - shift.cashOutMinor
    if (expectedCashMinor < 0) throw new HttpsError('failed-precondition', 'El historial de caja tiene un efectivo esperado negativo; requiere revisión.')
    const differenceMinor = payload.countedCashMinor - expectedCashMinor
    tx.update(shiftRef, { status: 'closed', countedCashMinor: payload.countedCashMinor, expectedCashMinor, differenceMinor, closedBy: uid, closedAt: now, updatedAt: now })
    tx.set(stateRef, { activeShiftId: null, lastClosedShiftId: activeShiftId, updatedAt: now }, { merge: true })
    return { shiftId: activeShiftId, expectedCashMinor, differenceMinor, status: 'closed' }
  }
  throw new HttpsError('invalid-argument', 'Operación de Comercio no reconocida.')
}

async function executeRetailCommand(db, request) {
  if (request.data?.action !== 'retailCommand') throw new HttpsError('invalid-argument', 'Acción de Comercio no reconocida.')
  if (request.data.commandType === 'load') return load(db, request)
  return mutate(db, request)
}

module.exports = { executeRetailCommand, load, mutate, applyMutation }
