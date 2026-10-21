// Emulator-only integration: independent distribution tenants across five rubros.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA Distribution.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const suffix = Date.now().toString(36)
const app = initializeApp({ projectId }, `distribution-universal-e2e-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const fixtures = [
  { profile: 'beverages', name: 'Caja de agua', category: 'Agua', presentation: 'Caja de 12 botellas', unitType: 'package', saleUnitLabel: 'caja', amount: 12, contentUnit: 'unit', price: 48 },
  { profile: 'food', name: 'Arroz seleccionado', category: 'Granos', presentation: 'Bolsa de 5 kg', unitType: 'package', saleUnitLabel: 'bolsa', amount: 5, contentUnit: 'kg', price: 36 },
  { profile: 'cleaning', name: 'Detergente líquido', category: 'Detergentes', presentation: 'Botella de 1 litro', unitType: 'package', saleUnitLabel: 'botella', amount: 1, contentUnit: 'l', price: 22 },
  { profile: 'hardware', name: 'Tornillo galvanizado', category: 'Fijaciones', presentation: 'Pieza', unitType: 'unit', saleUnitLabel: 'pieza', amount: 1, contentUnit: 'unit', price: 3 },
  { profile: 'pets', name: 'Alimento para perro', category: 'Alimento', presentation: 'Bolsa de 500 g', unitType: 'package', saleUnitLabel: 'bolsa', amount: 500, contentUnit: 'g', price: 25 },
]
const tenants = []
const users = []
let checks = 0
const pass = message => { checks += 1; console.log(`PASS ${message}`) }

async function tokenFor(uid) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'EmulatorQA-5B!', returnSecureToken: true }),
  })
  const body = await response.json()
  assert(response.ok, `No inició sesión ${uid}: ${body.error?.message || JSON.stringify(body)}`)
  return body.idToken
}

async function gateway(token, data) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  assert(response.ok && !body.error, `${data.action} falló: ${JSON.stringify(body.error || body)}`)
  return body.result?.data || body.result
}

async function enqueue(client, tenantId, actorUid, type, payload, id, expectedStatus = 'confirmed') {
  const operationId = `${suffix}-${id}`
  const ref = doc(client, 'tenants', tenantId, 'distOperations', operationId)
  await setDoc(ref, { id: operationId, tenantId, branchId: 'main', createdBy: actorUid, createdAt: new Date().toISOString(), type, payload, status: 'queued' })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const result = (await getDoc(ref)).data()
    if (result?.status !== 'queued') {
      assert.equal(result?.status, expectedStatus, `${type} terminó ${result?.status}: ${result?.error || 'sin detalle'}`)
      return result
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout procesando ${type} ${operationId}`)
}

