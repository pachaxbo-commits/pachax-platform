import assert from 'node:assert/strict'
import test from 'node:test'
import { canUseDocumentCapability, requiredPrintCapability } from '../src/core/documents/documentCapabilities.ts'
import { resolveBusinessDocumentContext } from '../src/core/documents/businessDocumentContext.ts'
import { makeBusinessDocument } from '../src/core/documents/documentTypes.ts'
import { canonicalReceiptToPrintJobPayload } from '../src/core/receiptService.ts'
import type { Tenant } from '../src/core/platform.ts'

const legacy = { tenantId: 'legacy', name: 'Comercio', businessType: 'gelateria_weight_cafe', ownerUid: 'owner',
  status: 'active', branding: { primary: '#123456', accent: '#ffffff' }, configuration: { currency: 'BOB', currencySymbol: 'Bs',
    timezone: 'America/La_Paz', features: {}, trackStock: true, allowNegativeStock: false, ticketWidth: 80, paymentMethods: ['cash'] },
  entitlements: {}, planKey: null, subscriptionStatus: 'trial', schemaVersion: 1, templateVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } satisfies Tenant

test('document capabilities preserve legacy behavior and enforce active snapshots', () => {
  assert.equal(canUseDocumentCapability(legacy, 'receipts.digital'), true)
  const enforced = { ...legacy, billingEnforcement: true, commercialCapabilities: {
    version: 1 as const, businessType: legacy.businessType,
    limits: { activeUsers: 1, activeProducts: 10, activeBranches: 1 },
    features: { reports: { basic: true, detailed: false, export: false }, receipts: { digital: true },
      printing: { manual: false, kitchenAutomatic: true }, adsRequired: false },
  } }
  assert.equal(canUseDocumentCapability(enforced, 'receipts.digital'), true)
  assert.equal(canUseDocumentCapability(enforced, 'printing.manual'), false)
  assert.equal(canUseDocumentCapability(enforced, 'printing.kitchenAutomatic'), true)
  assert.equal(canUseDocumentCapability({ ...enforced, commercialCapabilities: undefined }, 'receipts.digital'), false)
})

test('print requests resolve the manual or automatic capability explicitly', () => {
  assert.equal(requiredPrintCapability('kitchen_ticket', 'automatic'), 'printing.kitchenAutomatic')
  assert.equal(requiredPrintCapability('bar_ticket', 'automatic'), 'printing.kitchenAutomatic')
  assert.equal(requiredPrintCapability('kitchen_ticket', 'manual'), 'printing.manual')
  assert.equal(requiredPrintCapability('receipt', 'automatic'), 'printing.manual')
  assert.equal(requiredPrintCapability('test'), 'printing.manual')
})

test('company and branch identity resolve into one document context', () => {
  const context = resolveBusinessDocumentContext({ tradeName: 'Mercado Uno', primaryColor: '#123456', accentColor: '#654321',
    showLogo: true, showAddress: true, showPhone: true, showTaxId: true, showManagedBy: false },
  { name: 'Sucursal Norte', address: 'Av. Central 10', phone: '70000000' })
  assert.equal(context.companyName, 'Mercado Uno')
  assert.equal(context.branchName, 'Sucursal Norte')
  assert.ok(context.formattedHeaderLines.includes('Av. Central 10'))
  assert.ok(context.formattedHeaderLines.some(line => line.includes('70000000')))
  const legacyContext = resolveBusinessDocumentContext(undefined, undefined, { companyName: 'Tienda Central', logoUrl: '/brand.png' })
  assert.equal(legacyContext.companyName, 'Tienda Central')
  assert.equal(legacyContext.logoUrl, '/brand.png')
})

test('shared document envelope requires tenant, branch, source and a valid date', () => {
  const base = { kind: 'customer_receipt' as const, tenantId: 't1', branchId: 'b1', sourceId: 'sale1',
    createdAt: '2026-10-29T12:00:00.000Z', identity: resolveBusinessDocumentContext(undefined), payload: { receiptNumber: '1' } }
  assert.equal(makeBusinessDocument(base).schemaVersion, 1)
  assert.throws(() => makeBusinessDocument({ ...base, branchId: '' }), /empresa, sucursal/)
  assert.throws(() => makeBusinessDocument({ ...base, kind: 'unknown' as never }), /tipo de documento/)
  assert.throws(() => makeBusinessDocument({ ...base, identity: {} as never }), /identidad/)
  assert.throws(() => makeBusinessDocument({ ...base, createdAt: 'invalid' }), /fecha/)
})

test('shared receipt projection preserves totals and company branding', () => {
  const context = resolveBusinessDocumentContext({ tradeName: 'Mercado Uno', logoUrl: '/logo.png' }, { name: 'Sucursal Norte', address: 'Av. Central 10' })
  const payload = canonicalReceiptToPrintJobPayload({ receiptNumber: 'V-10', dateIso: '2026-10-29T12:00:00.000Z',
    items: [{ name: 'Producto', quantity: 2, unitPrice: 7, lineTotal: 14 }], subtotal: 14, total: 14, paymentMethod: 'Efectivo' }, context)
  assert.equal(payload.restaurantName, 'Mercado Uno')
  assert.equal(payload.branchName, 'Sucursal Norte')
  assert.equal(payload.logoUrl, '/logo.png')
  assert.equal(payload.grandTotal, 14)
  assert.equal(payload.items[0].lineTotal, 14)
})

