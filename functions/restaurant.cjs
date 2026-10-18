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
  saveProducts: 'products.manage',
  saveCustomer: 'sales.create',
  archiveCustomer: 'customers.manage',
  assignCustomer: 'sales.create',
  recordInventoryMovement: 'inventory.manage',
  countInventoryItem: 'inventory.manage',
  recordCashMovement: 'cash.close',
  cancelCashMovement: 'cash.close',
  updateCashMovement: 'cash.close',
  archiveProduct: 'products.manage',
  deleteProduct: 'products.manage',
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

const RESTAURANT_BUSINESS_TYPES = new Set([
  'restaurant_pos',
  'hamburger_shop',
])

async function validateRecipe(tx, root, actor, productId, rawRecipe, localProductsList = []) {
  if (!Array.isArray(rawRecipe) || rawRecipe.length === 0) return []
  const seen = new Set()
  const validated = []
  for (const part of rawRecipe) {
    if (!part || typeof part !== 'object') throw new HttpsError('invalid-argument', 'Línea de receta inválida.')
    const ingredientId = id(part.ingredientId)
    if (ingredientId === productId) {
      throw new HttpsError('invalid-argument', 'Un producto no puede ser insumo de su propia receta.')
    }
    if (seen.has(ingredientId)) {
      throw new HttpsError('invalid-argument', 'Ingrediente duplicado en la receta.')
    }
    seen.add(ingredientId)

    const qtyBase = Number(part.quantityBase)
    if (!Number.isFinite(qtyBase) || qtyBase <= 0) {
      throw new HttpsError('invalid-argument', 'La cantidad base del insumo debe ser mayor a cero.')
    }

    const localIng = localProductsList.find(p => p.id === ingredientId)
    if (!localIng) {
      const ingSnap = await tx.get(root.collection('products').doc(ingredientId))
      if (!ingSnap.exists) {
        throw new HttpsError('not-found', `El insumo ${ingredientId} no existe en este tenant.`)
      }
      const ingData = ingSnap.data()
      if (ingData.tenantId !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'No se permiten insumos de otro tenant.')
      }
    }

    validated.push({
      ingredientId,
      quantityBase: Math.round((qtyBase + Number.EPSILON) * 1000) / 1000,
      ...(part.displayUnit ? { displayUnit: text(part.displayUnit, 20) } : {}),
    })
  }
  return validated
}

async function resolveProductsAndIngredients(tx, root, items) {
  const directIds = [...new Set(items.map(it => it.productId).filter(Boolean).map(id))]
  const directSnaps = await Promise.all(directIds.map(pId => tx.get(root.collection('products').doc(pId))))
  const prodMap = new Map()
  for (const snap of directSnaps) {
    if (snap.exists) prodMap.set(snap.id, snap.data())
  }

  const ingredientIds = new Set()
  for (const [_, prod] of prodMap) {
    if (Array.isArray(prod.recipe) && prod.recipe.length > 0) {
      for (const part of prod.recipe) {
        if (part.ingredientId && !prodMap.has(part.ingredientId)) {
          ingredientIds.add(part.ingredientId)
        }
      }
    }
  }

  if (ingredientIds.size > 0) {
    const ingSnaps = await Promise.all([...ingredientIds].map(pId => tx.get(root.collection('products').doc(pId))))
    for (const snap of ingSnaps) {
      if (snap.exists) prodMap.set(snap.id, snap.data())
    }
  }

  return prodMap
}

function computeItemInventoryRequirements(items, prodMap) {
  const requirements = []
  const totalPerProduct = new Map()

  for (const item of items) {
    if (!item.productId) continue
    const prod = prodMap.get(item.productId)
    if (!prod) continue
    const itemQty = Math.max(1, Number(item.quantity) || 1)

    if (Array.isArray(prod.recipe) && prod.recipe.length > 0) {
      // A) Producto con receta: descuenta ingredientes únicamente
      for (const part of prod.recipe) {
        const ingredientId = part.ingredientId
        const ingProd = prodMap.get(ingredientId)
        if (!ingProd) {
          throw new HttpsError('failed-precondition', `Insumo ${ingredientId} no encontrado para ${prod.name}.`)
        }
        const consumed = Math.round((Number(part.quantityBase) * itemQty + Number.EPSILON) * 1000) / 1000
        requirements.push({
          itemId: item.id,
          targetProductId: ingredientId,
          quantityBase: consumed,
          soldQuantity: itemQty,
          isRecipe: true,
          parentName: prod.name,
        })
        totalPerProduct.set(ingredientId, Math.round(((totalPerProduct.get(ingredientId) || 0) + consumed + Number.EPSILON) * 1000) / 1000)
      }
    } else if (prod.stockBase !== undefined && prod.stockBase !== null) {
      // B) Producto sin receta: descuenta producto final si gestiona stockBase
      requirements.push({
        itemId: item.id,
        targetProductId: prod.id,
        quantityBase: itemQty,
        soldQuantity: itemQty,
        isRecipe: false,
        parentName: prod.name,
      })
      totalPerProduct.set(prod.id, Math.round(((totalPerProduct.get(prod.id) || 0) + itemQty + Number.EPSILON) * 1000) / 1000)
    }
  }

  return { requirements, totalPerProduct }
}

