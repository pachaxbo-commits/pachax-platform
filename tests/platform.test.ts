import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPlatform, canSupportWrite, canUseModule, platformFlags } from '../src/core/platform.ts'
import type { Membership, PlatformOperator, SupportSession, Tenant } from '../src/core/platform.ts'
import { getTemplate } from '../src/core/templates.ts'
import { cashClosure, createSaleLine, saleTotal, validatePayments } from '../src/core/sales.ts'

function fixture() {
  const template = getTemplate('gelateria_weight_cafe')
  const tenant: Tenant = { tenantId: 'a', name: 'Demo', businessType: template.businessType, ownerUid: 'u', status: 'trial',
    branding: { primary: '#20383A', accent: '#B58A55' }, configuration: template.defaults, entitlements: {}, planKey: null,
    subscriptionStatus: 'past_due', schemaVersion: 1, templateVersion: 1, createdAt: '', updatedAt: '' }
  const member: Membership = { tenantId: 'a', uid: 'u', roleId: 'cashier', status: 'active', branchIds: ['main'], routeIds: [] }
  return { template, tenant, member, module: template.modules.find(module => module.id === 'sell')! }
}
test('three explicit templates reject unknown business types', () => {
  for (const type of ['restaurant_pos', 'route_distribution', 'gelateria_weight_cafe']) assert.equal(getTemplate(type).businessType, type)
  assert.throws(() => getTemplate('unknown'))
  assert.throws(() => getTemplate('__proto__'))
})
test('tenant configuration never mutates the template preset', () => {
  const template = getTemplate('gelateria_weight_cafe')
  template.defaults.features.sales = false
  assert.equal(getTemplate('gelateria_weight_cafe').defaults.features.sales, true)
})
test('billing disabled does not block unpaid tenants', () => {
  const f = fixture()
  assert.equal(platformFlags.billingEnforcement, false)
  assert.equal(canUseModule(f.template, f.tenant, f.member, f.module), true)
})
test('cross-tenant, disabled and missing membership deny UI capability', () => {
  const f = fixture()
  for (const member of [null, { ...f.member, tenantId: 'b' }, { ...f.member, status: 'disabled' as const }]) {
    assert.equal(canUseModule(f.template, f.tenant, member, f.module), false)
  }
})
test('cashier cannot manage users; disabled modules stay hidden', () => {
  const f = fixture()
  assert.equal(canUseModule(f.template, f.tenant, f.member, f.template.modules.find(module => module.id === 'users')!), false)
  f.tenant.configuration.features.sales = false
  assert.equal(canUseModule(f.template, f.tenant, f.member, f.module), false)
})
test('tenant owner is not a platform owner and support has no finance permissions', () => {
  assert.equal(canPlatform({ uid: 'u', role: 'owner', active: true } as unknown as PlatformOperator, 'tenants.read'), false)
  assert.equal(canPlatform({ uid: 'p', role: 'platform_support', active: true }, 'support.read'), true)
  assert.equal(canPlatform({ uid: 'p', role: 'platform_support', active: true }, 'finance.read'), false)
})
test('support editing requires owner, identity, exact tenant, reason and live elevation', () => {
  const operator: PlatformOperator = { uid: 'p', role: 'platform_owner', active: true }
  const now = Date.parse('2026-09-21T12:00:00Z')
  const session: SupportSession = { id: 's', operatorUid: 'p', tenantId: 'a', viewedRoleId: 'cashier', mode: 'editing', reason: 'Corregir configuración', expiresAt: '2026-09-21T12:15:00Z' }
  assert.equal(canSupportWrite(operator, session, 'a', now), true)
  assert.equal(operator.role, 'platform_owner')
  for (const changed of [{ ...session, mode: 'read-only' as const }, { ...session, reason: ' ' }, { ...session, operatorUid: 'q' }, { ...session, expiresAt: 'invalid' }]) {
    assert.equal(canSupportWrite(operator, changed, 'a', now), false)
  }
  assert.equal(canSupportWrite(operator, session, 'b', now), false)
  assert.equal(canSupportWrite(operator, session, 'a', now + 1_000_000), false)
  assert.equal(canSupportWrite({ ...operator, role: 'platform_support' }, session, 'a', now), false)
})
const ice = { id: 'ice', name: 'Helado demo', soldBy: 'weight' as const, priceMinor: 6000, trackStock: true, stockUnit: 'g' as const }
test('weight: 250g at Bs60/kg is Bs15; 325g is Bs19.50', () => {
  assert.equal(createSaleLine(ice, 250).subtotalMinor, 1500)
  assert.equal(createSaleLine(ice, 325).subtotalMinor, 1950)
})
test('mixed cart totals exactly Bs54 and preserves weight snapshot', () => {
  const weight = createSaleLine(ice, 250)
  const coffee = createSaleLine({ id: 'coffee', name: 'Café demo', soldBy: 'unit', priceMinor: 1200, trackStock: false, stockUnit: 'unit' }, 2)
  const snack = createSaleLine({ id: 'snack', name: 'Bocadito demo', soldBy: 'unit', priceMinor: 500, trackStock: true, stockUnit: 'unit' }, 3)
  assert.equal(saleTotal([weight, coffee, snack]), 5400)
  assert.equal(weight.enteredUnit, 'g')
  assert.equal(weight.normalizedQuantity, 250)
  assert.equal(weight.unitPriceMinor, 6000)
})
test('quantity, price, units and overflow fail safely', () => {
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => createSaleLine(ice, quantity))
  assert.throws(() => createSaleLine({ ...ice, priceMinor: -1 }, 250))
  assert.throws(() => createSaleLine({ ...ice, stockUnit: 'unit' }, 250))
  assert.throws(() => createSaleLine({ ...ice, priceMinor: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER))
  assert.equal(createSaleLine({ ...ice, priceMinor: 5 }, 100).subtotalMinor, 1)
})
test('cash and QR settle separately; cash closure excludes QR', () => {
  validatePayments(5400, 2000, 3400)
  assert.throws(() => validatePayments(5400, 2000, 3401))
  assert.deepEqual(cashClosure(10000, 2000, 500, 11400), { expectedMinor: 11500, declaredMinor: 11400, differenceMinor: -100 })
})
