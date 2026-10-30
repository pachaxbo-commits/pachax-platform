const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing')
const { collection, doc, getDoc, getDocs } = require('firebase/firestore')
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')

const projectId = process.env.GCLOUD_PROJECT || 'demo-pachax-platform'
if (!projectId.startsWith('demo-')) throw new Error(`Proyecto no permitido para retail QA: ${projectId}`)
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const app = initializeApp({ projectId }, `retail-tenant-${randomUUID()}`)
const db = getFirestore(app), auth = getAuth(app)
const suffix = randomUUID().replace(/-/g, '')
const tenantId = `qa-retail-${suffix}`
const foreignTenantId = `qa-retail-foreign-${suffix}`
const ownerUid = `owner-${suffix}`, cashierUid = `cashier-${suffix}`, stockUid = `stock-${suffix}`
const inactiveUid = `inactive-${suffix}`, wrongBranchUid = `wrong-branch-${suffix}`, outsiderUid = `outsider-${suffix}`
let createdStaffUid = null
const origin = process.env.C1_FUNCTIONS_ORIGIN || 'http://127.0.0.1:5101'
const apiBase = `${origin}/${projectId}/southamerica-west1/tenantGateway`
let env
let passed = 0
const pass = message => { passed++; console.log(`PASS ${message}`) }

async function makeUser(uid, roleId, branchIds = ['main'], status = 'active', memberTenantId = tenantId) {
  const email = `${uid}@example.test`, password = 'Emulator123!'
  await auth.createUser({ uid, email, password })
  await db.doc(`tenants/${memberTenantId}/members/${uid}`).set({ uid, tenantId: memberTenantId, email, roleId, branchIds, status })
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
  return body.idToken
}

async function call(token, data) {
  const response = await fetch(apiBase, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data: { action: 'retailCommand', tenantId, branchId: 'main', ...data } }) })
  return { response, body: await response.json() }
}

async function callAction(token, data) {
  const response = await fetch(apiBase, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data: { tenantId, ...data } }) })
  return { response, body: await response.json() }
}

async function mustPass(token, data) {
  const result = await call(token, data)
  assert.equal(result.response.ok, true, JSON.stringify(result.body))
  return result.body.result
}

async function mustDeny(token, data, status = 'PERMISSION_DENIED') {
  const result = await call(token, data)
  assert.equal(result.response.ok, false)
  assert.equal(result.body.error?.status, status, JSON.stringify(result.body))
  return result.body
}

async function cleanup() {
  await db.recursiveDelete(db.doc(`tenants/${tenantId}`)).catch(() => undefined)
  await db.recursiveDelete(db.doc(`tenants/${foreignTenantId}`)).catch(() => undefined)
  await db.recursiveDelete(db.doc(`users/${ownerUid}`)).catch(() => undefined)
  if (createdStaffUid) await db.recursiveDelete(db.doc(`users/${createdStaffUid}`)).catch(() => undefined)
  for (const uid of [ownerUid, cashierUid, stockUid, inactiveUid, wrongBranchUid, outsiderUid, createdStaffUid].filter(Boolean)) await auth.deleteUser(uid).catch(() => undefined)
  if (env) await env.cleanup()
  await deleteApp(app)
}

