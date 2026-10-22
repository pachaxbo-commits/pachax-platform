const { createHash } = require('node:crypto')
const { HttpsError } = require('firebase-functions/v2/https')
const { tenantActor, hasPermission, id } = require('./authorization.cjs')
const { isRetailProfile } = require('./generated/retailProfiles.js')

const permissions = { saveProduct: 'products.manage', importProducts: 'products.manage', archiveProduct: 'products.manage', recordInventoryMovement: 'inventory.manage', createSale: 'sales.create' }
const fingerprint = value => createHash('sha256').update(JSON.stringify(sort(value))).digest('hex')
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value
const safeId = value => {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(result)) throw new HttpsError('invalid-argument', 'Identificador inválido.')
  return result
}
const label = (value, max, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || value.trim().length > max || !value.trim()) throw new HttpsError('invalid-argument', 'Revisa el nombre y los datos del producto.')
  return value.trim()
}
const whole = (value, name, { min = 0, max = 1_000_000_000 } = {}) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpsError('invalid-argument', `${name} debe ser un número entero válido.`)
  return value
}
const moneyMinor = value => whole(value, 'Importe', { max: 100_000_000 })
const barcode = value => {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || value.length > 80 || !/^[\x20-\x7E]+$/.test(value.trim())) throw new HttpsError('invalid-argument', 'Código de barras inválido; guárdalo como texto.')
  return value.trim()
}
const barcodeKey = value => createHash('sha256').update(value).digest('hex')
const skuKey = value => createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
const isAdmin = member => ['owner', 'admin'].includes(member.roleId)

function validateProduct(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Producto inválido.')
  const soldBy = raw.soldBy
  if (!['unit', 'weight'].includes(soldBy)) throw new HttpsError('invalid-argument', 'Selecciona venta por unidad o por peso.')
  const priceMinor = moneyMinor(raw.priceMinor)
  const costMinor = raw.costMinor === undefined ? undefined : moneyMinor(raw.costMinor)
  const minStock = whole(raw.minStock ?? 0, 'Stock mínimo')
  const initialStock = whole(raw.initialStock ?? 0, 'Stock inicial')
  return {
    name: label(raw.name, 120), description: label(raw.description ?? '', 500, true), barcode: barcode(raw.barcode),
    sku: label(raw.sku ?? '', 60, true), category: label(raw.category ?? 'General', 60), brand: label(raw.brand ?? '', 80, true),
    soldBy, stockUnit: soldBy === 'weight' ? 'g' : 'unit', priceMinor, minStock,
    trackStock: raw.trackStock !== false, active: raw.active !== false,
    initialStock, ...(costMinor !== undefined ? { costMinor } : {}),
  }
}

function saleLine(product, quantity) {
  whole(quantity, 'Cantidad', { min: 1 })
  const subtotalMinor = product.soldBy === 'weight'
    ? Number((BigInt(quantity) * BigInt(product.priceMinor) + 500n) / 1000n)
    : Number(BigInt(quantity) * BigInt(product.priceMinor))
  if (!Number.isSafeInteger(subtotalMinor)) throw new HttpsError('invalid-argument', 'El importe excede el rango admitido.')
  return { productId: product.id, productNameSnapshot: product.name, soldBy: product.soldBy, quantity, unit: product.soldBy === 'weight' ? 'g' : 'unit', unitPriceMinor: product.priceMinor, subtotalMinor }
}

async function executeRetailCommand(db, request) {
  const input = request.data || {}, type = input.commandType
  const permission = permissions[type]
  if (!permission) throw new HttpsError('invalid-argument', 'Operación de Comercio no reconocida.')
  const operationId = safeId(input.operationId)
  const actor = await tenantActor(db, request, permission)
  if (actor.tenant.businessType !== 'gelateria_weight_cafe') throw new HttpsError('failed-precondition', 'Esta empresa no utiliza Comercio / Venta rápida.')
  const branchId = safeId(input.branchId || 'main'), payload = input.payload || {}
  if (!actor.membership.branchIds?.includes(branchId)) throw new HttpsError('permission-denied', 'Sucursal no autorizada.')
  const requestHash = fingerprint({ type, branchId, payload }), root = actor.root
  const operationRef = root.collection('retailOperations').doc(operationId), now = new Date().toISOString()
  return db.runTransaction(async tx => {
    const [stored, tenantSnap, memberSnap] = await Promise.all([tx.get(operationRef), tx.get(root), tx.get(root.collection('members').doc(actor.uid))])
    if (stored.exists) {
      const previous = stored.data()
      if (previous.actorUid !== actor.uid || previous.requestHash !== requestHash) throw new HttpsError('already-exists', 'El identificador de operación ya se utilizó con otros datos.')
      return previous.result
    }
    const tenant = tenantSnap.data(), member = memberSnap.data()
    if (!hasPermission(tenant, member, permission) || !member.branchIds?.includes(branchId)) throw new HttpsError('permission-denied', 'Permiso revocado o sucursal no autorizada.')
    const result = await apply({ db, tx, root, actor, member, tenant, branchId, type, payload, operationId, now })
    tx.create(operationRef, { tenantId: actor.tenantId, branchId, operationId, actorUid: actor.uid, type, requestHash, status: 'confirmed', result, createdAt: now })
    tx.create(root.collection('retailAudit').doc(), { tenantId: actor.tenantId, branchId, operationId, actorUid: actor.uid, type, resourceId: result.productId || result.saleId || result.movementId || null, createdAt: now })
    return result
  })
}

