import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

import {
  EXPRESO_PUNATA_COMPANY,
  EXPRESO_PUNATA_TARIFF_CONFIG,
  EXPRESO_PUNATA_DUES_CONFIG,
  EXPRESO_PUNATA_THEME,
} from '../src/modules/parcel/domain/expresoPunataConfig.ts'
import {
  createFullExpresoPunataDataset,
  createEmptyExpresoPunataDataset,
} from '../src/demo/datasets/parcel/expresoPunataDatasets.ts'
import {
  calculateParcelPricing,
  validateParcelDelivery,
  calculateFinancialSummary,
  generateTrackingCode,
  generateManifestNumber,
  generateMonthlyDuesForPeriod,
  applyDuePayment,
} from '../src/modules/parcel/domain/parcelEngine.ts'
import {
  generateShipmentReceptionPdf,
  generateDeliveryReceiptPdf,
  generateUnionDueReceiptPdf,
  generateManifestPdf,
  generateOperationalReportPdf,
} from '../src/modules/parcel/domain/parcelDocuments.ts'
import {
  toExpresoPunataBusinessReport,
  toExpresoPunataDigitalReport,
} from '../src/modules/parcel/domain/expresoPunataReportAdapter.ts'
import { PUBLIC_TEMPLATES } from '../src/core/publicTemplates.ts'
import { DEFAULT_EXPRESO_PUNATA_BRANDING } from '../src/studio/branding/brandingTypes.ts'
import { EXPRESO_PUNATA_LOGO_DATA_URL } from '../src/modules/parcel/assets/expresoPunataLogo.ts'

test('Expreso Punata company identity, branding & assets are defined correctly', () => {
  assert.equal(EXPRESO_PUNATA_COMPANY.tradeName, 'S.M.T. EXPRESO PUNATA')
  assert.equal(EXPRESO_PUNATA_COMPANY.name, 'S.M.T. EXPRESO PUNATA')
  assert.equal(EXPRESO_PUNATA_COMPANY.acronym, 'S.M.T.')
  assert.match(EXPRESO_PUNATA_COMPANY.city || '', /Punata/)
  assert.match(EXPRESO_PUNATA_COMPANY.slogan || '', /Somos los Pioneros/)
  assert.equal(EXPRESO_PUNATA_COMPANY.serviceHours, 'Atención 24 Horas')
  assert.ok((EXPRESO_PUNATA_COMPANY.commercialServices || []).length >= 3)

  // Verify theme colors
  assert.equal(EXPRESO_PUNATA_THEME.primary, '#064e3b') // Dark forest green
  assert.equal(EXPRESO_PUNATA_THEME.accent, '#facc15') // Intense yellow
  assert.equal(DEFAULT_EXPRESO_PUNATA_BRANDING.primaryColor, '#064e3b')
  assert.equal(DEFAULT_EXPRESO_PUNATA_BRANDING.accentColor, '#facc15')

  // Check physical logo file exists on disk
  const logoPath = path.resolve('public/brand/expreso-punata-logo.jpg')
  assert.ok(fs.existsSync(logoPath), 'Logo file must exist in public/brand/expreso-punata-logo.jpg')
  const stats = fs.statSync(logoPath)
  assert.ok(stats.size > 1000, 'Logo file size should be non-trivial')

  // Check base64 logo
  assert.ok(EXPRESO_PUNATA_LOGO_DATA_URL.startsWith('data:image/jpeg;base64,'))
})

