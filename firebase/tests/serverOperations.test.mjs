// All writes are confined to local emulators. Never point this suite at production.
import fs from 'node:fs'
fs.mkdirSync('docs/qa-pachax', { recursive: true })
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing'
import {collection,getDocs,getDoc,doc,setDoc,deleteDoc,writeBatch} from 'firebase/firestore'
const req=createRequire(new URL('../../functions/package.json',import.meta.url))
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9195'
const {initializeApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore')
const {getAuth}=req('firebase-admin/auth')
const {processCommand,dayKey}=req('./operations.cjs')
const {prepareCleanDelivery,executeCleanDelivery}=req('./maintenance.cjs')
const projectId='demo-pachax-platform',adminApp=initializeApp({projectId},'qa-operations'),db=getFirestore(adminApp),adminAuth=getAuth(adminApp),root=db.doc('restaurants/pachax')
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules:fs.readFileSync('firebase/firestore.rules','utf8')}})
const prefix=`q${Date.now().toString(36)}`,pid=`${prefix}-p`,pid2=`${prefix}-p2`,pid3=`${prefix}-p3`,route=`${prefix}-route`,wh=`${prefix}-wh`,cust=`${prefix}-customer`,old=`${prefix}-overdue`,admin=`${prefix}-admin`,seller=`${prefix}-seller`,warehouse=`${prefix}-warehouse`
let checks=0
const ok=(v,msg)=>{assert(v,msg);checks++;console.log('PASS',msg)}
const read=async(col,id)=>(await root.collection(col).doc(id).get()).data()
async function command(actor,type,payload,expect='confirmed',operationId){
 const id=operationId||`${prefix}-${type}-${Math.random().toString(36).slice(2)}`
 await setDoc(doc(env.authenticatedContext(actor).firestore(),'restaurants','pachax','distOperations',id),{id,restaurantId:'pachax',createdBy:actor,createdAt:new Date().toISOString(),type,payload,status:'queued'})
 // The emulator trigger is the production entrypoint. Poll only the resulting record.
 const until=Date.now()+60000;let op
 while(Date.now()<until){op=await read('distOperations',id);if(op.status!=='queued')break;await new Promise(r=>setTimeout(r,100))}
 if(expect!=='any')assert.equal(op.status,expect,`${type}: ${op.error||'sin procesar'}`);return {...op,id}
}
try {
 ok(dayKey(new Date('2026-10-21T03:59:59.000Z'))==='2026-10-20'&&dayKey(new Date('2026-10-21T04:00:00.000Z'))==='2026-10-21','la caja administrativa cambia de jornada en medianoche de Bolivia')
 await adminAuth.createUser({uid:admin,email:`${prefix}-admin@example.test`,password:'Inicial123'})
 const passwordTarget=`${prefix}-password-target`
 await adminAuth.createUser({uid:passwordTarget,email:`${prefix}-target@example.test`,password:'Inicial123'})
 await root.collection('members').doc(admin).set({role:'admin',active:true,displayName:'QA administración'})
 await root.collection('members').doc(passwordTarget).set({role:'distributor',active:true,routeId:route,displayName:'QA contraseña'})
 await root.collection('members').doc(seller).set({role:'distributor',active:true,routeId:route,displayName:'QA vendedor'})
 await root.collection('members').doc(warehouse).set({role:'warehouse',active:true,warehouseId:wh,displayName:'QA almacén'})
 await root.collection('distRoutes').doc(route).set({id:route,restaurantId:'pachax',name:'QA ruta',kind:'route',active:true})
 await root.collection('distWarehouses').doc(wh).set({id:wh,restaurantId:'pachax',name:'QA interno',active:true})
 for(const [id,price,cost] of [[pid,10,5],[pid2,8,3],[pid3,6,2]])await root.collection('distProducts').doc(id).set({id,restaurantId:'pachax',name:id,unitType:'kg',active:true,referencePrice:price,productionCost:cost})
 for(const id of [cust,old])await root.collection('distCustomers').doc(id).set({id,restaurantId:'pachax',name:id,identityNumber:id===cust?'6543210':'6543211',customerCode:id===cust?'6543210':'6543211',active:true,createdAt:new Date().toISOString(),createdBy:admin})
 await root.collection('distReceivables').doc(`${prefix}-old`).set({id:`${prefix}-old`,restaurantId:'pachax',customerId:old,routeId:route,originalAmount:5,paidAmount:0,balance:5,createdAt:new Date(Date.now()-8*86400000).toISOString()})
 const date=(days)=>dayKey(new Date(Date.now()+days*86400000))
 const intake=await command(admin,'intake',{lines:[{productId:pid,quantity:10,lotCode:'FUTURO',manufacturedOn:date(-10),expiresOn:date(30)},{productId:pid,quantity:2,lotCode:'PRIMERO',manufacturedOn:date(-10),expiresOn:date(5)},{productId:pid,quantity:4,lotCode:'VENCIDO',manufacturedOn:date(-10),expiresOn:date(-1)},{productId:pid2,quantity:4,lotCode:'REEMPLAZO',manufacturedOn:date(-10),expiresOn:date(30)}],note:'QA'})
 ok((await read('distBalances',`central__${pid}`)).quantity===16,'ingreso por lotes suma stock físico')
 const intakeMovements=await root.collection('distStockMovements').where('productId','==',pid).get()
 ok(intakeMovements.docs.some(entry=>entry.data().type==='intake'&&entry.data().responsibleRole==='admin'&&entry.data().responsibleName==='QA administración'),'historial de ingreso conserva rol y nombre del usuario')
 await command(admin,'updateLot',{lotId:`${intake.id}__0`,lotCode:'FUTURO-EDITADO',manufacturedOn:date(-9),expiresOn:date(31),productionCost:5,reason:'Corrección QA'})
 ok((await read('distLots',`${intake.id}__0`)).lotCode==='FUTURO-EDITADO'&&!(await root.collection('distLotHistory').where('lotId','==',`${intake.id}__0`).get()).empty,'edición de lote conserva historial anterior y nuevo')
 await command(admin,'adjustment',{warehouseId:'central',line:{productId:pid,quantity:-1},note:'Merma técnica QA'})
 ok((await read('distBalances',`central__${pid}`)).quantity===15,'ajuste negativo descuenta stock y queda auditado')
 await command(admin,'deleteProduct',{productId:pid},'rejected');checks++
 const deletedProduct=await command(admin,'deleteProduct',{productId:pid3})
 ok(deletedProduct.result.deleted==true&&(await read('distProducts',pid3)).deleted===true,'eliminación de producto exige stock cero y conserva marca de auditoría')
 const expense=await command(seller,'expense',{concept:'Combustible',amount:15,routeId:route,routeName:'QA ruta'})
 await command(admin,'deleteExpense',{expenseId:expense.id})
 ok((await read('distExpenses',expense.id)).voided===true,'gasto eliminado queda anulado para excluirlo de totales y reportes')
 await command(admin,'transfer',{from:'central',to:wh,line:{productId:pid,quantity:13},note:''},'rejected')
 ok((await read('distBalances',`central__${pid}`)).quantity===15,'lotes vencidos no se transfieren ni alteran el saldo')
 const transfer=await command(admin,'transfer',{from:'central',to:wh,line:{productId:pid,quantity:4},note:'QA'})
 ok(transfer.result.allocations[0].lotCode==='PRIMERO','FEFO prioriza el vencimiento más próximo')
 const dispatch=await command(warehouse,'dispatch',{warehouseId:wh,routeId:route,routeName:'QA ruta',distributorUid:seller,distributorName:'QA vendedor',lines:[{productId:pid,quantity:3}]})
 const adminSaleDuringRoute=await command(admin,'sale',{sourceLocation:'centralWarehouse',routeId:route,routeName:'QA ruta',dispatchId:dispatch.id,lines:[{productId:pid,quantity:1,actualUnitPrice:10}],cashAmount:10,qrAmount:0,creditAmount:0,paymentKind:'cash'})
 ok(adminSaleDuringRoute.result.dispatchId===''&&adminSaleDuringRoute.result.sourceLocation==='centralWarehouse','venta administrativa no hereda el despacho abierto aunque llegue en el payload')
 ok(adminSaleDuringRoute.result.routeId==='central'&&adminSaleDuringRoute.result.routeName==='Administración','venta administrativa ignora ruta obsoleta y queda atribuida a Administración')
 const centralAfterAdminSale=(await read('distBalances',`central__${pid}`)).quantity,routeAfterAdminSale=(await read('distBalances',`route__${route}__${pid}`)).quantity
 ok(centralAfterAdminSale===10&&routeAfterAdminSale===3,`venta administrativa descuenta almacén central sin tocar inventario de ruta (${centralAfterAdminSale}/${routeAfterAdminSale})`)
 const adminCredit=await command(admin,'sale',{sourceLocation:'centralWarehouse',routeId:route,routeName:'Ruta obsoleta',customerId:cust,lines:[{productId:pid,quantity:1,actualUnitPrice:10}],cashAmount:0,qrAmount:0,creditAmount:10,paymentKind:'credit'})
 const adminPayment=await command(admin,'collection',{receivableId:adminCredit.id,routeId:route,amount:2,method:'cash',cashAmount:2})
 const adminExpense=await command(admin,'expense',{concept:'Gasto de administración',amount:1,routeId:route,routeName:'Ruta obsoleta'})
 ok(adminPayment.result.collectionOrigin==='administration'&&adminPayment.result.routeId==='central'&&(await read('distExpenses',adminExpense.id)).expenseOrigin==='administration','cobro y gasto administrativos quedan marcados con origen propio, ignorando ruta obsoleta')
 await root.collection('distSales').doc(`${prefix}-route-close-isolation`).set({id:`${prefix}-route-close-isolation`,restaurantId:'pachax',sourceLocation:'route',routeId:`${prefix}-other-route`,dispatchId:`${prefix}-other-dispatch`,cashAmount:75,qrAmount:0,creditAmount:0,total:75,dayKey:dayKey(),createdAt:new Date().toISOString()})
 await root.collection('distCollections').doc(`${prefix}-route-collection-isolation`).set({id:`${prefix}-route-collection-isolation`,restaurantId:'pachax',collectionOrigin:'route',routeId:`${prefix}-other-route`,amount:30,cashAmount:30,qrAmount:0,dayKey:dayKey(),createdAt:new Date().toISOString()})
 await root.collection('distExpenses').doc(`${prefix}-route-expense-isolation`).set({id:`${prefix}-route-expense-isolation`,restaurantId:'pachax',expenseOrigin:'route',routeId:`${prefix}-other-route`,amount:20,dayKey:dayKey(),createdAt:new Date().toISOString()})
 await root.collection('distSales').doc(`${prefix}-legacy-central-sale`).set({id:`${prefix}-legacy-central-sale`,restaurantId:'pachax',sourceLocation:'centralWarehouse',routeId:route,dispatchId:dispatch.id,lines:[{productId:pid,quantity:9}],cashAmount:90,qrAmount:0,creditAmount:0,total:90,createdAt:new Date().toISOString()})
 const base={sourceLocation:'route',routeId:route,routeName:'QA ruta',dispatchId:dispatch.id,customerId:cust,lines:[{productId:pid,quantity:2,actualUnitPrice:10}],cashAmount:0,qrAmount:0,creditAmount:20,paymentKind:'credit'}
 await command(seller,'sale',{...base,lines:[{productId:pid,quantity:2,actualUnitPrice:9}],creditAmount:18},'rejected');checks++
 await command(seller,'sale',{...base,customerId:old,creditAmount:20,cashAmount:0,paymentKind:'credit'},'rejected');checks++
 const sold=await command(seller,'sale',base)
 ok(sold.result.lines[0].costTotal===10,'venta conserva el costo histórico')
 await processCommand(db,root.collection('distOperations').doc(sold.id))
 ok((await read('distBalances',`route__${route}__${pid}`)).quantity===1,'reintento no duplica la venta')
 await command(seller,'collection',{receivable:{id:sold.id},amount:5,method:'cash'})
 await command(admin,'claim',{kind:'exchange',saleId:sold.id,productId:pid,quantity:1,replacementProductId:pid2,replacementQuantity:1,warehouseId:'central',reason:'Mal envasado',method:'cash'})
 let debt=await read('distReceivables',sold.id)
 ok(debt.balance===13&&debt.originalAmount===20&&debt.creditedAmount===2,'cambio compensa deuda sin modificar el importe original')
 await command(admin,'claim',{kind:'return',saleId:sold.id,productId:pid,quantity:1,warehouseId:'central',reason:'Deteriorado',method:'cash'})
 ok((await read('distReceivables',sold.id)).balance===3,'devolución reduce el saldo restante')
 await command(admin,'claim',{kind:'return',saleId:sold.id,productId:pid,quantity:1,warehouseId:'central',reason:'Repetido',method:'cash'},'rejected');checks++
 await command(warehouse,'closure',{closure:{dispatchId:dispatch.id,products:[{productId:pid,actualReturn:1}]},mode:'warehouse'},'rejected');checks++
 await command(seller,'closure',{dispatchId:dispatch.id,mode:'declaration',declaredReturns:{[pid]:1},declaredReturnMermas:{[pid]:0},declaredReturnNonSellables:{[pid]:0}})
 const closeInput={closure:{dispatchId:dispatch.id,products:[{productId:pid,actualReturn:1}],physicalCashDeclared:5},mode:'warehouse'}
 await command(warehouse,'closure',closeInput)
 ok((await read('distBalances',`warehouse__${wh}__${pid}`)).quantity===2,'retorno vuelve al almacén de origen y conserva lote')
 const closed=await command(seller,'closure',{...closeInput,mode:'money'})
 ok(closed.result.expectedCash===5&&closed.result.cashDifference===0,'cierre calcula efectivo en servidor')
 ok(closed.result.cashSales===0&&closed.result.expectedCash===5,'cierre de ruta excluye venta administrativa histórica con dispatchId obsoleto')
 ok(closed.result.products.find(row=>row.productId===pid)?.sold===2,'conciliación física de ruta excluye unidades de ventas centrales')
 const client=env.authenticatedContext(seller).firestore()
 const adminClient=env.authenticatedContext(admin).firestore()
 await assertFails(setDoc(doc(client,'restaurants','pachax','distSales',`${prefix}-forged`),{restaurantId:'pachax',routeId:route}));checks++
 await assertFails(setDoc(doc(client,'restaurants','pachax','distBalances',`route__${route}__${pid}`),{quantity:999},{merge:true}));checks++
 await assertFails(setDoc(doc(client,'restaurants','pachax','distOperations',`${prefix}-forged-actor`),{id:`${prefix}-forged-actor`,restaurantId:'pachax',createdBy:admin,createdAt:new Date().toISOString(),type:'intake',payload:{},status:'queued'}));checks++
 const drafts=[{sourceLocation:'centralWarehouse',routeId:'route-directa',routeName:'Directa',lines:[{productId:pid2,quantity:2,actualUnitPrice:8}],cashAmount:16,qrAmount:0,creditAmount:0,paymentKind:'cash'},{sourceLocation:'centralWarehouse',routeId:'route-directa',routeName:'Directa',lines:[{productId:pid2,quantity:2,actualUnitPrice:8}],cashAmount:16,qrAmount:0,creditAmount:0,paymentKind:'cash'}]
 const concurrent=await Promise.allSettled(drafts.map(p=>command(admin,'sale',p)))
 ok(concurrent.filter(r=>r.status==='fulfilled').length===1,'ventas concurrentes no dejan stock negativo')

 const closureDocPath = ['restaurants', 'pachax', 'distClosures', `closure_${dispatch.id}`]
 const unauthClient = env.unauthenticatedContext().firestore()
 await assertFails(getDoc(doc(unauthClient, ...closureDocPath))); checks++
 const foreignTenantClient = env.authenticatedContext(`${prefix}-foreign-tenant-user`).firestore()
 await assertFails(getDoc(doc(foreignTenantClient, ...closureDocPath))); checks++
 const otherDistUid = `${prefix}-other-dist`
 await root.collection('members').doc(otherDistUid).set({ role: 'distributor', active: true, routeId: 'otra-ruta-distinta', displayName: 'QA otro distribuidor' })
 const otherDistClient = env.authenticatedContext(otherDistUid).firestore()
 await assertFails(getDoc(doc(otherDistClient, ...closureDocPath))); checks++
 const whClient = env.authenticatedContext(warehouse).firestore()
 const otherWhUid = `${prefix}-other-wh`
 await root.collection('members').doc(otherWhUid).set({ role: 'warehouse', active: true, warehouseId: 'otro-almacen', displayName: 'QA otro almacén' })
 const otherWhClient = env.authenticatedContext(otherWhUid).firestore()
 await assertFails(getDoc(doc(otherWhClient, ...closureDocPath))); checks++
 ok((await getDoc(doc(client, ...closureDocPath))).exists(), 'distribuidor dueño de la ruta puede leer su cierre')
 ok((await getDoc(doc(whClient, ...closureDocPath))).exists(), 'almacén correspondiente puede leer el cierre')
 ok((await getDoc(doc(adminClient, ...closureDocPath))).exists(), 'administración puede leer el cierre')
 await assertFails(setDoc(doc(client, 'restaurants', 'pachax', 'distClosures', `${prefix}-forged-closure`), { restaurantId: 'pachax', routeId: route })); checks++
 await assertFails(setDoc(doc(adminClient, 'restaurants', 'pachax', 'distClosures', `${prefix}-forged-closure`), { restaurantId: 'pachax', routeId: route })); checks++
 await assertFails(setDoc(doc(client, ...closureDocPath), { physicalCashDeclared: 999, expectedCash: 999 }, { merge: true })); checks++
 await assertFails(setDoc(doc(adminClient, ...closureDocPath), { physicalCashDeclared: 999, expectedCash: 999 }, { merge: true })); checks++
 await assertFails(deleteDoc(doc(client, ...closureDocPath))); checks++
 await assertFails(deleteDoc(doc(adminClient, ...closureDocPath))); checks++
 await assertFails(setDoc(doc(client,'restaurants','pachax','distProducts',pid),{referencePrice:1},{merge:true}));checks++
 await command(admin,'reopen',{closureId:`closure_${dispatch.id}`},'rejected');checks++
 await command(admin,'reopen',{closureId:`closure_${dispatch.id}`,reason:'Reapertura administrativa QA'});ok((await read('distDispatches',dispatch.id)).status==='open','reapertura administrativa conserva el retorno recibido')
 const status=await command(seller,'creditStatus',{customerId:old});ok(!!status.result.oldestPendingAt,'consulta de crédito funciona con clientes anteriores')
 const foreignDebtId=`${prefix}-foreign-debt`
 await root.collection('distReceivables').doc(foreignDebtId).set({id:foreignDebtId,restaurantId:'pachax',customerId:cust,customerName:'Cliente de otra ruta',routeId:'otra-ruta',distributorUid:'otro-vendedor',originalAmount:12,paidAmount:0,balance:12,status:'OPEN',createdAt:new Date().toISOString(),dayKey:dayKey(new Date())})
 const globalCredits=await getDocs(collection(client,'restaurants','pachax','distReceivables'))
 ok(globalCredits.docs.some(entry=>entry.id===foreignDebtId),'distribuidor ve la cartera global aunque la deuda sea de otra ruta')
 const foreignCollection=await command(seller,'collection',{receivable:{id:foreignDebtId},amount:2,method:'cash'})
 ok((await read('distReceivables',foreignDebtId)).balance===10,'distribuidor puede cobrar una deuda originada por otra ruta')
 ok(foreignCollection.result.routeId===route&&foreignCollection.result.originRouteId==='otra-ruta','cobro cruzado entra a la caja del cobrador y conserva la ruta original')
 const cashSaleOld=await command(admin,'sale',{sourceLocation:'centralWarehouse',routeId:'route-directa',routeName:'Directa',customerId:old,lines:[{productId:pid,quantity:1,actualUnitPrice:10}],cashAmount:10,qrAmount:0,creditAmount:0,paymentKind:'cash'})
 ok(cashSaleOld.status==='confirmed','venta de contado permitida a cliente con créditos vencidos')
 const courtesySale=await command(admin,'sale',{sourceLocation:'centralWarehouse',routeId:'route-directa',routeName:'Directa',lines:[{productId:pid,quantity:1,actualUnitPrice:0}],saleKind:'courtesy',courtesyReason:'Muestra comercial QA',cashAmount:0,qrAmount:0,creditAmount:0,paymentKind:'cash'})
 ok(courtesySale.result.saleKind==='courtesy'&&courtesySale.result.total===0,'venta de cortesía descuenta stock con total cero')
 const override=await command(admin,'creditOverride',{customerId:old,reason:'Autorizado QA para cliente especial',days:7})
 ok(override.result.active===true,'excepción de crédito creada por administración')
 const creditSaleOverride=await command(admin,'sale',{sourceLocation:'centralWarehouse',routeId:'route-directa',routeName:'Directa',customerId:old,lines:[{productId:pid,quantity:1,actualUnitPrice:10}],cashAmount:0,qrAmount:0,creditAmount:10,paymentKind:'credit'})
 ok(creditSaleOverride.status==='confirmed'&&creditSaleOverride.result.creditOverrideId===override.result.id,'venta a crédito permitida con excepción activa')
 const [closeAttempts,racingSale]=await Promise.all([
  Promise.all([
   command(admin,'closure',{mode:'administrative',dayKey:dayKey(),declaredCash:45},'any'),
   command(admin,'closure',{mode:'administrative',dayKey:dayKey(),declaredCash:45},'any'),
  ]),
  command(admin,'sale',{sourceLocation:'centralWarehouse',lines:[{productId:pid2,quantity:1,actualUnitPrice:8}],cashAmount:8,qrAmount:0,creditAmount:0,paymentKind:'cash'},'any'),
 ])
 const adminClose=closeAttempts.find(row=>row.status==='confirmed')
 ok(closeAttempts.filter(row=>row.status==='confirmed').length===1&&closeAttempts.filter(row=>row.status==='rejected').length===1,'cierres administrativos concurrentes crean un único cierre sin estados contradictorios')
 const expectedCashForClose=37+(racingSale.status==='confirmed'?8:0)
 ok(adminClose.result.cashSales===36+(racingSale.status==='confirmed'?8:0)&&adminClose.result.creditSales===20&&adminClose.result.cashCollections===2&&adminClose.result.expensesTotal===1&&adminClose.result.expectedCash===expectedCashForClose&&adminClose.result.cashDifference===45-expectedCashForClose,'cierre y venta concurrentes se serializan: la venta entra al cierre o se rechaza íntegramente')
 await processCommand(db,root.collection('distOperations').doc(adminClose.id))
 ok((await root.collection('distClosures').where('closeType','==','administrative').get()).size===1,'reintento del mismo operationId no duplica cierre administrativo')
 const adminClosePath=['restaurants','pachax','distClosures',`admin_close_${dayKey()}`]
 const adminCloseBefore=(await read('distClosures',`admin_close_${dayKey()}`))
 ok((await getDoc(doc(env.authenticatedContext(admin).firestore(),...adminClosePath))).exists(),'administración puede consultar el cierre administrativo persistido')
 await assertFails(getDoc(doc(env.authenticatedContext(seller).firestore(),...adminClosePath)));checks++
 ok(true,'distribuidor no puede leer el cierre administrativo de la empresa')
 const lateSale=await command(admin,'sale',{sourceLocation:'centralWarehouse',lines:[{productId:pid,quantity:1,actualUnitPrice:10}],cashAmount:10,qrAmount:0,creditAmount:0,paymentKind:'cash'},'rejected')
 const lateCollection=await command(admin,'collection',{receivableId:adminCredit.id,amount:1,method:'cash'},'rejected')
 const lateExpense=await command(admin,'expense',{concept:'Gasto tardío QA',amount:1},'rejected')
 const lateClaim=await command(admin,'claim',{kind:'return'},'rejected')
 const lateDeleteExpense=await command(admin,'deleteExpense',{expenseId:adminExpense.id},'rejected')
 ok([lateSale,lateCollection,lateExpense,lateClaim,lateDeleteExpense].every(row=>row.error.includes('cerrada')),'ventas, cobros, gastos, ajustes y anulaciones financieras tardías se rechazan')
 ok((await read('distClosures',`admin_close_${dayKey()}`)).expectedCash===adminCloseBefore.expectedCash&&(await read('distAdministrativeDays',dayKey())).status==='closed','operaciones tardías conservan íntegro el cierre y el bloqueo del día')
 await command(seller,'closure',{mode:'administrative',dayKey:dayKey(),declaredCash:0},'rejected');checks++
 const mixedCollection=await command(seller,'collection',{customerId:old,amount:10,method:'mixed',cashAmount:6,qrAmount:4,routeId:route})
 ok(mixedCollection.result.allocations?.length===2,'cobro mixto aplica FIFO sobre deudas abiertas del cliente')
 ok(mixedCollection.result.cashAmount===6&&mixedCollection.result.qrAmount===4,'cobro mixto registra desglose exacto')
 const mixedQrVerificationDoc=['restaurants','pachax','distQrVerifications',`collection_${mixedCollection.id}`]
 await assertFails(setDoc(doc(adminClient,...mixedQrVerificationDoc),{id:`collection_${mixedCollection.id}`,restaurantId:'pachax',routeId:route,sourceType:'collection',sourceId:mixedCollection.id,amount:10,reference:'REF-BAD-TOTAL',verifiedBy:admin,verifiedAt:new Date().toISOString()}));checks++
 await setDoc(doc(adminClient,...mixedQrVerificationDoc),{id:`collection_${mixedCollection.id}`,restaurantId:'pachax',routeId:route,sourceType:'collection',sourceId:mixedCollection.id,amount:4,reference:'REF-VALID-QR',verifiedBy:admin,verifiedAt:new Date().toISOString()});checks++
 ok((await getDoc(doc(adminClient,...mixedQrVerificationDoc))).exists(),'verificación QR de cobro mixto exitosa con monto exacto qrAmount')
 const debtAId=`${prefix}-debt-A`,debtBId=`${prefix}-debt-B`
 await root.collection('distReceivables').doc(debtAId).set({id:debtAId,restaurantId:'pachax',customerId:cust,routeId:route,originalAmount:100,paidAmount:0,balance:100,createdAt:'2026-10-01T08:00:00.000Z'})
 await root.collection('distReceivables').doc(debtBId).set({id:debtBId,restaurantId:'pachax',customerId:cust,routeId:route,originalAmount:50,paidAmount:0,balance:50,createdAt:'2026-10-15T08:00:00.000Z'})
 const colIndiv=await command(seller,'collection',{receivableId:debtBId,amount:30,method:'cash',routeId:route})
 ok(colIndiv.result.allocations?.length===1&&colIndiv.result.allocations[0].receivableId===debtBId,'cobro individual genera exactamente 1 allocation')
 ok((await read('distReceivables',debtAId)).balance===100,'deuda A antigua permanece intacta tras cobro individual en B')
 ok((await read('distReceivables',debtBId)).balance===20,'deuda B se reduce a 20 tras cobro individual de 30')
 const colFifo=await command(seller,'collection',{customerId:cust,amount:30,method:'cash',routeId:route})
 ok(colFifo.result.allocations?.length===1&&colFifo.result.allocations[0].receivableId===debtAId,'cobro FIFO sin receivableId aplica a la deuda más antigua')
 ok((await read('distReceivables',debtAId)).balance===70,'deuda A antigua se reduce a 70')
 ok((await read('distReceivables',debtBId)).balance===20,'deuda B permanece en 20')
 await command(admin,'creditOverride',{customerId:old,reason:'Fecha pasada',validUntil:'2020-01-01T00:00:00Z'},'rejected');checks++
 await command(admin,'creditOverride',{customerId:old,reason:'Fecha basura',validUntil:'basura'},'rejected');checks++
 await command(admin,'creditOverride',{customerId:old,reason:'Dias exceso',days:31},'rejected');checks++
 await command(admin,'creditOverride',{customerId:old,reason:'Dias cero',days:0},'rejected');checks++
 const statusAfterGrant=await read('distCreditStatus',old)
 ok(statusAfterGrant?.blocked===false&&statusAfterGrant?.activeOverrideId===override.result.id,'distCreditStatus actualizado con blocked=false tras otorgar excepción')
 const overdueDebtId = prefix + '-old-overdue'
 await root.collection('distReceivables').doc(overdueDebtId).set({id:overdueDebtId,restaurantId:'pachax',customerId:old,routeId:route,originalAmount:20,paidAmount:0,balance:20,createdAt:new Date(Date.now()-8*86400000).toISOString()})
 const revokedOverride=await command(admin,'creditOverride',{overrideId:override.result.id,revoke:true})
 ok(revokedOverride.result.active===false,'excepción revocada por administración')
 const statusAfterRevoke=await read('distCreditStatus',old)
 ok(statusAfterRevoke?.blocked===true&&!statusAfterRevoke?.activeOverrideId,'distCreditStatus actualizado con blocked=true tras revocar excepción')
 const overrideDocPath=['restaurants','pachax','distCreditOverrides',override.result.id]
 await assertFails(getDoc(doc(unauthClient,...overrideDocPath)));checks++
 await assertFails(getDoc(doc(client,...overrideDocPath)));checks++
 await assertFails(getDoc(doc(whClient,...overrideDocPath)));checks++
 ok((await getDoc(doc(adminClient,...overrideDocPath))).exists(),'administración puede leer excepción de crédito')
 await assertFails(setDoc(doc(adminClient,...overrideDocPath),{active:false},{merge:true}));checks++
 await assertFails(setDoc(doc(client,...overrideDocPath),{active:false},{merge:true}));checks++
 const validPhoto='data:image/jpeg;base64,/9j/2Q=='
 await setDoc(doc(adminClient,'restaurants','pachax','distProducts',pid2),{photoDataUrl:validPhoto},{merge:true});checks++
 await assertFails(setDoc(doc(adminClient,'restaurants','pachax','distProducts',pid2),{photoDataUrl:'data:image/png;base64,AAAA'},{merge:true}));checks++
 await assertFails(setDoc(doc(adminClient,'restaurants','pachax','distProducts',pid2),{photoDataUrl:`data:image/jpeg;base64,${'A'.repeat(150001)}`},{merge:true}));checks++
 const customerId=`${prefix}-ci`,ci=String(Date.now()).slice(-11),createdAt=new Date().toISOString()
 const customerData={id:customerId,restaurantId:'pachax',name:'Cliente CI',identityNumber:ci,customerCode:ci,createdAt,createdBy:seller}
 const batch=writeBatch(client);batch.set(doc(client,'restaurants','pachax','distCustomers',customerId),customerData);batch.set(doc(client,'restaurants','pachax','distCustomerIdentities',ci),{restaurantId:'pachax',identityNumber:ci,customerId});await batch.commit();checks++
 await assertFails(setDoc(doc(client,'restaurants','pachax','distCustomers',`${customerId}-duplicate`),{...customerData,id:`${customerId}-duplicate`}));checks++
 await assertFails(setDoc(doc(client,'restaurants','pachax','distCustomers',customerId),{customerCode:'OTRO'},{merge:true}));checks++
 await assertFails(setDoc(doc(client,'restaurants','pachax','distCustomers',customerId),{photoDataUrl:'x'.repeat(130001)},{merge:true}));checks++
 const signIn=async(email,password)=>{const response=await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});return {response,data:await response.json()}}
 const adminSignIn=await signIn(`${prefix}-admin@example.test`,'Inicial123')
 const memberCall=async payload=>{const response=await fetch('http://127.0.0.1:5101/demo-pachax-platform/us-central1/changePachaxMemberPassword',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${adminSignIn.data.idToken}`},body:JSON.stringify({data:payload})});return {response,data:await response.json()}}
 const passwordCall=(await memberCall({action:'changePassword',uid:passwordTarget,password:'NuevaClave123'})).response
 ok(passwordCall.ok,'Administración puede cambiar directamente la contraseña de otro usuario')
 const targetSignIn=await signIn(`${prefix}-target@example.test`,'NuevaClave123')
 ok(targetSignIn.response.ok,'la nueva contraseña permite iniciar sesión')
 const changedEmail=`${prefix}-target-edited@example.test`
 const edited=await memberCall({action:'updateMember',uid:passwordTarget,displayName:'Responsable editado',email:changedEmail,role:'distributor',active:true,routeId:route})
 const editedMember=await read('members',passwordTarget),editedMap=(await db.collection('users').doc(passwordTarget).get()).data(),editedAuth=await adminAuth.getUser(passwordTarget)
 ok(edited.response.ok&&editedMember.displayName==='Responsable editado'&&editedMember.email===changedEmail&&editedMap.email===changedEmail&&editedAuth.email===changedEmail,'edición coordina nombre y correo en acceso y perfil')
 ok((await signIn(changedEmail,'NuevaClave123')).response.ok,'el correo nuevo permite iniciar sesión')
 await assertFails(setDoc(doc(adminClient,'restaurants','pachax','members',passwordTarget),{displayName:'Cambio directo prohibido'},{merge:true}));checks++
 const lastAdmin=await memberCall({action:'updateMember',uid:admin,active:false})
 ok(!lastAdmin.response.ok&&!(await adminAuth.getUser(admin)).disabled&&(await read('members',admin)).active===true,'no se puede desactivar la última cuenta administrativa')
 const removable=`${prefix}-removable`,removableEmail=`${prefix}-removable@example.test`
 await adminAuth.createUser({uid:removable,email:removableEmail,password:'Eliminar123'})
 await root.collection('members').doc(removable).set({uid:removable,email:removableEmail,displayName:'Usuario eliminable',role:'warehouse',active:true,warehouseId:wh,routeId:''})
 await db.collection('users').doc(removable).set({uid:removable,email:removableEmail,displayName:'Usuario eliminable',defaultRestaurantId:'pachax'})
 const deletedMember=await memberCall({action:'deleteMember',uid:removable})
 let deletedFromAuth=false;try{await adminAuth.getUser(removable)}catch(error){deletedFromAuth=error.code==='auth/user-not-found'}
 ok(deletedMember.response.ok&&deletedFromAuth&&!(await root.collection('members').doc(removable).get()).exists&&!(await db.collection('users').doc(removable).get()).exists,'eliminar retira acceso, perfil y mapa del usuario')
 const deleteSelf=await memberCall({action:'deleteMember',uid:admin})
 ok(!deleteSelf.response.ok&&(await root.collection('members').doc(admin).get()).exists,'Administración no puede eliminar su propia cuenta')

 const support=`${prefix}-support`
 await adminAuth.createUser({uid:support,email:`${prefix}-support@example.test`,password:'Soporte123'})
 await root.collection('members').doc(support).set({uid:support,email:`${prefix}-support@example.test`,displayName:'QA soporte',role:'support',active:true,createdAt:new Date().toISOString(),routeId:'',warehouseId:'central'})
 const supportClient=env.authenticatedContext(support).firestore()
 await assertFails(getDocs(collection(supportClient,'restaurants','pachax','distSales')));checks++
 await assertFails(getDocs(collection(supportClient,'restaurants','pachax','distCustomers')));checks++
 await assertFails(getDocs(collection(supportClient,'restaurants','pachax','distProducts')));checks++
 await assertFails(getDocs(collection(supportClient,'restaurants','pachax','distClosures')));checks++
 await assertFails(getDoc(doc(supportClient,'restaurants','pachax','distClosures',`closure_${dispatch.id}`)));checks++
 const supportSettings={restaurantId:'pachax',expiryAlertDays:14,creditBlockDays:7,requireQrVerification:true,updatedAt:new Date().toISOString(),updatedBy:support}
 await assertFails(setDoc(doc(supportClient,'restaurants','pachax','supportConfig','main'),supportSettings));checks++
 const adminSettings={restaurantId:'pachax',expiryAlertDays:14,creditBlockDays:7,requireQrVerification:true,updatedAt:new Date().toISOString(),updatedBy:admin}
 await setDoc(doc(adminClient,'restaurants','pachax','supportConfig','main'),adminSettings);checks++
 ok((await getDoc(doc(supportClient,'restaurants','pachax','supportConfig','main'))).data().creditBlockDays===7,'Soporte puede leer configuración técnica pero no modificarla')
 const warehouseClient=env.authenticatedContext(warehouse).firestore()
 for (const [role, roleClient] of [['Administración', adminClient], ['Almacén', warehouseClient], ['Distribuidor', client]]) {
  const settingsQuery=await getDocs(collection(roleClient,'restaurants','pachax','supportConfig'))
  ok(settingsQuery.docs.some(entry=>entry.id==='main'),`${role} puede suscribirse a la configuración operativa`)
 }
 const ownerTenantId=`${prefix}-owner-tenant`,ownerUid=`${prefix}-tenant-owner`,ownerRoot=db.doc(`tenants/${ownerTenantId}`)
 await ownerRoot.set({tenantId:ownerTenantId,businessType:'route_distribution',configuration:{features:{sales:true,credits:true,routes:true,dispatch:true,inventory:true,customers:true,reports:true,settings:true,users:true}}})
 await ownerRoot.collection('members').doc(ownerUid).set({tenantId:ownerTenantId,status:'active',roleId:'owner',branchIds:['main']})
 const ownerCloseRef=ownerRoot.collection('distOperations').doc(`${prefix}-owner-close`)
 await ownerCloseRef.set({id:ownerCloseRef.id,tenantId:ownerTenantId,branchId:'main',createdBy:ownerUid,createdAt:new Date().toISOString(),type:'closure',payload:{mode:'administrative',dayKey:dayKey(),declaredCash:0},status:'queued'})
 await processCommand(db,ownerCloseRef)
 const ownerClose=(await ownerCloseRef.get()).data()
 ok(ownerClose.status==='confirmed'&&ownerClose.result.closeType==='administrative','tenant owner con permiso canónico puede cerrar la caja administrativa')
 const ownerLateSaleRef=ownerRoot.collection('distOperations').doc(`${prefix}-owner-late-sale`)
 await ownerLateSaleRef.set({id:ownerLateSaleRef.id,tenantId:ownerTenantId,branchId:'main',createdBy:ownerUid,createdAt:new Date().toISOString(),type:'sale',payload:{sourceLocation:'centralWarehouse',lines:[],cashAmount:0,qrAmount:0,creditAmount:0,paymentKind:'cash'},status:'queued'})
 await processCommand(db,ownerLateSaleRef)
 ok((await ownerLateSaleRef.get()).data().status==='rejected','venta del tenant owner también respeta el bloqueo de jornada cerrada')
 const supportRequest={auth:{uid:support,token:{auth_time:Math.floor(Date.now()/1000)}},data:{}}
 const preview=await prepareCleanDelivery(db,supportRequest)
 ok(preview.totalDocuments>0&&preview.counts.distSales>0,'entrega limpia muestra conteo sin devolver datos comerciales')
 const reset=await executeCleanDelivery(db,{...supportRequest,data:{requestId:preview.requestId,phrase:'LIMPIAR PACHAX',acknowledgement:true}})
 ok(reset.deletedDocuments>0&&(await root.collection('distSales').get()).empty,'entrega limpia respalda y elimina los datos operativos')
 ok((await root.collection('distProducts').doc(pid).get()).exists&&(await root.collection('members').doc(support).get()).exists&&(await root.collection('distWarehouses').doc(wh).get()).exists,'entrega limpia conserva productos, usuarios y almacenes')
 const backup=await root.collection('maintenanceBackups').doc(reset.backupId).get()
 ok(backup.data().status==='complete'&&backup.data().documentCount>0,'respaldo restringido queda completo antes de finalizar la limpieza')
 fs.writeFileSync('docs/qa-pachax/server-operations-result.json',JSON.stringify({passed:true,checks,at:new Date().toISOString()},null,2))
 console.log(`${checks} comprobaciones aprobadas`)
}finally{await env.cleanup()}
