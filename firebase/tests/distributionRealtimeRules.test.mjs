import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
const tenantId = 'tenant-dist-realtime'
const foreignTenantId = 'tenant-dist-foreign'

const uids = {
  owner: 'qa-dist-owner',
  admin: 'qa-dist-admin',
  accountant: 'qa-dist-accountant',
  support: 'qa-dist-support',
  distributorA: 'qa-dist-distributor-a',
  distributorB: 'qa-dist-distributor-b',
  warehouse: 'qa-dist-warehouse',
}

const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 8185,
    rules: fs.readFileSync('firebase/firestore.rules', 'utf8'),
  },
})

let checks = 0
const pass = (msg) => {
  checks++
  console.log('PASS', msg)
}

try {
  // Seed database without security rules
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()

    // 1. Tenants
    await setDoc(doc(db, 'tenants', tenantId), {
      id: tenantId,
      name: 'Distribuidora Realtime QA',
      businessType: 'route_distribution',
      active: true,
    })
    await setDoc(doc(db, 'tenants', foreignTenantId), {
      id: foreignTenantId,
      name: 'Otra Distribuidora QA',
      businessType: 'route_distribution',
      active: true,
    })

    // 2. Memberships
    const member = (uid, tId, roleId) => ({
      uid,
      tenantId: tId,
      roleId,
      status: 'active',
      branchIds: ['main'],
      routeIds: roleId === 'distributor' ? [uid === uids.distributorA ? 'route-a' : 'route-b'] : [],
      warehouseId: 'central',
    })

    for (const [key, uid] of Object.entries(uids)) {
      await setDoc(doc(db, 'tenants', tenantId, 'members', uid), member(uid, tenantId, key.startsWith('distributor') ? 'distributor' : key))
    }

    // 3. Operational documents
    // Dispatches
    await setDoc(doc(db, 'tenants', tenantId, 'distDispatches', 'disp-a'), {
      id: 'disp-a',
      tenantId,
      distributorUid: uids.distributorA,
      routeId: 'route-a',
      status: 'open',
    })
    await setDoc(doc(db, 'tenants', tenantId, 'distDispatches', 'disp-b'), {
      id: 'disp-b',
      tenantId,
      distributorUid: uids.distributorB,
      routeId: 'route-b',
      status: 'open',
    })

    // Sales
    await setDoc(doc(db, 'tenants', tenantId, 'distSales', 'sale-a'), {
      id: 'sale-a',
      tenantId,
      sellerUid: uids.distributorA,
      routeId: 'route-a',
      total: 150,
    })
    await setDoc(doc(db, 'tenants', tenantId, 'distSales', 'sale-b'), {
      id: 'sale-b',
      tenantId,
      sellerUid: uids.distributorB,
      routeId: 'route-b',
      total: 300,
    })

    // Closures
    await setDoc(doc(db, 'tenants', tenantId, 'distClosures', 'close-a'), {
      id: 'close-a',
      tenantId,
      distributorUid: uids.distributorA,
      routeId: 'route-a',
      status: 'closed',
    })
    await setDoc(doc(db, 'tenants', tenantId, 'distClosures', 'close-b'), {
      id: 'close-b',
      tenantId,
      distributorUid: uids.distributorB,
      routeId: 'route-b',
      status: 'closed',
    })

    // SupportConfig
    await setDoc(doc(db, 'tenants', tenantId, 'supportConfig', 'main'), {
      tenantId,
      expiryAlertDays: 14,
      creditBlockDays: 7,
      requireQrVerification: true,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.admin,
    })
  })

  // Authenticated clients
  const ownerClient = env.authenticatedContext(uids.owner).firestore()
  const adminClient = env.authenticatedContext(uids.admin).firestore()
  const accountantClient = env.authenticatedContext(uids.accountant).firestore()
  const supportClient = env.authenticatedContext(uids.support).firestore()
  const distAClient = env.authenticatedContext(uids.distributorA).firestore()
  const distBClient = env.authenticatedContext(uids.distributorB).firestore()
  const warehouseClient = env.authenticatedContext(uids.warehouse).firestore()

  // Tenant scoped universal catalog profile and descriptive SKU contents.
  const catalogSettings = {
    id: 'catalog', tenantId, industryProfile: 'beverages', updatedAt: new Date().toISOString(),
    categories: [{ id: 'soft-drinks', name: 'Gaseosas', active: true }],
  }
  await assertSucceeds(setDoc(doc(ownerClient, 'tenants', tenantId, 'distSettings', 'catalog'), catalogSettings))
  pass('owner configura el perfil y categorías de su catálogo Distribution')
  await assertSucceeds(setDoc(doc(adminClient, 'tenants', tenantId, 'distSettings', 'catalog'), { ...catalogSettings, industryProfile: 'cleaning' }))
  pass('admin puede cambiar el perfil conservando categorías existentes')
  await assertFails(setDoc(doc(accountantClient, 'tenants', tenantId, 'distSettings', 'catalog'), catalogSettings))
  pass('accountant no administra catálogo de Distribution')
  await assertFails(setDoc(doc(ownerClient, 'tenants', foreignTenantId, 'distSettings', 'catalog'), { ...catalogSettings, tenantId: foreignTenantId }))
  pass('el perfil de catálogo no puede escribirse en otro tenant')
  await assertSucceeds(setDoc(doc(adminClient, 'tenants', tenantId, 'distProducts', 'sku-box'), {
    id: 'sku-box', tenantId, name: 'Refresco', category: 'Gaseosas', unitType: 'package',
    saleUnitLabel: 'caja', sku: 'BEB-12', presentationContent: { amount: 12, unit: 'unit' },
    referencePrice: 60, productionCost: 40, minimumStock: 1, active: true,
  }))
  pass('producto universal guarda presentación como SKU de caja sin alterar su unidad operativa')
  await assertFails(setDoc(doc(adminClient, 'tenants', tenantId, 'distProducts', 'sku-bad'), {
    id: 'sku-bad', tenantId, name: 'Producto', category: 'Gaseosas', unitType: 'package',
    presentationContent: { amount: 1, unit: 'kg', conversion: 1000 }, referencePrice: 1, active: true,
  }))
  pass('Rules rechazan campos de conversión no admitidos')

  // =========================================================================
  // 1. TESTS supportConfig: Hardening de permisos y exclusión de Accountant
  // =========================================================================

  // Owner update -> PASS
  await assertSucceeds(
    updateDoc(doc(ownerClient, 'tenants', tenantId, 'supportConfig', 'main'), {
      expiryAlertDays: 10,
      creditBlockDays: 5,
      requireQrVerification: false,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.owner,
    })
  )
  pass('supportConfig: Owner update -> PASS')

  // Admin update -> PASS
  await assertSucceeds(
    updateDoc(doc(adminClient, 'tenants', tenantId, 'supportConfig', 'main'), {
      expiryAlertDays: 15,
      creditBlockDays: 8,
      requireQrVerification: true,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.admin,
    })
  )
  pass('supportConfig: Admin update -> PASS')

  // Accountant update -> DENIED
  await assertFails(
    updateDoc(doc(accountantClient, 'tenants', tenantId, 'supportConfig', 'main'), {
      expiryAlertDays: 20,
      creditBlockDays: 10,
      requireQrVerification: true,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.accountant,
    })
  )
  pass('supportConfig: Accountant update -> DENIED')

  // Support update -> DENIED
  await assertFails(
    updateDoc(doc(supportClient, 'tenants', tenantId, 'supportConfig', 'main'), {
      expiryAlertDays: 20,
      creditBlockDays: 10,
      requireQrVerification: true,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.support,
    })
  )
  pass('supportConfig: Support update -> DENIED')

  // Distributor update -> DENIED
  await assertFails(
    updateDoc(doc(distAClient, 'tenants', tenantId, 'supportConfig', 'main'), {
      expiryAlertDays: 20,
      creditBlockDays: 10,
      requireQrVerification: true,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.distributorA,
    })
  )
  pass('supportConfig: Distributor update -> DENIED')

  // Warehouse update -> DENIED
  await assertFails(
    updateDoc(doc(warehouseClient, 'tenants', tenantId, 'supportConfig', 'main'), {
      expiryAlertDays: 20,
      creditBlockDays: 10,
      requireQrVerification: true,
      updatedAt: new Date().toISOString(),
      updatedBy: uids.warehouse,
    })
  )
  pass('supportConfig: Warehouse update -> DENIED')

  // Support read -> PASS
  await assertSucceeds(getDoc(doc(supportClient, 'tenants', tenantId, 'supportConfig', 'main')))
  pass('supportConfig: Support getDoc main -> PASS')
  await assertSucceeds(getDocs(collection(supportClient, 'tenants', tenantId, 'supportConfig')))
  pass('supportConfig: Support list query -> PASS')

  // Accountant read -> PASS
  await assertSucceeds(getDoc(doc(accountantClient, 'tenants', tenantId, 'supportConfig', 'main')))
  pass('supportConfig: Accountant getDoc main -> PASS')
  await assertSucceeds(getDocs(collection(accountantClient, 'tenants', tenantId, 'supportConfig')))
  pass('supportConfig: Accountant list query -> PASS')

  // =========================================================================
  // 2. TESTS Realtime Distribuidor: Queries focalizadas y aislamiento
  // =========================================================================

  // Distributor A: query sus dispatches -> PASS
  const dispatchesQueryA = query(
    collection(distAClient, 'tenants', tenantId, 'distDispatches'),
    where('distributorUid', '==', uids.distributorA)
  )
  await assertSucceeds(getDocs(dispatchesQueryA))
  pass('distDispatches: Distributor A query sus dispatches -> PASS')

  // Distributor A: query sus sales -> PASS
  const salesQueryA = query(
    collection(distAClient, 'tenants', tenantId, 'distSales'),
    where('sellerUid', '==', uids.distributorA)
  )
  await assertSucceeds(getDocs(salesQueryA))
  pass('distSales: Distributor A query sus sales -> PASS')

  // Distributor A: query sus closures -> PASS
  const closuresQueryA = query(
    collection(distAClient, 'tenants', tenantId, 'distClosures'),
    where('distributorUid', '==', uids.distributorA)
  )
  await assertSucceeds(getDocs(closuresQueryA))
  pass('distClosures: Distributor A query sus closures -> PASS')

  // Distributor A: leer documento propio -> PASS
  await assertSucceeds(getDoc(doc(distAClient, 'tenants', tenantId, 'distDispatches', 'disp-a')))
  await assertSucceeds(getDoc(doc(distAClient, 'tenants', tenantId, 'distSales', 'sale-a')))
  await assertSucceeds(getDoc(doc(distAClient, 'tenants', tenantId, 'distClosures', 'close-a')))
  pass('Distributor A: lectura de documentos propios -> PASS')

  // Distributor A: intentar leer documento de Distributor B -> DENIED
  await assertFails(getDoc(doc(distAClient, 'tenants', tenantId, 'distDispatches', 'disp-b')))
  await assertFails(getDoc(doc(distAClient, 'tenants', tenantId, 'distSales', 'sale-b')))
  await assertFails(getDoc(doc(distAClient, 'tenants', tenantId, 'distClosures', 'close-b')))
  pass('Distributor A: leer documento de Distributor B -> DENIED')

  // Distributor A: query sin filtro (unconstrained list) -> DENIED
  await assertFails(getDocs(collection(distAClient, 'tenants', tenantId, 'distDispatches')))
  await assertFails(getDocs(collection(distAClient, 'tenants', tenantId, 'distSales')))
  await assertFails(getDocs(collection(distAClient, 'tenants', tenantId, 'distClosures')))
  pass('Distributor A: query sin filtro (unconstrained list) -> DENIED')

  // Distributor A: query que podría devolver B -> DENIED
  const queryForBDispatches = query(
    collection(distAClient, 'tenants', tenantId, 'distDispatches'),
    where('distributorUid', '==', uids.distributorB)
  )
  await assertFails(getDocs(queryForBDispatches))

  const queryForBSales = query(
    collection(distAClient, 'tenants', tenantId, 'distSales'),
    where('sellerUid', '==', uids.distributorB)
  )
  await assertFails(getDocs(queryForBSales))

  const queryForBClosures = query(
    collection(distAClient, 'tenants', tenantId, 'distClosures'),
    where('distributorUid', '==', uids.distributorB)
  )
  await assertFails(getDocs(queryForBClosures))
  pass('Distributor A: query que podría devolver B -> DENIED')

  // Cross-tenant -> DENIED
  const crossDispatches = query(
    collection(distAClient, 'tenants', foreignTenantId, 'distDispatches'),
    where('distributorUid', '==', uids.distributorA)
  )
  await assertFails(getDocs(crossDispatches))

  const crossSales = query(
    collection(distAClient, 'tenants', foreignTenantId, 'distSales'),
    where('sellerUid', '==', uids.distributorA)
  )
  await assertFails(getDocs(crossSales))

  const crossClosures = query(
    collection(distAClient, 'tenants', foreignTenantId, 'distClosures'),
    where('distributorUid', '==', uids.distributorA)
  )
  await assertFails(getDocs(crossClosures))
  pass('Cross-tenant queries -> DENIED')

  // Admin: query sin restricción -> PASS
  await assertSucceeds(getDocs(collection(adminClient, 'tenants', tenantId, 'distDispatches')))
  await assertSucceeds(getDocs(collection(adminClient, 'tenants', tenantId, 'distSales')))
  await assertSucceeds(getDocs(collection(adminClient, 'tenants', tenantId, 'distClosures')))
  pass('Admin: queries generales sin filtro -> PASS')

  // No abrir permisos de escritura: clientes no escriben dispatches, sales ni closures directamente
  await assertFails(
    setDoc(doc(distAClient, 'tenants', tenantId, 'distDispatches', 'disp-forged'), {
      tenantId,
      distributorUid: uids.distributorA,
    })
  )
  await assertFails(
    setDoc(doc(distAClient, 'tenants', tenantId, 'distSales', 'sale-forged'), {
      tenantId,
      sellerUid: uids.distributorA,
    })
  )
  await assertFails(
    setDoc(doc(distAClient, 'tenants', tenantId, 'distClosures', 'close-forged'), {
      tenantId,
      distributorUid: uids.distributorA,
    })
  )
  await assertFails(
    setDoc(doc(adminClient, 'tenants', tenantId, 'distDispatches', 'disp-forged-admin'), {
      tenantId,
      distributorUid: uids.admin,
    })
  )
  pass('Escritura directa de dispatches, sales y closures por clientes -> DENIED')

  console.log(`\nTODAS LAS ${checks} PRUEBAS FOCALES DE REGLAS PASARON SATISFACTORIAMENTE.`)
} finally {
  await env.cleanup()
}