async function main() {
  try {
    env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
    const template = require('../generated/templates.js').getTemplate('gelateria_weight_cafe')
    await db.doc(`tenants/${tenantId}`).set({ tenantId, name: 'QA Comercio', businessType: 'gelateria_weight_cafe', ownerUid,
      billingEnforcement: true, subscriptionStatus: 'active', billingAccessUntil: new Date(Date.now() + 30 * 86_400_000),
      commercialCapabilities: { version: 1, businessType: 'gelateria_weight_cafe', limits: { activeUsers: 100, activeProducts: 200, activeBranches: 1 },
        features: { reports: { basic: true, detailed: false, export: false }, receipts: { digital: false },
          printing: { manual: false, kitchenAutomatic: false }, adsRequired: false } },
      configuration: { features: template.defaults.features } })
    await db.doc(`tenants/${tenantId}/commercialUsage/active`).set({ activeUsers: 1, activeProducts: 0, activeBranches: 1 })
    await db.doc(`tenants/${tenantId}/branches/main`).set({ tenantId, branchId: 'main', active: true })
    await db.doc(`tenants/${tenantId}/branches/other`).set({ tenantId, branchId: 'other', active: true })
    await Promise.all(template.roles.map(role => db.doc(`tenants/${tenantId}/roles/${role.id}`).set({ ...role, tenantId })))
    await db.doc(`tenants/${foreignTenantId}`).set({ tenantId: foreignTenantId, name: 'QA externa', businessType: 'gelateria_weight_cafe', ownerUid: outsiderUid, configuration: { features: template.defaults.features } })
    await db.doc(`tenants/${foreignTenantId}/branches/main`).set({ tenantId: foreignTenantId, branchId: 'main', active: true })
    const ownerToken = await makeUser(ownerUid, 'owner')
    const cashierToken = await makeUser(cashierUid, 'cashier')
    const stockToken = await makeUser(stockUid, 'inventory')
    const inactiveToken = await makeUser(inactiveUid, 'cashier', ['main'], 'disabled')
    const wrongBranchToken = await makeUser(wrongBranchUid, 'cashier', ['other'])
    const outsiderToken = await makeUser(outsiderUid, 'owner', ['main'], 'active', foreignTenantId)
    pass('tenant de prueba y roles Owner, Caja e Inventario viven solo en Auth/Firestore Emulator')

    const memberPayload = { action: 'createMember', operationId: `staff-${suffix}`, displayName: 'Caja QA', email: `retail-staff-${suffix}@example.test`, password: 'InitialQaPass123!', roleId: 'cashier', branchIds: ['main'] }
    const memberCreate = await callAction(ownerToken, memberPayload)
    assert.equal(memberCreate.response.ok, true, JSON.stringify(memberCreate.body))
    createdStaffUid = memberCreate.body.result.uid
    const memberRetry = await callAction(ownerToken, memberPayload)
    assert.equal(memberRetry.response.ok, true, JSON.stringify(memberRetry.body))
    assert.equal(memberRetry.body.result.uid, createdStaffUid)
    assert.equal((await db.collection(`tenants/${tenantId}/members`).where('uid', '==', createdStaffUid).get()).size, 1)
    assert.equal((await db.doc(`tenants/${tenantId}/members/${createdStaffUid}`).get()).data().roleId, 'cashier')
    const ownerDb = env.authenticatedContext(ownerUid).firestore()
    const cashierDb = env.authenticatedContext(cashierUid).firestore()
    const ownersMemberList = await assertSucceeds(getDocs(collection(ownerDb, `tenants/${tenantId}/members`)))
    assert.ok(ownersMemberList.size >= 1)
    await assertFails(getDocs(collection(cashierDb, `tenants/${tenantId}/members`)))
    const cashierCreate = await callAction(cashierToken, { action: 'createMember', operationId: `denied-staff-${suffix}`, displayName: 'No autorizado', email: `denied-${suffix}@example.test`, password: 'InitialQaPass123!', roleId: 'cashier', branchIds: ['main'] })
    assert.equal(cashierCreate.body.error?.status, 'PERMISSION_DENIED')
    pass('Owner puede listar y crear usuarios; Caja no puede listar miembros ni administrar usuarios')

    const bulk = db.batch()
    for (let index = 0; index < 201; index += 1) {
      bulk.set(db.doc(`tenants/${tenantId}/retailProducts/limit-${suffix}-${index}`), {
        id: `limit-${index}`, tenantId, branchId: 'main', name: `Producto ${index}`, active: true,
      })
    }
    await bulk.commit()
    await mustDeny(ownerToken, { commandType: 'load' }, 'RESOURCE_EXHAUSTED')
    await db.recursiveDelete(db.collection(`tenants/${tenantId}/retailProducts`))
    pass('la consulta no presenta una lista truncada como catálogo completo si supera 200 productos')

    const blockedRetailType = await db.doc(`tenants/${tenantId}/retailProducts/sales-test`).get()
    assert.equal(blockedRetailType.exists, false)

    const weighted = await mustPass(ownerToken, { commandType: 'saveProduct', operationId: `weighted-${suffix}`, payload: { name: 'Café a granel', category: 'A granel', sku: 'CAF-1', soldBy: 'weight', priceMinor: 10000 } })
    const unit = await mustPass(ownerToken, { commandType: 'saveProduct', operationId: `unit-${suffix}`, payload: { name: 'Taza', category: 'Cafetería', sku: 'TAZ-1', soldBy: 'unit', priceMinor: 2500 } })
    assert.equal((await db.doc(`tenants/${tenantId}/commercialUsage/active`).get()).data().activeProducts, 2)
    const archivedUnitInput = { commandType: 'archiveProduct', operationId: `archive-unit-${suffix}`, payload: { productId: unit.productId, reason: 'Producto discontinuado QA' } }
    const archivedUnit = await mustPass(ownerToken, archivedUnitInput)
    assert.equal(archivedUnit.status, 'archived')
    const archiveReplay = await mustPass(ownerToken, archivedUnitInput)
    assert.equal(archiveReplay.productId, unit.productId)
    assert.equal((await db.doc(`tenants/${tenantId}/commercialUsage/active`).get()).data().activeProducts, 1,
      'Archiving releases exactly one active product slot.')
    const archivedDoc = await db.doc(`tenants/${tenantId}/retailProducts/${unit.productId}`).get()
    assert.equal(archivedDoc.exists, true, 'Archiving must preserve the product document and references.')
    assert.equal(archivedDoc.data().active, false)
    assert.equal(archivedDoc.data().archiveReason, 'Producto discontinuado QA')
    const repeatedArchive = await mustPass(ownerToken, { commandType: 'archiveProduct', operationId: `archive-again-${suffix}`,
      payload: { productId: unit.productId, reason: 'No reemplazar el motivo original' } })
    assert.equal(repeatedArchive.status, 'already_archived')
    const afterRepeatedArchive = await db.doc(`tenants/${tenantId}/retailProducts/${unit.productId}`).get()
    assert.equal(afterRepeatedArchive.data().archiveReason, archivedDoc.data().archiveReason)
    assert.equal(afterRepeatedArchive.data().archivedAt, archivedDoc.data().archivedAt)
    assert.equal((await db.doc(`tenants/${tenantId}/commercialUsage/active`).get()).data().activeProducts, 1)
    const stateAfterArchive = await mustPass(ownerToken, { commandType: 'load' })
    assert.equal(stateAfterArchive.products.some(product => product.id === unit.productId), false)
    assert.equal(stateAfterArchive.archivedProducts.some(product => product.id === unit.productId), true)
    const archiveAudit = await db.collection(`tenants/${tenantId}/auditLogs`).where('resourceId', '==', unit.productId).get()
    assert(archiveAudit.docs.some(item => item.data().action === 'retail.archiveProduct'
      && item.data().after?.reason === 'Producto discontinuado QA'))
    await mustDeny(cashierToken, { ...archivedUnitInput, operationId: `cashier-archive-${suffix}` })
    await mustDeny(cashierToken, { commandType: 'restoreProduct', operationId: `cashier-restore-${suffix}`, payload: { productId: unit.productId } })
    const [reactivatedA, reactivatedB] = await Promise.all([
      mustPass(ownerToken, { commandType: 'restoreProduct', operationId: `reactivate-a-${suffix}`, payload: { productId: unit.productId } }),
      mustPass(ownerToken, { commandType: 'restoreProduct', operationId: `reactivate-b-${suffix}`, payload: { productId: unit.productId } }),
    ])
    assert.equal(reactivatedA.productId, unit.productId)
    assert.equal(reactivatedB.productId, unit.productId)
    assert.equal([reactivatedA, reactivatedB].filter(result => result.restored).length, 1)
    assert.equal([reactivatedA, reactivatedB].filter(result => result.status === 'already_active').length, 1)
    assert.equal((await db.doc(`tenants/${tenantId}/commercialUsage/active`).get()).data().activeProducts, 2,
      'Concurrent reactivation may consume only one active slot.')
    const restoredDoc = await db.doc(`tenants/${tenantId}/retailProducts/${unit.productId}`).get()
    assert.equal(restoredDoc.data().active, true)
    assert.equal(restoredDoc.data().archivedAt, null)
    const restoreAudit = await db.collection(`tenants/${tenantId}/auditLogs`).where('resourceId', '==', unit.productId).get()
    assert(restoreAudit.docs.some(item => item.data().action === 'retail.restoreProduct'))
    const stateAfterRestore = await mustPass(ownerToken, { commandType: 'load' })
    assert.equal(stateAfterRestore.products.some(product => product.id === unit.productId), true)
    assert.equal(stateAfterRestore.archivedProducts.some(product => product.id === unit.productId), false)
    pass('archivado transaccional conserva historial, audita motivo, libera cupo una sola vez y reactivar concurrentemente lo consume una sola vez')
    await mustPass(stockToken, { commandType: 'adjustStock', operationId: `stock-w-${suffix}`, payload: { productId: weighted.productId, delta: 1000, reason: 'Ingreso inicial de prueba' } })
    await mustPass(stockToken, { commandType: 'adjustStock', operationId: `stock-u-${suffix}`, payload: { productId: unit.productId, delta: 1, reason: 'Ingreso inicial de prueba' } })
    pass('producto por kg y por unidad persiste precio menor y existencias en unidades base inequívocas')

    const deniedProduct = await mustDeny(cashierToken, { commandType: 'saveProduct', operationId: `cashier-product-${suffix}`, payload: { name: 'No', category: 'No', soldBy: 'unit', priceMinor: 100 } })
    assert.equal(deniedProduct.error.status, 'PERMISSION_DENIED')
    await mustDeny(stockToken, { commandType: 'recordSale', operationId: `inventory-sale-${suffix}`, payload: { items: [] } })
    await mustDeny(outsiderToken, { commandType: 'load' })
    await mustDeny(inactiveToken, { commandType: 'load' })
    await mustDeny(wrongBranchToken, { commandType: 'load' })
    pass('Inventario no cobra; Caja no crea productos; otro tenant, miembro inactivo y sucursal ajena son rechazados')

    const opened = await mustPass(ownerToken, { commandType: 'openShift', operationId: `open-${suffix}`, payload: { openingFloatMinor: 10000 } })
    const openRetry = await mustPass(ownerToken, { commandType: 'openShift', operationId: `open-${suffix}`, payload: { openingFloatMinor: 10000 } })
    assert.equal(openRetry.shiftId, opened.shiftId)
    pass('apertura de caja idempotente no duplica turnos')

    const saleOperationId = `sale-${suffix}`
    const saleData = { commandType: 'recordSale', operationId: saleOperationId, payload: { items: [{ productId: weighted.productId, quantity: 250 }], method: 'mixed', cashMinor: 2000, qrMinor: 500, cashReceivedMinor: 2500 } }
    const [saleA, saleB] = await Promise.all([mustPass(cashierToken, saleData), mustPass(cashierToken, saleData)])
    assert.equal(saleA.saleId, saleB.saleId)
    assert.equal(saleA.totalMinor, 2500)
    assert.equal(saleA.changeMinor, 500)
    assert.equal((await db.doc(`tenants/${tenantId}/retailProducts/${weighted.productId}`).get()).data().stockBase, 750)
    assert.equal((await db.doc(`tenants/${tenantId}/retailSales/${saleA.saleId}`).get()).data().lines[0].quantity, 250)
    pass('venta de 250 g calcula su precio en servidor, guarda QR/efectivo/cambio y descuenta stock una vez pese al reintento')

    await mustDeny(cashierToken, { ...saleData, payload: { ...saleData.payload, items: [{ productId: weighted.productId, quantity: 251 }] } }, 'ALREADY_EXISTS')
    pass('payload alterado con una operación ya confirmada se rechaza sin cambiar el resultado anterior')

    const [raceA, raceB] = await Promise.all([
      call(cashierToken, { commandType: 'recordSale', operationId: `race-a-${suffix}`, payload: { items: [{ productId: unit.productId, quantity: 1 }], method: 'qr', cashMinor: 0, qrMinor: 2500, cashReceivedMinor: 0 } }),
      call(cashierToken, { commandType: 'recordSale', operationId: `race-b-${suffix}`, payload: { items: [{ productId: unit.productId, quantity: 1 }], method: 'qr', cashMinor: 0, qrMinor: 2500, cashReceivedMinor: 0 } }),
    ])
    assert.equal([raceA, raceB].filter(result => result.response.ok).length, 1)
    assert.equal((await db.doc(`tenants/${tenantId}/retailProducts/${unit.productId}`).get()).data().stockBase, 0)
    pass('dos ventas concurrentes de la última unidad producen una sola venta y saldo cero, nunca stock negativo')

    await mustDeny(ownerToken, { commandType: 'recordCashMovement', operationId: `overspend-${suffix}`, payload: { type: 'expense', amountMinor: 12001, reason: 'Fuera de saldo' } }, 'FAILED_PRECONDITION')
    const expense = await mustPass(cashierToken, { commandType: 'recordCashMovement', operationId: `expense-${suffix}`, payload: { type: 'expense', amountMinor: 1000, reason: 'Compra menor QA' } })
    assert.equal(expense.status, 'recorded')
    const close = await mustPass(ownerToken, { commandType: 'closeShift', operationId: `close-${suffix}`, payload: { countedCashMinor: 11000 } })
    assert.equal(close.expectedCashMinor, 11000)
    assert.equal(close.differenceMinor, 0)
    await mustDeny(cashierToken, { commandType: 'recordSale', operationId: `after-close-${suffix}`, payload: { items: [{ productId: weighted.productId, quantity: 1 }], method: 'cash', cashMinor: 100, qrMinor: 0, cashReceivedMinor: 100 } }, 'FAILED_PRECONDITION')
    pass('egreso superior al efectivo se deniega; cierre reconcilia y bloquea ventas posteriores')

    const reportBatch = db.batch()
    const reportStart = Date.parse('2026-10-01T12:00:00.000Z')
    for (let index = 0; index < 205; index++) {
      const ref = db.doc(`tenants/${tenantId}/retailSales/report-${suffix}-${String(index).padStart(3, '0')}`)
      reportBatch.set(ref, { tenantId, branchId: 'main', totalMinor: 500, cashMinor: 500, qrMinor: 0, changeMinor: 0, method: 'cash', createdAt: new Date(reportStart + index * 1000).toISOString(), lines: [{ name: 'Artículo QA', quantity: 1, unit: 'unit', lineTotalMinor: 500 }] })
    }
    await reportBatch.commit()
    const reportPeriod = { startAt: '2026-10-01T00:00:00.000Z', endBefore: '2026-10-02T00:00:00.000Z' }
    await mustDeny(ownerToken, { commandType: 'loadReportPage', reportMode: 'detailed', ...reportPeriod }, 'FAILED_PRECONDITION')
    const firstReportPage = await mustPass(ownerToken, { commandType: 'loadReportPage', reportMode: 'basic', ...reportPeriod })
    const secondReportPage = await mustPass(ownerToken, { commandType: 'loadReportPage', reportMode: 'basic', ...reportPeriod, cursor: firstReportPage.cursor })
    const thirdReportPage = await mustPass(ownerToken, { commandType: 'loadReportPage', reportMode: 'basic', ...reportPeriod, cursor: secondReportPage.cursor })
    assert.equal(firstReportPage.rows.length, 100); assert.equal(firstReportPage.hasMore, true)
    assert.equal(secondReportPage.rows.length, 100); assert.equal(secondReportPage.hasMore, true)
    assert.equal(thirdReportPage.rows.length, 5); assert.equal(thirdReportPage.hasMore, false)
    assert.equal(new Set([...firstReportPage.rows, ...secondReportPage.rows, ...thirdReportPage.rows].map(row => row.id)).size, 205)
    assert.deepEqual(firstReportPage.rows[0].lines, [], 'Basic report does not expose detailed line items.')
    pass('Retail reports paginate all 205 rows without duplicates; detailed mode is plan-gated and basic omits line data')
    const exportDenied = await callAction(ownerToken, { action: 'authorizeReportCapability', branchId: 'main', feature: 'reports.export' })
    assert.equal(exportDenied.response.ok, false); assert.equal(exportDenied.body.error?.status, 'PERMISSION_DENIED')
    const tenantRef = db.doc(`tenants/${tenantId}`)
    const reportCaps = (await tenantRef.get()).data().commercialCapabilities
    await tenantRef.update({ commercialCapabilities: { ...reportCaps, features: { ...reportCaps.features, reports: { basic: true, detailed: true, export: true } } } })
    assert.equal((await callAction(ownerToken, { action: 'authorizeReportCapability', branchId: 'main', feature: 'reports.export' })).response.ok, true)
    assert.equal((await callAction(ownerToken, { action: 'authorizeReportCapability', branchId: 'other', feature: 'reports.export' })).response.ok, false)
    await tenantRef.update({ commercialCapabilities: reportCaps })
    pass('server export authorization honors subscription feature and rejects an unauthorized branch')

    await db.doc(`tenants/${tenantId}`).update({ subscriptionStatus: 'suspended' })
    const salesBeforeSuspension = await db.collection(`tenants/${tenantId}/retailSales`).get()
    const movementsBeforeSuspension = await db.collection(`tenants/${tenantId}/retailCashMovements`).get()
    await mustDeny(cashierToken, { commandType: 'recordSale', operationId: `suspended-sale-${suffix}`, payload: { items: [{ productId: weighted.productId, quantity: 1 }], method: 'cash', cashMinor: 100, qrMinor: 0, cashReceivedMinor: 100 } })
    await mustDeny(ownerToken, { commandType: 'recordCashMovement', operationId: `suspended-cash-${suffix}`, payload: { type: 'income', amountMinor: 100, reason: 'No debe registrarse' } })
    assert.equal((await db.collection(`tenants/${tenantId}/retailSales`).get()).size, salesBeforeSuspension.size)
    assert.equal((await db.collection(`tenants/${tenantId}/retailCashMovements`).get()).size, movementsBeforeSuspension.size)
    pass('suscripción suspendida bloquea venta y caja Retail en servidor sin crear ventas ni movimientos')

    const unauthContext = env.unauthenticatedContext()
    const cashierContext = env.authenticatedContext(cashierUid)
    await assert.rejects(getDoc(doc(cashierContext.firestore(), `tenants/${tenantId}/retailSales/${saleA.saleId}`)))
    await assert.rejects(getDoc(doc(cashierContext.firestore(), `tenants/${tenantId}/retailProducts/${weighted.productId}`)))
    await assert.rejects(getDoc(doc(unauthContext.firestore(), `tenants/${tenantId}/retailSales/${saleA.saleId}`)))
    pass('Rules no permiten lecturas directas de productos/ventas ni lectura anónima; el acceso pasa por tenantGateway')
    console.log(`RESULT ${passed} retail tenant emulator assertions passed`)
  } finally { await cleanup() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
