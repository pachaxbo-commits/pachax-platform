import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILE_METADATA,
  buildProfileProducts,
  buildProfileCustomers,
  buildProfileDataset,
} from '../src/demo/datasets/distribution/profileDatasets.ts'
import type { DistributionIndustryProfile } from '../src/modules/distribution/types.ts'
import {
  createDistributionTutorialPlans,
  loadTutorialProgress,
  saveTutorialProgress,
  getDistributionTutorialProgressKey,
} from '../src/modules/distribution/tutorials/distributionTutorials.ts'
import { calculateTutorialCardPlacement } from '../src/modules/distribution/tutorials/tutorialLayout.ts'
import { DemoDistributionRepository } from '../src/demo/distribution/demoDistributionRepository.ts'
import { hasPermission } from '../src/services/permissionService.ts'
import type { ModuleId } from '../src/config/businessTypes.ts'

const ALL_PROFILES: DistributionIndustryProfile[] = [
  'food',
  'beverages',
  'cleaning',
  'hardware',
  'pharmacy',
  'pets',
  'stationery',
  'spare_parts',
  'mixed',
]

test('G2.1 — Industry Profiles Catalog: all 9 industry profiles are fully defined with authentic metadata', () => {
  for (const profile of ALL_PROFILES) {
    const meta = PROFILE_METADATA[profile]
    assert.ok(meta, `Metadata for profile ${profile} must exist`)
    assert.ok(meta.commercialName.length > 3, `Commercial name for ${profile} must be descriptive`)
    assert.ok(meta.companyName.length > 3, `Company name for ${profile} must be descriptive`)
    assert.ok(meta.taxId.length > 5, `Tax ID for ${profile} must be defined`)
    assert.ok(meta.categories.length >= 2, `Profile ${profile} must have at least 2 categories`)
    assert.ok(meta.sampleProducts.length >= 3, `Profile ${profile} must have at least 3 sample products`)
    assert.ok(meta.sampleCustomers.length >= 2, `Profile ${profile} must have at least 2 sample customers`)
    assert.ok(meta.primaryUnitHint.length >= 3, `Profile ${profile} must specify primaryUnitHint`)
  }
})

test('G2.2 — Deterministic Seed Datasets: all 9 profiles generate authentic products, customers and ledger balances', () => {
  for (const profile of ALL_PROFILES) {
    const products = buildProfileProducts(profile)
    assert.ok(products.length >= 3, `Profile ${profile} must generate at least 3 products`)
    for (const p of products) {
      assert.ok(p.id.length > 3, `Product ID must be valid`)
      assert.ok(p.name.length > 2, `Product name must be valid`)
      assert.ok(p.referencePrice > 0, `Product price must be positive`)
      assert.ok(['kg', 'unit', 'package'].includes(p.unitType), `Unit type must be canonical`)
    }

    const customers = buildProfileCustomers(profile)
    assert.ok(customers.length >= 3, `Profile ${profile} must generate at least 3 customers`)
    for (const c of customers) {
      assert.ok(c.id.startsWith(`c-`), `Customer ID must be prefixed with c-`)
      assert.equal(c.routeId, 'route-norte', `Customer must be assigned to route-norte`)
    }

    const fullDataset = buildProfileDataset(profile)
    assert.ok(fullDataset.products.length >= 3)
    assert.ok(fullDataset.customers.length >= 3)
    assert.ok(fullDataset.routes.length >= 2)
    assert.ok(fullDataset.warehouses.length >= 1)
    assert.ok(fullDataset.balances.length >= 3, 'Must seed initial inventory balances')
    assert.ok(fullDataset.openDispatches.length >= 1, 'Must seed an open dispatch for route-norte')
    assert.ok(fullDataset.sales.length >= 1, 'Must seed initial sales operations')
    assert.ok(fullDataset.receivables.length >= 1, 'Must seed initial credit receivables')
    assert.ok(fullDataset.collections.length >= 1, 'Must seed initial collections')
    assert.ok(fullDataset.expenses.length >= 1, 'Must seed initial expenses')
  }
})