test('Expreso Punata datasets: Full and Empty structural integrity and cash reconciliation', () => {
  const full = createFullExpresoPunataDataset()
  assert.equal(full.companyInfo?.tradeName, 'S.M.T. EXPRESO PUNATA')
  assert.equal(full.currentBranchId, 'branch-punata')
  assert.equal(full.branches.length, 5)
  assert.equal(full.members.length, 6)
  assert.equal(full.workers.length, 3)
  assert.equal(full.shipments.length, 5)
  assert.equal(full.manifests.length, 2)
  assert.equal(full.unionExpenses.length, 4)
  assert.ok(full.activeShift !== null)

  // Verify exact mathematical cash reconciliation:
  // initialCash: 300.00
  // totalCashIn: 65.00 (ENC-PUN-26-001) + 150.00 (CUOTA-PUN-26-001) = 215.00
  // totalCashOut: 75.00 (Agua potable) + 200.00 (Adelanto sueldo) = 275.00
  // expectedCash: 300 + 215 - 275 = 240.00
  const cashShift = full.activeShift!
  assert.equal(cashShift.initialCash, 300)
  assert.equal(cashShift.totalCashIn, 215)
  assert.equal(cashShift.totalCashOut, 275)
  assert.equal(cashShift.expectedCash, 240)
  assert.equal(cashShift.status, 'open')

  // Verify Empty dataset
  const empty = createEmptyExpresoPunataDataset()
  assert.equal(empty.companyInfo?.tradeName, 'S.M.T. EXPRESO PUNATA')
  assert.equal(empty.members.length, 0)
  assert.equal(empty.shipments.length, 0)
  assert.equal(empty.manifests.length, 0)
  assert.equal(empty.dues.length, 0)
  assert.equal(empty.unionExpenses.length, 0)
  assert.equal(empty.workers.length, 0)
  assert.equal(empty.activeShift, null)
  assert.ok(empty.branches.length >= 1)
})

test('Expreso Punata dues generation and payment lifecycle', () => {
  const members = [
    {
      id: 'soc-1',
      memberNumber: 'SOC-001',
      fullName: 'Ramiro Vallejos Guzmán',
      phone: '71452369',
      vehicleType: 'surubi' as const,
      licensePlate: '3045-EXP',
      vehicleNumber: '08',
      monthlyFee: EXPRESO_PUNATA_DUES_CONFIG.monthlyDueAmount,
      status: 'active' as const,
      joinedDate: '2020-03-15',
    },
    {
      id: 'soc-2',
      memberNumber: 'SOC-002',
      fullName: 'Gonzalo Claros Arispe',
      phone: '72234190',
      vehicleType: 'minibus' as const,
      licensePlate: '2819-PUN',
      vehicleNumber: '14',
      monthlyFee: EXPRESO_PUNATA_DUES_CONFIG.driverMonthlyDueAmount,
      status: 'active' as const,
      joinedDate: '2021-08-10',
    },
  ]

  const { createdDues, skippedCount } = generateMonthlyDuesForPeriod(
    members,
    [],
    '2026-10',
    'Octubre 2026',
    '2026-10-31',
    120
  )

  assert.equal(createdDues.length, 2)
  assert.equal(skippedCount, 0)
  assert.equal(createdDues[0].amount, 120) // regular due
  assert.equal(createdDues[1].amount, 90) // driver due

  // Apply partial payment of Bs. 50
  const partialPaid = applyDuePayment(
    createdDues[0],
    50,
    'cash',
    'Operador Ventanilla',
    'REC-PUN-001'
  )
  assert.equal(partialPaid.paidAmount, 50)
  assert.equal(partialPaid.balance, 70)
  assert.equal(partialPaid.status, 'partial')

  // Apply complete remaining payment of Bs. 70
  const fullyPaid = applyDuePayment(
    partialPaid,
    70,
    'transfer',
    'Operador Ventanilla',
    'REC-PUN-002'
  )
  assert.equal(fullyPaid.paidAmount, 120)
  assert.equal(fullyPaid.balance, 0)
  assert.equal(fullyPaid.status, 'paid')
})

