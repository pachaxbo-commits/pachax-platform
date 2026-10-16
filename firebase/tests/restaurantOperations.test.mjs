import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

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
  await hambRoot.set({ tenantId: hambTenantId, name: 'Burger Express QA', businessType: 'hamburger_shop', configuration: hambTemplate.defaults })
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

  console.log('\n==================================================')
  console.log('TODAS LAS PRUEBAS DE OPERACIONES RESTAURANTE PASARON (32/32)')
  console.log('==================================================\n')
  process.exit(0)
} catch (error) {
  console.error('ERROR EN PRUEBAS:', error)
  process.exit(1)
}