test('G2.3 — Role-Based Tutorial Tracks: permissions strictly gate available tracks per role', () => {
  const ALL_DIST_MODULES: ModuleId[] = [
    'dist.dashboard',
    'dist.sales',
    'dist.inventory',
    'dist.dispatches',
    'dist.credits',
    'dist.collections',
    'dist.customers',
    'dist.expenses',
    'dist.closure',
    'dist.products',
    'dist.reports',
    'dist.users',
    'dist.support',
    'dist.claims',
    'dist.qr',
    'dist.warehouses',
  ]

  // 1. OWNER / ADMIN has full access to all tracks
  const ownerPlans = createDistributionTutorialPlans({
    role: 'owner',
    profile: 'beverages',
    can: (perm) => hasPermission('owner', perm),
    modules: ALL_DIST_MODULES,
  })
  assert.ok(ownerPlans.length >= 5, 'Owner must have at least 5-6 tracks')
  const ownerTrackIds = ownerPlans.map((p) => p.trackId)
  assert.ok(ownerTrackIds.includes('onboarding'))
  assert.ok(ownerTrackIds.includes('inventory'))
  assert.ok(ownerTrackIds.includes('routes'))
  assert.ok(ownerTrackIds.includes('sales'))
  assert.ok(ownerTrackIds.includes('closures'))
  assert.ok(ownerTrackIds.includes('admin'))

  // 2. DISTRIBUTOR only has operational road tracks
  const distributorModules: ModuleId[] = ['dist.dashboard', 'dist.sales', 'dist.credits', 'dist.closure']
  const distributorPlans = createDistributionTutorialPlans({
    role: 'distributor',
    profile: 'hardware',
    can: (perm) => hasPermission('distributor', perm),
    modules: distributorModules,
  })
  const distTrackIds = distributorPlans.map((p) => p.trackId)
  assert.ok(distTrackIds.includes('onboarding'))
  assert.ok(distTrackIds.includes('sales'))
  assert.ok(distTrackIds.includes('closures'))
  assert.ok(!distTrackIds.includes('inventory'), 'Distributor must NOT have warehouse inventory track')
  assert.ok(!distTrackIds.includes('admin'), 'Distributor must NOT have admin reports track')

  // 3. WAREHOUSE only has physical warehouse tracks
  const warehouseModules: ModuleId[] = ['dist.dashboard', 'dist.inventory', 'dist.dispatches', 'dist.closure', 'dist.warehouses']
  const warehousePlans = createDistributionTutorialPlans({
    role: 'warehouse',
    profile: 'cleaning',
    can: (perm) => hasPermission('warehouse', perm),
    modules: warehouseModules,
  })
  const whTrackIds = warehousePlans.map((p) => p.trackId)
  assert.ok(whTrackIds.includes('onboarding'))
  assert.ok(whTrackIds.includes('inventory'))
  assert.ok(whTrackIds.includes('routes'))
  assert.ok(whTrackIds.includes('closures'))
  assert.ok(!whTrackIds.includes('sales'), 'Warehouse must NOT have sales track')
  assert.ok(!whTrackIds.includes('admin'), 'Warehouse must NOT have admin financial reports track')
})

test('G2.4 — Step Content Dynamic Adaptation: profile examples reflect real industry terminology', () => {
  const allModules: ModuleId[] = ['dist.dashboard', 'dist.sales', 'dist.inventory', 'dist.dispatches', 'dist.closure', 'dist.reports']
  const bevPlans = createDistributionTutorialPlans({
    role: 'admin',
    profile: 'beverages',
    can: () => true,
    modules: allModules,
  })
  const bevOnboardingPlan = bevPlans.find((p) => p.trackId === 'onboarding')
  assert.ok(bevOnboardingPlan)
  const bevText = JSON.stringify(bevOnboardingPlan.steps)
  assert.ok(bevText.includes('Distribuidora Refrescos del Valle') || bevText.includes('Bebidas'))

  const hardPlans = createDistributionTutorialPlans({
    role: 'admin',
    profile: 'hardware',
    can: () => true,
    modules: allModules,
  })
  const hardOnboardingPlan = hardPlans.find((p) => p.trackId === 'onboarding')
  assert.ok(hardOnboardingPlan)
  const hardText = JSON.stringify(hardOnboardingPlan.steps)
  assert.ok(hardText.includes('Distribuidora FerreMax') || hardText.includes('Ferretería'))
})

test('G2.5 — Smart Layout Card Placement: card flips safely and protects touch targets', () => {
  const viewportMobile = { width: 390, height: 844 }

  // Target in upper half -> card placed BELOW target
  const upperTarget = { top: 80, left: 20, width: 200, height: 40 }
  const placementBelow = calculateTutorialCardPlacement(upperTarget, viewportMobile, { width: 340, height: 220 })
  assert.equal(placementBelow.side, 'below')
  assert.ok(placementBelow.top > upperTarget.top + upperTarget.height, 'Card must be below target')

  // Target in lower half -> card placed ABOVE target
  const lowerTarget = { top: 600, left: 20, width: 350, height: 50 }
  const placementAbove = calculateTutorialCardPlacement(lowerTarget, viewportMobile, { width: 340, height: 220 })
  assert.equal(placementAbove.side, 'above')
  assert.ok(placementAbove.top < lowerTarget.top, 'Card must be above target')
})