test('Expreso Punata parcel pricing calculation with company tariff config', () => {
  // Base package (under 3 kg, no home delivery) -> Bs. 15.00
  const p1 = calculateParcelPricing({
    weightKg: 2,
    deliveryType: 'agency',
    tariffConfig: EXPRESO_PUNATA_TARIFF_CONFIG,
  })
  assert.equal(p1.baseFee, 15)
  assert.equal(p1.weightSurcharge, 0)
  assert.equal(p1.homeDeliveryFee, 0)
  assert.equal(p1.finalAmount, 15)

  // Heavy package: 8 kg with home delivery -> 3 included, 5 extra * Bs. 2 = Bs. 10 surcharge + Bs. 12 home delivery = Bs. 37.00
  const p2 = calculateParcelPricing({
    weightKg: 8,
    deliveryType: 'home',
    tariffConfig: EXPRESO_PUNATA_TARIFF_CONFIG,
  })
  assert.equal(p2.baseFee, 15)
  assert.equal(p2.weightSurcharge, 10)
  assert.equal(p2.homeDeliveryFee, 12)
  assert.equal(p2.finalAmount, 37)
})

test('Expreso Punata code generation prefixes', () => {
  const trackingCode = generateTrackingCode([], 2026, 'PUN')
  assert.match(trackingCode, /^PUN-2026-\d{5}$/)

  const manifestNumber = generateManifestNumber([], 2026, 'MAN-PUN')
  assert.match(manifestNumber, /^MAN-PUN-2026-\d{4}$/)
})

test('Expreso Punata delivery validation: rejects third-party without required relationship & doc', () => {
  const shipment = createFullExpresoPunataDataset().shipments[0]
  // Put shipment in ready_for_pickup state for delivery testing
  const readyShipment = { ...shipment, status: 'ready_for_pickup' as const }

  // Delivery to actual recipient -> valid
  const res1 = validateParcelDelivery(
    readyShipment,
    readyShipment.recipient.name,
    '1234567',
    'titular',
    false
  )
  assert.equal(res1.canDeliver, true)

  // Delivery to third party without relationship/reason -> invalid
  const res2 = validateParcelDelivery(
    readyShipment,
    'Carlos Tercero',
    '9988776',
    'familiar',
    false,
    ''
  )
  assert.equal(res2.canDeliver, false)
  assert.match(res2.error!, /justificación, autorización/)

  // Delivery to third party with full authorization -> valid
  const res3 = validateParcelDelivery(
    readyShipment,
    'Carlos Tercero',
    '9988776',
    'familiar',
    false,
    'Hermano autorizado por llamada telefónica'
  )
  assert.equal(res3.canDeliver, true)
})

test('Expreso Punata financial summary engine matches all transactions accurately', () => {
  const full = createFullExpresoPunataDataset()
  const summary = calculateFinancialSummary({
    movements: full.cashMovements,
    workerPayments: full.workerPayments,
    unionExpenses: full.unionExpenses,
    initialCash: full.activeShift?.initialCash || 0,
  })

  // Verify financial summary computes correctly
  assert.ok(summary.byCategory.shippingOriginIncome > 0)
  assert.ok(summary.byCategory.unionDuesIncome > 0)
  assert.ok(summary.expenses.standaloneUnionExpenses > 0)
  assert.ok(summary.expenses.totalWorkerPayments > 0)

  // Net operating result = total recognition - expenses
  const expectedNet =
    summary.totalIncomeAllMethods -
    summary.expenses.totalOperationalExpenses

  assert.equal(summary.netOperatingBalance, expectedNet)
})