async function apply(ctx) {
  const { tx, root, actor, member, branchId, type, payload, operationId, now } = ctx
  if (type === 'saveProduct') {
    if (!isAdmin(member)) throw new HttpsError('permission-denied', 'Solo Owner o Administrador puede administrar productos y precios.')
    const product = validateProduct(payload.product || payload), productId = safeId((payload.product || payload).id || `p_${operationId}`)
    const productRef = root.collection('retailProducts').doc(productId), stockRef = root.collection('retailInventory').doc(productId), costRef = root.collection('retailProductCosts').doc(productId)
    const oldProduct = await tx.get(productRef), oldStock = await tx.get(stockRef)
    const oldBarcode = oldProduct.data()?.barcode || '', oldSku = oldProduct.data()?.sku || ''
    const oldBarcodeRef = oldBarcode ? root.collection('retailBarcodeIndex').doc(barcodeKey(oldBarcode)) : null
    const nextBarcodeRef = product.barcode ? root.collection('retailBarcodeIndex').doc(barcodeKey(product.barcode)) : null
    const oldSkuRef = oldSku ? root.collection('retailSkuIndex').doc(skuKey(oldSku)) : null
    const nextSkuRef = product.sku ? root.collection('retailSkuIndex').doc(skuKey(product.sku)) : null
    const [oldBarcodeSnap, nextBarcodeSnap] = await Promise.all([
      oldBarcodeRef ? tx.get(oldBarcodeRef) : Promise.resolve(null),
      nextBarcodeRef && product.barcode !== oldBarcode ? tx.get(nextBarcodeRef) : Promise.resolve(null),
    ])
    const [oldSkuSnap, nextSkuSnap] = await Promise.all([
      oldSkuRef ? tx.get(oldSkuRef) : Promise.resolve(null),
      nextSkuRef && product.sku.trim().toLowerCase() !== oldSku.trim().toLowerCase() ? tx.get(nextSkuRef) : Promise.resolve(null),
    ])
    if (nextBarcodeSnap?.exists && nextBarcodeSnap.data()?.productId !== productId) throw new HttpsError('already-exists', 'Ese código de barras ya está registrado en esta empresa.')
    if (nextSkuSnap?.exists && nextSkuSnap.data()?.productId !== productId) throw new HttpsError('already-exists', 'Ese SKU ya está registrado en esta empresa.')
    if (!oldProduct.exists && oldStock.exists) throw new HttpsError('failed-precondition', 'Hay stock sin producto asociado; solicita revisión antes de continuar.')
    const saved = { id: productId, tenantId: actor.tenantId, branchId, name: product.name, description: product.description, barcode: product.barcode, sku: product.sku, category: product.category, brand: product.brand, soldBy: product.soldBy, stockUnit: product.stockUnit, priceMinor: product.priceMinor, minStock: product.minStock, trackStock: product.trackStock, active: product.active, createdAt: oldProduct.data()?.createdAt || now, updatedAt: now, updatedBy: actor.uid }
    tx.set(productRef, saved)
    if (product.costMinor !== undefined || !oldProduct.exists) tx.set(costRef, { productId, tenantId: actor.tenantId, branchId, costMinor: product.costMinor ?? 0, updatedAt: now, updatedBy: actor.uid })
    if (oldBarcodeRef && oldBarcode !== product.barcode && oldBarcodeSnap?.data()?.productId === productId) tx.delete(oldBarcodeRef)
    if (nextBarcodeRef) tx.set(nextBarcodeRef, { productId, tenantId: actor.tenantId, branchId, barcode: product.barcode, updatedAt: now })
    if (oldSkuRef && oldSku.trim().toLowerCase() !== product.sku.trim().toLowerCase() && oldSkuSnap?.data()?.productId === productId) tx.delete(oldSkuRef)
    if (nextSkuRef) tx.set(nextSkuRef, { productId, tenantId: actor.tenantId, branchId, sku: product.sku, updatedAt: now })
    if (!oldProduct.exists) {
      tx.create(stockRef, { productId, tenantId: actor.tenantId, branchId, quantity: product.initialStock, unit: product.stockUnit, updatedAt: now })
      if (product.initialStock > 0) tx.create(root.collection('retailInventoryMovements').doc(`initial_${operationId}`), { tenantId: actor.tenantId, branchId, productId, type: 'initial', quantityDelta: product.initialStock, unit: product.stockUnit, actorUid: actor.uid, operationId, createdAt: now })
    } else if (oldProduct.data().stockUnit !== product.stockUnit) throw new HttpsError('failed-precondition', 'No se puede cambiar la unidad de un producto con historial; crea un producto nuevo.')
    return { productId, created: !oldProduct.exists }
  }
  if (type === 'importProducts') {
    if (!isAdmin(member)) throw new HttpsError('permission-denied', 'Solo Owner o Administrador puede importar productos.')
    if (!['create_new','update_existing'].includes(payload.mode) || !Array.isArray(payload.products) || !payload.products.length || payload.products.length > 80) throw new HttpsError('invalid-argument', 'La importación debe incluir entre 1 y 80 productos y un modo válido.')
    const products = payload.products.map(validateProduct), seenBarcodes = new Set(), seenSkus = new Set()
    for (const product of products) {
      if (product.barcode && seenBarcodes.has(product.barcode)) throw new HttpsError('invalid-argument', 'El archivo contiene códigos de barras duplicados.')
      if (product.sku && seenSkus.has(product.sku.toLowerCase())) throw new HttpsError('invalid-argument', 'El archivo contiene SKU duplicados.')
      if (product.barcode) seenBarcodes.add(product.barcode)
      if (product.sku) seenSkus.add(product.sku.toLowerCase())
    }
    const barcodeRefs = products.map(product => product.barcode ? root.collection('retailBarcodeIndex').doc(barcodeKey(product.barcode)) : null)
    const skuRefs = products.map(product => product.sku ? root.collection('retailSkuIndex').doc(skuKey(product.sku)) : null)
    const barcodeSnaps = await Promise.all(barcodeRefs.map(ref => ref ? tx.get(ref) : Promise.resolve(null)))
    const skuSnaps = await Promise.all(skuRefs.map(ref => ref ? tx.get(ref) : Promise.resolve(null)))
    const existingIds = products.map((_, index) => {
      const fromBarcode = barcodeSnaps[index]?.data()?.productId || null, fromSku = skuSnaps[index]?.data()?.productId || null
      if (fromBarcode && fromSku && fromBarcode !== fromSku) throw new HttpsError('already-exists', 'El código y el SKU apuntan a productos distintos; corrige la fila antes de importar.')
      return fromBarcode || fromSku
    })
    const productIds = existingIds.map((existingId, index) => existingId || `p_${createHash('sha256').update(`${operationId}:${index}`).digest('hex').slice(0,24)}`)
    const productRefs = productIds.map(productId => root.collection('retailProducts').doc(productId))
    const stockRefs = productIds.map(productId => root.collection('retailInventory').doc(productId))
    const costRefs = productIds.map(productId => root.collection('retailProductCosts').doc(productId))
    const productSnaps = await Promise.all(productRefs.map(ref => tx.get(ref)))
    const oldBarcodeRefs = productSnaps.map(snap => snap.data()?.barcode ? root.collection('retailBarcodeIndex').doc(barcodeKey(snap.data().barcode)) : null)
    const oldSkuRefs = productSnaps.map(snap => snap.data()?.sku ? root.collection('retailSkuIndex').doc(skuKey(snap.data().sku)) : null)
    const oldBarcodeSnaps = await Promise.all(oldBarcodeRefs.map(ref => ref ? tx.get(ref) : Promise.resolve(null)))
    const oldSkuSnaps = await Promise.all(oldSkuRefs.map(ref => ref ? tx.get(ref) : Promise.resolve(null)))
    const results = { created: 0, updated: 0, skipped: 0, productIds: [] }
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index], productId = productIds[index], old = productSnaps[index].data(), existing = Boolean(existingIds[index] && productSnaps[index].exists)
      if (existing && old.branchId !== branchId) throw new HttpsError('failed-precondition', 'Un producto coincide con código o SKU en otra sucursal.')
      if (existing && payload.mode === 'create_new') { results.skipped += 1; results.productIds.push(productId); continue }
      if (!existing && productSnaps[index].exists) throw new HttpsError('already-exists', 'Identificador de producto en conflicto; reintenta con una nueva operación.')
      if (existing && old.stockUnit !== product.stockUnit) throw new HttpsError('failed-precondition', `La unidad de ${old.name} no se puede cambiar porque tiene historial.`)
      const barcodeOwner = barcodeSnaps[index]?.data()?.productId, skuOwner = skuSnaps[index]?.data()?.productId
      if ((barcodeOwner && barcodeOwner !== productId) || (skuOwner && skuOwner !== productId)) throw new HttpsError('already-exists', 'El código de barras o SKU ya pertenece a otro producto.')
      const saved = { id:productId, tenantId:actor.tenantId, branchId, name:product.name, description:product.description, barcode:product.barcode, sku:product.sku, category:product.category, brand:product.brand, soldBy:product.soldBy, stockUnit:product.stockUnit, priceMinor:product.priceMinor, minStock:product.minStock, trackStock:product.trackStock, active:product.active, createdAt:old?.createdAt||now, updatedAt:now, updatedBy:actor.uid }
      tx.set(productRefs[index], saved)
      if (product.costMinor !== undefined || !existing) tx.set(costRefs[index], { productId, tenantId:actor.tenantId, branchId, costMinor:product.costMinor??0, updatedAt:now, updatedBy:actor.uid })
      if (oldBarcodeRefs[index] && old?.barcode !== product.barcode && oldBarcodeSnaps[index]?.data()?.productId === productId) tx.delete(oldBarcodeRefs[index])
      if (oldSkuRefs[index] && old?.sku?.toLowerCase() !== product.sku.toLowerCase() && oldSkuSnaps[index]?.data()?.productId === productId) tx.delete(oldSkuRefs[index])
      if (product.barcode) tx.set(barcodeRefs[index], { productId, tenantId:actor.tenantId, branchId, barcode:product.barcode, updatedAt:now })
      if (product.sku) tx.set(skuRefs[index], { productId, tenantId:actor.tenantId, branchId, sku:product.sku, updatedAt:now })
      if (!existing) {
        tx.create(stockRefs[index], { productId, tenantId:actor.tenantId, branchId, quantity:product.initialStock, unit:product.stockUnit, updatedAt:now })
        if (product.initialStock > 0) tx.create(root.collection('retailInventoryMovements').doc(`initial_${operationId}_${index}`), { tenantId:actor.tenantId, branchId, productId, type:'initial', quantityDelta:product.initialStock, unit:product.stockUnit, actorUid:actor.uid, operationId, createdAt:now })
        results.created += 1
      } else results.updated += 1
      // Existing stock is deliberately not read-modified or overwritten by catalog imports.
      results.productIds.push(productId)
    }
    return results
  }
  if (type === 'archiveProduct') {
    if (!isAdmin(member)) throw new HttpsError('permission-denied', 'Solo Owner o Administrador puede archivar productos.')
    const productId = safeId(payload.productId), ref = root.collection('retailProducts').doc(productId), product = await tx.get(ref)
    if (!product.exists) throw new HttpsError('not-found', 'Producto no encontrado.')
    tx.update(ref, { active: false, updatedAt: now, updatedBy: actor.uid })
    return { productId, archived: true }
  }
  if (type === 'recordInventoryMovement') {
    const productId = safeId(payload.productId), movementType = payload.movementType
    if (!['intake', 'adjustment', 'count'].includes(movementType)) throw new HttpsError('invalid-argument', 'Tipo de movimiento inválido.')
    const quantity = whole(payload.quantity, 'Cantidad', { min: movementType === 'count' ? 0 : 1 })
    const productRef = root.collection('retailProducts').doc(productId), stockRef = root.collection('retailInventory').doc(productId)
    const [productSnap, stockSnap] = await Promise.all([tx.get(productRef), tx.get(stockRef)])
    if (!productSnap.exists || !stockSnap.exists || productSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Producto o inventario no encontrado en esta sucursal.')
    const current = stockSnap.data().quantity, delta = movementType === 'count' ? quantity - current : movementType === 'adjustment' ? (payload.direction === 'decrease' ? -quantity : quantity) : quantity
    const next = current + delta
    if (!Number.isSafeInteger(next) || next < 0) throw new HttpsError('failed-precondition', 'El movimiento dejaría el inventario en negativo.')
    tx.update(stockRef, { quantity: next, updatedAt: now })
    const movementId = `mv_${operationId}`
    tx.create(root.collection('retailInventoryMovements').doc(movementId), { tenantId: actor.tenantId, branchId, productId, type: movementType, quantityDelta: delta, quantityAfter: next, unit: stockSnap.data().unit, note: typeof payload.note === 'string' ? payload.note.trim().slice(0, 240) : '', actorUid: actor.uid, operationId, createdAt: now })
    return { movementId, productId, quantity: next }
  }
  if (type === 'createSale') {
    if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100) throw new HttpsError('invalid-argument', 'La venta debe incluir entre 1 y 100 productos.')
    const items = payload.items.map(item => ({ productId: safeId(item.productId), quantity: whole(item.quantity, 'Cantidad', { min: 1 }) }))
    const ids = [...new Set(items.map(item => item.productId))]
    const refs = ids.map(productId => root.collection('retailProducts').doc(productId))
    const stockRefs = ids.map(productId => root.collection('retailInventory').doc(productId))
    const [productSnaps, stockSnaps] = await Promise.all([Promise.all(refs.map(ref => tx.get(ref))), Promise.all(stockRefs.map(ref => tx.get(ref)))])
    const products = new Map(productSnaps.map((snap, index) => [ids[index], snap.exists ? { id: snap.id, ...snap.data() } : null]))
    const stocks = new Map(stockSnaps.map((snap, index) => [ids[index], snap.exists ? { ref: stockRefs[index], ...snap.data() } : null]))
    const lineTotals = new Map(), lines = []
    for (const item of items) {
      const product = products.get(item.productId)
      if (!product?.active || product.branchId !== branchId) throw new HttpsError('failed-precondition', 'Un producto ya no está disponible.')
      const line = saleLine(product, item.quantity); lines.push(line)
      lineTotals.set(item.productId, (lineTotals.get(item.productId) || 0) + item.quantity)
    }
    const totalMinor = lines.reduce((sum, line) => sum + line.subtotalMinor, 0)
    if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new HttpsError('invalid-argument', 'Total de venta inválido.')
    const payment = payload.payment
    if (!payment || !['cash', 'qr', 'mixed'].includes(payment.method)) throw new HttpsError('invalid-argument', 'Selecciona una forma de pago válida.')
    const cashMinor = moneyMinor(payment.cashMinor), qrMinor = moneyMinor(payment.qrMinor)
    if (cashMinor + qrMinor !== totalMinor || (payment.method === 'cash' && qrMinor !== 0) || (payment.method === 'qr' && cashMinor !== 0) || (payment.method === 'mixed' && (!cashMinor || !qrMinor))) throw new HttpsError('invalid-argument', 'Los pagos deben cubrir exactamente el total.')
    const receivedMinor = payment.method === 'qr' ? 0 : moneyMinor(payment.receivedMinor)
    if (receivedMinor < cashMinor) throw new HttpsError('failed-precondition', 'El efectivo recibido no cubre el monto en efectivo.')
    const changeMinor = receivedMinor - cashMinor
    for (const [productId, quantity] of lineTotals) {
      const product = products.get(productId), stock = stocks.get(productId)
      if (product.trackStock) {
        if (!stock || stock.quantity < quantity) throw new HttpsError('failed-precondition', `Stock insuficiente para ${product.name}.`)
        tx.update(stock.ref, { quantity: stock.quantity - quantity, updatedAt: now })
        tx.create(root.collection('retailInventoryMovements').doc(`sale_${operationId}_${productId}`), { tenantId: actor.tenantId, branchId, productId, type: 'sale', quantityDelta: -quantity, quantityAfter: stock.quantity - quantity, unit: stock.unit, actorUid: actor.uid, operationId, createdAt: now })
      }
    }
    const saleId = `sale_${operationId}`
    tx.create(root.collection('retailSales').doc(saleId), { saleId, tenantId: actor.tenantId, branchId, items: lines, totalMinor, payment: { method: payment.method, cashMinor, qrMinor, receivedMinor, changeMinor }, status: 'paid', actorUid: actor.uid, createdAt: now })
    return { saleId, totalMinor, changeMinor }
  }
  throw new HttpsError('invalid-argument', 'Operación de Comercio no reconocida.')
}

module.exports = { executeRetailCommand, validateProduct, saleLine }
