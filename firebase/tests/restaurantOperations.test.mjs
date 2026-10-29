import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { calculateCashShiftSummary } from '../../src/modules/restaurant/domain/cashEngine.ts'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('QA permitido solo en demo-pachax-platform.')
}
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { getTemplate } = require('./generated/templates.js')
const { executeRestaurantCommand } = require('./restaurant.cjs')
const { manageMember } = require('./tenants.cjs')
const { completeOnboarding } = require('./onboarding.cjs')

const suffix = Date.now().toString(36)
const tenantId = `rest_${suffix}`
const otherTenantId = `other_${suffix}`
const app = initializeApp({ projectId }, `restaurant-operations-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
const root = db.doc(`tenants/${tenantId}`)
const otherRoot = db.doc(`tenants/${otherTenantId}`)

const call = (uid, commandType, operationId, payload = {}, tId = tenantId) =>
  executeRestaurantCommand(db, {
    auth: { uid },
    data: { tenantId: tId, branchId: 'main', commandType, operationId, payload },
  })

const data = async path => (await root.collection(path.split('/')[0]).doc(path.split('/')[1]).get()).data()

try {
  console.log('--- Configurando tenants de prueba ---')
  const template = getTemplate('restaurant_pos')

  // Setup Tenant Principal (Restaurante)
  await root.set({ tenantId, name: 'Restaurante QA', businessType: 'restaurant_pos', configuration: template.defaults })
  await root.collection('branches').doc('main').set({ id: 'main', name: 'Principal', active: true })
  for (const role of template.roles) {
    await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  }

  // Members: owner, admin, cashier, waiter, kitchen
  for (const [uid, roleId] of [
    ['owner_user', 'owner'],
    ['admin_user', 'admin'],
    ['cashier_user', 'cashier'],
    ['waiter_user', 'waiter'],
    ['kitchen_user', 'kitchen'],
  ]) {
    await root.collection('members').doc(uid).set({
      uid,
      tenantId,
      roleId,
      status: 'active',
      branchIds: ['main'],
    })
  }

  // Setup Other Tenant (Aislamiento)
  await otherRoot.set({ tenantId: otherTenantId, name: 'Otro Restaurante QA', businessType: 'restaurant_pos', configuration: template.defaults })
  for (const role of template.roles) {
    await otherRoot.collection('roles').doc(role.id).set({ ...role, tenantId: otherTenantId })
  }
  await otherRoot.collection('members').doc('other_waiter').set({
    uid: 'other_waiter',
    tenantId: otherTenantId,
    roleId: 'waiter',
    status: 'active',
    branchIds: ['main'],
  })

  // 1. Verificar Rechazo de Turno Sin Permisos
  console.log('1. Validando permisos de inicio de turno...')
  await assert.rejects(
    () => call('waiter_user', 'openShift', 'shift-waiter-fail', { openingFloat: 100 }),
    err => err.code === 'permission-denied',
    'El mesero no debe poder abrir turno de caja'
  )

  // 2. Abrir Turno con Cajero
  console.log('2. Apertura de turno por cajero...')
  const shiftRes = await call('cashier_user', 'openShift', 'shift-op-1', { openingFloat: 150 })
  assert.ok(shiftRes.shiftId)
  assert.equal(shiftRes.openingFloat, 150)

  const activeShift = (await root.collection('restaurantOperationalState').doc('main').get()).data()
  assert.equal(activeShift.activeShiftId, shiftRes.shiftId)
  console.log('PASS Turno abierto correctamente en estado operativo.')

  // 2b. Intentar abrir segundo turno debe fallar
  await assert.rejects(
    () => call('cashier_user', 'openShift', 'shift-op-duplicate', { openingFloat: 100 }),
    err => err.code === 'failed-precondition',
    'No se puede abrir dos turnos simultáneos'
  )
  console.log('PASS Rechazo de múltiples turnos activos.')

  // 3. Crear Sector y Mesa vía FloorAction (Admin)
  console.log('3. Administrar plano con floorAction...')
  await assert.rejects(
    () => call('waiter_user', 'floorAction', 'floor-waiter-fail', { action: { type: 'sector.create', id: 'sec-main', name: 'Salón Principal' } }),
    err => err.code === 'permission-denied',
    'Mesero no puede configurar plano'
  )

  await call('admin_user', 'floorAction', 'floor-sec-1', {
    action: { type: 'sector.create', id: 'sec-main', name: 'Salón Principal' },
  })
  const secData = (await root.collection('restaurantSectors').doc('sec-main').get()).data()
  assert.equal(secData.name, 'Salón Principal')

  await call('admin_user', 'floorAction', 'floor-tbl-1', {
    action: { type: 'table.create', id: 'tbl-1', name: 'Mesa 1', sectorId: 'sec-main', capacity: 4, shape: 'square', active: true },
  })
  const tblData = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblData.name, 'Mesa 1')
  assert.equal(tblData.status, 'available')
  console.log('PASS Sector y mesa creados con validaciones y permisos.')

  // 4. Crear Producto
  await call('admin_user', 'saveProduct', 'prod-pizza-op', {
    product: {
      id: 'pizza-artesanal',
      name: 'Pizza Artesanal',
      price: 65,
      categoryId: 'cat-pizzas',
      preparationArea: 'Cocina',
    },
  })
  const prodData = (await root.collection('products').doc('pizza-artesanal').get()).data()
  assert.equal(prodData.price, 65)
  console.log('PASS Producto registrado en el catálogo del tenant.')

  // 5. Abrir Mesa (Mesero)
  console.log('5. Apertura de mesa...')
  const openRes = await call('waiter_user', 'openTableOrder', 'open-tbl-1', {
    tableId: 'tbl-1',
    diners: 3,
    customerName: 'Carlos Siles',
  })
  assert.ok(openRes.orderId)
  assert.equal(openRes.tableId, 'tbl-1')

  const updatedTbl = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(updatedTbl.status, 'occupied')
  assert.equal(updatedTbl.activeOrderId, openRes.orderId)

  // Intentar abrir la misma mesa nuevamente debe fallar
  await assert.rejects(
    () => call('waiter_user', 'openTableOrder', 'open-tbl-again', { tableId: 'tbl-1' }),
    err => err.code === 'aborted',
    'No se puede abrir una mesa ya ocupada'
  )
  console.log('PASS Mesa ocupada atómicamente y protegida contra aperturas duplicadas.')

  // 6. Añadir Producto a la Mesa
  console.log('6. Añadir productos a la comanda...')
  const addRes = await call('waiter_user', 'addProduct', 'add-items-1', {
    orderId: openRes.orderId,
    input: { productId: 'pizza-artesanal', quantity: 2, note: 'Sin orégano' },
  })
  assert.equal(addRes.total, 130)

  const orderAfterAdd = (await root.collection('restaurantOrders').doc(openRes.orderId).get()).data()
  assert.equal(orderAfterAdd.total, 130)
  assert.equal(orderAfterAdd.items.length, 1)
  assert.equal(orderAfterAdd.items[0].lineTotal, 130)
  console.log('PASS Productos agregados y totales recalculados.')

  // 7. Flujo KDS Cocina: pending -> preparing -> ready -> delivered
  console.log('7. Transiciones de estado KDS cocina...')
  const kds1 = await call('kitchen_user', 'advanceStatus', 'kds-prep', { orderId: openRes.orderId })
  assert.equal(kds1.status, 'preparing')

  const kds2 = await call('kitchen_user', 'advanceStatus', 'kds-ready', { orderId: openRes.orderId })
  assert.equal(kds2.status, 'ready')

  const kds3 = await call('waiter_user', 'advanceStatus', 'kds-delivered', { orderId: openRes.orderId })
  assert.equal(kds3.status, 'delivered')
  console.log('PASS Estados de preparación y entrega auditados correctamente.')

  // 8. Pedir Cuenta y Verificar Bloqueo de Cierre de Turno
  console.log('8. Pedido de cuenta y bloqueo de cierre con saldos pendientes...')
  await call('waiter_user', 'requestBill', 'req-bill-1', { tableId: 'tbl-1' })
  const tblBill = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblBill.status, 'bill_requested')

  // Intento de cerrar turno con cuenta pendiente debe fallar
  await assert.rejects(
    () => call('cashier_user', 'closeShift', 'close-premature', { countedCash: 280 }),
    err => err.code === 'failed-precondition',
    'No se puede cerrar turno con pedidos pendientes de cobro'
  )
  console.log('PASS Cierre de caja bloqueado correctamente ante cuentas por cobrar.')

  // 9. Cobro Atómico
  console.log('9. Liquidación y cobro de la cuenta...')
  const payRes = await call('cashier_user', 'recordPayment', 'pay-op-1', {
    orderId: openRes.orderId,
    method: 'cash',
    received: 150,
  })
  assert.equal(payRes.total, 130)
  assert.equal(payRes.change, 20)

  // Mesa debe liberarse automáticamente
  const tblFreed = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblFreed.status, 'available')
  assert.equal(tblFreed.activeOrderId, null)

  const paidOrder = (await root.collection('restaurantOrders').doc(openRes.orderId).get()).data()
  assert.equal(paidOrder.paymentStatus, 'paid')
  assert.equal(paidOrder.accountStatus, 'closed')
  console.log('PASS Cobro registrado, cambio calculado y mesa liberada.')

  // 10. Cerrar Turno
  console.log('10. Cierre y arqueo de turno...')
  // Fondo inicial 150 + Venta efectivo 130 = 280 efectivo esperado
  const closeRes = await call('cashier_user', 'closeShift', 'close-op-final', {
    countedCash: 280,
  })
  assert.equal(closeRes.expectedCash, 280)
  assert.equal(closeRes.difference, 0)

  const finalState = (await root.collection('restaurantOperationalState').doc('main').get()).data()
  assert.equal(finalState.activeShiftId, null)

  const closedShiftDoc = (await root.collection('restaurantShifts').doc(shiftRes.shiftId).get()).data()
  assert.equal(closedShiftDoc.status, 'closed')
  assert.equal(closedShiftDoc.reconciliationStatus, 'balanced')
  console.log('PASS Turno cerrado y conciliado con arqueo exacto.')

  // 11. Idempotencia y Resistencia a Reintentos
  console.log('11. Verificando idempotencia...')
  const retryRes = await call('cashier_user', 'closeShift', 'close-op-final', {
    countedCash: 280,
  })
  assert.equal(retryRes.expectedCash, 280)

  // Reintento con mismo ID pero payload distinto debe ser rechazado
  await assert.rejects(
    () => call('cashier_user', 'closeShift', 'close-op-final', { countedCash: 999 }),
    err => err.code === 'already-exists',
    'operationId con payload modificado debe ser rechazado'
  )
  console.log('PASS Idempotencia comprobada contra reintentos y mutaciones.')

  // 12. Aislamiento Multi-Tenant Estricto
  console.log('12. Verificando aislamiento multi-tenant...')
  // Usuario de Tenant B no puede ejecutar comandos en Tenant A
  await assert.rejects(
    () => call('other_waiter', 'openTableOrder', 'cross-tenant-op', { tableId: 'tbl-1' }, tenantId),
    err => err.code === 'permission-denied',
    'Usuario de otra empresa no puede interactuar con el tenant'
  )

  // Usuario no existente o sin membresía no puede interactuar
  await assert.rejects(
    () => call('hacker_user', 'openTableOrder', 'hack-op', { tableId: 'tbl-1' }, tenantId),
    err => err.code === 'permission-denied',
    'Usuario sin membresía activa es rechazado'
  )
  console.log('PASS Aislamiento tenant verificado: ningún cruce entre empresas ni roles externos.')

  // 13. Guardar Cliente y Normalizar Teléfono
  console.log('13. Creación de cliente y normalización...')
  const custRes = await call('cashier_user', 'saveCustomer', 'cust-op-1', {
    customer: { firstName: 'Mario', lastName: 'Guzmán', phone: '70712345', countryCode: '591' },
  })
  assert.ok(custRes.customerId)
  assert.equal(custRes.customer.firstName, 'Mario')
  assert.equal(custRes.customer.normalizedPhone, '59170712345')
  const custInDb = (await root.collection('restaurantCustomers').doc(custRes.customerId).get()).data()
  assert.equal(custInDb.firstName, 'Mario')
  assert.equal(custInDb.normalizedPhone, '59170712345')
  assert.equal(custInDb.active, true)
  console.log('PASS Cliente creado y persistido con teléfono normalizado.')

  // 14. Archivar Cliente
  console.log('14. Archivo de cliente...')
  const archRes = await call('admin_user', 'archiveCustomer', 'cust-arch-1', {
    customerId: custRes.customerId,
  })
  assert.equal(archRes.active, false)
  const custArchived = (await root.collection('restaurantCustomers').doc(custRes.customerId).get()).data()
  assert.equal(custArchived.active, false)
  console.log('PASS Cliente archivado correctamente.')

  // 15. Guardar Catálogo de Productos por Lote
  console.log('15. Guardado de catálogo con control de inventario...')
  await call('admin_user', 'saveProducts', 'prods-batch-1', {
    products: [
      { id: 'burger-special', name: 'Hamburguesa Especial', price: 45, stockBase: 20, preparationArea: 'Cocina' },
    ],
  })
  const burgerInDb = (await root.collection('products').doc('burger-special').get()).data()
  assert.equal(burgerInDb.stockBase, 20)
  assert.equal(burgerInDb.price, 45)
  console.log('PASS Catálogo guardado en batch con stock base configurado.')

  // 16. Ajuste Manual de Inventario
  console.log('16. Ajuste manual de inventario...')
  const movRes = await call('admin_user', 'recordInventoryMovement', 'inv-mov-1', {
    productId: 'burger-special',
    nextStock: 25,
    type: 'manual_adjustment',
    reason: 'Ingreso inicial por conteo',
  })
  assert.equal(movRes.nextStock, 25)
  const burgerAfterAdj = (await root.collection('products').doc('burger-special').get()).data()
  assert.equal(burgerAfterAdj.stockBase, 25)

  const movDoc = (await root.collection('restaurantInventoryMovements').doc(movRes.movementId).get()).data()
  assert.equal(movDoc.type, 'manual_adjustment')
  assert.equal(movDoc.quantityBase, 5)
  assert.equal(movDoc.newStock, 25)
  console.log('PASS Movimiento manual de inventario registrado y stock recalculado.')

  // 17. Apertura de Segundo Turno y Venta con Deducción de Stock
  console.log('17. Deducción de stock automática en pedido...')
  const shift2 = await call('cashier_user', 'openShift', 'shift-op-2', { openingFloat: 200 })
  const ord2 = await call('waiter_user', 'addOrder', 'ord-stock-1', {
    order: {
      displayNumber: '#2001',
      items: [{ productId: 'burger-special', name: 'Hamburguesa Especial', price: 45, quantity: 2 }],
    },
  })
  const burgerAfterSale = (await root.collection('products').doc('burger-special').get()).data()
  assert.equal(burgerAfterSale.stockBase, 23) // 25 - 2 = 23
  console.log('PASS Stock deducido atómicamente al confirmar pedido.')

  // 18. Asignar Cliente a la Orden
  console.log('18. Asignar cliente a pedido...')
  const assignRes = await call('waiter_user', 'assignCustomer', 'assign-cust-1', {
    orderId: ord2.orderId,
    customerId: custRes.customerId,
  })
  assert.equal(assignRes.customerId, custRes.customerId)
  const ordWithCust = (await root.collection('restaurantOrders').doc(ord2.orderId).get()).data()
  assert.equal(ordWithCust.customerId, custRes.customerId)
  assert.equal(ordWithCust.customerName, 'Mario Guzmán')
  console.log('PASS Cliente asignado al pedido con datos consolidados.')

  // 19. Conteo Físico de Turno
  console.log('19. Registro de conteo físico en turno...')
  await call('admin_user', 'countInventoryItem', 'count-item-1', {
    productId: 'burger-special',
    physical: 23,
    note: 'Conteo validado en turno',
  })
  const shiftWithCount = (await root.collection('restaurantShifts').doc(shift2.shiftId).get()).data()
  assert.equal(shiftWithCount.inventoryCounts['burger-special'].physical, 23)
  console.log('PASS Conteo físico persistido dentro del turno activo.')

  // 20. Devolución de Stock al Anular Pedido
  console.log('20. Retorno de stock por anulación de pedido...')
  await call('waiter_user', 'cancelOrder', 'cancel-ord-stock', {
    orderId: ord2.orderId,
    reason: 'Cancelado antes de producción',
  })
  const burgerAfterCancel = (await root.collection('products').doc('burger-special').get()).data()
  assert.equal(burgerAfterCancel.stockBase, 25) // 23 + 2 = 25 restaurado
  await call('cashier_user', 'closeShift', 'close-shift-2', { countedCash: 200 })
  console.log('PASS Stock devuelto automáticamente con movimiento cancellation_return y turno cerrado.')

  // 21. Validación estricta de contraseña en creación de empleados (backend)
  console.log('21. Validación estricta de contraseña en creación de miembros...')
  await assert.rejects(
    () => manageMember(db, auth, {
      auth: { uid: 'admin_user' },
      data: {
        action: 'createMember',
        tenantId,
        operationId: 'bad-pass-empty',
        email: 'staff_empty@example.test',
        displayName: 'Sin Contraseña',
        roleId: 'waiter',
        password: '',
      },
    }),
    err => err.code === 'invalid-argument',
    'Contraseña vacía debe ser rechazada con invalid-argument'
  )

  await assert.rejects(
    () => manageMember(db, auth, {
      auth: { uid: 'admin_user' },
      data: {
        action: 'createMember',
        tenantId,
        operationId: 'bad-pass-short',
        email: 'staff_short@example.test',
        displayName: 'Corta',
        roleId: 'waiter',
        password: '1234567',
      },
    }),
    err => err.code === 'invalid-argument',
    'Contraseña menor a 8 caracteres debe ser rechazada con invalid-argument'
  )

  await assert.rejects(
    () => manageMember(db, auth, {
      auth: { uid: 'admin_user' },
      data: {
        action: 'createMember',
        tenantId,
        operationId: 'bad-pass-null',
        email: 'staff_null@example.test',
        displayName: 'Nula',
        roleId: 'waiter',
        password: null,
      },
    }),
    err => err.code === 'invalid-argument',
    'Contraseña nula o no string debe ser rechazada'
  )
  console.log('PASS Contraseñas inválidas (< 8 caracteres, vacías o nulas) rechazadas por el backend.')

  // 22. Control de permisos: usuario sin permiso no puede crear personal
  console.log('22. Control de permisos: mesero no puede crear personal...')
  await assert.rejects(
    () => manageMember(db, auth, {
      auth: { uid: 'waiter_user' },
      data: {
        action: 'createMember',
        tenantId,
        operationId: 'waiter-create-staff',
        email: 'staff_unauth@example.test',
        displayName: 'Intento Mesero',
        roleId: 'waiter',
        password: 'SecurePassword123!',
      },
    }),
    err => err.code === 'permission-denied',
    'Usuario sin permiso users.manage debe ser rechazado'
  )
  console.log('PASS Permiso users.manage validado estrictamente en backend.')

  // 23. Creación exitosa de personal con contraseña válida (>= 8 caracteres)
  console.log('23. Creación exitosa de personal con contraseña >= 8 caracteres...')
  const newStaffRes = await manageMember(db, auth, {
    auth: { uid: 'admin_user' },
    data: {
      action: 'createMember',
      tenantId,
      operationId: 'staff-valid-1',
      email: `staff_${suffix}@example.test`,
      displayName: 'Mesero Verificado',
      roleId: 'waiter',
      password: 'SecureStaffPassword2026!',
    },
  })
  assert.ok(newStaffRes.uid)
  const authUser = await auth.getUser(newStaffRes.uid)
  assert.equal(authUser.email, `staff_${suffix}@example.test`)
  assert.equal(authUser.displayName, 'Mesero Verificado')
  console.log('PASS Usuario creado exitosamente en Auth.')

  // 24. Verificación de seguridad: no persistencia de contraseña, auditoría segura y ausencia de fallback fijo
  console.log('24. Verificación de seguridad de contraseña y ausencia de fallback fijo...')
  const memberDoc = (await root.collection('members').doc(newStaffRes.uid).get()).data()
  assert.ok(memberDoc)
  assert.equal('password' in memberDoc, false, 'La contraseña NUNCA debe guardarse en Firestore')
  assert.equal('credential' in memberDoc, false, 'No deben existir credenciales en Firestore')
  assert.equal(memberDoc.roleId, 'waiter')
  assert.equal(memberDoc.status, 'active')

  const auditLogs = await root.collection('auditLogs').where('action', '==', 'member.created').get()
  assert.ok(auditLogs.size > 0)
  for (const doc of auditLogs.docs) {
    const rawAudit = JSON.stringify(doc.data())
    assert.equal(rawAudit.includes('SecureStaffPassword2026!'), false, 'La contraseña jamás debe aparecer en logs de auditoría')
  }

  // Comprobar ausencia absoluta de fallback Pachax123! en código fuente de frontend
  const repoFiles = ['src/demo/restaurant/RestaurantUsers.tsx', 'src/services/restaurant/restaurantRepository.ts', 'src/public/register/PublicRegisterView.tsx']
  for (const file of repoFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8')
      assert.equal(content.includes('Pachax123!'), false, `El archivo ${file} no debe contener la contraseña default Pachax123!`)
    }
  }
  console.log('PASS Contraseña no persistida en base de datos ni auditoría, y fallback eliminado del código.')

  // 25. Verificación de Onboarding Reanudable e Idempotente para Restaurante
  console.log('25. Verificación de onboarding seguro y reanudable...')
  const onbUid = `onb_user_${suffix}`
  await auth.createUser({
    uid: onbUid,
    email: `owner_${suffix}@example.test`,
    password: 'OwnerPassword2026!',
    displayName: 'Owner Restaurante',
  })

  // Caso A: Primer onboarding
  const onbRes1 = await completeOnboarding(db, auth, {
    auth: { uid: onbUid },
    data: {
      action: 'completeOnboarding',
      requestId: `onb-req-1-${suffix}`,
      companyName: 'Restaurante El Valle',
      businessType: 'restaurant_pos',
      branding: { primary: '#20383a', accent: '#b58a55' },
    },
  })
  assert.ok(onbRes1.tenantId)
  assert.equal(onbRes1.template.businessType, 'restaurant_pos')
  assert.equal(onbRes1.membership.roleId, 'owner')

  const onbTenantData = (await db.doc(`tenants/${onbRes1.tenantId}`).get()).data()
  assert.equal(onbTenantData.planKey, null, 'No debe autoasignar plan pago')
  assert.equal(onbTenantData.subscriptionStatus, 'trial', 'Debe iniciar en período de prueba (trial)')
  assert.equal(onbTenantData.businessType, 'restaurant_pos')

  // Caso B: Reintento/Reanudación con la misma cuenta existente (idempotente)
  const onbRes2 = await completeOnboarding(db, auth, {
    auth: { uid: onbUid },
    data: {
      action: 'completeOnboarding',
      requestId: `onb-req-retry-${suffix}`,
      companyName: 'Restaurante El Valle',
      businessType: 'restaurant_pos',
      branding: { primary: '#20383a', accent: '#b58a55' },
    },
  })
  assert.equal(onbRes2.tenantId, onbRes1.tenantId, 'El reintento debe devolver el mismo tenant determinístico')
  assert.equal(onbRes2.onboarding.status, 'complete')

  console.log('PASS Onboarding reanudable, idempotente, con trial y sin auto-paid plan.')

  // 26. Rechazo de tenant con businessType ajeno a la familia Restaurante
  console.log('26. Verificando que businessType ajeno (ej. route_distribution) es rechazado...')
  const distTenantId = `dist_${suffix}`
  const distRoot = db.doc(`tenants/${distTenantId}`)
  const distTemplate = getTemplate('route_distribution')
  await distRoot.set({ tenantId: distTenantId, name: 'Distribuidora QA', businessType: 'route_distribution', configuration: distTemplate.defaults })
  await distRoot.collection('branches').doc('main').set({ id: 'main', name: 'Principal', active: true })
  for (const role of distTemplate.roles) {
    await distRoot.collection('roles').doc(role.id).set({ ...role, tenantId: distTenantId })
  }
  await distRoot.collection('members').doc('dist_owner').set({
    uid: 'dist_owner',
    tenantId: distTenantId,
    roleId: 'owner',
    status: 'active',
    branchIds: ['main'],
  })
  await assert.rejects(
    () => call('dist_owner', 'saveProduct', 'prod-dist-fail', { product: { id: 'dist_p1', name: 'Insumo Distribuidora', price: 10 } }, distTenantId),
    err => err.code === 'failed-precondition' && err.message.includes('compatible con Restaurante'),
    'Tenant route_distribution debe ser rechazado por restaurantCommand'
  )
  console.log('PASS Tenant ajeno a Restaurante rechazado correctamente.')

  // 27. Setup de Tenant hamburger_shop (Restaurante de Servicio Rápido)
  console.log('27. Setup y apertura de turno en tenant hamburger_shop...')
  const hambTenantId = `hamb_${suffix}`
  const hambRoot = db.doc(`tenants/${hambTenantId}`)
  const hambTemplate = getTemplate('hamburger_shop')
  await hambRoot.set({ tenantId: hambTenantId, name: 'Burger Express QA', businessType: 'hamburger_shop',
    billingEnforcement: true, subscriptionStatus: 'active', billingAccessUntil: new Date(Date.now() + 30 * 86_400_000),
    commercialCapabilities: { version: 1, businessType: 'hamburger_shop', limits: { activeUsers: 100, activeProducts: 200, activeBranches: 1 },
      features: { reports: { basic: true, detailed: false, export: false }, receipts: { digital: false },
        printing: { manual: false, kitchenAutomatic: false }, adsRequired: false } },
    configuration: hambTemplate.defaults })
  await hambRoot.collection('commercialUsage').doc('active').set({ activeUsers: 4, activeProducts: 0, activeBranches: 1 })
  await hambRoot.collection('branches').doc('main').set({ id: 'main', name: 'Principal', active: true })
  for (const role of hambTemplate.roles) {
    await hambRoot.collection('roles').doc(role.id).set({ ...role, tenantId: hambTenantId })
  }
  for (const [uid, roleId] of [
    ['hamb_owner', 'owner'],
    ['hamb_cashier', 'cashier'],
    ['hamb_kitchen', 'kitchen'],
    ['hamb_inventory', 'inventory'],
  ]) {
    await hambRoot.collection('members').doc(uid).set({
      uid,
      tenantId: hambTenantId,
      roleId,
      status: 'active',
      branchIds: ['main'],
    })
  }

  const hambCall = (uid, commandType, operationId, payload = {}) =>
    executeRestaurantCommand(db, {
      auth: { uid },
      data: { tenantId: hambTenantId, branchId: 'main', commandType, operationId, payload },
    })

  // Abrir turno en hamburger_shop
  const hambShift = await hambCall('hamb_cashier', 'openShift', 'hamb-shift-1', { openingFloat: 100 })
  assert.ok(hambShift.shiftId)
  const restaurantOperationsBeforeSuspension = await hambRoot.collection('restaurantOperations').get()
  await hambRoot.update({ subscriptionStatus: 'suspended' })
  await assert.rejects(
    () => hambCall('hamb_cashier', 'addOrder', 'hamb-suspended-sale', { items: [{ productId: 'not-used', quantity: 1 }] }),
    error => error.code === 'permission-denied',
    'Suspended Hamburger subscription must reject sales before writes',
  )
  await assert.rejects(
    () => hambCall('hamb_cashier', 'closeShift', 'hamb-suspended-cash', { countedCash: 100 }),
    error => error.code === 'permission-denied',
    'Suspended Hamburger subscription must reject cash operations before writes',
  )
  assert.equal((await hambRoot.collection('restaurantOperations').get()).size, restaurantOperationsBeforeSuspension.size)
  await hambRoot.update({ subscriptionStatus: 'active' })
  console.log('PASS Hamburger suscripción suspendida deniega venta y caja sin registrar operaciones y conserva acceso al reactivarla.')
  console.log('PASS Turno abierto con éxito en tenant hamburger_shop.')

  // 28. Validación de Recetas e Insumos en saveProduct
  console.log('28. Validación estricta de recetas e insumos...')
  // Auto-referencia prohibida
  await assert.rejects(
    () => hambCall('hamb_inventory', 'saveProduct', 'prod-self-ref', {
      product: {
        id: 'prod_burger_self',
        name: 'Burger Loop',
        price: 30,
        recipe: [{ ingredientId: 'prod_burger_self', quantityBase: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'Un producto no puede ser insumo de sí mismo'
  )

  // Insumo inexistente prohibido
  await assert.rejects(
    () => hambCall('hamb_inventory', 'saveProduct', 'prod-ing-missing', {
      product: {
        id: 'prod_burger_ghost',
        name: 'Burger Fantasma',
        price: 30,
        recipe: [{ ingredientId: 'ing_inexistente', quantityBase: 1 }],
      },
    }),
    err => err.code === 'not-found',
    'Insumo debe existir en el tenant'
  )

  // Crear insumos reales
  await hambCall('hamb_inventory', 'saveProduct', 'save-ing-pan', {
    product: { id: 'ing_pan', name: 'Pan de Hamburguesa', price: 0, stockBase: 10, restaurantType: 'ingredient', baseUnit: 'unit' },
  })
  await hambCall('hamb_inventory', 'saveProduct', 'save-ing-carne', {
    product: { id: 'ing_carne', name: 'Carne de Res 150g', price: 0, stockBase: 10, restaurantType: 'ingredient', baseUnit: 'unit' },
  })
  await hambCall('hamb_inventory', 'saveProduct', 'save-ing-queso', {
    product: { id: 'ing_queso', name: 'Queso Cheddar', price: 0, stockBase: 10, restaurantType: 'ingredient', baseUnit: 'unit' },
  })
  // Crear producto directo sin receta (Gaseosa)
  await hambCall('hamb_inventory', 'saveProduct', 'save-prod-soda', {
    product: { id: 'prod_soda', name: 'Gaseosa 500ml', price: 10, stockBase: 20, restaurantType: 'beverage', baseUnit: 'unit' },
  })
  // Crear producto preparado con receta
  await hambCall('hamb_inventory', 'saveProduct', 'save-prod-burger', {
    product: {
      id: 'prod_burger_clasica',
      name: 'Hamburguesa Clásica',
      price: 35,
      restaurantType: 'prepared',
      recipe: [
        { ingredientId: 'ing_pan', quantityBase: 1 },
        { ingredientId: 'ing_carne', quantityBase: 1 },
        { ingredientId: 'ing_queso', quantityBase: 1 },
      ],
    },
  })
  console.log('PASS Insumos y producto con receta creados y validados correctamente.')

  // 29. Crear Punto de Entrega y Pedido counter_service con Mesa de Referencia
  console.log('29. Pedido counter_service con punto de entrega referencial y deducción de receta...')
  await hambCall('hamb_owner', 'floorAction', 'floor-add-sec', {
    action: { type: 'sector.create', id: 'sec_delivery', name: 'Puntos de Entrega', active: true },
  })
  await hambCall('hamb_owner', 'floorAction', 'floor-add-point', {
    action: { type: 'table.create', id: 'tbl_ref_10', name: 'Entrega 10', sectorId: 'sec_delivery', capacity: 4, shape: 'square', active: true },
  })

  // Venta de 2 Hamburguesas Clásicas (debe consumir 2 Pan, 2 Carne, 2 Queso)
  const orderRes = await hambCall('hamb_cashier', 'addOrder', 'hamb-order-1', {
    order: {
      id: 'ord_hamb_1',
      displayNumber: '#H01',
      fulfillmentType: 'table',
      tableId: 'tbl_ref_10',
      tableInfo: 'Entrega 10',
      referenceOnly: true,
      isReferenceTable: true,
      status: 'pending',
      paymentStatus: 'pending',
      items: [
        {
          id: 'line_hamb_1',
          productId: 'prod_burger_clasica',
          name: 'Hamburguesa Clásica',
          basePrice: 35,
          quantity: 2,
          lineTotal: 70,
        },
      ],
      total: 70,
    },
  })
  assert.equal(orderRes.orderId, 'ord_hamb_1')

  // Verificar que la mesa NO fue ocupada
  const tblSnap = await hambRoot.collection('restaurantTables').doc('tbl_ref_10').get()
  assert.equal(tblSnap.data().status, 'available', 'La mesa de referencia debe permanecer available')
  assert.ok(!tblSnap.data().activeOrderId, 'activeOrderId no debe estar asignado en mesa de referencia')

  // Verificar descuento de insumos: Pan 10 -> 8, Carne 10 -> 8, Queso 10 -> 8
  const [panDoc, carneDoc, quesoDoc, burgerDoc] = await Promise.all([
    hambRoot.collection('products').doc('ing_pan').get(),
    hambRoot.collection('products').doc('ing_carne').get(),
    hambRoot.collection('products').doc('ing_queso').get(),
    hambRoot.collection('products').doc('prod_burger_clasica').get(),
  ])
  assert.equal(panDoc.data().stockBase, 8)
  assert.equal(carneDoc.data().stockBase, 8)
  assert.equal(quesoDoc.data().stockBase, 8)
  assert.equal(burgerDoc.data().stockBase, undefined, 'No debe descontar stockBase del producto preparado')

  // Verificar movimientos de inventario tipo sale para los ingredientes
  const hambMovs = await hambRoot.collection('restaurantInventoryMovements').where('orderId', '==', 'ord_hamb_1').get()
  assert.equal(hambMovs.docs.length, 3)
  for (const mDoc of hambMovs.docs) {
    const m = mDoc.data()
    assert.equal(m.type, 'sale')
    assert.equal(m.quantityBase, -2)
    assert.equal(m.soldQuantity, 2)
    assert.ok(['ing_pan', 'ing_carne', 'ing_queso'].includes(m.productId))
    assert.ok(m.reason.includes('Hamburguesa Clásica'))
  }
  console.log('PASS Mesa referencial disponible, stock de insumos descontado (-2 c/u) y movimientos registrados.')

  // 30. Producto sin receta, KDS completo, cobro y entrega
  console.log('30. Flujo KDS, cobro y entrega...')
  // Pedido con producto directo (Gaseosa)
  await hambCall('hamb_cashier', 'addOrder', 'hamb-order-soda', {
    order: {
      id: 'ord_soda_1',
      displayNumber: '#S01',
      fulfillmentType: 'pickup',
      customerName: 'Mario',
      customerPhone: '71112233',
      status: 'pending',
      paymentStatus: 'pending',
      items: [
        { id: 'line_soda_1', productId: 'prod_soda', name: 'Gaseosa 500ml', basePrice: 10, quantity: 2, lineTotal: 20 },
      ],
      total: 20,
    },
  })
  const sodaAfter = (await hambRoot.collection('products').doc('prod_soda').get()).data()
  assert.equal(sodaAfter.stockBase, 18, 'Gaseosa sin receta debe descontar de su propio stock (20 - 2 = 18)')

  // KDS en hamb-order-1: pending -> preparing -> ready -> delivered
  await hambCall('hamb_kitchen', 'advanceStatus', 'kds-hamb-1', { orderId: 'ord_hamb_1', status: 'preparing' })
  await hambCall('hamb_kitchen', 'advanceStatus', 'kds-hamb-2', { orderId: 'ord_hamb_1', status: 'ready' })
  await hambCall('hamb_kitchen', 'advanceStatus', 'kds-hamb-3', { orderId: 'ord_hamb_1', status: 'delivered' })
  const hambOrderDelivered = (await hambRoot.collection('restaurantOrders').doc('ord_hamb_1').get()).data()
  assert.equal(hambOrderDelivered.status, 'delivered')
  assert.ok(hambOrderDelivered.deliveredAt)

  // Cobro
  await hambCall('hamb_cashier', 'recordPayment', 'pay-hamb-1', {
    orderId: 'ord_hamb_1',
    method: 'cash',
    received: 100,
  })
  const paidHamb = (await hambRoot.collection('restaurantOrders').doc('ord_hamb_1').get()).data()
  assert.equal(paidHamb.paymentStatus, 'paid')
  console.log('PASS KDS, producto sin receta, cobro y entrega completados.')

  // 31. Cancelación simétrica total y parcial con receta
  console.log('31. Cancelación simétrica total y parcial de recetas...')
  // Pedido nuevo con 1 burger para anular completo: Pan pasa de 8 a 7, Carne 8 a 7, Queso 8 a 7
  await hambCall('hamb_cashier', 'addOrder', 'hamb-order-cancel-all', {
    order: {
      id: 'ord_to_cancel',
      displayNumber: '#C01',
      fulfillmentType: 'pickup',
      items: [{ id: 'line_to_cancel', productId: 'prod_burger_clasica', name: 'Hamburguesa Clásica', basePrice: 35, quantity: 1, lineTotal: 35 }],
      total: 35,
    },
  })
  assert.equal((await hambRoot.collection('products').doc('ing_pan').get()).data().stockBase, 7)

  // Cancelar pedido completo
  await hambCall('hamb_owner', 'cancelOrder', 'cancel-op-full', { orderId: 'ord_to_cancel', reason: 'Cliente desistió' })
  assert.equal((await hambRoot.collection('products').doc('ing_pan').get()).data().stockBase, 8, 'Pan devuelto a 8')
  assert.equal((await hambRoot.collection('products').doc('ing_carne').get()).data().stockBase, 8, 'Carne devuelta a 8')
  assert.equal((await hambRoot.collection('products').doc('ing_queso').get()).data().stockBase, 8, 'Queso devuelto a 8')

  // Cancelación parcial de ítem: pedir 3 burgers (Pan: 8 -> 5, Carne: 8 -> 5, Queso: 8 -> 5)
  await hambCall('hamb_cashier', 'addOrder', 'hamb-order-partial', {
    order: {
      id: 'ord_partial',
      displayNumber: '#P01',
      fulfillmentType: 'pickup',
      items: [{ id: 'line_partial', productId: 'prod_burger_clasica', name: 'Hamburguesa Clásica', basePrice: 35, quantity: 3, lineTotal: 105 }],
      total: 105,
    },
  })
  assert.equal((await hambRoot.collection('products').doc('ing_pan').get()).data().stockBase, 5)

  // Anular 1 hamburguesa del pedido de 3
  const cancelItemRes = await hambCall('hamb_owner', 'cancelOrderItem', 'cancel-op-partial', {
    orderId: 'ord_partial',
    itemId: 'line_partial',
    quantity: 1,
  })
  assert.equal(cancelItemRes.total, 70, 'Nuevo total debe ser 70 por las 2 restantes')
  assert.equal((await hambRoot.collection('products').doc('ing_pan').get()).data().stockBase, 6, 'Pan devuelto proporcionalmente (+1 -> 6)')
  assert.equal((await hambRoot.collection('products').doc('ing_carne').get()).data().stockBase, 6, 'Carne devuelta proporcionalmente (+1 -> 6)')
  assert.equal((await hambRoot.collection('products').doc('ing_queso').get()).data().stockBase, 6, 'Queso devuelto proporcionalmente (+1 -> 6)')
  console.log('PASS Cancelación total y parcial devolvieron stock proporcionalmente de forma simétrica.')

  // 32. Stock insuficiente rechaza toda la transacción
  console.log('32. Rechazo atómico por stock insuficiente...')
  // Reducir carne a 0
  await hambCall('hamb_inventory', 'recordInventoryMovement', 'zero-carne', {
    productId: 'ing_carne',
    nextStock: 0,
    reason: 'Agotado en cocina',
  })
  assert.equal((await hambRoot.collection('products').doc('ing_carne').get()).data().stockBase, 0)

  // Intentar pedir 1 hamburguesa (Pan tiene 6, Queso tiene 6, Carne tiene 0)
  await assert.rejects(
    () => hambCall('hamb_cashier', 'addOrder', 'hamb-order-fail-stock', {
      order: {
        id: 'ord_fail_stock',
        displayNumber: '#F01',
        fulfillmentType: 'pickup',
        items: [{ id: 'line_fail', productId: 'prod_burger_clasica', name: 'Hamburguesa Clásica', basePrice: 35, quantity: 1, lineTotal: 35 }],
        total: 35,
      },
    }),
    err => err.code === 'failed-precondition' && err.message.includes('Stock insuficiente para Carne de Res 150g'),
    'Debe rechazar la transacción completa indicando el insumo faltante'
  )

  // Verificar que Pan y Queso NO fueron descontados (se mantuvieron en 6)
  assert.equal((await hambRoot.collection('products').doc('ing_pan').get()).data().stockBase, 6)
  assert.equal((await hambRoot.collection('products').doc('ing_queso').get()).data().stockBase, 6)
  console.log('PASS Transacción rechazada atómicamente por stock insuficiente sin tocar insumos.')

  // 33. Control de movimientos de caja (recordCashMovement, updateCashMovement, cancelCashMovement)
  console.log('33. Movimientos de caja (ingresos, egresos y anulación con auditoría)...')
  // Abrir nuevo turno en tenant principal
  const shiftMov = await call('cashier_user', 'openShift', 'op-shift-mov', { openingFloat: 200 })
  assert.ok(shiftMov.shiftId)

  // Mesero sin permiso cash.close no puede registrar movimientos
  await assert.rejects(
    () => call('waiter_user', 'recordCashMovement', 'mov-waiter-denied', {
      type: 'expense',
      category: 'supply_purchase',
      description: 'Compra no autorizada',
      amount: 50,
      paymentMethod: 'cash',
    }),
    err => err.code === 'permission-denied',
    'Mesero no debe poder registrar movimientos de caja'
  )

  // Cajero registra egreso en efectivo de Bs 45 con metadatos
  const mov1 = await call('cashier_user', 'recordCashMovement', 'mov-expense-1', {
    type: 'expense',
    category: 'supply_purchase',
    description: 'Compra de verduras de urgencia',
    amount: 45,
    paymentMethod: 'cash',
    supplier: 'Mercado Central',
    workerId: 'worker_ana',
  })
  assert.ok(mov1.movementId)

  // Actualizar movimiento con todos los campos editables
  await call('cashier_user', 'updateCashMovement', 'mov-update-1', {
    movementId: mov1.movementId,
    description: 'Compra de verduras y frutas',
    note: 'Factura #1234',
    amount: 45,
    supplier: 'Mercado Central S.R.L.',
    workerId: 'worker_ana_m',
  })
  const mov1Doc = (await root.collection('restaurantCashMovements').doc(mov1.movementId).get()).data()
  assert.equal(mov1Doc.description, 'Compra de verduras y frutas')
  assert.equal(mov1Doc.note, 'Factura #1234')
  assert.equal(mov1Doc.supplier, 'Mercado Central S.R.L.')
  assert.equal(mov1Doc.workerId, 'worker_ana_m')
  assert.equal(mov1Doc.amount, 45)
  assert.equal(mov1Doc.method, 'cash')
  assert.equal(mov1Doc.active, true)

  // Cajero registra gasto con QR de Bs 50 (NO debe alterar expectedCash de efectivo físico)
  const movQR = await call('cashier_user', 'recordCashMovement', 'mov-expense-qr', {
    type: 'expense',
    category: 'transport',
    description: 'Flete transporte QR',
    amount: 50,
    paymentMethod: 'qr',
  })
  const movQRDoc = (await root.collection('restaurantCashMovements').doc(movQR.movementId).get()).data()
  assert.equal(movQRDoc.method, 'qr')
  assert.equal(movQRDoc.amount, 50)

  // Cajero registra ingreso en efectivo de Bs 100
  const mov2 = await call('cashier_user', 'recordCashMovement', 'mov-income-1', {
    type: 'income',
    category: 'additional_cash',
    description: 'Aporte de cambio por el dueño',
    amount: 100,
    paymentMethod: 'cash',
  })
  assert.ok(mov2.movementId)

  // Cajero registra egreso con 'other' de Bs 25 (NO debe alterar expectedCash ni cashOutflow)
  const movOtherExp = await call('cashier_user', 'recordCashMovement', 'mov-expense-other', {
    type: 'expense',
    category: 'services',
    description: 'Servicio pagado por otro método',
    amount: 25,
    paymentMethod: 'other',
  })
  const movOtherExpDoc = (await root.collection('restaurantCashMovements').doc(movOtherExp.movementId).get()).data()
  assert.equal(movOtherExpDoc.method, 'other')
  assert.equal(movOtherExpDoc.amount, 25)

  // Cajero registra ingreso con 'other' de Bs 70 (NO debe alterar expectedCash ni cashIncome)
  const movOtherInc = await call('cashier_user', 'recordCashMovement', 'mov-income-other', {
    type: 'income',
    category: 'other',
    description: 'Ingreso no efectivo',
    amount: 70,
    paymentMethod: 'other',
  })
  const movOtherIncDoc = (await root.collection('restaurantCashMovements').doc(movOtherInc.movementId).get()).data()
  assert.equal(movOtherIncDoc.method, 'other')
  assert.equal(movOtherIncDoc.amount, 70)

  // Intentar registrar movimiento con método inválido debe fallar con invalid-argument
  await assert.rejects(
    () => call('cashier_user', 'recordCashMovement', 'mov-invalid-method-fail', {
      type: 'expense',
      category: 'supply_purchase',
      description: 'Intento con método inválido',
      amount: 10,
      paymentMethod: 'crypto',
    }),
    err => err.code === 'invalid-argument',
    'Método de pago no reconocido debe ser rechazado con invalid-argument'
  )

  // Registrar un movimiento para anular
  const movToCancel = await call('cashier_user', 'recordCashMovement', 'mov-cancel-target', {
    type: 'expense',
    category: 'maintenance',
    description: 'Gasto erróneo a anular',
    amount: 30,
    paymentMethod: 'cash',
  })
  // Anular movimiento
  await call('owner_user', 'cancelCashMovement', 'mov-cancel-op', {
    movementId: movToCancel.movementId,
    reason: 'Registrado por error en turno incorrecto',
  })
  const cancelledDoc = (await root.collection('restaurantCashMovements').doc(movToCancel.movementId).get()).data()
  assert.equal(cancelledDoc.active, false)
  assert.equal(cancelledDoc.cancelledBy, 'owner_user')
  assert.equal(cancelledDoc.cancelReason, 'Registrado por error en turno incorrecto')

  // Intentar editar movimiento anulado debe fallar
  await assert.rejects(
    () => call('cashier_user', 'updateCashMovement', 'mov-edit-cancelled-fail', {
      movementId: movToCancel.movementId,
      description: 'Intento de edición sobre movimiento anulado',
    }),
    err => err.code === 'failed-precondition',
    'No se puede editar un movimiento de caja anulado'
  )
  console.log('PASS Movimientos de caja registrados, actualizados y anulados con auditoría completa.')

  // 34. Cierre de turno y conciliación con movimientos manuales
  console.log('34. Conciliación y arqueo considerando movimientos manuales...')
  // Fondo inicial 200 + Ingreso 100 - Egreso efectivo 45 = Esperado 255
  // (los egresos QR de 50 y other de 25 no afectan caja física, el ingreso other de 70 tampoco, y el de 30 anulado no cuenta)
  const closeRes2 = await call('cashier_user', 'closeShift', 'op-close-2', {
    shiftId: shiftMov.shiftId,
    countedCash: 255,
  })
  assert.equal(closeRes2.difference, 0)
  const closedMovShiftDoc = (await root.collection('restaurantShifts').doc(shiftMov.shiftId).get()).data()
  assert.equal(closedMovShiftDoc.status, 'closed')
  assert.equal(closedMovShiftDoc.expectedCash, 255)
  assert.equal(closedMovShiftDoc.difference, 0)
  assert.equal(closedMovShiftDoc.cashIncome, 100)
  assert.equal(closedMovShiftDoc.cashOutflow, 45)
  console.log('PASS Cierre de caja calculó exactamente los movimientos activos en efectivo e ignoró QR, other y anulados.')

  // Intentar editar movimiento cuando el turno ya cerró debe fallar
  await assert.rejects(
    () => call('cashier_user', 'updateCashMovement', 'mov-edit-after-close-fail', {
      movementId: mov1.movementId,
      description: 'Intento de edición tras cierre de turno',
    }),
    err => err.code === 'failed-precondition',
    'No se puede editar movimientos cuando el turno está cerrado'
  )

  // 35. Archivación de productos (archiveProduct)
  console.log('35. Archivación de productos...')
  // Crear un producto para archivar
  await call('admin_user', 'saveProduct', 'prod-to-archive-create', {
    product: {
      id: 'prod_vino_especial',
      name: 'Vino Tinto Reserva',
      price: 150,
      restaurantType: 'beverage',
      isActive: true,
      isVisible: true,
    },
  })
  // Mesero sin products.manage no puede archivar
  await assert.rejects(
    () => call('waiter_user', 'archiveProduct', 'archive-waiter-fail', { productId: 'prod_vino_especial' }),
    err => err.code === 'permission-denied',
    'Mesero no puede archivar productos'
  )
  // Admin archiva el producto
  await call('admin_user', 'archiveProduct', 'archive-admin-ok', { productId: 'prod_vino_especial' })
  const archivedDoc = (await root.collection('products').doc('prod_vino_especial').get()).data()
  assert.equal(archivedDoc.isActive, false)
  assert.equal(archivedDoc.isVisible, false)
  assert.equal(archivedDoc.availability, 'archived')
  assert.ok(archivedDoc.archivedAt)
  assert.equal(archivedDoc.archivedBy, 'admin_user')
  console.log('PASS Producto archivado con estado inactivo, no visible y auditado.')

  // Abrir turno para probar venta
  const shiftArchivedTest = await call('cashier_user', 'openShift', 'shift-archived-test', { openingFloat: 100 })

  // Intentar vender producto archivado en addOrder debe fallar en backend
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'order-archived-rejected', {
      items: [{ productId: 'prod_vino_especial', name: 'Vino Tinto Reserva', basePrice: 150, quantity: 1 }],
      total: 150,
    }),
    err => err.code === 'failed-precondition',
    'addOrder debe rechazar venta de producto archivado'
  )

  // Crear el producto prod_1 antes de utilizarlo
  await call('admin_user', 'saveProduct', 'prod-1-seed', {
    product: {
      id: 'prod_1',
      name: 'Lomo a la Pimienta',
      price: 58,
      categoryId: 'cat-carnes',
      preparationArea: 'Cocina',
    },
  })

  // Crear una orden válida para probar addProduct con producto archivado
  const validOrder = await call('waiter_user', 'addOrder', 'order-valid-pre-add', {
    items: [{ productId: 'prod_1', name: 'Lomo a la Pimienta', basePrice: 58, quantity: 1 }],
    total: 58,
  })
  assert.ok(validOrder.orderId)

  // Intentar agregar producto archivado mediante addProduct a orden existente debe fallar en backend
  await assert.rejects(
    () => call('waiter_user', 'addProduct', 'add-archived-to-order-fail', {
      orderId: validOrder.orderId,
      items: [{ productId: 'prod_vino_especial', quantity: 1, basePrice: 150 }],
    }),
    err => err.code === 'failed-precondition',
    'addProduct debe rechazar agregar producto archivado a orden existente'
  )
  console.log('PASS Backend rechaza venta de productos archivados en addOrder y addProduct.')

  // 36. Eliminación física deshabilitada (deleteProduct reject)
  console.log('36. Eliminación física deshabilitada en favor de archivación...')
  // Crear un producto sin dependencias
  await call('admin_user', 'saveProduct', 'prod-to-delete-create', {
    product: {
      id: 'prod_unreferenced',
      name: 'Producto Sin Referencia',
      price: 20,
      restaurantType: 'beverage',
    },
  })
  // Intentar eliminar físicamente debe ser rechazado con failed-precondition
  await assert.rejects(
    () => call('admin_user', 'deleteProduct', 'del-admin-rejected', { productId: 'prod_unreferenced' }),
    err => err.code === 'failed-precondition' && err.message.includes('eliminación física está deshabilitada'),
    'deleteProduct debe ser rechazado con failed-precondition'
  )
  const productStillExists = await root.collection('products').doc('prod_unreferenced').get()
  assert.equal(productStillExists.exists, true, 'El producto se mantiene intacto al rechazarse el borrado físico')
  console.log('PASS Eliminación física rechazada con política estricta de archivo.')

  // 37. Protección estricta contra manipulación de precios y nombres desde el cliente (addOrder)
  console.log('37. Resistencia a alteración de precios y nombres en addOrder...')
  await call('admin_user', 'saveProduct', 'prod-tamper-setup', {
    product: {
      id: 'prod_bife_chorizo',
      name: 'Bife de Chorizo Premium',
      price: 110,
      categoryId: 'cat-carnes',
      preparationArea: 'Cocina',
    },
  })
  // Cliente malicioso intenta enviar basePrice: 1, total: 1 y nombre adulterado
  const tamperedOrder = await call('waiter_user', 'addOrder', 'order-tampered-attempt', {
    items: [{
      productId: 'prod_bife_chorizo',
      name: 'Producto Hackeado Barato',
      basePrice: 1,
      price: 1,
      lineTotal: 1,
      quantity: 2,
    }],
    total: 2,
    productSubtotal: 2,
  })
  assert.ok(tamperedOrder.orderId)
  assert.equal(tamperedOrder.total, 220) // 110 * 2 calculado por servidor
  const tamperedDoc = (await root.collection('restaurantOrders').doc(tamperedOrder.orderId).get()).data()
  assert.equal(tamperedDoc.total, 220)
  assert.equal(tamperedDoc.productSubtotal, 220)
  assert.equal(tamperedDoc.items[0].name, 'Bife de Chorizo Premium') // Nombre canónico
  assert.equal(tamperedDoc.items[0].basePrice, 110)
  assert.equal(tamperedDoc.items[0].lineTotal, 220)
  console.log('PASS Precios y nombres del cliente ignorados; servidor impone catálogo y totales autoritativos.')

  // 38. Rechazo estricto de productos inexistentes (addOrder y addProduct)
  console.log('38. Rechazo de productos desconocidos en addOrder y addProduct...')
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'order-fake-prod-fail', {
      items: [{ productId: 'prod_fantasma_xyz', quantity: 1, basePrice: 50 }],
    }),
    err => err.code === 'not-found',
    'addOrder debe fallar con not-found para productos que no existen'
  )
  await assert.rejects(
    () => call('waiter_user', 'addProduct', 'add-fake-prod-fail', {
      orderId: tamperedOrder.orderId,
      items: [{ productId: 'prod_fantasma_xyz', quantity: 1, basePrice: 50 }],
    }),
    err => err.code === 'not-found',
    'addProduct debe fallar con not-found para productos que no existen'
  )
  console.log('PASS Productos desconocidos rechazados con not-found.')

  // 39. Rechazo de venta directa de insumos (restaurantType === ingredient)
  console.log('39. Rechazo de venta directa de insumos en addOrder y addProduct...')
  await call('admin_user', 'saveProduct', 'prod-raw-ingredient', {
    product: {
      id: 'ing_aceite_trufa',
      name: 'Aceite de Trufa (Insumo)',
      price: 90,
      restaurantType: 'ingredient',
      categoryId: 'cat-insumos',
    },
  })
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'order-ingredient-fail', {
      items: [{ productId: 'ing_aceite_trufa', quantity: 1 }],
    }),
    err => err.code === 'failed-precondition',
    'addOrder debe rechazar venta directa de insumos'
  )
  await assert.rejects(
    () => call('waiter_user', 'addProduct', 'add-ingredient-fail', {
      orderId: tamperedOrder.orderId,
      items: [{ productId: 'ing_aceite_trufa', quantity: 1 }],
    }),
    err => err.code === 'failed-precondition',
    'addProduct debe rechazar venta directa de insumos'
  )
  console.log('PASS Venta directa de insumos bloqueada con failed-precondition.')

  // 40. Validación autoritativa de extras y opciones con resistencia a manipulación
  console.log('40. Validación autoritativa de extras y opciones configuradas...')
  await call('admin_user', 'saveProduct', 'prod-burguer-extras', {
    product: {
      id: 'prod_hamburguesa_doble',
      name: 'Hamburguesa Doble Gourmet',
      price: 45,
      restaurantType: 'food',
      categoryId: 'cat-hamb',
      extras: [
        { id: 'ext_bacon', name: 'Bacon Ahumado', price: 6 },
        { id: 'ext_cheddar', name: 'Queso Cheddar Extra', price: 5 },
      ],
      options: [
        { id: 'opt_termino_3_4', label: 'Término 3/4' },
        { id: 'opt_bien_cocido', label: 'Bien Cocido' },
      ],
    },
  })

  // Cliente intenta manipular precio de extra (enviar precio 0.05 en vez de 6)
  const orderWithExtras = await call('waiter_user', 'addOrder', 'order-extras-tamper-attempt', {
    items: [{
      productId: 'prod_hamburguesa_doble',
      quantity: 2,
      modifiers: {
        extras: [
          { id: 'ext_bacon', name: 'Bacon Ahumado', price: 0.05 },
          { id: 'ext_cheddar', name: 'Queso Cheddar Extra', price: 0.01 },
        ],
        options: ['opt_termino_3_4'],
        note: 'Papas crujientes',
      },
    }],
  })
  // Precio unitario autoritativo: 45 + 6 + 5 = 56. Por 2 unidades = 112
  assert.equal(orderWithExtras.total, 112)
  const extrasDoc = (await root.collection('restaurantOrders').doc(orderWithExtras.orderId).get()).data()
  assert.equal(extrasDoc.total, 112)
  assert.equal(extrasDoc.items[0].unitPrice, 56)
  assert.equal(extrasDoc.items[0].lineTotal, 112)
  assert.equal(extrasDoc.items[0].modifiers.extras[0].price, 6)
  assert.equal(extrasDoc.items[0].modifiers.extras[1].price, 5)
  assert.equal(extrasDoc.items[0].modifiers.options[0], 'Término 3/4')

  // Intento de extra no existente debe fallar
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'order-fake-extra-fail', {
      items: [{
        productId: 'prod_hamburguesa_doble',
        quantity: 1,
        modifiers: {
          extras: [{ id: 'ext_fake_gold', name: 'Oro Comestible', price: 100 }],
        },
      }],
    }),
    err => err.code === 'failed-precondition',
    'Extra inexistente debe ser rechazado'
  )

  // Intento de opción no existente debe fallar
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'order-fake-option-fail', {
      items: [{
        productId: 'prod_hamburguesa_doble',
        quantity: 1,
        modifiers: {
          options: ['opt_termino_carbonizado'],
        },
      }],
    }),
    err => err.code === 'failed-precondition',
    'Opción no existente debe ser rechazada'
  )
  console.log('PASS Extras y opciones validados y cobrados autoritativamente.')

  // 41. Anulación parcial de ítems con extras conserva unitPrice autoritativo
  console.log('41. Anulación parcial de ítem con extras...')
  const cancelExtraItemRes = await call('waiter_user', 'cancelOrderItem', 'cancel-extra-partial', {
    orderId: orderWithExtras.orderId,
    itemId: extrasDoc.items[0].id,
    quantity: 1,
  })
  assert.ok(cancelExtraItemRes)
  const orderAfterCancel = (await root.collection('restaurantOrders').doc(orderWithExtras.orderId).get()).data()
  // Quedó 1 unidad a 56 Bs (45 + 11 extras)
  assert.equal(orderAfterCancel.total, 56)
  assert.equal(orderAfterCancel.productSubtotal, 56)
  assert.equal(orderAfterCancel.items[0].quantity, 1)
  assert.equal(orderAfterCancel.items[0].lineTotal, 56)
  console.log('PASS Anulación parcial recalculó total y lineTotal respetando extras unitarios.')

  // 42. Cobro autoritativo total y validación de liquidación completa
  console.log('42. Verificación de liquidación en recordPayment con totales autoritativos...')
  // Pago insuficiente debe ser rechazado
  await assert.rejects(
    () => call('cashier_user', 'recordPayment', 'pay-underpaid-fail', {
      orderId: orderWithExtras.orderId,
      method: 'cash',
      received: 30, // total es 56
    }),
    err => err.code === 'invalid-argument',
    'Pago menor al total debe ser rechazado'
  )
  // Pago exacto con tarjeta
  const payCardRes = await call('cashier_user', 'recordPayment', 'pay-card-ok', {
    orderId: orderWithExtras.orderId,
    method: 'card',
    received: 56,
  })
  assert.equal(payCardRes.total, 56)
  assert.equal(payCardRes.change, 0)
  const paidCardOrder = (await root.collection('restaurantOrders').doc(orderWithExtras.orderId).get()).data()
  assert.equal(paidCardOrder.paymentStatus, 'paid')
  console.log('PASS Liquidación verificada contra total autoritativo del pedido.')

  // 43. A, F, G, H: addOrder pending server-authoritative y resistencia a spoofing de lifecycle
  console.log('43. Creación de pedido pendiente y rechazo de spoofing de lifecycle...')
  const spoofedPending = await call('waiter_user', 'addOrder', 'op-spoof-pending', {
    order: {
      status: 'delivered',
      accountStatus: 'closed',
      createdBy: 'attacker_user',
      createdAt: '2000-01-01T00:00:00.000Z',
      paidAt: '2000-01-01T00:00:00.000Z',
      paidBy: 'attacker_user',
      payments: [{ method: 'cash', amount: 0.01 }],
      shiftId: 'fake_shift_id',
      tenantId: 'fake_tenant_id',
      branchId: 'fake_branch_id',
      items: [{ productId: 'prod_1', quantity: 1 }],
    },
  })
  assert.ok(spoofedPending.orderId)
  const pendingDoc = (await root.collection('restaurantOrders').doc(spoofedPending.orderId).get()).data()
  assert.equal(pendingDoc.status, 'pending', 'El estado inicial debe ser forzosamente pending')
  assert.equal(pendingDoc.accountStatus, 'open', 'La cuenta debe estar abierta para pedido pending')
  assert.equal(pendingDoc.paymentStatus, 'pending', 'El estado de pago debe ser pending')
  assert.equal(pendingDoc.paymentMethod, null, 'paymentMethod debe ser null para pending')
  assert.equal(pendingDoc.createdBy, 'waiter_user', 'createdBy debe ser el actor UID real, no el spoofed')
  assert.notEqual(pendingDoc.createdAt, '2000-01-01T00:00:00.000Z', 'createdAt debe ser generado por el servidor')
  assert.equal(pendingDoc.paidAt, null, 'paidAt no debe existir en pending')
  assert.equal(pendingDoc.paidBy, null, 'paidBy no debe existir en pending')
  assert.deepEqual(pendingDoc.payments, [], 'payments inyectados por el cliente deben ser ignorados')
  assert.equal(pendingDoc.tenantId, tenantId, 'tenantId debe ser el del contexto')
  assert.equal(pendingDoc.branchId, 'main', 'branchId debe ser el del contexto')

  // Verificar que NO se crearon documentos en restaurantPayments ni restaurantCashMovements
  const paymentsQueryPending = await root.collection('restaurantPayments').where('orderId', '==', spoofedPending.orderId).get()
  assert.equal(paymentsQueryPending.empty, true, 'No debe existir restaurantPayments para pedido pending')
  const cashQueryPending = await root.collection('restaurantCashMovements').where('orderId', '==', spoofedPending.orderId).get()
  assert.equal(cashQueryPending.empty, true, 'No debe existir cash movement para pedido pending')
  console.log('PASS Lifecycle server-authoritative garantizado; bypass de estado, actor y pagos rechazado.')

  // 44. J: Rechazo de paymentStatus inválido ('gift', 'cortesía', 'otro')
  console.log('44. Rechazo de estados de pago no autorizados (gift, cortesía)...')
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-gift-attempt', {
      order: {
        paymentStatus: 'gift',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'paymentStatus gift debe ser rechazado con invalid-argument'
  )
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-cortesia-attempt', {
      order: {
        paymentStatus: 'cortesía',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'paymentStatus cortesía debe ser rechazado con invalid-argument'
  )
  console.log('PASS Estados de pago inválidos (gift/cortesía) rechazados con invalid-argument.')

  // 45. K: Rechazo de datos de pago incompletos o insuficientes en paid-at-creation
  console.log('45. Rechazo de datos de pago inconsistentes en creación...')
  // Paid sin método
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-paid-no-method', {
      order: {
        paymentStatus: 'paid',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'Pedido paid sin método debe fallar con invalid-argument'
  )
  // Paid con desglose insuficiente en mixed
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-paid-mixed-underpay', {
      order: {
        paymentStatus: 'paid',
        paymentMethod: 'mixed',
        payment: { cashAmount: 1, qrAmount: 1 }, // total es 58
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'Desglose menor al total debe fallar con invalid-argument'
  )
  // Paid con efectivo recibido menor al cashAmount
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-paid-cash-underpay', {
      order: {
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        payment: { received: 20 }, // total es 58
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'Efectivo recibido menor debe fallar con invalid-argument'
  )
  console.log('PASS Validaciones de integridad de pago en creación aplicadas estrictamente.')

  // 46. B: addOrder paid cash (atómico al crear)
  console.log('46. Creación atómica de pedido pagado en efectivo (paid-at-creation)...')
  const paidCashOrder = await call('cashier_user', 'addOrder', 'op-paid-cash-create', {
    order: {
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      payment: { method: 'cash', cashReceived: 70 },
      items: [{ productId: 'prod_1', quantity: 1 }],
    },
  })
  assert.ok(paidCashOrder.orderId)
  assert.equal(paidCashOrder.total, 58)
  const cashDoc = (await root.collection('restaurantOrders').doc(paidCashOrder.orderId).get()).data()
  assert.equal(cashDoc.paymentStatus, 'paid')
  assert.equal(cashDoc.accountStatus, 'closed')
  assert.equal(cashDoc.paymentMethod, 'cash')
  assert.equal(cashDoc.paidBy, 'cashier_user')
  assert.ok(cashDoc.paidAt)
  assert.equal(cashDoc.payments.length, 1)
  assert.equal(cashDoc.payments[0].method, 'cash')
  assert.equal(cashDoc.payments[0].amount, 58)
  assert.equal(cashDoc.payments[0].received, 70)
  assert.equal(cashDoc.payments[0].change, 12)

  const cashPayDoc = (await root.collection('restaurantPayments').doc(`payment_op-paid-cash-create`).get()).data()
  assert.equal(cashPayDoc.amount, 58)
  assert.equal(cashPayDoc.cashAmount, 58)
  assert.equal(cashPayDoc.change, 12)

  const cashMovDoc = (await root.collection('restaurantCashMovements').doc(`cash_op-paid-cash-create`).get()).data()
  assert.equal(cashMovDoc.type, 'sale')
  assert.equal(cashMovDoc.method, 'cash')
  assert.equal(cashMovDoc.amount, 58)
  console.log('PASS Pedido pagado en efectivo creado atómicamente con registros de pago y caja.')

  // 47. C: addOrder paid QR (atómico al crear, sin cash movement)
  console.log('47. Creación atómica de pedido pagado con QR...')
  const paidQROrder = await call('cashier_user', 'addOrder', 'op-paid-qr-create', {
    order: {
      paymentStatus: 'paid',
      paymentMethod: 'qr',
      payment: { method: 'qr' },
      items: [{ productId: 'prod_1', quantity: 1 }],
    },
  })
  const qrDoc = (await root.collection('restaurantOrders').doc(paidQROrder.orderId).get()).data()
  assert.equal(qrDoc.paymentStatus, 'paid')
  assert.equal(qrDoc.accountStatus, 'closed')
  assert.equal(qrDoc.paymentMethod, 'qr')
  assert.equal(qrDoc.payments.length, 1)
  assert.equal(qrDoc.payments[0].method, 'qr')
  assert.equal(qrDoc.payments[0].amount, 58)

  const qrPayDoc = (await root.collection('restaurantPayments').doc(`payment_op-paid-qr-create`).get()).data()
  assert.equal(qrPayDoc.qrAmount, 58)
  assert.equal(qrPayDoc.cashAmount, 0)

  const qrCashMov = await root.collection('restaurantCashMovements').doc(`cash_op-paid-qr-create`).get()
  assert.equal(qrCashMov.exists, false, 'Pago con QR NO debe generar movimiento en restaurantCashMovements')
  console.log('PASS Pedido pagado con QR registrado sin alterar movimientos de efectivo.')

  // 48. D: addOrder paid card (atómico al crear, sin cash movement)
  console.log('48. Creación atómica de pedido pagado con tarjeta...')
  const paidCardOrder2 = await call('cashier_user', 'addOrder', 'op-paid-card-create', {
    order: {
      paymentStatus: 'paid',
      paymentMethod: 'card',
      payment: { method: 'card' },
      items: [{ productId: 'prod_1', quantity: 1 }],
    },
  })
  const cardDoc = (await root.collection('restaurantOrders').doc(paidCardOrder2.orderId).get()).data()
  assert.equal(cardDoc.paymentStatus, 'paid')
  assert.equal(cardDoc.paymentMethod, 'card')
  assert.equal(cardDoc.payments.length, 1)
  assert.equal(cardDoc.payments[0].method, 'card')

  const cardCashMov = await root.collection('restaurantCashMovements').doc(`cash_op-paid-card-create`).get()
  assert.equal(cardCashMov.exists, false, 'Pago con tarjeta NO debe generar movimiento en restaurantCashMovements')
  console.log('PASS Pedido pagado con tarjeta registrado sin alterar movimientos de efectivo.')

  // 49. E, M & 15: addOrder paid mixed + convergencia total de expectedCash entre UI y closeShift
  console.log('49. Pago mixto atómico y convergencia UI/backend de expectedCash...')
  // Primero cerramos el turno actual de pruebas
  const currentPendingOrders = await root.collection('restaurantOrders').where('shiftId', '==', shiftArchivedTest.shiftId).where('paymentStatus', '==', 'pending').get()
  for (const doc of currentPendingOrders.docs) {
    if (doc.data().status !== 'cancelled') {
      await call('waiter_user', 'cancelOrder', `clean-cancel-${doc.id}`, { orderId: doc.id })
    }
  }
  // Cerramos turno previo
  const curShiftSnap = await root.collection('restaurantShifts').doc(shiftArchivedTest.shiftId).get()
  if (curShiftSnap.data().status === 'open') {
    const curSummary = await root.collection('restaurantPayments').where('shiftId', '==', shiftArchivedTest.shiftId).get()
    let curExpected = curShiftSnap.data().openingFloat || 0
    for (const pDoc of curSummary.docs) {
      curExpected += pDoc.data().cashAmount || 0
    }
    await call('cashier_user', 'closeShift', 'op-close-prev', { countedCash: curExpected })
  }

  // Abrir nuevo turno limpio con openingFloat 100
  const shiftMixed = await call('cashier_user', 'openShift', 'shift-mixed-clean', { openingFloat: 100 })
  assert.ok(shiftMixed.shiftId)

  // Crear producto de 100 Bs
  await call('admin_user', 'saveProduct', 'prod-pack-100-create', {
    product: {
      id: 'prod_pack_100',
      name: 'Combo Parrillero 100',
      price: 100,
      categoryId: 'cat-carnes',
      preparationArea: 'Cocina',
    },
  })

  // Crear pedido mixto de Bs 100 (Cash 20 + QR 80)
  const mixedOrder = await call('cashier_user', 'addOrder', 'op-mixed-order', {
    order: {
      paymentStatus: 'paid',
      paymentMethod: 'mixed',
      payment: {
        method: 'mixed',
        cashAmount: 20,
        qrAmount: 80,
        cardAmount: 0,
        cashReceived: 20,
      },
      items: [{ productId: 'prod_pack_100', quantity: 1 }],
    },
  })
  assert.equal(mixedOrder.total, 100)

  const mixedDoc = (await root.collection('restaurantOrders').doc(mixedOrder.orderId).get()).data()
  assert.equal(mixedDoc.paymentStatus, 'paid')
  assert.equal(mixedDoc.accountStatus, 'closed')
  // Comprobar entradas canónicas en order.payments (entries separadas, NUNCA total como cash)
  assert.equal(mixedDoc.payments.length, 2, 'Deben existir exactamente 2 entradas para cash y qr (sin card 0)')
  const cashEntry = mixedDoc.payments.find(p => p.method === 'cash')
  const qrEntry = mixedDoc.payments.find(p => p.method === 'qr')
  assert.ok(cashEntry, 'Entrada de cash debe existir')
  assert.ok(qrEntry, 'Entrada de qr debe existir')
  assert.equal(cashEntry.amount, 20, 'Entrada de efectivo debe ser exactamente 20')
  assert.equal(qrEntry.amount, 80, 'Entrada de QR debe ser exactamente 80')

  // Comprobar documento maestro restaurantPayments
  const mixedPayDoc = (await root.collection('restaurantPayments').doc(`payment_op-mixed-order`).get()).data()
  assert.equal(mixedPayDoc.amount, 100)
  assert.equal(mixedPayDoc.cashAmount, 20)
  assert.equal(mixedPayDoc.qrAmount, 80)
  assert.equal(mixedPayDoc.cardAmount, 0)

  // Comprobar que restaurantCashMovements SOLO registró los 20 Bs de efectivo
  const mixedCashMov = (await root.collection('restaurantCashMovements').doc(`cash_op-mixed-order`).get()).data()
  assert.equal(mixedCashMov.amount, 20, 'Movimiento de caja debe ser exclusivamente por 20 Bs (NUNCA 100)')

  // 10. Comprobar convergencia absoluta entre calculateCashShiftSummary (UI/dominio) y closeShift (servidor)
  const uiSummary = calculateCashShiftSummary(100, [mixedDoc], shiftMixed.shiftId, [])
  assert.equal(uiSummary.cashSales, 20)
  assert.equal(uiSummary.qrSales, 80)
  assert.equal(uiSummary.cardSales, 0)
  assert.equal(uiSummary.totalSales, 100)
  assert.equal(uiSummary.expectedCash, 120, 'expectedCash debe ser 120 (100 inicial + 20 efectivo), NUNCA 200')

  // Cierre en servidor
  const closeMixedRes = await call('cashier_user', 'closeShift', 'op-close-mixed', {
    countedCash: 120,
  })
  assert.equal(closeMixedRes.expectedCash, 120)
  assert.equal(closeMixedRes.difference, 0)

  const closedMixedShift = (await root.collection('restaurantShifts').doc(shiftMixed.shiftId).get()).data()
  assert.equal(closedMixedShift.status, 'closed')
  assert.equal(closedMixedShift.expectedCash, 120)
  assert.equal(closedMixedShift.cashSales, 20)
  assert.equal(closedMixedShift.qrSales, 80)
  assert.equal(closedMixedShift.difference, 0)
  console.log('PASS Pago mixto verificado: entries separadas, movimiento solo por cash (20 Bs) y convergencia UI/backend 120 Bs.')

  // 50. L & 14: Regresión recordPayment en orden pending y bloqueo estricto de doble cobro
  console.log('50. Flujo recordPayment sobre orden pendiente y rechazo de doble cobro...')
  // Abrir nuevo turno
  const shiftPendingFlow = await call('cashier_user', 'openShift', 'shift-pending-flow', { openingFloat: 150 })
  // Crear orden pending
  const orderForLaterPay = await call('waiter_user', 'addOrder', 'op-order-for-later', {
    order: {
      paymentStatus: 'pending',
      items: [{ productId: 'prod_1', quantity: 1 }], // 58 Bs
    },
  })
  const initialPendingDoc = (await root.collection('restaurantOrders').doc(orderForLaterPay.orderId).get()).data()
  assert.equal(initialPendingDoc.paymentStatus, 'pending')
  assert.equal(initialPendingDoc.accountStatus, 'open')
  assert.deepEqual(initialPendingDoc.payments, [])

  // Cobrar con recordPayment mixto: Cash 30 + QR 28
  const payLaterRes = await call('cashier_user', 'recordPayment', 'op-pay-later-mixed', {
    orderId: orderForLaterPay.orderId,
    method: 'mixed',
    cashAmount: 30,
    qrAmount: 28,
    received: 30,
  })
  assert.equal(payLaterRes.total, 58)
  assert.equal(payLaterRes.change, 0)

  const paidLaterDoc = (await root.collection('restaurantOrders').doc(orderForLaterPay.orderId).get()).data()
  assert.equal(paidLaterDoc.paymentStatus, 'paid')
  assert.equal(paidLaterDoc.accountStatus, 'closed')
  assert.equal(paidLaterDoc.payments.length, 2)
  assert.equal(paidLaterDoc.payments.find(p => p.method === 'cash').amount, 30)
  assert.equal(paidLaterDoc.payments.find(p => p.method === 'qr').amount, 28)

  // Intentar segundo cobro debe ser rechazado con failed-precondition
  await assert.rejects(
    () => call('cashier_user', 'recordPayment', 'op-double-pay-fail', {
      orderId: orderForLaterPay.orderId,
      method: 'cash',
      received: 58,
    }),
    err => err.code === 'failed-precondition',
    'Segundo cobro sobre orden pagada debe ser rechazado con failed-precondition'
  )

  // Cerrar turno: 150 inicial + 30 cash = 180
  const closePendingFlow = await call('cashier_user', 'closeShift', 'op-close-pending-flow', {
    countedCash: 180,
  })
  assert.equal(closePendingFlow.expectedCash, 180)
  assert.equal(closePendingFlow.difference, 0)
  console.log('PASS recordPayment procesado con entradas canónicas y doble cobro bloqueado.')

  // 51. 16: Integridad de salón y mesa en restaurant_pos
  console.log('51. Integridad de ocupación de mesa en restaurant_pos...')
  // Abrir nuevo turno
  const shiftTableTest = await call('cashier_user', 'openShift', 'shift-table-test', { openingFloat: 100 })
  // Mesa tbl-1 está available
  const tblBefore = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblBefore.status, 'available')

  // Intento de cliente de usar flags referenceOnly / isReferenceTable en tenant restaurant_pos
  const tableOrder = await call('waiter_user', 'addOrder', 'op-table-order-test', {
    order: {
      tableId: 'tbl-1',
      referenceOnly: true,
      isReferenceTable: true,
      paymentStatus: 'pending',
      items: [{ productId: 'prod_1', quantity: 1 }],
    },
  })
  assert.ok(tableOrder.orderId)
  // En restaurant_pos la mesa DEBE quedar ocupada con activeOrderId asignado
  const tblOccupied = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblOccupied.status, 'occupied', 'En restaurant_pos la mesa debe ocuparse atómicamente')
  assert.equal(tblOccupied.activeOrderId, tableOrder.orderId)

  // Intento de abrir otra orden sobre la mesa ya ocupada debe fallar con aborted
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-table-collision-fail', {
      order: {
        tableId: 'tbl-1',
        paymentStatus: 'pending',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'aborted',
    'No se puede abrir una nueva orden sobre una mesa ya ocupada'
  )

  // Cobrar la orden de la mesa libera la mesa automáticamente
  await call('cashier_user', 'recordPayment', 'op-table-pay', {
    orderId: tableOrder.orderId,
    method: 'cash',
    received: 58,
  })
  const tblFreedTableTest = (await root.collection('restaurantTables').doc('tbl-1').get()).data()
  assert.equal(tblFreedTableTest.status, 'available', 'La mesa debe quedar disponible tras el cobro')
  assert.equal(tblFreedTableTest.activeOrderId, null)

  // Cerrar turno de mesa: 100 + 58 = 158
  await call('cashier_user', 'closeShift', 'op-close-table-shift', { countedCash: 158 })
  console.log('PASS Integridad de salón respetada; bypass de mesa bloqueado y liberación atómica comprobada.')

  // 52. Server-authoritative item status & fulfillment / orderSource validation
  console.log('52. Item status inicial pending y validación de fulfillment y orderSource...')
  await call('cashier_user', 'openShift', 'shift-sm-suite', { openingFloat: 100 })

  // Rechazo de fulfillment inválido
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-fake-fulfillment', {
      order: {
        fulfillmentType: 'takeout_flying',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'fulfillmentType no reconocido debe fallar con invalid-argument'
  )

  // Rechazo de orderSource inválido
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-fake-source', {
      order: {
        orderSource: 'telegram_bot',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'orderSource no reconocido debe fallar con invalid-argument'
  )

  // Rechazo de delivery con tableId
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-delivery-table-conflict', {
      order: {
        fulfillmentType: 'delivery',
        tableId: 'tbl-1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'delivery con tableId debe fallar con invalid-argument'
  )

  // Rechazo de table sin tableId
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-table-no-table-id', {
      order: {
        fulfillmentType: 'table',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'invalid-argument',
    'table sin tableId debe fallar con invalid-argument'
  )

  // Creación válida pickup con item status manipulado a "delivered"
  const pickupOrder = await call('waiter_user', 'addOrder', 'op-pickup-authoritative', {
    order: {
      fulfillmentType: 'pickup',
      orderSource: 'whatsapp',
      items: [
        { productId: 'prod_1', quantity: 1, status: 'delivered' },
      ],
    },
  })
  assert.ok(pickupOrder.orderId)
  const pickupDoc = (await root.collection('restaurantOrders').doc(pickupOrder.orderId).get()).data()
  assert.equal(pickupDoc.fulfillmentType, 'pickup')
  assert.equal(pickupDoc.orderSource, 'whatsapp')
  assert.equal(pickupDoc.status, 'pending')
  assert.equal(pickupDoc.items[0].status, 'pending', 'item.status en request debe ser ignorado y persistir como pending')
  console.log('PASS Item status inicial pending y validación de enums de entrega y origen exitosas.')

  // 53. Máquina de estados de Order (advanceStatus)
  console.log('53. Máquina de estados de pedidos y rechazo de transiciones inválidas...')
  // Intento de salto pending -> ready
  await assert.rejects(
    () => call('kitchen_user', 'advanceStatus', 'op-jump-ready', {
      orderId: pickupOrder.orderId,
      status: 'ready',
    }),
    err => err.code === 'failed-precondition',
    'pending -> ready debe ser rechazado'
  )

  // Intento de salto pending -> delivered
  await assert.rejects(
    () => call('kitchen_user', 'advanceStatus', 'op-jump-deliv', {
      orderId: pickupOrder.orderId,
      status: 'delivered',
    }),
    err => err.code === 'failed-precondition',
    'pending -> delivered debe ser rechazado'
  )

  // Intento de cancelación vía advanceStatus
  await assert.rejects(
    () => call('kitchen_user', 'advanceStatus', 'op-cancel-via-advance', {
      orderId: pickupOrder.orderId,
      status: 'cancelled',
    }),
    err => err.code === 'failed-precondition',
    'advanceStatus con cancelled debe ser rechazado'
  )

  // Intento con estado inválido
  await assert.rejects(
    () => call('kitchen_user', 'advanceStatus', 'op-hacked-status', {
      orderId: pickupOrder.orderId,
      status: 'hacked',
    }),
    err => err.code === 'failed-precondition',
    'advanceStatus con estado inválido debe ser rechazado'
  )

  // Transición válida: pending -> preparing
  const adv1 = await call('kitchen_user', 'advanceStatus', 'op-adv-prep', {
    orderId: pickupOrder.orderId,
    status: 'preparing',
  })
  assert.equal(adv1.status, 'preparing')

  // Intento de salto preparing -> delivered
  await assert.rejects(
    () => call('kitchen_user', 'advanceStatus', 'op-jump-prep-deliv', {
      orderId: pickupOrder.orderId,
      status: 'delivered',
    }),
    err => err.code === 'failed-precondition',
    'preparing -> delivered debe ser rechazado'
  )

  // Transición válida: preparing -> ready
  const adv2 = await call('kitchen_user', 'advanceStatus', 'op-adv-ready', {
    orderId: pickupOrder.orderId,
  })
  assert.equal(adv2.status, 'ready')

  // Intento de retroceso ready -> preparing
  await assert.rejects(
    () => call('kitchen_user', 'advanceStatus', 'op-retro-ready-prep', {
      orderId: pickupOrder.orderId,
      status: 'preparing',
    }),
    err => err.code === 'failed-precondition',
    'ready -> preparing debe ser rechazado'
  )

  // Transición válida: ready -> delivered
  const adv3 = await call('waiter_user', 'advanceStatus', 'op-adv-deliv', {
    orderId: pickupOrder.orderId,
    status: 'delivered',
  })
  assert.equal(adv3.status, 'delivered')

  // Intento de avance desde delivered
  await assert.rejects(
    () => call('waiter_user', 'advanceStatus', 'op-post-deliv-fail', {
      orderId: pickupOrder.orderId,
      status: 'pending',
    }),
    err => err.code === 'failed-precondition',
    'delivered -> pending debe ser rechazado'
  )
  console.log('PASS Máquina de estados de orden respetada estrictamente sin saltos ni retrocesos.')

  // 54. Máquina de estados de Ítems y derivación coherente de Order status
  console.log('54. Máquina de estados de ítems y derivación coherente de orden...')
  const multiItemOrder = await call('waiter_user', 'addOrder', 'op-multi-item-order', {
    order: {
      fulfillmentType: 'pickup',
      items: [
        { id: 'it_line_a', productId: 'prod_1', quantity: 1 },
        { id: 'it_line_b', productId: 'prod_1', quantity: 1 },
      ],
    },
  })
  assert.equal(multiItemOrder.order.status, 'pending')

  // Intento salto ítem pending -> ready
  await assert.rejects(
    () => call('kitchen_user', 'advanceItemStatus', 'op-it-jump-ready', {
      orderId: multiItemOrder.orderId,
      itemId: 'it_line_a',
      status: 'ready',
    }),
    err => err.code === 'failed-precondition',
    'ítem pending -> ready debe fallar'
  )

  // Intento cancelación ítem vía advanceItemStatus
  await assert.rejects(
    () => call('kitchen_user', 'advanceItemStatus', 'op-it-cancel-via-adv', {
      orderId: multiItemOrder.orderId,
      itemId: 'it_line_a',
      status: 'cancelled',
    }),
    err => err.code === 'failed-precondition',
    'ítem advance a cancelled debe fallar'
  )

  // Avanzar línea A: pending -> preparing
  const itAdv1 = await call('kitchen_user', 'advanceItemStatus', 'op-it-a-prep', {
    orderId: multiItemOrder.orderId,
    itemId: 'it_line_a',
    status: 'preparing',
  })
  assert.equal(itAdv1.itemStatus, 'preparing')
  assert.equal(itAdv1.orderStatus, 'preparing', 'Orden debe pasar a preparing al iniciar preparación de una línea')

  // Avanzar línea B: pending -> preparing
  const itAdv2 = await call('kitchen_user', 'advanceItemStatus', 'op-it-b-prep', {
    orderId: multiItemOrder.orderId,
    itemId: 'it_line_b',
    status: 'preparing',
  })
  assert.equal(itAdv2.itemStatus, 'preparing')
  assert.equal(itAdv2.orderStatus, 'preparing')

  // Avanzar línea A: preparing -> ready (Línea B sigue preparing)
  const itAdv3 = await call('kitchen_user', 'advanceItemStatus', 'op-it-a-ready', {
    orderId: multiItemOrder.orderId,
    itemId: 'it_line_a',
    status: 'ready',
  })
  assert.equal(itAdv3.itemStatus, 'ready')
  assert.equal(itAdv3.orderStatus, 'preparing', 'Orden permanece preparing mientras alguna línea siga preparing')

  // Avanzar línea B: preparing -> ready (Ambas listas)
  const itAdv4 = await call('kitchen_user', 'advanceItemStatus', 'op-it-b-ready', {
    orderId: multiItemOrder.orderId,
    itemId: 'it_line_b',
    status: 'ready',
  })
  assert.equal(itAdv4.itemStatus, 'ready')
  assert.equal(itAdv4.orderStatus, 'ready', 'Orden pasa a ready cuando todas las líneas están ready')

  // Avanzar línea A: ready -> delivered (Línea B ready)
  const itAdv5 = await call('waiter_user', 'advanceItemStatus', 'op-it-a-deliv', {
    orderId: multiItemOrder.orderId,
    itemId: 'it_line_a',
    status: 'delivered',
  })
  assert.equal(itAdv5.itemStatus, 'delivered')
  assert.equal(itAdv5.orderStatus, 'ready', 'Orden permanece ready mientras existan líneas ready no entregadas')

  // Avanzar línea B: ready -> delivered (Ambas entregadas)
  const itAdv6 = await call('waiter_user', 'advanceItemStatus', 'op-it-b-deliv', {
    orderId: multiItemOrder.orderId,
    itemId: 'it_line_b',
    status: 'delivered',
  })
  assert.equal(itAdv6.itemStatus, 'delivered')
  assert.equal(itAdv6.orderStatus, 'delivered', 'Orden pasa a delivered cuando todas las líneas están delivered')

  // Cobrar órdenes de prueba para balancear turno
  await call('cashier_user', 'recordPayment', 'pay-pickup-ord', {
    orderId: pickupOrder.orderId,
    method: 'cash',
    received: 58,
  })
  await call('cashier_user', 'recordPayment', 'pay-multi-ord', {
    orderId: multiItemOrder.orderId,
    method: 'cash',
    received: 116,
  })
  console.log('PASS Máquina de estados de ítems y orden derivada verificadas.')

  // 55. CancelOrder real vs intento advanceStatus cancelled
  console.log('55. Devolución de inventario estricta solo en cancelOrder...')
  await call('admin_user', 'saveProduct', 'prod-stock-test-create', {
    product: {
      id: 'prod_stock_item',
      name: 'Bife con Stock',
      price: 60,
      stockBase: 20,
      categoryId: 'cat-carnes',
      preparationArea: 'Cocina',
    },
  })
  const prodBeforeCancel = (await root.collection('products').doc('prod_stock_item').get()).data()
  const stockBefore = prodBeforeCancel.stockBase
  assert.equal(stockBefore, 20)

  const orderToCancel = await call('waiter_user', 'addOrder', 'op-to-cancel-test', {
    order: {
      fulfillmentType: 'pickup',
      items: [{ productId: 'prod_stock_item', quantity: 2 }],
    },
  })
  const prodAfterSale = (await root.collection('products').doc('prod_stock_item').get()).data()
  assert.equal(prodAfterSale.stockBase, stockBefore - 2)

  // Intento de usar advanceStatus('cancelled')
  await assert.rejects(
    () => call('waiter_user', 'advanceStatus', 'op-adv-cancel-attempt', {
      orderId: orderToCancel.orderId,
      status: 'cancelled',
    }),
    err => err.code === 'failed-precondition',
    'advanceStatus no puede cancelar pedidos'
  )
  const prodStillUnchanged = (await root.collection('products').doc('prod_stock_item').get()).data()
  assert.equal(prodStillUnchanged.stockBase, stockBefore - 2, 'Stock no debe ser devuelto por advanceStatus fallido')

  // CancelOrder real
  const cancelRes = await call('waiter_user', 'cancelOrder', 'op-real-cancel', {
    orderId: orderToCancel.orderId,
    reason: 'Cancelación autorizada',
  })
  assert.equal(cancelRes.status, 'cancelled')
  const prodRestored = (await root.collection('products').doc('prod_stock_item').get()).data()
  assert.equal(prodRestored.stockBase, stockBefore, 'Stock debe retornar exactamente una vez tras cancelOrder')

  // Reintento de cancelOrder (idempotencia sin doble retorno de stock)
  await call('waiter_user', 'cancelOrder', 'op-real-cancel-repeat', {
    orderId: orderToCancel.orderId,
  })
  const prodRepeat = (await root.collection('products').doc('prod_stock_item').get()).data()
  assert.equal(prodRepeat.stockBase, stockBefore, 'Stock no debe duplicar devolución en reintentos')
  console.log('PASS Stock devuelto únicamente por cancelOrder real y con idempotencia garantizada.')

  // 56. Integridad de mesas y restricciones en updateTableStatus
  console.log('56. Integridad de mesas y restricciones en updateTableStatus...')
  // Rechazo de tableId inexistente
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-fake-table-add', {
      order: {
        tableId: 'tbl_inexistente_999',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'not-found',
    'Mesa inexistente debe fallar con not-found'
  )

  // Crear mesa 2 en el plano
  await call('admin_user', 'floorAction', 'floor-tbl-2-create', {
    action: { type: 'table.create', id: 'tbl-2', name: 'Mesa 2', sectorId: 'sec-main', capacity: 4, shape: 'round', active: true },
  })

  // Crear mesa archivada para prueba
  await root.collection('restaurantTables').doc('tbl-archived-test').set({
    id: 'tbl-archived-test',
    name: 'Mesa Archivada',
    status: 'archived',
    active: false,
  })
  await assert.rejects(
    () => call('waiter_user', 'addOrder', 'op-archived-table-add', {
      order: {
        tableId: 'tbl-archived-test',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
    }),
    err => err.code === 'failed-precondition',
    'Mesa archivada/inactiva debe fallar con failed-precondition'
  )

  // Mesa libre: available <-> reserved PASS
  const res1 = await call('waiter_user', 'updateTableStatus', 'op-reserve-tbl2', {
    tableId: 'tbl-2',
    status: 'reserved',
  })
  assert.equal(res1.status, 'reserved')

  const res2 = await call('waiter_user', 'updateTableStatus', 'op-unreserve-tbl2', {
    tableId: 'tbl-2',
    status: 'available',
  })
  assert.equal(res2.status, 'available')

  // Intento de forzar occupied o bill_requested manualmente sin orden
  await assert.rejects(
    () => call('waiter_user', 'updateTableStatus', 'op-manual-occupy', {
      tableId: 'tbl-2',
      status: 'occupied',
    }),
    err => err.code === 'failed-precondition',
    'updateTableStatus occupied manual sin orden debe fallar'
  )
  await assert.rejects(
    () => call('waiter_user', 'updateTableStatus', 'op-manual-bill', {
      tableId: 'tbl-2',
      status: 'bill_requested',
    }),
    err => err.code === 'failed-precondition',
    'updateTableStatus bill_requested manual sin orden debe fallar'
  )

  // Abrir orden en tbl-2
  const orderTbl2 = await call('waiter_user', 'openTableOrder', 'op-open-tbl2', {
    tableId: 'tbl-2',
    diners: 3,
  })
  assert.ok(orderTbl2.orderId)
  const tbl2Data = (await root.collection('restaurantTables').doc('tbl-2').get()).data()
  assert.equal(tbl2Data.status, 'occupied')
  assert.equal(tbl2Data.activeOrderId, orderTbl2.orderId)

  // Intento de bypass manual de estado con activeOrderId presente
  await assert.rejects(
    () => call('waiter_user', 'updateTableStatus', 'op-bypass-available', {
      tableId: 'tbl-2',
      status: 'available',
    }),
    err => err.code === 'failed-precondition',
    'Mesa con activeOrderId no puede ser marcada available manualmente'
  )
  await assert.rejects(
    () => call('waiter_user', 'updateTableStatus', 'op-bypass-reserved', {
      tableId: 'tbl-2',
      status: 'reserved',
    }),
    err => err.code === 'failed-precondition',
    'Mesa con activeOrderId no puede ser marcada reserved'
  )
  console.log('PASS Invariantes de mesa y restricciones en updateTableStatus verificadas.')

  // 57. RequestBill y ReopenBill validación relacional estricta
  console.log('57. Relación estricta mesa-orden en requestBill y reopenBill...')
  // Añadir ítem a la orden de tbl-2
  await call('waiter_user', 'addProduct', 'op-add-prod-tbl2', {
    orderId: orderTbl2.orderId,
    items: [{ productId: 'prod_1', quantity: 1 }],
  })

  // Table A + Order B (mismatch)
  await assert.rejects(
    () => call('waiter_user', 'requestBill', 'op-req-bill-mismatch', {
      tableId: 'tbl-2',
      orderId: 'fake_order_id_999',
    }),
    err => err.code === 'failed-precondition',
    'requestBill con orden no coincidente debe fallar'
  )

  // requestBill válido
  const reqBillRes = await call('waiter_user', 'requestBill', 'op-req-bill-valid', {
    tableId: 'tbl-2',
    orderId: orderTbl2.orderId,
  })
  assert.equal(reqBillRes.status, 'bill_requested')
  const tbl2BillSnap = (await root.collection('restaurantTables').doc('tbl-2').get()).data()
  assert.equal(tbl2BillSnap.status, 'bill_requested')
  const ord2BillSnap = (await root.collection('restaurantOrders').doc(orderTbl2.orderId).get()).data()
  assert.equal(ord2BillSnap.accountStatus, 'bill_requested')

  // Reintento requestBill sobre cuenta ya pedida
  await assert.rejects(
    () => call('waiter_user', 'requestBill', 'op-req-bill-dup', {
      tableId: 'tbl-2',
    }),
    err => err.code === 'failed-precondition',
    'requestBill duplicado debe fallar con failed-precondition'
  )

  // reopenBill válido
  const reopenRes = await call('waiter_user', 'reopenBill', 'op-reopen-valid', {
    tableId: 'tbl-2',
  })
  assert.equal(reopenRes.status, 'occupied')
  const tbl2ReopenSnap = (await root.collection('restaurantTables').doc('tbl-2').get()).data()
  assert.equal(tbl2ReopenSnap.status, 'occupied')
  const ord2ReopenSnap = (await root.collection('restaurantOrders').doc(orderTbl2.orderId).get()).data()
  assert.equal(ord2ReopenSnap.accountStatus, 'open')

  // Reintento reopenBill sobre cuenta ya open
  await assert.rejects(
    () => call('waiter_user', 'reopenBill', 'op-reopen-dup', {
      tableId: 'tbl-2',
    }),
    err => err.code === 'failed-precondition',
    'reopenBill sobre cuenta open debe fallar'
  )

  // Cobro de la orden
  await call('cashier_user', 'recordPayment', 'op-pay-tbl2', {
    orderId: orderTbl2.orderId,
    method: 'cash',
    received: 58,
  })
  const tbl2PostPay = (await root.collection('restaurantTables').doc('tbl-2').get()).data()
  assert.equal(tbl2PostPay.status, 'available')
  assert.equal(tbl2PostPay.activeOrderId, null)

  // requestBill sobre orden pagada/cerrada debe fallar
  await assert.rejects(
    () => call('waiter_user', 'requestBill', 'op-req-bill-paid-fail', {
      orderId: orderTbl2.orderId,
    }),
    err => err.code === 'failed-precondition',
    'requestBill sobre orden pagada debe fallar con failed-precondition'
  )

  // Cerrar turno shiftSM: 100 inicial + 58 (pickupOrder) + 116 (multiItemOrder) + 58 (orderTbl2) = 332
  await call('cashier_user', 'closeShift', 'op-close-sm-suite', { countedCash: 332 })
  console.log('PASS Invariantes relacionales de requestBill y reopenBill comprobadas exitosamente.')

  console.log('\n==================================================')
  console.log('TODAS LAS PRUEBAS DE OPERACIONES RESTAURANTE PASARON (57/57)')
  console.log('==================================================\n')
  process.exit(0)
} catch (error) {
  console.error('ERROR EN PRUEBAS:', error)
  process.exit(1)
}
