import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { createTenant, updateSettings } = require('./tenants.cjs')
const { prepareCleanDelivery, executeCleanDelivery } = require('./maintenance.cjs')
const { hasPermission } = require('./authorization.cjs')

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9195'

const suffix = Date.now().toString(36)
const adminApp = initializeApp({ projectId }, `support-security-${suffix}`)
const db = getFirestore(adminApp)
const auth = getAuth(adminApp)

const uids = {
  ownerA: `owner-a-${suffix}`,
  adminA: `admin-a-${suffix}`,
  supportA: `support-a-${suffix}`,
  accountantA: `accountant-a-${suffix}`,
  warehouseA: `warehouse-a-${suffix}`,
  distributorA: `distributor-a-${suffix}`,
  ownerB: `owner-b-${suffix}`,
  supportB: `support-b-${suffix}`,
}

let checks = 0
const pass = (msg) => {
  checks++
  console.log('PASS', msg)
}

const member = (uid, tenantId, roleId) => ({
  uid,
  tenantId,
  roleId,
  status: 'active',
  branchIds: ['main'],
  routeIds: roleId === 'distributor' ? ['route-1'] : [],
  warehouseId: 'central',
  createdAt: new Date().toISOString(),
})

try {
  // Create auth users
  for (const uid of Object.values(uids)) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
  }

  // Create distribution tenant A
  const tenantAId = (
    await createTenant(db, auth, {
      auth: { uid: uids.ownerA, token: {} },
      data: {
        action: 'createTenant',
        operationId: `op-dist-a-${suffix}`,
        name: 'Distribuidora Principal QA',
        businessType: 'route_distribution',
      },
    })
  ).tenantId

  // Create distribution tenant B
  const tenantBId = (
    await createTenant(db, auth, {
      auth: { uid: uids.ownerB, token: {} },
      data: {
        action: 'createTenant',
        operationId: `op-dist-b-${suffix}`,
        name: 'Distribuidora Secundaria QA',
        businessType: 'route_distribution',
      },
    })
  ).tenantId

  // Populate memberships in Tenant A
  await db.doc(`tenants/${tenantAId}/members/${uids.adminA}`).set(member(uids.adminA, tenantAId, 'admin'))
  await db.doc(`tenants/${tenantAId}/members/${uids.supportA}`).set(member(uids.supportA, tenantAId, 'support'))
  await db.doc(`tenants/${tenantAId}/members/${uids.accountantA}`).set(member(uids.accountantA, tenantAId, 'accountant'))
  await db.doc(`tenants/${tenantAId}/members/${uids.warehouseA}`).set(member(uids.warehouseA, tenantAId, 'warehouse'))
  await db.doc(`tenants/${tenantAId}/members/${uids.distributorA}`).set(member(uids.distributorA, tenantAId, 'distributor'))

  // Populate memberships in Tenant B
  await db.doc(`tenants/${tenantBId}/members/${uids.supportB}`).set(member(uids.supportB, tenantBId, 'support'))

  const tenantASnap = (await db.doc(`tenants/${tenantAId}`).get()).data()
  const supportAMember = (await db.doc(`tenants/${tenantAId}/members/${uids.supportA}`).get()).data()
  const adminAMember = (await db.doc(`tenants/${tenantAId}/members/${uids.adminA}`).get()).data()
  const accountantAMember = (await db.doc(`tenants/${tenantAId}/members/${uids.accountantA}`).get()).data()

  // =========================================================================
  // 1. Backend Authorization unit checks (hasPermission in authorization.cjs)
  // =========================================================================
  assert.equal(hasPermission(tenantASnap, supportAMember, 'settings.manage'), false, 'Support must not have settings.manage')
  assert.equal(hasPermission(tenantASnap, supportAMember, 'support.reset.prepare'), true, 'Support must have support.reset.prepare')
  assert.equal(hasPermission(tenantASnap, adminAMember, 'settings.manage'), true, 'Admin must have settings.manage')
  assert.equal(hasPermission(tenantASnap, adminAMember, 'support.reset.prepare'), true, 'Admin must have support.reset.prepare')
  assert.equal(hasPermission(tenantASnap, accountantAMember, 'settings.manage'), false, 'Accountant must not have settings.manage')
  assert.equal(hasPermission(tenantASnap, accountantAMember, 'support.reset.prepare'), false, 'Accountant must not have support.reset.prepare')
  pass('hasPermission: soporte tiene support.reset.prepare pero NO settings.manage')

  // =========================================================================
  // 2. updateSettings: Support MUST be rejected on name, branding & businessIdentity
  // =========================================================================

  // Vector 1: Name change attempt by Support -> PERMISSION_DENIED
  await assert.rejects(
    () => updateSettings(db, {
      auth: { uid: uids.supportA, token: {} },
      data: { tenantId: tenantAId, name: 'Nombre Vulnerado por Support' },
    }),
    error => error.code === 'permission-denied'
  )
  pass('updateSettings: Support cambiando nombre -> DENIED (permission-denied)')

  // Vector 2: Branding change attempt by Support -> PERMISSION_DENIED
  await assert.rejects(
    () => updateSettings(db, {
      auth: { uid: uids.supportA, token: {} },
      data: { tenantId: tenantAId, branding: { primary: '#000000', accent: '#333333' } },
    }),
    error => error.code === 'permission-denied'
  )
  pass('updateSettings: Support cambiando branding -> DENIED (permission-denied)')

  // Vector 3: BusinessIdentity change attempt by Support -> PERMISSION_DENIED
  await assert.rejects(
    () => updateSettings(db, {
      auth: { uid: uids.supportA, token: {} },
      data: {
        tenantId: tenantAId,
        businessIdentity: {
          tradeName: 'Identidad Vulnerada por Support',
          taxId: '999999999',
          phone: '77777777',
        },
      },
    }),
    error => error.code === 'permission-denied'
  )
  pass('updateSettings: Support cambiando businessIdentity -> DENIED (permission-denied)')

  // =========================================================================
  // 3. updateSettings: Admin and Owner MUST PASS
  // =========================================================================
  await updateSettings(db, {
    auth: { uid: uids.adminA, token: {} },
    data: {
      tenantId: tenantAId,
      name: 'Distribuidora Admin Actualizada',
      businessIdentity: {
        tradeName: 'Distribuidora Admin Actualizada',
        phone: '70011223',
      },
    },
  })
  pass('updateSettings: Admin actualizando configuración comercial -> PASS')

  await updateSettings(db, {
    auth: { uid: uids.ownerA, token: {} },
    data: {
      tenantId: tenantAId,
      name: 'Distribuidora Owner Autorizada',
      businessIdentity: {
        tradeName: 'Distribuidora Owner Autorizada',
        phone: '71122334',
      },
    },
  })
  pass('updateSettings: Owner actualizando configuración comercial -> PASS')

  // =========================================================================
  // 4. Maintenance: prepareCleanDelivery authorization
  // =========================================================================

  // Support: prepareCleanDelivery -> PASS
  const supportPreview = await prepareCleanDelivery(db, {
    auth: { uid: uids.supportA, token: {} },
    data: { tenantId: tenantAId },
  })
  assert.ok(supportPreview.requestId, 'prepareCleanDelivery debe devolver requestId')
  assert.ok(supportPreview.counts, 'prepareCleanDelivery debe devolver counts')
  pass('prepareCleanDelivery: Support -> PASS')

  // Admin: prepareCleanDelivery -> PASS
  const adminPreview = await prepareCleanDelivery(db, {
    auth: { uid: uids.adminA, token: {} },
    data: { tenantId: tenantAId },
  })
  assert.ok(adminPreview.requestId)
  pass('prepareCleanDelivery: Admin -> PASS')

  // Owner: prepareCleanDelivery -> PASS
  const ownerPreview = await prepareCleanDelivery(db, {
    auth: { uid: uids.ownerA, token: {} },
    data: { tenantId: tenantAId },
  })
  assert.ok(ownerPreview.requestId)
  pass('prepareCleanDelivery: Owner -> PASS')

  // Accountant: prepareCleanDelivery -> DENIED
  await assert.rejects(
    () => prepareCleanDelivery(db, {
      auth: { uid: uids.accountantA, token: {} },
      data: { tenantId: tenantAId },
    }),
    error => error.code === 'permission-denied'
  )
  pass('prepareCleanDelivery: Accountant -> DENIED (permission-denied)')

  // Warehouse: prepareCleanDelivery -> DENIED
  await assert.rejects(
    () => prepareCleanDelivery(db, {
      auth: { uid: uids.warehouseA, token: {} },
      data: { tenantId: tenantAId },
    }),
    error => error.code === 'permission-denied'
  )
  pass('prepareCleanDelivery: Warehouse -> DENIED (permission-denied)')

  // Distributor: prepareCleanDelivery -> DENIED
  await assert.rejects(
    () => prepareCleanDelivery(db, {
      auth: { uid: uids.distributorA, token: {} },
      data: { tenantId: tenantAId },
    }),
    error => error.code === 'permission-denied'
  )
  pass('prepareCleanDelivery: Distributor -> DENIED (permission-denied)')

  // =========================================================================
  // 5. Maintenance: executeCleanDelivery authorization
  // =========================================================================

  // Support: executeCleanDelivery passes tenantActor authorization layer.
  // When called with incorrect phrase, it throws 'invalid-argument' (phrase mismatch),
  // proving that Support was successfully AUTHORIZED by tenantActor(..., 'support.reset.prepare').
  await assert.rejects(
    () => executeCleanDelivery(db, {
      auth: { uid: uids.supportA, token: {} },
      data: { tenantId: tenantAId, phrase: 'FRASE_INCORRECTA', acknowledgement: true },
    }),
    error => error.code === 'invalid-argument' && error.message.includes('frase')
  )
  pass('executeCleanDelivery: Support supera la capa de autorización por permiso y alcanza validación de seguridad (PASS)')

  // Accountant: executeCleanDelivery fails at the tenantActor permission layer -> permission-denied
  await assert.rejects(
    () => executeCleanDelivery(db, {
      auth: { uid: uids.accountantA, token: {} },
      data: { tenantId: tenantAId, phrase: 'LIMPIAR PACHAX', acknowledgement: true },
    }),
    error => error.code === 'permission-denied'
  )
  pass('executeCleanDelivery: Accountant rechazado en capa de permisos -> DENIED (permission-denied)')

  // =========================================================================
  // 6. Multitenant Isolation on Maintenance
  // =========================================================================

  // Support A tries to prepare clean delivery on Tenant B -> DENIED
  await assert.rejects(
    () => prepareCleanDelivery(db, {
      auth: { uid: uids.supportA, token: {} },
      data: { tenantId: tenantBId },
    }),
    error => error.code === 'permission-denied'
  )
  pass('Cross-tenant: Support A intentando preparar Entrega Limpia en Tenant B -> DENIED (permission-denied)')

  // Support A tries to execute clean delivery on Tenant B -> DENIED
  await assert.rejects(
    () => executeCleanDelivery(db, {
      auth: { uid: uids.supportA, token: {} },
      data: { tenantId: tenantBId, phrase: 'LIMPIAR PACHAX', acknowledgement: true },
    }),
    error => error.code === 'permission-denied'
  )
  pass('Cross-tenant: Support A intentando ejecutar Entrega Limpia en Tenant B -> DENIED (permission-denied)')

  console.log(`\nTODAS LAS ${checks} PRUEBAS DE SEGURIDAD DE SERVIDOR PASARON SATISFACTORIAMENTE.`)
} finally {
  // Cleanup
}