try {
  for (const [index, fixture] of fixtures.entries()) {
    const ownerUid = `d5b-owner-${suffix}-${index}`
    const warehouseUid = `d5b-warehouse-${suffix}-${index}`
    const distributorUid = `d5b-distributor-${suffix}-${index}`
    users.push(ownerUid, warehouseUid, distributorUid)
    for (const uid of [ownerUid, warehouseUid, distributorUid]) {
      await auth.createUser({ uid, email: `${uid}@example.test`, password: 'EmulatorQA-5B!' })
    }
    const ownerToken = await tokenFor(ownerUid)
    const created = await gateway(ownerToken, {
      action: 'completeOnboarding', requestId: `${suffix}-onboard-${index}`,
      companyName: `QA 5B ${fixture.profile} ${suffix}`, businessType: 'route_distribution', industryProfile: fixture.profile,
    })
    const tenantId = created.tenantId
    tenants.push(tenantId)
    const root = db.doc(`tenants/${tenantId}`)
    const ownerClient = env.authenticatedContext(ownerUid).firestore()
    const warehouseId = db.doc(`tenants/${tenantId}/members/${warehouseUid}`)
    const routeId = `route-${suffix}-${index}`
    await warehouseId.set({ uid: warehouseUid, tenantId, roleId: 'warehouse', status: 'active', branchIds: ['main'], routeIds: [], warehouseId: 'central', displayName: 'QA Almacén' })
    await root.collection('members').doc(distributorUid).set({ uid: distributorUid, tenantId, roleId: 'distributor', status: 'active', branchIds: ['main'], routeIds: [routeId], displayName: 'QA Ruta' })

    const catalog = await getDoc(doc(ownerClient, 'tenants', tenantId, 'distSettings', 'catalog'))
    assert.equal(catalog.data()?.industryProfile, fixture.profile)
    assert(catalog.data()?.categories.some(category => category.name === fixture.category), `Falta categoría ${fixture.category}`)
    const productId = `sku-${fixture.profile}-${suffix}`
    const customerId = `customer-${suffix}-${index}`
    const product = {
      id: productId, tenantId, name: fixture.name, category: fixture.category, presentation: fixture.presentation,
      unitType: fixture.unitType, saleUnitLabel: fixture.saleUnitLabel, sku: `5B-${fixture.profile}-${suffix}`,
      presentationContent: { amount: fixture.amount, unit: fixture.contentUnit },
      referencePrice: fixture.price, productionCost: Math.floor(fixture.price / 2), minimumStock: 1, active: true,
    }
    await setDoc(doc(ownerClient, 'tenants', tenantId, 'distProducts', productId), product)
    const customerBatch = writeBatch(ownerClient)
    const identityNumber = `91${String(index).padStart(5, '0')}${String(Date.now()).slice(-4)}`
    customerBatch.set(doc(ownerClient, 'tenants', tenantId, 'distCustomers', customerId), {
      id: customerId, tenantId, name: `Cliente QA ${fixture.profile}`, identityNumber, customerCode: identityNumber,
      active: true, createdBy: ownerUid, createdAt: new Date().toISOString(),
    })
    customerBatch.set(doc(ownerClient, 'tenants', tenantId, 'distCustomerIdentities', identityNumber), {
      tenantId, identityNumber, customerId,
    })
    await customerBatch.commit()
    pass(`${fixture.profile}: tenant, categorías, SKU y cliente aislados creados`)

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const expires = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    await enqueue(ownerClient, tenantId, ownerUid, 'intake', { lines: [
      { productId, quantity: 10, lotCode: `LATE-${index}`, manufacturedOn: today, expiresOn: expires(90) },
      { productId, quantity: 10, lotCode: `EARLY-${index}`, manufacturedOn: today, expiresOn: expires(30) },
    ], note: 'QA ingreso universal' }, `intake-${index}`)
    const centralAfterIntake = (await getDoc(doc(ownerClient, 'tenants', tenantId, 'distBalances', `central__${productId}`))).data()
    assert.equal(centralAfterIntake.quantity, 20)
    const lotsAfterIntake = await getDocs(query(collection(ownerClient, 'tenants', tenantId, 'distLots'), where('productId', '==', productId)))
    assert.equal(lotsAfterIntake.size, 2)
    pass(`${fixture.profile}: ingreso crea dos lotes y 20 SKU en almacén sin convertir contenido`)

    const dispatch = await enqueue(env.authenticatedContext(warehouseUid).firestore(), tenantId, warehouseUid, 'dispatch', {
      warehouseId: 'central', routeId, routeName: 'Ruta QA', distributorUid, distributorName: 'QA Ruta',
      lines: [{ productId, quantity: 5 }],
    }, `dispatch-${index}`)
    assert.equal(dispatch.result.lines[0].allocations[0].lotCode, `EARLY-${index}`)
    const adminSale = await enqueue(ownerClient, tenantId, ownerUid, 'sale', {
      sourceLocation: 'centralWarehouse', lines: [{ productId, quantity: 1, actualUnitPrice: fixture.price }],
      cashAmount: fixture.price, qrAmount: 0, creditAmount: 0, paymentKind: 'cash',
    }, `admin-sale-${index}`)
    const routeSale = await enqueue(env.authenticatedContext(distributorUid).firestore(), tenantId, distributorUid, 'sale', {
      sourceLocation: 'route', routeId, routeName: 'Ruta QA', dispatchId: dispatch.id, customerId,
      lines: [{ productId, quantity: 1, actualUnitPrice: fixture.price }],
      cashAmount: 0, qrAmount: 0, creditAmount: fixture.price, paymentKind: 'credit',
    }, `route-sale-${index}`)
    assert.equal(adminSale.result.lines[0].unitLabel, fixture.saleUnitLabel)
    assert.equal(routeSale.result.lines[0].unitLabel, fixture.saleUnitLabel)
    assert.equal(routeSale.result.lines[0].quantity, 1)
    pass(`${fixture.profile}: despacho FEFO y ventas de ruta/Administración conservan precio y etiqueta snapshot`)

    let fractionalSaleTotal = 0
    if (fixture.profile === 'food') {
      const kgProductId = `sku-food-kg-${suffix}`
      await setDoc(doc(ownerClient, 'tenants', tenantId, 'distProducts', kgProductId), {
        id: kgProductId, tenantId, name: 'Arroz a granel QA', category: 'Granos', unitType: 'kg',
        saleUnitLabel: 'kg', sku: `5B-food-kg-${suffix}`, referencePrice: 10, productionCost: 4, minimumStock: 0, active: true,
      })
      await enqueue(ownerClient, tenantId, ownerUid, 'intake', { lines: [
        { productId: kgProductId, quantity: 2, lotCode: `KG-${suffix}`, manufacturedOn: today, expiresOn: expires(90) },
      ], note: 'QA fracción kg' }, `kg-intake-${index}`)
      const fractional = await enqueue(ownerClient, tenantId, ownerUid, 'sale', {
        sourceLocation: 'centralWarehouse', lines: [{ productId: kgProductId, quantity: 0.25, actualUnitPrice: 10 }],
        cashAmount: 2.5, qrAmount: 0, creditAmount: 0, paymentKind: 'cash',
      }, `fractional-kg-sale-${index}`)
      fractionalSaleTotal = 2.5
      assert.equal(fractional.result.lines[0].quantity, 0.25)
      assert.equal((await getDoc(doc(ownerClient, 'tenants', tenantId, 'distBalances', `central__${kgProductId}`))).data()?.quantity, 1.75)
      const rejectedPackageFraction = await enqueue(ownerClient, tenantId, ownerUid, 'sale', {
        sourceLocation: 'centralWarehouse', lines: [{ productId, quantity: 1.5, actualUnitPrice: fixture.price }],
        cashAmount: fixture.price * 1.5, qrAmount: 0, creditAmount: 0, paymentKind: 'cash',
      }, `fractional-package-rejected-${index}`, 'rejected')
      assert.equal(rejectedPackageFraction.status, 'rejected')
      pass('food: kg admite 0.25 con stock 1.75 restante; package fraccionario es rechazado')
    }

    const collectionAmount = Math.min(5, fixture.price)
    const collectionResult = await enqueue(env.authenticatedContext(distributorUid).firestore(), tenantId, distributorUid, 'collection', {
      receivableId: routeSale.id, amount: collectionAmount, method: 'cash', routeId,
    }, `collection-${index}`)
    assert.equal(collectionResult.result.amount, collectionAmount)
    assert.equal((await getDoc(doc(ownerClient, 'tenants', tenantId, 'distReceivables', routeSale.id))).data()?.balance, fixture.price - collectionAmount)

    await enqueue(env.authenticatedContext(distributorUid).firestore(), tenantId, distributorUid, 'closure', {
      mode: 'declaration', dispatchId: dispatch.id, declaredReturns: { [productId]: 4 },
      declaredReturnMermas: { [productId]: 0 }, declaredReturnNonSellables: { [productId]: 0 },
    }, `declare-return-${index}`)
    const closeInput = { closure: { dispatchId: dispatch.id, products: [{ productId, actualReturn: 4 }], physicalCashDeclared: collectionAmount }, mode: 'warehouse' }
    await enqueue(env.authenticatedContext(warehouseUid).firestore(), tenantId, warehouseUid, 'closure', closeInput, `warehouse-return-${index}`)
    const routeClose = await enqueue(env.authenticatedContext(distributorUid).firestore(), tenantId, distributorUid, 'closure', { ...closeInput, mode: 'money' }, `route-close-${index}`)
    assert.equal(routeClose.result.status, 'closed')
    assert.equal(routeClose.result.expectedCash, collectionAmount)

    const adminClose = await enqueue(ownerClient, tenantId, ownerUid, 'closure', {
      mode: 'administrative', dayKey: today, declaredCash: fixture.price,
    }, `admin-close-${index}`)
    assert.equal(adminClose.result.cashSales, fixture.price + fractionalSaleTotal)
    assert.equal(adminClose.result.totalSales, fixture.price + fractionalSaleTotal)
    const [sales, collections, movementRows, centralAfter] = await Promise.all([
      getDocs(collection(ownerClient, 'tenants', tenantId, 'distSales')),
      getDocs(collection(ownerClient, 'tenants', tenantId, 'distCollections')),
      getDocs(query(collection(ownerClient, 'tenants', tenantId, 'distStockMovements'), where('productId', '==', productId))),
      getDoc(doc(ownerClient, 'tenants', tenantId, 'distBalances', `central__${productId}`)),
    ])
    assert.equal(sales.docs.reduce((sum, row) => sum + row.data().total, 0), fixture.price * 2 + fractionalSaleTotal)
    assert.equal(collections.size, 1)
    assert(movementRows.size >= 6)
    assert.equal(centralAfter.data()?.quantity, 18)
    assert.equal((await getDoc(doc(ownerClient, 'tenants', tenantId, 'distBalances', `route__${routeId}__${productId}`))).data()?.quantity, 0)
    pass(`${fixture.profile}: crédito/cobranza, retorno, conciliación y cierres independientes cuadran; ventas Bs ${fixture.price * 2 + fractionalSaleTotal}`)
  }
  console.log(`${checks} comprobaciones E2E de los cinco rubros aprobadas`)
} finally {
  for (const tenantId of tenants) await db.recursiveDelete(db.doc(`tenants/${tenantId}`)).catch(() => {})
  for (const uid of users) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {})
    await auth.deleteUser(uid).catch(() => {})
  }
  await env.cleanup()
  await app.delete()
}