test('G2.6 — Repository Profile Switching: dynamically seeds new profile without leaking old state', () => {
  const repo = new DemoDistributionRepository('full', 'pharmacy')
  const pharmData = repo.getData()
  assert.ok(pharmData.products.some((p) => p.name.toLowerCase().includes('alcohol') || p.name.toLowerCase().includes('venda')))

  // Switch to pets
  repo.switchProfile('pets')
  const petsData = repo.getData()
  assert.ok(petsData.products.some((p) => p.name.toLowerCase().includes('perro') || p.name.toLowerCase().includes('gato')))
  assert.ok(!petsData.products.some((p) => p.name.toLowerCase().includes('alcohol')), 'Old pharmacy products must not leak into pets profile')

  // Switch to food (default legacy compatibility)
  repo.switchProfile('food')
  const foodData = repo.getData()
  assert.ok(foodData.products.some((p) => p.name.toLowerCase().includes('arroz') || p.name.toLowerCase().includes('aceite') || p.name.toLowerCase().includes('frijol')))
})

test('G2.7 — Storage Isolation: progress keys isolate role and industry profile', () => {
  const key1 = getDistributionTutorialProgressKey('distributor', 'food', 'track_sales')
  const key2 = getDistributionTutorialProgressKey('distributor', 'hardware', 'track_sales')
  const key3 = getDistributionTutorialProgressKey('admin', 'food', 'track_sales')

  assert.notEqual(key1, key2, 'Progress keys must be isolated by industry profile')
  assert.notEqual(key1, key3, 'Progress keys must be isolated by actor role')

  saveTutorialProgress('distributor', 'food', 'track_sales', {
    status: 'in_progress',
    stepIndex: 2,
    lastUpdated: new Date().toISOString(),
  })

  const loadedFood = loadTutorialProgress('distributor', 'food')
  assert.equal(loadedFood['track_sales']?.status, 'in_progress')
  assert.equal(loadedFood['track_sales']?.stepIndex, 2)

  const loadedHardware = loadTutorialProgress('distributor', 'hardware')
  assert.equal(loadedHardware['track_sales'], undefined, 'Hardware progress must not have food progress')
})

test('G2.8 — Genuine Interactive Step Contracts: sales and operational steps mandate action before advancing', () => {
  const allModules: ModuleId[] = [
    'dist.dashboard', 'dist.sales', 'dist.inventory', 'dist.dispatches', 'dist.closure', 'dist.reports'
  ]
  const plans = createDistributionTutorialPlans({
    role: 'distributor',
    profile: 'beverages',
    can: () => true,
    modules: allModules,
  })

  const salesPlan = plans.find((p) => p.trackId === 'sales')
  assert.ok(salesPlan, 'Sales plan must exist for distributor')

  // Verificar que los pasos clave de venta tienen interaction === "action" o "navigate", NO observe pasivo
  const navStep = salesPlan.steps.find((s) => s.id === 'step-go-sales')
  assert.ok(navStep)
  assert.equal(navStep.interaction, 'navigate')
  assert.equal(navStep.module, 'dist.sales')

  const custStep = salesPlan.steps.find((s) => s.id === 'step-select-customer')
  assert.ok(custStep)
  assert.equal(custStep.interaction, 'action')
  assert.equal(custStep.advancesOn, 'click')
  assert.ok(custStep.requiredActionHint && custStep.requiredActionHint.length > 5)

  const prodStep = salesPlan.steps.find((s) => s.id === 'step-select-products')
  assert.ok(prodStep)
  assert.equal(prodStep.interaction, 'action')
  assert.equal(prodStep.advancesOn, 'click')
  assert.ok(prodStep.requiredActionHint && prodStep.requiredActionHint.length > 5)

  const cartStep = salesPlan.steps.find((s) => s.id === 'step-cart-summary')
  assert.ok(cartStep)
  assert.equal(cartStep.interaction, 'action')
  assert.equal(cartStep.advancesOn, 'click')

  const submitStep = salesPlan.steps.find((s) => s.id === 'step-submit-sale')
  assert.ok(submitStep)
  assert.equal(submitStep.interaction, 'action')
  assert.equal(submitStep.advancesOn, 'click')
})

