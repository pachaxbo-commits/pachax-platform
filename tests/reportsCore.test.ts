import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Tenant } from '../src/core/platform.ts'
import { canUseReportCapability } from '../src/core/reports/reportCapabilities.ts'
import { enterDemoMode, exitDemoMode } from '../src/demo/core/demoContext.ts'
import { assertReportSourceComplete, reportPaginationIsComplete, reportSourceMayBeTruncated } from '../src/core/reports/reportCompleteness.ts'
import { getBusinessReportPrintSheet } from '../src/core/reports/businessReportPrintService.ts'
import { summarizeNightclubReportPayments } from '../src/modules/nightclub/domain/nightclubReportPayments.ts'
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

test('report access without a tenant stays closed outside an isolated demo and never overrides tenant entitlements', () => {
  const restricted = {
    tenantId: 'restricted', businessType: 'nightclub_lounge', billingEnforcement: true,
    commercialCapabilities: { version: 1, businessType: 'nightclub_lounge', limits: { activeUsers: 1, activeProducts: 1, activeBranches: 1 }, features: { reports: { basic: false, detailed: false, export: false }, receipts: { digital: false }, printing: { manual: false, kitchenAutomatic: false }, adsRequired: false } },
  } as Tenant

  assert.equal(canUseReportCapability(null, 'reports.export'), false)
  enterDemoMode('isolated-report-test')
  try {
    assert.equal(canUseReportCapability(null, 'reports.export'), true)
    assert.equal(canUseReportCapability(restricted, 'reports.export'), false,
      'A demo context never overrides an active tenant capability snapshot')
  } finally {
    exitDemoMode()
  }
  assert.equal(canUseReportCapability(null, 'reports.export'), false)
})

test('capped report source marks the whole source incomplete before period filtering', () => {
  assert.equal(reportSourceMayBeTruncated(99, 100), false)
  assert.equal(reportSourceMayBeTruncated(100, 100), true)
  assert.equal(reportSourceMayBeTruncated(Number.NaN, 100), true)
  assert.throws(() => assertReportSourceComplete(100, 100, 'El historial de movimientos'), /no se puede presentar un total completo/)
  // The raw source hit 100 even though only one record matched the selected period.
  const selectedPeriodRows = 1
  assert.equal(selectedPeriodRows < 100, true)
  assert.throws(() => assertReportSourceComplete(100, 100), /límite/)
  const restaurantSource = readFileSync(new URL('../src/modules/restaurant/components/RestaurantReports.tsx', import.meta.url), 'utf8')
  const printAction = restaurantSource.slice(restaurantSource.indexOf('const runPrint'), restaurantSource.indexOf('return <div'))
  assert.match(printAction, /assertReportSourceComplete\(stockMovements\.length, 100/)
})

test('Retail report completion accepts exactly 10,000 only when the server confirms the final page', () => {
  assert.equal(reportPaginationIsComplete(9_999, 10_000, false), true)
  assert.equal(reportPaginationIsComplete(10_000, 10_000, false), true)
  assert.equal(reportPaginationIsComplete(10_000, 10_000, true), false)
  assert.equal(reportPaginationIsComplete(10_001, 10_000, false), false)
})

test('report print service selects only the summary sheet and leaves full exports intact', () => {
  const report = makeBusinessReport({
    tenantId: 'tenant-1', branchId: 'branch-1', businessType: 'hamburger_shop', generatedAt: '2026-10-29T12:00:00.000Z',
    period: { startDate: '2026-10-29', endDate: '2026-10-29', timeZone: 'America/La_Paz' }, identity,
    completeness: 'complete', recordCount: 2, warnings: [], sheets: [
      { name: 'Detalle', headers: ['Venta'], rows: [['A']] },
      { name: 'Resumen', headers: ['Concepto'], rows: [['Total']] },
    ],
  })
  assert.equal(getBusinessReportPrintSheet(report)?.name, 'Resumen')
  assert.equal(report.sheets.length, 2, 'PDF and Excel source still contains all report sheets')
})

test('Nightclub report uses paidAt/refundedAt, separates partial payments and mixed methods, and never infers legacy dates', () => {
  const oldOpenedAt = '2026-10-29T20:00:00-04:00'
  const summary = summarizeNightclubReportPayments([
    { id: 'old-account', openedAt: oldOpenedAt, openedBy: 'Apertura', status: 'closed', subtotal: 125, rounds: [], payments: [
      { id: 'mixed', method: 'mixed', amount: 100, cashAmount: 40, qrAmount: 50, cardAmount: 10, received: 40, change: 0, paidAt: '2026-10-30T08:00:00Z', paidBy: 'Cajero', status: 'partially_refunded', refundedAmount: 10, refundedAt: '2026-10-30T09:00:00Z' },
      { id: 'partial', method: 'cash', amount: 25, cashAmount: 25, qrAmount: 0, cardAmount: 0, received: 25, change: 0, paidAt: '2026-10-30T10:00:00Z', paidBy: 'Cajero', status: 'confirmed' },
      { id: 'exchange-refund', method: 'cash', amount: 5, cashAmount: 5, qrAmount: 0, cardAmount: 0, received: 0, change: 0, paidAt: '2026-10-30T11:00:00Z', paidBy: 'Admin', status: 'confirmed', kind: 'exchange_refund' },
      { id: 'pending-refund', method: 'qr', amount: 8, cashAmount: 0, qrAmount: 8, cardAmount: 0, received: 0, change: 0, paidAt: '2026-10-30T12:00:00Z', paidBy: 'Admin', status: 'confirmed', kind: 'pending_electronic_refund' },
    ] },
    { id: 'opened-today-paid-yesterday', openedAt: '2026-10-30T07:00:00Z', openedBy: 'Apertura', status: 'closed', subtotal: 50, rounds: [], payments: [
      { id: 'yesterday', method: 'cash', amount: 50, cashAmount: 50, qrAmount: 0, cardAmount: 0, received: 50, change: 0, paidAt: '2026-10-29T20:00:00Z', paidBy: 'Cajero', status: 'confirmed' },
    ] },
  ] as never, Date.parse('2026-10-30T04:00:00Z'), Date.parse('2026-10-31T04:00:00Z'))
  assert.equal(summary.incomplete, false)
  assert.deepEqual(summary.accountIds, ['old-account'])
  assert.equal(summary.grossCollections, 125)
  assert.equal(summary.refunds, 15)
  assert.equal(summary.netCollections, 110)
  assert.equal(summary.cashCollections, 65)
  assert.equal(summary.qrCollections, 50)
  assert.equal(summary.cardCollections, 10)
  assert.equal(summary.events.length, 4)

  const missingDate = summarizeNightclubReportPayments([
    { id: 'legacy', openedAt: oldOpenedAt, openedBy: 'Apertura', status: 'closed', subtotal: 50, rounds: [], payment: { method: 'cash', amount: 50, cashAmount: 50, qrAmount: 0, cardAmount: 0, received: 50, change: 0, paidAt: '', paidBy: 'Cajero' } },
  ] as never, Date.parse('2026-10-30T04:00:00Z'), Date.parse('2026-10-31T04:00:00Z'))
  assert.equal(missingDate.incomplete, true)
  assert.equal(missingDate.netCollections, 0)
})