function checkSufficientStock(totalPerProduct, prodMap, allowNegativeStock) {
  if (allowNegativeStock) return
  for (const [targetId, needed] of totalPerProduct) {
    const prod = prodMap.get(targetId)
    const available = Number(prod?.stockBase) || 0
    if (available < needed) {
      const name = prod?.name || targetId
      const unit = prod?.baseUnit || 'unidades'
      throw new HttpsError('failed-precondition', `Stock insuficiente para ${name}: disponible ${available} ${unit}, requerido ${needed} ${unit}.`)
    }
  }
}

function applyInventoryDeduction({ tx, root, actor, branchId, activeShiftId, orderId, operationId, now, requirements, prodMap }) {
  for (const req of requirements) {
    const target = prodMap.get(req.targetProductId)
    const prevStock = Number(target.stockBase) || 0
    const nextStock = Math.round((prevStock - req.quantityBase + Number.EPSILON) * 1000) / 1000
    target.stockBase = nextStock

    tx.update(root.collection('products').doc(req.targetProductId), {
      stockBase: nextStock,
      updatedAt: now,
    })

    const movId = `mov_sale_${operationId}_${req.itemId}_${req.targetProductId}`
    tx.create(root.collection('restaurantInventoryMovements').doc(movId), {
      id: movId,
      operationId: `sale:${orderId}:${req.itemId}:${req.targetProductId}`,
      tenantId: actor.tenantId,
      branchId,
      productId: req.targetProductId,
      productName: target.name,
      quantityBase: -req.quantityBase,
      soldQuantity: req.soldQuantity,
      previousStock: prevStock,
      newStock: nextStock,
      type: 'sale',
      reason: req.isRecipe ? `Consumo por receta: ${req.parentName}` : 'Venta de producto',
      orderId,
      orderItemId: req.itemId,
      shiftId: activeShiftId,
      createdAt: now,
      createdBy: actor.uid,
    })
  }
}