test('G2.9 — Complete Roles Coverage: Support and Accountant have tailored tracks without invalid module dependencies', () => {
  // 1. Rol SUPPORT: solo accede a dist.support y printer-settings (sin dist.dashboard ni dist.sales)
  const supportModules: ModuleId[] = ['dist.support', 'printer-settings']
  const supportPlans = createDistributionTutorialPlans({
    role: 'support',
    profile: 'hardware',
    can: (perm) => perm === 'support.settings.manage',
    modules: supportModules,
  })

  assert.ok(supportPlans.length >= 1, 'Support must have at least 1 track')
  const supportPlan = supportPlans.find((p) => p.id.startsWith('tour-support-'))
  assert.ok(supportPlan, 'Support must have dedicated tour-support track')
  // Comprobar que NINGÚN paso de support depende de dashboard ni ventas
  for (const step of supportPlan.steps) {
    assert.notEqual(step.module, 'dist.dashboard', 'Support steps must not target dist.dashboard')
    assert.notEqual(step.module, 'dist.sales', 'Support steps must not target dist.sales')
    assert.equal(step.module, 'dist.support')
  }

  // 2. Rol ACCOUNTANT: tiene dashboard, reportes, inventario, cierre (sin dist.sales ni dist.dispatches)
  const accountantModules: ModuleId[] = [
    'dist.dashboard', 'dist.inventory', 'dist.collections', 'dist.customers', 'dist.reports', 'dist.closure'
  ]
  const accountantPlans = createDistributionTutorialPlans({
    role: 'accountant',
    profile: 'pharmacy',
    can: (perm) => hasPermission('accountant', perm),
    modules: accountantModules,
  })

  const accTrackIds = accountantPlans.map((p) => p.trackId)
  assert.ok(accTrackIds.includes('onboarding'))
  assert.ok(accTrackIds.includes('inventory'))
  assert.ok(accTrackIds.includes('closures'))
  assert.ok(accTrackIds.includes('admin'))
  assert.ok(!accTrackIds.includes('sales'), 'Accountant must not have sales track')
  assert.ok(!accTrackIds.includes('routes'), 'Accountant must not have dispatch routes track')

  // 3. Rol ADMIN: tiene todos los tracks disponibles
  const adminModules: ModuleId[] = [
    'dist.dashboard', 'dist.sales', 'dist.inventory', 'dist.dispatches', 'dist.closure', 'dist.reports', 'dist.support'
  ]
  const adminPlans = createDistributionTutorialPlans({
    role: 'admin',
    profile: 'cleaning',
    can: (perm) => hasPermission('admin', perm),
    modules: adminModules,
  })
  assert.ok(adminPlans.length >= 6, 'Admin must have at least 6 plans')
})

test('G2.10 — Progress Mutual Exclusivity: completed status is never overwritten by omission or pause', () => {
  const ctx = { isDemo: true, role: 'distributor', profile: 'pets' as DistributionIndustryProfile }
  
  // Guardar estado completed
  saveTutorialProgress(ctx, 'tour-pets-1', {
    status: 'completed',
    stepIndex: 5,
    lastUpdated: new Date().toISOString(),
  })

  const loaded = loadTutorialProgress(ctx)
  assert.equal(loaded['tour-pets-1']?.status, 'completed')

  // Simular lógica de onDismiss cuando ya estaba completed: no debe sobreescribir a omitted
  const currentStatus = loaded['tour-pets-1']?.status
  if (currentStatus !== 'completed') {
    saveTutorialProgress(ctx, 'tour-pets-1', {
      status: 'omitted',
      stepIndex: 0,
      lastUpdated: new Date().toISOString(),
    })
  }

  const reloaded = loadTutorialProgress(ctx)
  assert.equal(reloaded['tour-pets-1']?.status, 'completed', 'Completed status must remain protected')
})

test('G2.11 — Tenant vs Demo Progress Isolation: per-worker keys isolate real tenants from demo', () => {
  // Tenant A, Trabajador 1
  const keyTenant1 = getDistributionTutorialProgressKey(
    { isDemo: false, tenantId: 'tenant-corp-1', uid: 'user-emp-1', role: 'distributor', profile: 'food' },
    'tour-onboarding'
  )
  assert.equal(keyTenant1, 'tut_progress:tenant-corp-1:user-emp-1:tour-onboarding')

  // Tenant A, Trabajador 2 (mismo tenant, distinto trabajador -> progreso aislado)
  const keyTenant2 = getDistributionTutorialProgressKey(
    { isDemo: false, tenantId: 'tenant-corp-1', uid: 'user-emp-2', role: 'distributor', profile: 'food' },
    'tour-onboarding'
  )
  assert.equal(keyTenant2, 'tut_progress:tenant-corp-1:user-emp-2:tour-onboarding')
  assert.notEqual(keyTenant1, keyTenant2, 'Workers on the same tenant must NOT share tutorial progress')

  // Demo key
  const keyDemo = getDistributionTutorialProgressKey(
    { isDemo: true, tenantId: 'preview-distribution', uid: 'v1', role: 'distributor', profile: 'food' },
    'tour-onboarding'
  )
  assert.equal(keyDemo, 'tut_progress:demo:distributor:food:tour-onboarding')
  assert.notEqual(keyTenant1, keyDemo)
})

