import assert from 'node:assert/strict'
import test from 'node:test'
import type { Tenant } from '../src/core/platform.ts'
import { canUseReportCapability } from '../src/core/reports/reportCapabilities.ts'
import { reportSourceMayBeTruncated } from '../src/core/reports/reportCompleteness.ts'
import { isInReportPeriod, reportPeriodUtcRange } from '../src/core/reports/reportPeriod.ts'
import { makeBusinessReport, toDigitalReportDocument } from '../src/core/reports/reportTypes.ts'

const identity = {
  companyName: 'Empresa ficticia', primaryColor: '#20383a', accentColor: '#b58a55',
  showLogo: false, showAddress: false, showPhone: false, showTaxId: false, showManagedBy: true,
  formattedHeaderLines: [], branchName: 'Principal',
}

test('report period is inclusive in company timezone and represented as half-open UTC', () => {
  const laPaz = reportPeriodUtcRange({ startDate: '2026-10-29', endDate: '2026-10-29', timeZone: 'America/La_Paz' })
  assert.equal(laPaz.startInclusive.toISOString(), '2026-10-29T04:00:00.000Z')
  assert.equal(laPaz.endExclusive.toISOString(), '2026-10-30T04:00:00.000Z')
  assert.equal(isInReportPeriod('2026-10-30T03:59:59.999Z', { startDate: '2026-10-29', endDate: '2026-10-29', timeZone: 'America/La_Paz' }), true)
  assert.equal(isInReportPeriod('2026-10-30T04:00:00.000Z', { startDate: '2026-10-29', endDate: '2026-10-29', timeZone: 'America/La_Paz' }), false)
})

test('report period handles DST length in company timezone and rejects invalid ranges', () => {
  const range = reportPeriodUtcRange({ startDate: '2026-03-08', endDate: '2026-03-08', timeZone: 'America/New_York' })
  assert.equal((range.endExclusive.getTime() - range.startInclusive.getTime()) / 3_600_000, 23)
  assert.throws(() => reportPeriodUtcRange({ startDate: '2026-02-30', endDate: '2026-03-01', timeZone: 'America/La_Paz' }), /no existe/)
  assert.throws(() => reportPeriodUtcRange({ startDate: '2026-03-02', endDate: '2026-03-01', timeZone: 'America/La_Paz' }), /posterior/)
  assert.throws(() => reportPeriodUtcRange({ startDate: '2026-03-01', endDate: '2026-03-01', timeZone: 'Invalid/Zone' }))
})

test('report contract validates identity, rows and blocks export of partial data', () => {
  const report = makeBusinessReport({
    tenantId: 'tenant-1', branchId: 'branch-1', businessType: 'hamburger_shop', generatedAt: '2026-10-29T12:00:00.000Z',
    period: { startDate: '2026-10-29', endDate: '2026-10-29', timeZone: 'America/La_Paz' }, identity,
    completeness: 'complete', recordCount: 1, warnings: [], sheets: [{ name: 'Ventas', headers: ['Venta', 'Total'], rows: [['sale-1', 10] as (string | number | null)[]] }],
  })
  assert.equal(toDigitalReportDocument(report).kind, 'digital_report')
  assert.throws(() => toDigitalReportDocument({ ...report, completeness: 'partial' }), /todas las páginas/)
  assert.throws(() => makeBusinessReport({ ...report, tenantId: '', schemaVersion: undefined } as never), /empresa, sucursal/)
  assert.throws(() => makeBusinessReport({ ...report, sheets: [{ name: 'Ventas', headers: ['A', 'B'], rows: [['only-one']] }] } as never), /filas/)
})

test('legacy, enforced, missing and mismatched report entitlements fail closed as intended', () => {
  const legacy = { tenantId: 'legacy', businessType: 'hamburger_shop', billingEnforcement: false } as Tenant
  assert.equal(canUseReportCapability(legacy, 'reports.basic'), true)
  assert.equal(canUseReportCapability(legacy, 'reports.export'), true)
  const enforced = {
    ...legacy, billingEnforcement: true,
    commercialCapabilities: { version: 1, businessType: 'hamburger_shop', limits: { activeUsers: 5, activeProducts: 50, activeBranches: 1 }, features: { reports: { basic: true, detailed: false, export: true }, receipts: { digital: true }, printing: { manual: true, kitchenAutomatic: true }, adsRequired: false } },
  } as Tenant
  assert.equal(canUseReportCapability(enforced, 'reports.basic'), true)
  assert.equal(canUseReportCapability(enforced, 'reports.detailed'), false)
  assert.equal(canUseReportCapability(enforced, 'reports.export'), true)
  assert.equal(canUseReportCapability({ ...enforced, commercialCapabilities: undefined }, 'reports.basic'), false)
  assert.equal(canUseReportCapability({ ...enforced, commercialCapabilities: { ...enforced.commercialCapabilities!, businessType: 'route_distribution' } }, 'reports.basic'), false)
})

test('capped report source marks the whole source incomplete before period filtering', () => {
  assert.equal(reportSourceMayBeTruncated(99, 100), false)
  assert.equal(reportSourceMayBeTruncated(100, 100), true)
  assert.equal(reportSourceMayBeTruncated(Number.NaN, 100), true)
})