async function executeRestaurantCommand(db, request) {
  const input = request.data || {}
  const type = input.commandType || input.action
  const permission = permissions[type]
  if (!permission) throw new HttpsError('invalid-argument', 'Comando Restaurante no reconocido.')

  const operationId = id(input.operationId)
  const actor = await tenantActor(db, request, permission)
  if (!RESTAURANT_BUSINESS_TYPES.has(actor.tenant.businessType)) {
    throw new HttpsError('failed-precondition', 'La empresa no usa una plantilla compatible con Restaurante.')
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
      resourceId: result.orderId || result.tableId || result.shiftId || result.paymentId || result.sectorId || result.customerId || result.movementId || result.productId || null,
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
    const validatedRecipe = await validateRecipe(tx, root, actor, productId, p.recipe)
    const productData = {
      id: productId,
      tenantId: actor.tenantId,
      branchId,
      name: text(p.name, 100),
      categoryId: p.categoryId ? id(p.categoryId) : 'cat-general',
      price: amount(p.price),
      preparationArea: p.preparationArea || 'Cocina',
      restaurantType: p.restaurantType || 'prepared',
      availability: p.availability || 'available',
      isActive: p.isActive !== false,
      isVisible: p.isVisible !== false,
      sortOrder: Number(p.sortOrder) || 0,
      image: p.image || '',
      baseUnit: p.baseUnit || 'unit',
      ...(p.stockBase !== undefined ? { stockBase: Number(p.stockBase) || 0 } : {}),
      ...(Array.isArray(p.recipe) ? { recipe: validatedRecipe } : {}),
      updatedAt: now,
      createdAt: p.createdAt || now,
    }
    tx.set(productRef, productData, { merge: true })
    return { productId, product: productData }
  }

  // 3b. Guardar Catálogo Completo de Productos
  if (type === 'saveProducts') {
    const list = Array.isArray(payload.products) ? payload.products : []
    if (!list.length) throw new HttpsError('invalid-argument', 'Lista de productos requerida.')
    for (const p of list) {
      if (!p || typeof p.name !== 'string' || !p.name.trim()) continue
      const productId = id(p.id)
      const productRef = root.collection('products').doc(productId)
      const validatedRecipe = await validateRecipe(tx, root, actor, productId, p.recipe, list)
      const productData = {
        id: productId,
        tenantId: actor.tenantId,
        branchId,
        name: text(p.name, 100),
        categoryId: p.categoryId ? id(p.categoryId) : 'cat-general',
        price: amount(p.price),
        preparationArea: p.preparationArea || 'Cocina',
        restaurantType: p.restaurantType || 'prepared',
        availability: p.availability || 'available',
        isActive: p.isActive !== false,
        isVisible: p.isVisible !== false,
        sortOrder: Number(p.sortOrder) || 0,
        image: p.image || '',
        baseUnit: p.baseUnit || 'unit',
        ...(p.stockBase !== undefined ? { stockBase: Number(p.stockBase) || 0 } : {}),
        ...(Array.isArray(p.recipe) ? { recipe: validatedRecipe } : {}),
        updatedAt: now,
      }
      tx.set(productRef, productData, { merge: true })
    }
    return { ok: true, count: list.length }
  }

  // 3c. Guardar Cliente
  if (type === 'saveCustomer') {
    const c = payload.customer || payload
    if (!c || typeof c !== 'object') throw new HttpsError('invalid-argument', 'Cliente requerido.')
    const firstName = text(c.firstName || c.name || '', 80)
    const phone = text(c.phone || '', 30)
    const countryCode = c.countryCode ? text(c.countryCode, 10) : '591'
    const normalizedPhone = c.normalizedPhone || (countryCode + phone.replace(/\D/g, ''))
    const customerId = id(c.id || `cust_${operationId}`)
    const custRef = root.collection('restaurantCustomers').doc(customerId)
    const customerData = {
      id: customerId,
      tenantId: actor.tenantId,
      branchId,
      firstName,
      lastName: c.lastName ? text(c.lastName, 80) : '',
      countryCode,
      phone,
      normalizedPhone,
      email: c.email ? text(c.email, 160).toLowerCase() : '',
      birthday: c.birthday || '',
      notes: c.notes ? text(c.notes, 500) : '',
      active: c.active !== false,
      updatedAt: now,
      createdAt: c.createdAt || now,
    }
    tx.set(custRef, customerData, { merge: true })
    return { customerId, customer: customerData }
  }

  // 3d. Archivar Cliente
  if (type === 'archiveCustomer') {
    const customerId = id(payload.customerId || payload.id)
    const custRef = root.collection('restaurantCustomers').doc(customerId)
    const snap = await tx.get(custRef)
    if (!snap.exists) throw new HttpsError('not-found', 'Cliente no encontrado.')
    tx.update(custRef, { active: false, archivedAt: now, updatedAt: now })
    return { customerId, active: false }
  }

  // 3e. Ajuste de Inventario / Movimiento
  if (type === 'recordInventoryMovement') {
    const productId = id(payload.productId)
    const productRef = root.collection('products').doc(productId)
    const productSnap = await tx.get(productRef)
    if (!productSnap.exists) throw new HttpsError('not-found', 'Producto no encontrado.')
    const pData = productSnap.data()
    const nextStock = Number(payload.nextStock)
    if (!Number.isFinite(nextStock) || nextStock < 0) {
      throw new HttpsError('invalid-argument', 'Stock no puede ser negativo.')
    }
    const previousStock = Number(pData.stockBase) || 0
    const delta = Math.round((nextStock - previousStock + Number.EPSILON) * 1000) / 1000
    const movementId = `mov_${operationId}`
    const movementDoc = {
      id: movementId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      productId,
      productName: pData.name,
      quantityBase: delta,
      previousStock,
      newStock: nextStock,
      type: payload.type || 'manual_adjustment',
      reason: text(payload.reason || 'Ajuste de inventario', 200),
      shiftId: payload.shiftId || null,
      createdAt: now,
      createdBy: actor.uid,
    }
    tx.create(root.collection('restaurantInventoryMovements').doc(movementId), movementDoc)
    tx.update(productRef, { stockBase: nextStock, updatedAt: now })
    return { ok: true, movementId, nextStock }
  }

  // 3f. Archivar Producto
  if (type === 'archiveProduct') {
    const productId = id(payload.productId || payload.id)
    const productRef = root.collection('products').doc(productId)
    const snap = await tx.get(productRef)
    if (!snap.exists) throw new HttpsError('not-found', 'Producto no encontrado.')

    // Validar si otros productos activos usan este producto como ingrediente en sus recetas
    const activeProductsSnap = await tx.get(
      root.collection('products')
        .where('tenantId', '==', actor.tenantId)
        .where('isActive', '==', true)
    )
    for (const doc of activeProductsSnap.docs) {
      if (doc.id === productId) continue
      const prod = doc.data()
      if (Array.isArray(prod.recipe) && prod.recipe.some(part => part.ingredientId === productId)) {
        throw new HttpsError('failed-precondition', `No se puede archivar ${snap.data().name} porque es insumo de la receta activa de ${prod.name}.`)
      }
    }

    tx.update(productRef, {
      isActive: false,
      isVisible: false,
      availability: 'archived',
      archivedAt: now,
      archivedBy: actor.uid,
      updatedAt: now,
    })
    return { ok: true, productId, archived: true }
  }

  // 3g. Eliminar Producto Físicamente (Deshabilitado por política de integridad)
  if (type === 'deleteProduct') {
    throw new HttpsError(
      'failed-precondition',
      'La eliminación física está deshabilitada. Usa archivar para preservar la integridad histórica.'
    )
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
      if (m.active !== false) {
        if (!m.method || m.method === 'cash') {
          if (m.type === 'income') cashIncome = money(cashIncome + amount(m.amount))
          else if (m.type === 'expense' || m.type === 'refund') cashOutflow = money(cashOutflow + amount(m.amount))
        }
      }
    }

    const expectedCash = money(openingFloat + cashSales + cashIncome - cashOutflow)
    const difference = money(countedCash - expectedCash)
    const totalSales = money(cashSales + qrSales + cardSales)

    const shiftPatch = {
      status: 'closed',
      countedCash,
      expectedCash,
      expectedCashAtClose: expectedCash,
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
    }
    if (payload.stockSnapshot && typeof payload.stockSnapshot === 'object') {
      shiftPatch.stockSnapshot = payload.stockSnapshot
    }
    if (payload.inventoryClosure && typeof payload.inventoryClosure === 'object') {
      shiftPatch.inventoryClosure = payload.inventoryClosure
    }
    tx.update(shiftRef, shiftPatch)

    tx.set(stateRef, { activeShiftId: null, updatedAt: now }, { merge: true })
    return { shiftId, countedCash, expectedCash, difference, totalSales }
  }

  // 4b. Registrar Movimiento Manual de Caja (Ingreso / Egreso)
  if (type === 'recordCashMovement') {
    if (!activeShiftId) throw new HttpsError('failed-precondition', 'No hay turno activo para registrar movimientos de caja.')
    const moveType = payload.type === 'income' ? 'income' : 'expense'
    const validCategories = [
      'supply_purchase', 'worker_payment', 'supplier_payment', 'transport',
      'maintenance', 'services', 'additional_cash', 'change_replenishment', 'other',
    ]
    const category = validCategories.includes(payload.category) ? payload.category : 'other'
    const desc = text(payload.description, 200)
    const val = amount(payload.amount)
    if (val <= 0) throw new HttpsError('invalid-argument', 'El importe debe ser mayor a cero.')
    const rawMethod = payload.method || payload.paymentMethod
    const method = ['cash', 'qr', 'card'].includes(rawMethod) ? rawMethod : 'cash'
    const movementId = id(payload.id || `cash_${operationId}`)
    const movementDoc = {
      id: movementId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      type: moveType,
      category,
      description: desc,
      amount: val,
      method,
      note: payload.note ? text(payload.note, 500) : '',
      workerId: payload.workerId ? text(payload.workerId, 100) : null,
      supplier: payload.supplier ? text(payload.supplier, 150) : null,
      active: true,
      actorUid: actor.uid,
      createdAt: now,
      updatedAt: now,
    }
    tx.set(root.collection('restaurantCashMovements').doc(movementId), movementDoc)
    return { ok: true, movementId, movement: movementDoc }
  }

  // 4c. Anular Movimiento de Caja
  if (type === 'cancelCashMovement') {
    if (!activeShiftId) throw new HttpsError('failed-precondition', 'No hay turno activo.')
    const movementId = id(payload.movementId || payload.id)
    const ref = root.collection('restaurantCashMovements').doc(movementId)
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Movimiento de caja no encontrado.')
    const m = snap.data()
    if (m.type === 'sale') {
      throw new HttpsError('failed-precondition', 'No se puede anular un movimiento de venta directamente desde caja.')
    }
    if (m.active === false) {
      throw new HttpsError('failed-precondition', 'El movimiento ya fue anulado.')
    }
    if (m.shiftId !== activeShiftId) {
      throw new HttpsError('failed-precondition', 'Solo se pueden anular movimientos del turno activo.')
    }
    const reason = text(payload.reason || 'Anulación manual', 200)
    tx.update(ref, {
      active: false,
      cancelledAt: now,
      cancelledBy: actor.uid,
      cancelReason: reason,
      updatedAt: now,
    })
    return { ok: true, movementId, active: false }
  }

  // 4d. Editar Movimiento de Caja
  if (type === 'updateCashMovement') {
    if (!activeShiftId) throw new HttpsError('failed-precondition', 'No hay turno activo.')
    const movementId = id(payload.movementId || payload.id)
    const ref = root.collection('restaurantCashMovements').doc(movementId)
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Movimiento de caja no encontrado.')
    const m = snap.data()
    if (m.type === 'sale') {
      throw new HttpsError('failed-precondition', 'No se puede editar un movimiento de venta desde caja.')
    }
    if (m.active === false) {
      throw new HttpsError('failed-precondition', 'No se puede editar un movimiento anulado.')
    }
    if (m.shiftId !== activeShiftId) {
      throw new HttpsError('failed-precondition', 'Solo se pueden editar movimientos del turno activo.')
    }
    const patch = { updatedAt: now }
    if (payload.type) {
      patch.type = payload.type === 'income' ? 'income' : 'expense'
    }
    if (payload.description !== undefined) {
      patch.description = text(payload.description, 200)
    }
    if (payload.category) {
      const validCategories = [
        'supply_purchase', 'worker_payment', 'supplier_payment', 'transport',
        'maintenance', 'services', 'additional_cash', 'change_replenishment', 'other',
      ]
      patch.category = validCategories.includes(payload.category) ? payload.category : 'other'
    }
    if (payload.amount !== undefined) {
      const val = amount(payload.amount)
      if (val <= 0) throw new HttpsError('invalid-argument', 'El importe debe ser mayor a cero.')
      patch.amount = val
    }
    const rawMethod = payload.method || payload.paymentMethod
    if (rawMethod && ['cash', 'qr', 'card'].includes(rawMethod)) {
      patch.method = rawMethod
    }
    if (payload.note !== undefined) {
      patch.note = text(payload.note || '', 500)
    }
    if (payload.workerId !== undefined) {
      patch.workerId = payload.workerId ? text(payload.workerId, 100) : null
    }
    if (payload.supplier !== undefined) {
      patch.supplier = payload.supplier ? text(payload.supplier, 150) : null
    }
    tx.update(ref, patch)
    return { ok: true, movementId, movement: { ...m, ...patch } }
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

    const prodMap = await resolveProductsAndIngredients(tx, root, items)
    for (const item of items) {
      if (!item.productId) continue
      const prod = prodMap.get(item.productId)
      if (prod && (prod.isActive === false || prod.availability === 'archived')) {
        throw new HttpsError('failed-precondition', `El producto ${prod.name || item.productId} está inactivo o archivado y no puede agregarse a la orden.`)
      }
    }
    const { requirements, totalPerProduct } = computeItemInventoryRequirements(items, prodMap)
    const allowNegativeStock = actor.tenant.configuration?.allowNegativeStock === true
    checkSufficientStock(totalPerProduct, prodMap, allowNegativeStock)

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
    if (tableRef && tableData && !rawOrder.referenceOnly && !rawOrder.isReferenceTable) {
      tx.update(tableRef, {
        status: 'occupied',
        activeOrderId: orderId,
        openedAt: now,
        openedBy: actor.uid,
        updatedAt: now,
      })
    }

    applyInventoryDeduction({ tx, root, actor, branchId, activeShiftId, orderId, operationId, now, requirements, prodMap })

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

    const prodMap = await resolveProductsAndIngredients(tx, root, inputItems)

    const newLines = []
    for (const item of inputItems) {
      const productId = id(item.productId)
      const pData = prodMap.get(productId)
      if (pData && (pData.isActive === false || pData.availability === 'archived')) {
        throw new HttpsError('failed-precondition', `El producto ${pData.name || productId} está inactivo o archivado y no puede agregarse al pedido.`)
      }
      const quantity = Math.max(1, Number(item.quantity) || 1)
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

    const { requirements, totalPerProduct } = computeItemInventoryRequirements(newLines, prodMap)
    const allowNegativeStock = actor.tenant.configuration?.allowNegativeStock === true
    checkSufficientStock(totalPerProduct, prodMap, allowNegativeStock)

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

    applyInventoryDeduction({ tx, root, actor, branchId, activeShiftId, orderId, operationId, now, requirements, prodMap })

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

    const prodMap = await resolveProductsAndIngredients(tx, root, order.items || [])
    const { requirements } = computeItemInventoryRequirements(order.items || [], prodMap)

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

    for (const req of requirements) {
      const target = prodMap.get(req.targetProductId)
      const prevStock = Number(target.stockBase) || 0
      const nextStock = Math.round((prevStock + req.quantityBase + Number.EPSILON) * 1000) / 1000
      target.stockBase = nextStock

      tx.update(root.collection('products').doc(req.targetProductId), {
        stockBase: nextStock,
        updatedAt: now,
      })

      const movId = `mov_ret_${operationId}_${req.itemId}_${req.targetProductId}`
      tx.create(root.collection('restaurantInventoryMovements').doc(movId), {
        id: movId,
        operationId: `return:${orderId}:${req.itemId}:${operationId}:${req.targetProductId}`,
        tenantId: actor.tenantId,
        branchId,
        productId: req.targetProductId,
        productName: target.name,
        quantityBase: req.quantityBase,
        soldQuantity: req.soldQuantity,
        previousStock: prevStock,
        newStock: nextStock,
        type: 'cancellation_return',
        reason: req.isRecipe ? `Devolución por cancelación (receta: ${req.parentName})` : 'Cancelación de pedido',
        orderId,
        orderItemId: req.itemId,
        shiftId: order.shiftId || activeShiftId,
        createdAt: now,
        createdBy: actor.uid,
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

    const cancelQty = Math.min(Number(payload.quantity) || target.quantity, target.quantity)
    if (cancelQty <= 0) throw new HttpsError('invalid-argument', 'Cantidad a anular inválida.')

    let updatedItems = []
    if (cancelQty >= target.quantity) {
      updatedItems = items.filter(it => it.id !== itemId)
    } else {
      const remainingQty = target.quantity - cancelQty
      const newLineTotal = money(target.basePrice * remainingQty)
      updatedItems = items.map(it => it.id === itemId ? { ...it, quantity: remainingQty, lineTotal: newLineTotal } : it)
    }

    const newTotal = money(updatedItems.reduce((sum, it) => sum + (it.lineTotal || 0), 0))
    const fakeItem = { ...target, quantity: cancelQty }
    const prodMap = await resolveProductsAndIngredients(tx, root, [fakeItem])
    const { requirements } = computeItemInventoryRequirements([fakeItem], prodMap)

    tx.update(orderRef, {
      items: updatedItems,
      total: newTotal,
      productSubtotal: newTotal,
      updatedAt: now,
    })

    for (const req of requirements) {
      const targetProd = prodMap.get(req.targetProductId)
      const prevStock = Number(targetProd.stockBase) || 0
      const nextStock = Math.round((prevStock + req.quantityBase + Number.EPSILON) * 1000) / 1000
      targetProd.stockBase = nextStock

      tx.update(root.collection('products').doc(req.targetProductId), {
        stockBase: nextStock,
        updatedAt: now,
      })

      const movId = `mov_ret_${operationId}_${itemId}_${req.targetProductId}`
      tx.create(root.collection('restaurantInventoryMovements').doc(movId), {
        id: movId,
        operationId: `return:${orderId}:${itemId}:${operationId}:${req.targetProductId}`,
        tenantId: actor.tenantId,
        branchId,
        productId: req.targetProductId,
        productName: targetProd.name,
        quantityBase: req.quantityBase,
        soldQuantity: cancelQty,
        previousStock: prevStock,
        newStock: nextStock,
        type: 'cancellation_return',
        reason: req.isRecipe ? `Devolución de ítem (receta: ${req.parentName})` : 'Cancelación de ítem',
        orderId,
        orderItemId: itemId,
        shiftId: order.shiftId || activeShiftId,
        createdAt: now,
        createdBy: actor.uid,
      })
    }

    return { orderId, itemId, total: newTotal, cancelledQuantity: cancelQty }
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
    const rawMethod = payload.method || payload.payment?.method
    const method = text(rawMethod, 20)
    if (!['cash', 'qr', 'card', 'mixed'].includes(method)) {
      throw new HttpsError('invalid-argument', 'Método de pago no reconocido.')
    }

    const cashAmount = amount(method === 'cash' ? total : method === 'mixed' ? (payload.cashAmount ?? payload.payment?.cashAmount ?? 0) : 0)
    const qrAmount = amount(method === 'qr' ? total : method === 'mixed' ? (payload.qrAmount ?? payload.payment?.qrAmount ?? 0) : 0)
    const cardAmount = amount(method === 'card' ? total : method === 'mixed' ? (payload.cardAmount ?? payload.payment?.cardAmount ?? 0) : 0)

    if (money(cashAmount + qrAmount + cardAmount) !== total) {
      throw new HttpsError('invalid-argument', 'El desglose del pago no coincide con el total.')
    }

    const received = amount(payload.received ?? payload.payment?.received ?? payload.payment?.cashReceived ?? (method === 'cash' ? total : cashAmount))
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

  // 15. Asignar Cliente a Pedido
  if (type === 'assignCustomer') {
    const orderId = id(payload.orderId)
    const orderRef = root.collection('restaurantOrders').doc(orderId)
    const customerId = payload.customerId ? id(payload.customerId) : null
    const custRef = customerId ? root.collection('restaurantCustomers').doc(customerId) : null

    const [orderSnap, custSnap] = await Promise.all([
      tx.get(orderRef),
      custRef ? tx.get(custRef) : Promise.resolve(null),
    ])

    if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const order = orderSnap.data()
    if (order.status === 'cancelled') throw new HttpsError('failed-precondition', 'El pedido está cancelado.')

    let tableRef = null
    let tableSnap = null
    if (order.tableId) {
      tableRef = root.collection('restaurantTables').doc(order.tableId)
      tableSnap = await tx.get(tableRef)
    }

    const cData = custSnap?.exists ? custSnap.data() : null
    const customerName = cData ? [cData.firstName, cData.lastName].filter(Boolean).join(' ') : (payload.customerName ? text(payload.customerName, 80) : null)
    const customerPhone = cData ? cData.phone : (payload.customerPhone ? text(payload.customerPhone, 30) : null)

    tx.update(orderRef, {
      customerId: customerId || null,
      customerName,
      customerPhone,
      updatedAt: now,
    })

    if (tableRef && tableSnap?.exists && tableSnap.data().activeOrderId === orderId) {
      tx.update(tableRef, {
        customerId: customerId || null,
        customerName,
        customerPhone,
        updatedAt: now,
      })
    }

    return { orderId, customerId, customerName, customerPhone }
  }

  // 16. Conteo Físico de Inventario
  if (type === 'countInventoryItem') {
    const productId = id(payload.productId)
    const productRef = root.collection('products').doc(productId)
    const shiftRef = root.collection('restaurantShifts').doc(activeShiftId)
    const [productSnap, shiftSnap] = await Promise.all([tx.get(productRef), tx.get(shiftRef)])
    if (!productSnap.exists) throw new HttpsError('not-found', 'Producto no encontrado.')
    if (!shiftSnap.exists) throw new HttpsError('not-found', 'Turno no encontrado.')
    const physical = Number(payload.physical)
    if (!Number.isFinite(physical) || physical < 0) {
      throw new HttpsError('invalid-argument', 'Conteo físico inválido.')
    }
    const countEntry = {
      physical,
      countedAt: now,
      countedBy: actor.uid,
      note: payload.note ? text(payload.note, 200) : '',
    }
    tx.set(shiftRef, {
      inventoryCounts: {
        [productId]: countEntry,
      },
      updatedAt: now,
    }, { merge: true })
    return { ok: true, productId, physical }
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