test('Expreso Punata document generation includes company context and produces valid pdfs', async () => {
  const full = createFullExpresoPunataDataset()
  const shipment = full.shipments[0]
  const due = full.dues[0]
  const manifest = full.manifests[0]

  // Setup DOMParser mock if needed in node test environment
  if (typeof (globalThis as any).DOMParser === 'undefined') {
    Object.defineProperty(globalThis, 'DOMParser', {
      value: class {
        parseFromString() {
          return { querySelector: () => null }
        }
      },
      configurable: true,
    })
  }

  // 1. Shipment reception 80mm
  const ticket80 = await generateShipmentReceptionPdf(shipment, {
    format: '80mm',
    company: full.companyInfo,
  })
  assert.ok(ticket80.blob.size > 1000)
  assert.match(ticket80.filename, /80mm\.pdf/)

  // 2. Shipment reception A4
  const guideA4 = await generateShipmentReceptionPdf(shipment, {
    format: 'a4',
    company: full.companyInfo,
  })
  assert.ok(guideA4.blob.size > 1000)
  assert.match(guideA4.filename, /A4\.pdf/)

  // 3. Delivery receipt
  const deliveredShipment = full.shipments.find(s => s.status === 'delivered') || {
    ...shipment,
    status: 'delivered' as const,
    delivery: {
      deliveredAt: new Date().toISOString(),
      deliveredByBranchId: 'branch-punata',
      deliveredByBranchName: 'Punata - Parada Central',
      receivedByName: 'Destinatario Demo',
      receivedByDoc: '5678910',
      recipientRelationship: 'titular' as const,
      paymentCollectedOnDelivery: 0,
      paymentMethod: 'cash' as const,
      cashierUid: 'c1',
      cashierName: 'Operador Demo',
    },
  }
  const deliveryDoc = await generateDeliveryReceiptPdf(
    deliveredShipment,
    deliveredShipment.delivery!,
    { company: full.companyInfo }
  )
  assert.ok(deliveryDoc.blob.size > 1000)

  // 4. Union due receipt
  const dueDoc = await generateUnionDueReceiptPdf(due, due.payments[0], {
    company: full.companyInfo,
  })
  assert.ok(dueDoc.blob.size > 1000)

  // 5. Dispatch manifest
  const manifestDoc = await generateManifestPdf(manifest, full.shipments, {
    company: full.companyInfo,
  })
  assert.ok(manifestDoc.blob.size > 1000)

  // 6. Operational report
  const repDoc = await generateOperationalReportPdf(
    {
      title: 'Reporte General de Encomiendas Expreso Punata',
      subtitle: 'Consolidado de despachos y aportes sindicales',
      headers: ['Guía', 'Origen', 'Destino', 'Remitente', 'Destinatario', 'Estado', 'Monto'],
      rows: full.shipments.map(s => [
        s.trackingCode,
        s.originCity,
        s.destinationCity,
        s.sender.name,
        s.recipient.name,
        s.status,
        s.finalAmount,
      ]),
      summaryLines: ['Total Encomiendas: 5', 'Total Facturado: Bs 265.00'],
    },
    { company: full.companyInfo }
  )
  assert.ok(repDoc.blob.size > 1000)
})

test('Expreso Punata adapter maps state to Codex canonical BusinessReportV1 contract', () => {
  const full = createFullExpresoPunataDataset()
  const report = toExpresoPunataBusinessReport(full)

  assert.equal(report.schemaVersion, 1)
  assert.equal(report.businessType, 'parcel_punata_sindicato')
  assert.equal(report.identity.companyName, 'S.M.T. EXPRESO PUNATA')
  assert.equal(report.completeness, 'complete')
  assert.ok(report.sheets.length >= 5)

  const sheetNames = report.sheets.map(s => s.name)
  assert.ok(sheetNames.includes('Resumen Financiero'))
  assert.ok(sheetNames.includes('Encomiendas'))
  assert.ok(sheetNames.includes('Aportes Sindicales'))
  assert.ok(sheetNames.includes('Gastos Sindicales'))
  assert.ok(sheetNames.includes('Padrón de Socios'))

  // Verify digital report document generation
  const digitalDoc = toExpresoPunataDigitalReport(full)
  assert.equal(digitalDoc.kind, 'digital_report')
  assert.equal(digitalDoc.identity.companyName, 'S.M.T. EXPRESO PUNATA')
  assert.equal(digitalDoc.payload.businessType, 'parcel_punata_sindicato')
})

test('Zero public catalog leakage: Expreso Punata is strictly an internal client demo in Studio', () => {
  // Check PUBLIC_TEMPLATES has not been polluted
  const publicIds = PUBLIC_TEMPLATES.map(t => t.id)
  assert.ok(!publicIds.includes('parcel' as any))
  assert.ok(!publicIds.includes('expreso-punata' as any))
  assert.equal(publicIds.length, 5, 'PUBLIC_TEMPLATES must keep exactly the 5 canonical public templates')
})