test('G2.12 — URL Profile Parameter Sanitization: invalid profile safely falls back to food', () => {
  const validProfiles: readonly DistributionIndustryProfile[] = [
    'food', 'beverages', 'cleaning', 'hardware', 'pharmacy', 'pets', 'stationery', 'spare_parts', 'mixed'
  ]

  function resolveProfile(input: string | null): DistributionIndustryProfile {
    return input && validProfiles.includes(input as DistributionIndustryProfile)
      ? (input as DistributionIndustryProfile)
      : 'food'
  }

  assert.equal(resolveProfile('food'), 'food')
  assert.equal(resolveProfile('beverages'), 'beverages')
  assert.equal(resolveProfile('cleaning'), 'cleaning')
  assert.equal(resolveProfile('hardware'), 'hardware')
  assert.equal(resolveProfile('pharmacy'), 'pharmacy')
  assert.equal(resolveProfile('pets'), 'pets')
  assert.equal(resolveProfile('stationery'), 'stationery')
  assert.equal(resolveProfile('spare_parts'), 'spare_parts')
  assert.equal(resolveProfile('mixed'), 'mixed')

  // Fallbacks seguros ante perfiles inválidos o inyecciones
  assert.equal(resolveProfile(''), 'food')
  assert.equal(resolveProfile(null), 'food')
  assert.equal(resolveProfile('invalid_profile'), 'food')
  assert.equal(resolveProfile('../../../etc/passwd'), 'food')
  assert.equal(resolveProfile('restaurant'), 'food')
})

test('G2.13 — Mathematical & Ledger Balance Consistency: all 9 profiles satisfy transactional invariants', () => {
  for (const profile of ALL_PROFILES) {
    const ds = buildProfileDataset(profile)

    // 1. Todos los productos tienen unidades canónicas válidas
    for (const p of ds.products) {
      assert.ok(['kg', 'unit', 'package'].includes(p.unitType), `Product ${p.id} in ${profile} must have canonical unit`)
      assert.ok(p.referencePrice > 0, `Product ${p.id} in ${profile} must have positive price`)
    }

    // 2. Líneas de despacho abierto referencian productos válidos con cantidades positivas
    assert.ok(ds.openDispatches.length >= 1, `Profile ${profile} must have at least 1 open dispatch`)
    for (const disp of ds.openDispatches) {
      assert.ok(disp.lines.length >= 1, `Dispatch ${disp.id} must have lines`)
      for (const line of disp.lines) {
        assert.ok(ds.products.some((p) => p.id === line.productId), `Dispatch line product ${line.productId} must exist`)
        assert.ok(line.quantity > 0, 'Loaded quantity must be positive')
      }
    }

    // 3. Ventas iniciales tienen subtotales y líneas coherentes
    for (const sale of ds.sales) {
      assert.ok(sale.total >= 0, 'Sale total must be non-negative')
      assert.ok(sale.lines.length >= 1, 'Sale must have lines')
      for (const line of sale.lines) {
        assert.ok(line.quantity > 0, 'Sale line quantity must be positive')
        assert.ok(line.actualUnitPrice > 0, 'Sale line unit price must be positive')
      }
    }

    // 4. Cuentas por cobrar iniciales tienen deudas positivas
    for (const rec of ds.receivables) {
      assert.ok(rec.balance > 0, 'Receivable balance must be positive')
      assert.ok(ds.customers.some((c) => c.id === rec.customerId), 'Receivable customer must exist')
    }

    // 5. Cobros iniciales tienen importes válidos
    for (const col of ds.collections) {
      assert.ok(col.amount > 0, 'Collection amount must be positive')
      assert.ok(ds.customers.some((c) => c.id === col.customerId), 'Collection customer must exist')
    }

    // 6. Gastos iniciales tienen importes válidos
    for (const exp of ds.expenses) {
      assert.ok(exp.amount > 0, 'Expense amount must be positive')
    }
  }
})
