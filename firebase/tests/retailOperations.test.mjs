import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit } from 'firebase/firestore'

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
const ids = { owner: `retail_owner_${suffix}`, cashier: `retail_cashier_${suffix}`, branchCashier: `retail_branch_cashier_${suffix}`, sales: `retail_sales_${suffix}`, inventory: `retail_inventory_${suffix}`, foreign: `retail_foreign_${suffix}` }
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const app = initializeApp({ projectId }, `retail-operations-${suffix}`), db = getFirestore(app), auth = getAuth(app)
const root = db.doc(`tenants/${tenantId}`), otherRoot = db.doc(`tenants/${otherTenant}`)
const call = (uid, commandType, operationId, payload = {}, selectedTenant = tenantId, branchId = 'main') => executeRetailCommand(db, { auth: { uid }, data: { tenantId: selectedTenant, branchId, commandType, operationId, payload } })
let checks = 0
const pass = message => { checks += 1; console.log('PASS', message) }

try {
  const template = getTemplate('gelateria_weight_cafe')
  await root.set({ tenantId, name: 'Comercio QA', businessType: 'gelateria_weight_cafe', ownerUid: ids.owner, configuration: template.defaults })
  await root.collection('branches').doc('main').set({ tenantId, id: 'main', active: true })
  await root.collection('branches').doc('branch2').set({ tenantId, id: 'branch2', active: true })
  await root.collection('branches').doc('branch3').set({ tenantId, id: 'branch3', active: true })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId] of [[ids.owner,'owner'],[ids.cashier,'cashier'],[ids.sales,'sales'],[ids.inventory,'inventory']]) await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status:'active', branchIds:['main','branch2','branch3'] })
  await root.collection('members').doc(ids.branchCashier).set({uid:ids.branchCashier,tenantId,roleId:'cashier',status:'active',branchIds:['main']})
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
  await assert.rejects(call(ids.inventory,'openCashSession','cash-open-denied',{openingFloatMinor:20000}), error => error.code === 'permission-denied')
  await assert.rejects(call(ids.cashier,'createSale','sale-without-shift',{items:[{productId,quantity:1}],payment:{method:'cash',cashMinor:600,qrMinor:0,receivedMinor:600}}), error => error.code === 'failed-precondition')
  const openingAttempts = [
    { operationId:'cash-open-a', openingFloatMinor:20000 },
    { operationId:'cash-open-b', openingFloatMinor:20000 },
  ]
  const openingResults = await Promise.allSettled(openingAttempts.map(item=>call(ids.owner,'openCashSession',item.operationId,{openingFloatMinor:item.openingFloatMinor})))
  assert.equal(openingResults.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(openingResults.filter(result=>result.status==='rejected'&&result.reason.code==='failed-precondition').length,1)
  const openedIndex = openingResults.findIndex(result=>result.status==='fulfilled'), shiftId = openingResults[openedIndex].value.shiftId
  assert.equal(openingResults[openedIndex].value.status,'open')
  assert.deepEqual(await call(ids.owner,'openCashSession',openingAttempts[openedIndex].operationId,{openingFloatMinor:20000}),openingResults[openedIndex].value)
  await assert.rejects(call(ids.owner,'openCashSession','cash-open-duplicate',{openingFloatMinor:20000}), error => error.code === 'failed-precondition')
  pass('apertura transaccional concurrente crea una sola jornada y el reintento conserva el resultado')
  const salePayload = {items:[{productId,quantity:750,unitPriceMinor:1,subtotalMinor:1,productNameSnapshot:'Precio manipulado'}],payment:{method:'cash',cashMinor:4500,qrMinor:0,receivedMinor:5000}}
  const sale = await call(ids.cashier,'createSale','weight-sale-1',salePayload)
  assert.equal(sale.totalMinor,4500)
  assert.equal(sale.changeMinor,500)
  const savedWeightSale = (await root.collection('retailSales').doc(sale.saleId).get()).data()
  assert.equal(savedWeightSale.items[0].unitPriceMinor,6000)
  assert.equal(savedWeightSale.items[0].subtotalMinor,4500)
  assert.equal(savedWeightSale.items[0].productNameSnapshot,'Queso por peso')
  assert.equal((await root.collection('retailInventory').doc(productId).get()).data().quantity,750)
  const saleRetry = await call(ids.cashier,'createSale','weight-sale-1',salePayload)
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
  const afterFirstSales=(await root.collection('retailCashSessions').doc(shiftId).get()).data()
  assert.equal(afterFirstSales.totalSalesMinor,9500)
  assert.equal(afterFirstSales.cashSalesMinor,5500)
  assert.equal(afterFirstSales.qrSalesMinor,4000)
  assert.equal(afterFirstSales.cashOnlySalesMinor,4500)
  assert.equal(afterFirstSales.qrOnlySalesMinor,2500)
  assert.equal(afterFirstSales.mixedCashMinor,1000)
  assert.equal(afterFirstSales.mixedQrMinor,1500)
  assert.equal(afterFirstSales.cashReceivedMinor,6000)
  assert.equal(afterFirstSales.changeMinor,500)
  assert.equal(afterFirstSales.salesCount,3)
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
  const productCountBeforeInvalidImport = (await root.collection('retailProducts').get()).size
  await assert.rejects(call(ids.owner,'importProducts','invalid-import-duplicate-sku',{mode:'update_existing',products:[
    { ...importRows[0], barcode:'', sku:'DUPLICADO' },
    { ...importRows[1], barcode:'', sku:'duplicado' },
  ]}), error => error.code === 'invalid-argument')
  assert.equal((await root.collection('retailProducts').get()).size, productCountBeforeInvalidImport)
  assert.equal((await root.collection('retailInventory').doc(imported.productIds[1]).get()).data().quantity,7)
  pass('importación Excel en lote omite/actualiza con confirmación, conserva stock y costo existentes e idempotencia')

  const raceProduct = await call(ids.owner,'saveProduct','race-product-1',{product:{...product,name:'Producto de concurrencia',barcode:'',sku:'RACE-1',soldBy:'unit',stockUnit:'unit',priceMinor:1000,costMinor:500,initialStock:5,minStock:0}})
  const racedSales = await Promise.allSettled([
    call(ids.cashier,'createSale','race-sale-a',{items:[{productId:raceProduct.productId,quantity:4}],payment:{method:'cash',cashMinor:4000,qrMinor:0,receivedMinor:4000}}),
    call(ids.cashier,'createSale','race-sale-b',{items:[{productId:raceProduct.productId,quantity:4}],payment:{method:'cash',cashMinor:4000,qrMinor:0,receivedMinor:4000}}),
  ])
  assert.equal(racedSales.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(racedSales.filter(result=>result.status==='rejected'&&result.reason.code==='failed-precondition').length,1)
  assert.equal((await root.collection('retailInventory').doc(raceProduct.productId).get()).data().quantity,1)
  assert.equal((await root.collection('retailInventoryMovements').where('productId','==',raceProduct.productId).where('type','==','sale').get()).size,1)
  pass('dos ventas concurrentes con stock insuficiente producen una sola venta y un solo movimiento')

  const inflow=await call(ids.cashier,'recordCashMovement','cash-in-1',{shiftId,direction:'in',amountMinor:2500,category:'change_float',description:'Cambio adicional'})
  const outflow=await call(ids.cashier,'recordCashMovement','cash-out-1',{shiftId,direction:'out',amountMinor:1500,category:'expense',description:'Compra autorizada de insumos'})
  assert.equal((await root.collection('retailCashMovements').doc(inflow.cashMovementId).get()).data().direction,'in')
  assert.equal((await root.collection('retailCashMovements').doc(outflow.cashMovementId).get()).data().shiftId,shiftId)
  const mainSessionBeforeClose=(await root.collection('retailCashSessions').doc(shiftId).get()).data()
  const expectedMain=mainSessionBeforeClose.openingFloatMinor+mainSessionBeforeClose.cashSalesMinor+mainSessionBeforeClose.manualInflowMinor-mainSessionBeforeClose.manualOutflowMinor
  assert.equal(expectedMain,30500)
  await assert.rejects(call(ids.owner,'closeCashSession','cash-close-missing-note',{shiftId,countedCashMinor:expectedMain-100}), error=>error.code==='invalid-argument')
  const closeAttempts=['cash-close-a','cash-close-b'].map(operationId=>call(ids.owner,'closeCashSession',operationId,{shiftId,countedCashMinor:expectedMain-100,observation:'Diferencia revisada en arqueo QA'}))
  const closeResults=await Promise.allSettled(closeAttempts)
  assert.equal(closeResults.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(closeResults.filter(result=>result.status==='rejected'&&result.reason.code==='failed-precondition').length,1)
  const closeWinner=closeResults.findIndex(result=>result.status==='fulfilled'),closure=(await root.collection('retailCashClosures').doc(shiftId).get()).data()
  assert.equal(closure.totalSalesMinor,13500)
  assert.equal(closure.cashSalesMinor,9500)
  assert.equal(closure.qrSalesMinor,4000)
  assert.equal(closure.cashOnlySalesMinor,8500)
  assert.equal(closure.qrOnlySalesMinor,2500)
  assert.equal(closure.mixedCashMinor,1000)
  assert.equal(closure.mixedQrMinor,1500)
  assert.equal(closure.cashReceivedMinor,10000)
  assert.equal(closure.changeMinor,500)
  assert.equal(closure.expectedCashMinor,expectedMain)
  assert.equal(closure.countedCashMinor,expectedMain-100)
  assert.equal(closure.differenceMinor,-100)
  assert.equal(closure.status,undefined)
  assert.equal((await root.collection('retailCashSessions').doc(shiftId).get()).data().status,'closed')
  assert.deepEqual(await call(ids.owner,'closeCashSession',['cash-close-a','cash-close-b'][closeWinner],{shiftId,countedCashMinor:expectedMain-100,observation:'Diferencia revisada en arqueo QA'}),closeResults[closeWinner].value)
  await assert.rejects(call(ids.cashier,'createSale','sale-after-close',{items:[{productId:raceProduct.productId,quantity:1}],payment:{method:'cash',cashMinor:1000,qrMinor:0,receivedMinor:1000}}),error=>error.code==='failed-precondition')
  await assert.rejects(call(ids.cashier,'recordCashMovement','movement-after-close',{shiftId,direction:'out',amountMinor:100,category:'expense',description:'No debe entrar'}),error=>error.code==='failed-precondition')
  pass('efectivo esperado considera ventas netas, entradas y salidas; diferencia exige nota y cierre concurrente es único e inmutable')

  const branchProduct=await call(ids.owner,'saveProduct','branch2-product',{product:{...product,name:'Producto sucursal dos',barcode:'',sku:'BR2-1',soldBy:'unit',stockUnit:'unit',priceMinor:1000,initialStock:5}},tenantId,'branch2')
  const branchShift=await call(ids.owner,'openCashSession','branch2-open',{openingFloatMinor:1000},tenantId,'branch2')
  const saleCloseRace=await Promise.allSettled([
    call(ids.cashier,'createSale','branch2-race-sale',{items:[{productId:branchProduct.productId,quantity:1}],payment:{method:'cash',cashMinor:1000,qrMinor:0,receivedMinor:1000}},tenantId,'branch2'),
    call(ids.owner,'closeCashSession','branch2-race-close',{shiftId:branchShift.shiftId,countedCashMinor:1000},tenantId,'branch2'),
  ])
  const raceSale=saleCloseRace[0],raceClose=saleCloseRace[1]
  assert.ok(raceSale.status==='fulfilled'||raceSale.reason?.code==='failed-precondition',`unexpected sale/close race: ${raceSale.reason?.code||raceSale.status}`)
  if(raceSale.status==='fulfilled'){
    assert.equal(raceClose.status,'rejected')
    assert.equal(raceClose.reason.code,'invalid-argument')
    const retriedClose=await call(ids.owner,'closeCashSession','branch2-race-close',{shiftId:branchShift.shiftId,countedCashMinor:2000,observation:'Arqueo incluye venta simultánea QA'},tenantId,'branch2')
    assert.equal(retriedClose.expectedCashMinor,2000)
    assert.equal((await root.collection('retailSales').doc(raceSale.value.saleId).get()).data().shiftId,branchShift.shiftId)
  }else{
    assert.equal(raceClose.status,'fulfilled')
    assert.equal(raceClose.value.expectedCashMinor,1000)
  }
  assert.equal((await root.collection('retailCashboxStates').doc('branch2__default').get()).data().activeSessionId,null)
  pass('venta concurrente con cierre se serializa y sucursales mantienen cajas independientes')

  const movementShift=await call(ids.owner,'openCashSession','branch2-outflow-open',{openingFloatMinor:1000},tenantId,'branch2')
  await assert.rejects(call(ids.cashier,'recordCashMovement','branch2-outflow-over-available',{shiftId:movementShift.shiftId,direction:'out',amountMinor:1001,category:'expense',description:'Excede efectivo disponible'},tenantId,'branch2'),error=>error.code==='failed-precondition')
  assert.equal((await root.collection('retailCashMovements').where('shiftId','==',movementShift.shiftId).get()).size,0)
  const outflowAttempts=['branch2-outflow-a','branch2-outflow-b'].map(operationId=>call(ids.cashier,'recordCashMovement',operationId,{shiftId:movementShift.shiftId,direction:'out',amountMinor:700,category:'expense',description:'Gasto concurrente QA'},tenantId,'branch2'))
  const outflowResults=await Promise.allSettled(outflowAttempts)
  assert.equal(outflowResults.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(outflowResults.filter(result=>result.status==='rejected'&&result.reason.code==='failed-precondition').length,1)
  const outflowWinner=outflowResults.findIndex(result=>result.status==='fulfilled'),outflowOperationId=['branch2-outflow-a','branch2-outflow-b'][outflowWinner]
  const outflowRetry=await call(ids.cashier,'recordCashMovement',outflowOperationId,{shiftId:movementShift.shiftId,direction:'out',amountMinor:700,category:'expense',description:'Gasto concurrente QA'},tenantId,'branch2')
  assert.deepEqual(outflowRetry,outflowResults[outflowWinner].value)
  assert.equal((await root.collection('retailCashMovements').where('shiftId','==',movementShift.shiftId).get()).size,1)
  const movementSessionRef=root.collection('retailCashSessions').doc(movementShift.shiftId)
  assert.equal((await movementSessionRef.get()).data().openingFloatMinor+(await movementSessionRef.get()).data().cashSalesMinor+(await movementSessionRef.get()).data().manualInflowMinor-(await movementSessionRef.get()).data().manualOutflowMinor,300)
  await movementSessionRef.update({manualOutflowMinor:2000})
  const movementCountBeforeInvalid=(await root.collection('retailCashMovements').where('shiftId','==',movementShift.shiftId).get()).size
  await assert.rejects(call(ids.cashier,'recordCashMovement','branch2-inconsistent-outflow',{shiftId:movementShift.shiftId,direction:'out',amountMinor:1,category:'expense',description:'Registro histórico inconsistente'},tenantId,'branch2'),error=>error.code==='failed-precondition')
  assert.equal((await root.collection('retailCashMovements').where('shiftId','==',movementShift.shiftId).get()).size,movementCountBeforeInvalid)
  pass('salidas concurrentes serializan el efectivo, reintentos no duplican y registros históricos inconsistentes no reciben nuevas escrituras')

  const concurrentProduct=await call(ids.owner,'saveProduct','branch3-race-product',{product:{...product,name:'Producto carrera caja',barcode:'',sku:'BR3-RACE',soldBy:'unit',stockUnit:'unit',priceMinor:1000,initialStock:2}},tenantId,'branch3')
  const concurrentShift=await call(ids.owner,'openCashSession','branch3-race-open',{openingFloatMinor:1000},tenantId,'branch3')
  const cashRace=await Promise.allSettled([
    call(ids.cashier,'createSale','branch3-race-sale',{items:[{productId:concurrentProduct.productId,quantity:1}],payment:{method:'cash',cashMinor:1000,qrMinor:0,receivedMinor:1000}},tenantId,'branch3'),
    call(ids.cashier,'recordCashMovement','branch3-race-out',{shiftId:concurrentShift.shiftId,direction:'out',amountMinor:700,category:'expense',description:'Salida concurrente QA'},tenantId,'branch3'),
  ])
  assert.equal(cashRace.filter(result=>result.status==='fulfilled').length,2)
  const concurrentSession=(await root.collection('retailCashSessions').doc(concurrentShift.shiftId).get()).data()
  const concurrentExpected=concurrentSession.openingFloatMinor+concurrentSession.cashSalesMinor+concurrentSession.manualInflowMinor-concurrentSession.manualOutflowMinor
  assert.equal(concurrentExpected,1300)
  const closeRace=await Promise.allSettled([
    call(ids.owner,'closeCashSession','branch3-race-close',{shiftId:concurrentShift.shiftId,countedCashMinor:1300},tenantId,'branch3'),
    call(ids.cashier,'recordCashMovement','branch3-after-close-race',{shiftId:concurrentShift.shiftId,direction:'out',amountMinor:1,category:'expense',description:'Debe quedar fuera del cierre'},tenantId,'branch3'),
  ])
  let finalClosure
  if(closeRace[0].status==='fulfilled')finalClosure=closeRace[0].value
  else{
    assert.equal(closeRace[0].reason?.code,'invalid-argument')
    const afterRace=(await root.collection('retailCashSessions').doc(concurrentShift.shiftId).get()).data()
    const expectedAfterRace=afterRace.openingFloatMinor+afterRace.cashSalesMinor+afterRace.manualInflowMinor-afterRace.manualOutflowMinor
    finalClosure=await call(ids.owner,'closeCashSession','branch3-race-close',{shiftId:concurrentShift.shiftId,countedCashMinor:expectedAfterRace},tenantId,'branch3')
  }
  assert.ok(closeRace[1].status==='fulfilled'||closeRace[1].reason?.code==='failed-precondition')
  assert.equal((await root.collection('retailCashClosures').doc(concurrentShift.shiftId).get()).data().expectedCashMinor,finalClosure.expectedCashMinor)
  assert.equal((await root.collection('retailCashSessions').doc(concurrentShift.shiftId).get()).data().status,'closed')
  pass('venta y salida simultáneas concilian; el cierre concurrente fija una instantánea y rechaza movimientos posteriores')

  const ownerClient = env.authenticatedContext(ids.owner).firestore(), cashierClient = env.authenticatedContext(ids.cashier).firestore(), branchCashierClient=env.authenticatedContext(ids.branchCashier).firestore(), inventoryClient = env.authenticatedContext(ids.inventory).firestore(), foreignClient = env.authenticatedContext(ids.foreign).firestore()
  await assertSucceeds(getDoc(doc(cashierClient,`tenants/${tenantId}/retailProducts/${productId}`)))
  await assertFails(getDoc(doc(cashierClient,`tenants/${tenantId}/retailProductCosts/${productId}`)))
  await assertSucceeds(getDoc(doc(ownerClient,`tenants/${tenantId}/retailProductCosts/${productId}`)))
  await assertSucceeds(getDocs(query(collection(cashierClient,`tenants/${tenantId}/retailProducts`),where('branchId','==','main'))))
  await assertSucceeds(getDoc(doc(inventoryClient,`tenants/${tenantId}/retailInventory/${productId}`)))
  await assertFails(getDoc(doc(foreignClient,`tenants/${tenantId}/retailProducts/${productId}`)))
  await assertFails(setDoc(doc(cashierClient,`tenants/${tenantId}/retailProducts/client-write`),{tenantId,branchId:'main'}))
  await assert.rejects(call(ids.foreign,'createSale','cross-tenant-sale',{items:[{productId,quantity:1}],payment:{method:'cash',cashMinor:600,qrMinor:0,receivedMinor:600}}), error => error.code === 'permission-denied')
  await assertSucceeds(getDoc(doc(cashierClient,`tenants/${tenantId}/retailCashClosures/${shiftId}`)))
  await assertSucceeds(getDoc(doc(cashierClient,`tenants/${tenantId}/retailCashSessions/${shiftId}`)))
  await assertFails(getDoc(doc(inventoryClient,`tenants/${tenantId}/retailCashClosures/${shiftId}`)))
  await assertFails(getDoc(doc(foreignClient,`tenants/${tenantId}/retailCashClosures/${shiftId}`)))
  await assertSucceeds(getDocs(query(collection(cashierClient,`tenants/${tenantId}/retailCashClosures`),where('branchId','==','main'))))
  const bulkSalesCollection=root.collection('retailSales'),bulkBatchSize=400,bulkCount=501
  for(let offset=0;offset<bulkCount;offset+=bulkBatchSize){const batch=db.batch();for(let index=offset;index<Math.min(offset+bulkBatchSize,bulkCount);index++)batch.set(bulkSalesCollection.doc(`bulk-${index}`),{tenantId,branchId:'main',saleId:`bulk-${index}`,totalMinor:100,payment:{method:'cash',cashMinor:100,qrMinor:0,changeMinor:0},items:[],createdAt:`2026-10-22T12:${String(Math.floor(index/60)).padStart(2,'0')}:${String(index%60).padStart(2,'0')}.000Z`});await batch.commit()}
  const oversizedReport=await getDocs(query(collection(cashierClient,`tenants/${tenantId}/retailSales`),where('branchId','==','main'),where('createdAt','>=','2026-10-22T00:00:00.000Z'),where('createdAt','<','2026-10-23T00:00:00.000Z'),orderBy('createdAt','desc'),limit(501)))
  assert.equal(oversizedReport.size,501)
  pass('consulta financiera recupera el registro centinela 501 para bloquear cualquier exportación parcial')
  const salesClient=env.authenticatedContext(ids.sales).firestore()
  await assertFails(getDoc(doc(salesClient,`tenants/${tenantId}/retailCashSessions/${shiftId}`)))
  await assertSucceeds(getDocs(query(collection(salesClient,`tenants/${tenantId}/retailCashboxStates`),where('branchId','==','main'),where('cashboxId','==','default'))))
  await assertFails(getDocs(query(collection(branchCashierClient,`tenants/${tenantId}/retailCashClosures`),where('branchId','==','branch2'))))
  await assertFails(getDoc(doc(branchCashierClient,`tenants/${tenantId}/retailCashClosures/branch2-open`)))
  await root.collection('retailSales').doc('legacy-sale').set({tenantId,branchId:'main',saleId:'legacy-sale',totalMinor:100,payment:{method:'cash',cashMinor:100,qrMinor:0,changeMinor:0},items:[],createdAt:new Date().toISOString()})
  assert.equal((await root.collection('retailSales').doc('legacy-sale').get()).data().shiftId,undefined)
  assert.equal((await root.collection('retailSales').get()).docs.find(doc=>doc.data().saleId==='sale_weight-sale-1')?.data().shiftId,shiftId)
  pass('Rules aíslan costo de compra y tenant, permiten consultas de sucursal autorizadas y bloquean escrituras cliente')
  console.log(`${checks}/12 comprobaciones de Retail aprobadas`)
} finally {
  await env.cleanup()
  await auth.deleteUsers(Object.values(ids)).catch(() => undefined)
  await app.delete()
}
