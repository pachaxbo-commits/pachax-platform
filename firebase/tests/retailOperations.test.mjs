import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Retail QA solo se permite en demo-pachax-platform.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { getTemplate } = require('./generated/templates.js')
const { executeRetailCommand } = require('./retail.cjs')

const suffix = Date.now().toString(36), tenantId = `retail_${suffix}`, otherTenant = `retail_other_${suffix}`
const ids = { owner: `retail_owner_${suffix}`, cashier: `retail_cashier_${suffix}`, inventory: `retail_inventory_${suffix}`, foreign: `retail_foreign_${suffix}` }
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `retail-operations-${suffix}`), db = getFirestore(app), auth = getAuth(app)
const root = db.doc(`tenants/${tenantId}`), otherRoot = db.doc(`tenants/${otherTenant}`)
const call = (uid, commandType, operationId, payload = {}, selectedTenant = tenantId) => executeRetailCommand(db, { auth: { uid }, data: { tenantId: selectedTenant, branchId: 'main', commandType, operationId, payload } })
let checks = 0
const pass = message => { checks += 1; console.log('PASS', message) }

try {
  const template = getTemplate('gelateria_weight_cafe')
  await root.set({ tenantId, name: 'Comercio QA', businessType: 'gelateria_weight_cafe', ownerUid: ids.owner, configuration: template.defaults })
  await root.collection('branches').doc('main').set({ tenantId, id: 'main', active: true })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId] of [[ids.owner,'owner'],[ids.cashier,'cashier'],[ids.inventory,'inventory']]) await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status:'active', branchIds:['main'] })
  await otherRoot.set({ tenantId: otherTenant, businessType:'gelateria_weight_cafe', configuration:template.defaults })
  await otherRoot.collection('members').doc(ids.foreign).set({ uid:ids.foreign, tenantId:otherTenant, roleId:'owner', status:'active', branchIds:['main'] })
  for (const role of template.roles) await otherRoot.collection('roles').doc(role.id).set({ ...role, tenantId:otherTenant })

  const product = { name:'Queso por peso', barcode:'0001234567890', sku:'QUESO-01', category:'A granel', brand:'QA', description:'', soldBy:'weight', stockUnit:'g', priceMinor:6000, costMinor:2500, initialStock:1000, minStock:100, trackStock:true, active:true }
  const created = await call(ids.owner,'saveProduct','product-weight-1',{product})
  const retry = await call(ids.owner,'saveProduct','product-weight-1',{product})
  assert.deepEqual(retry,created)
  const productId = created.productId
  assert.equal((await root.collection('retailProducts').doc(productId).get()).data().barcode,'0001234567890')
  assert.equal((await root.collection('retailInventory').doc(productId).get()).data().quantity,1000)
  assert.equal((await root.collection('retailProductCosts').doc(productId).get()).data().costMinor,2500)
  assert.equal((await root.collection('retailInventoryMovements').get()).size,1)
  await assert.rejects(call(ids.owner,'saveProduct','duplicate-barcode',{product:{...product,name:'Otro queso'}}), error => error.code === 'already-exists')
  await assert.rejects(call(ids.cashier,'saveProduct','cashier-catalog-write',{product:{...product,barcode:'',sku:'NEW'}}), error => error.code === 'permission-denied')
  pass('código de barras textual único por tenant, stock inicial y reintento idempotente; Caja no modifica catálogo')

  const stockRead = await call(ids.inventory,'recordInventoryMovement','stock-intake-1',{productId,quantity:500,movementType:'intake',note:'Ingreso QA'})
  assert.equal(stockRead.quantity,1500)
  const sale = await call(ids.cashier,'createSale','weight-sale-1',{items:[{productId,quantity:750}],payment:{method:'cash',cashMinor:4500,qrMinor:0,receivedMinor:5000}})
  assert.equal(sale.totalMinor,4500)
  assert.equal(sale.changeMinor,500)
  assert.equal((await root.collection('retailInventory').doc(productId).get()).data().quantity,750)
  const saleRetry = await call(ids.cashier,'createSale','weight-sale-1',{items:[{productId,quantity:750}],payment:{method:'cash',cashMinor:4500,qrMinor:0,receivedMinor:5000}})
  assert.deepEqual(saleRetry,sale)
  assert.equal((await root.collection('retailSales').get()).size,1)
  assert.equal((await root.collection('retailInventory').doc(productId).get()).data().quantity,750)
  await assert.rejects(call(ids.cashier,'createSale','insufficient-stock',{items:[{productId,quantity:751}],payment:{method:'cash',cashMinor:4506,qrMinor:0,receivedMinor:4506}}), error => error.code === 'failed-precondition')
  pass('venta 750 g a Bs 60/kg = Bs 45; cambio correcto, stock atómico, reintento no duplica y stock insuficiente se rechaza')

  const unitProduct = await call(ids.owner,'saveProduct','product-unit-1',{product:{...product,name:'Galletas',barcode:'',sku:'GAL-1',soldBy:'unit',stockUnit:'unit',priceMinor:1250,costMinor:500,initialStock:10,minStock:2}})
  const qrSale = await call(ids.cashier,'createSale','qr-sale-1',{items:[{productId:unitProduct.productId,quantity:2}],payment:{method:'qr',cashMinor:0,qrMinor:2500,receivedMinor:0}})
  assert.equal(qrSale.totalMinor,2500)
  const mixed = await call(ids.cashier,'createSale','mixed-sale-1',{items:[{productId:unitProduct.productId,quantity:2}],payment:{method:'mixed',cashMinor:1000,qrMinor:1500,receivedMinor:1000}})
  assert.equal(mixed.totalMinor,2500)
  assert.equal((await root.collection('retailSales').get()).size,3)
  pass('pagos QR y mixtos se validan y quedan en historial real')

  const importRows = [
    { name:'Queso por peso actualizado', barcode:'0001234567890', sku:'QUESO-01', category:'Lácteos', brand:'QA', description:'', soldBy:'weight', stockUnit:'g', priceMinor:6500, initialStock:99999, minStock:150, trackStock:true, active:true },
    { name:'Caramelo', barcode:'0000009', sku:'CAR-9', category:'Dulces', brand:'QA', description:'', soldBy:'unit', stockUnit:'unit', priceMinor:250, initialStock:7, minStock:1, trackStock:true, active:true },
  ]
  const imported = await call(ids.owner,'importProducts','bulk-import-1',{mode:'update_existing',products:importRows})
  assert.deepEqual({created:imported.created,updated:imported.updated,skipped:imported.skipped},{created:1,updated:1,skipped:0})
  const importRetry = await call(ids.owner,'importProducts','bulk-import-1',{mode:'update_existing',products:importRows})
  assert.deepEqual(importRetry,imported)
  assert.equal((await root.collection('retailInventory').doc(productId).get()).data().quantity,750)
  assert.equal((await root.collection('retailProductCosts').doc(productId).get()).data().costMinor,2500)
  assert.equal((await root.collection('retailInventory').doc(imported.productIds[1]).get()).data().quantity,7)
  const createOnly = await call(ids.owner,'importProducts','bulk-import-create-only',{mode:'create_new',products:[{...importRows[0],priceMinor:9000}]})
  assert.equal(createOnly.skipped,1)
  assert.equal((await root.collection('retailProducts').doc(productId).get()).data().priceMinor,6500)
  pass('importación Excel en lote omite/actualiza con confirmación, conserva stock y costo existentes e idempotencia')

  const ownerClient = env.authenticatedContext(ids.owner).firestore(), cashierClient = env.authenticatedContext(ids.cashier).firestore(), inventoryClient = env.authenticatedContext(ids.inventory).firestore(), foreignClient = env.authenticatedContext(ids.foreign).firestore()
  await assertSucceeds(getDoc(doc(cashierClient,`tenants/${tenantId}/retailProducts/${productId}`)))
  await assertFails(getDoc(doc(cashierClient,`tenants/${tenantId}/retailProductCosts/${productId}`)))
  await assertSucceeds(getDoc(doc(ownerClient,`tenants/${tenantId}/retailProductCosts/${productId}`)))
  await assertSucceeds(getDocs(query(collection(cashierClient,`tenants/${tenantId}/retailProducts`),where('branchId','==','main'))))
  await assertSucceeds(getDoc(doc(inventoryClient,`tenants/${tenantId}/retailInventory/${productId}`)))
  await assertFails(getDoc(doc(foreignClient,`tenants/${tenantId}/retailProducts/${productId}`)))
  await assertFails(setDoc(doc(cashierClient,`tenants/${tenantId}/retailProducts/client-write`),{tenantId,branchId:'main'}))
  await assert.rejects(call(ids.foreign,'createSale','cross-tenant-sale',{items:[{productId,quantity:1}],payment:{method:'cash',cashMinor:600,qrMinor:0,receivedMinor:600}}), error => error.code === 'permission-denied')
  pass('Rules aíslan costo de compra y tenant, permiten consultas de sucursal autorizadas y bloquean escrituras cliente')
  console.log(`${checks}/5 comprobaciones de Retail aprobadas`)
} finally {
  await env.cleanup()
  await auth.deleteUsers(Object.values(ids)).catch(() => undefined)
  await app.delete()
}
