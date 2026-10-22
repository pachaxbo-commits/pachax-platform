import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSaleLine, saleTotal, validatePayments } from '../src/core/sales.ts'
import { isRetailProfile, RETAIL_PROFILES } from '../src/modules/retail/domain/retailProfiles.ts'
import { addScannedProduct, calculateRetailPayment, isUncertainRetailSaleError, parseRetailMoney, resolveRetailSaleAttempt, retailReceiptQuantity } from '../src/modules/retail/domain/retailPos.ts'
import { validateRetailImportFields } from '../src/modules/retail/domain/retailImportValidation.ts'
import { expectedRetailCash, retailCashReconciliation, retailQuantityLabel, summarizeRetailSales } from '../src/modules/retail/domain/retailCash.ts'

test('Retail accepts only the eight supported tenant profiles', () => {
  assert.equal(RETAIL_PROFILES.length, 8)
  for (const profile of RETAIL_PROFILES) assert.equal(isRetailProfile(profile.id), true)
  assert.equal(isRetailProfile('restaurant'), false)
  assert.equal(isRetailProfile(null), false)
})

test('weight sale uses integer grams and rounds one line once', () => {
  const line = createSaleLine({ id:'cheese', name:'Queso', soldBy:'weight', priceMinor:6000, trackStock:true, stockUnit:'g' }, 750)
  assert.equal(line.subtotalMinor, 4500)
  assert.equal(saleTotal([line]), 4500)
})

test('receipt expresses gram sales in kilograms so printed unit price matches the total', () => {
  assert.deepEqual(retailReceiptQuantity(750, 'g'), { quantity: 0.75, unitLabel: 'kg' })
  assert.deepEqual(retailReceiptQuantity(2, 'unit'), { quantity: 2, unitLabel: 'unidad' })
})

test('unit and mixed payment totals must equal the authoritative sale total', () => {
  const unit = createSaleLine({ id:'cookie', name:'Galleta', soldBy:'unit', priceMinor:1250, trackStock:true, stockUnit:'unit' }, 2)
  assert.equal(saleTotal([unit]), 2500)
  validatePayments(2500, 1000, 1500)
  assert.throws(() => validatePayments(2500, 1000, 1000), /pagos no coinciden/)
})

test('Retail payment form requires valid amounts and calculates cash change in minor units', () => {
  assert.equal(parseRetailMoney('12,50'), 1250)
  assert.equal(parseRetailMoney(''), null)
  assert.equal(parseRetailMoney('-1'), null)
  assert.equal(parseRetailMoney('1.234'), null)
  assert.deepEqual(calculateRetailPayment(6200, 'cash', '', '70'), {
    amounts: { cashMinor: 6200, qrMinor: 0, receivedMinor: 7000, changeMinor: 800 },
  })
  const insufficientCash = calculateRetailPayment(6200, 'cash', '', '60')
  assert.ok('error' in insufficientCash)
  assert.match(insufficientCash.error, /no cubre/)
  assert.deepEqual(calculateRetailPayment(6200, 'qr', '', ''), {
    amounts: { cashMinor: 0, qrMinor: 6200, receivedMinor: 0, changeMinor: 0 },
  })
  assert.deepEqual(calculateRetailPayment(6200, 'mixed', '40', '50'), {
    amounts: { cashMinor: 4000, qrMinor: 2200, receivedMinor: 5000, changeMinor: 1000 },
  })
  const invalidMix = calculateRetailPayment(6200, 'mixed', '62', '62')
  assert.ok('error' in invalidMix)
  assert.match(invalidMix.error, /menor que el total/)
  const insufficientMix = calculateRetailPayment(6200, 'mixed', '40', '39')
  assert.ok('error' in insufficientMix)
  assert.match(insufficientMix.error, /no cubre/)
})

test('rapid repeated scans add intentionally and sale retry reuses the operation id', () => {
  const once = addScannedProduct({}, 'coffee', 1)
  assert.deepEqual(addScannedProduct(once, 'coffee', 1), { coffee: 2 })
  assert.deepEqual(addScannedProduct({}, 'ice-cream', 100), { 'ice-cream': 100 })

  let sequence = 0
  const createId = () => `sale-${++sequence}`
  const payload = { items: [{ productId: 'coffee', quantity: 2 }], payment: { method: 'cash', cashMinor: 2500 } }
  const first = resolveRetailSaleAttempt(payload, null, createId)
  const retry = resolveRetailSaleAttempt(structuredClone(payload), first, createId)
  const changed = resolveRetailSaleAttempt({ ...payload, payment: { ...payload.payment, cashMinor: 3000 } }, retry, createId)
  assert.equal(first.operationId, retry.operationId)
  assert.notEqual(changed.operationId, first.operationId)
  assert.equal(sequence, 2)
  assert.equal(isUncertainRetailSaleError({ code: 'functions/unavailable' }), true)
  assert.equal(isUncertainRetailSaleError({ code: 'functions/permission-denied' }), false)
})

test('Excel import reports row-specific invalid values and accepts blank optional stock defaults', () => {
  const row = { row: 8, name: 'Leche', category: 'Lácteos', price: '12,50', cost: '', initialStock: '', minStock: '2', trackStock: 'sí', active: '' }
  assert.deepEqual(validateRetailImportFields(row), {
    priceMinor: 1250, initialStock: 0, minStock: 2, trackStock: true, active: true,
  })
  assert.throws(() => validateRetailImportFields({ ...row, price: '' }), /Fila 8: falta el precio de venta/)
  assert.throws(() => validateRetailImportFields({ ...row, price: '12.345' }), /Fila 8: precio de venta debe ser un importe válido/)
  assert.throws(() => validateRetailImportFields({ ...row, cost: '-2' }), /Fila 8: precio de compra debe ser un importe válido/)
  assert.throws(() => validateRetailImportFields({ ...row, initialStock: '1.5' }), /Fila 8: stock inicial debe ser un entero/)
  assert.throws(() => validateRetailImportFields({ ...row, trackStock: 'tal vez' }), /Fila 8: el valor de controlar stock debe ser Sí o No/)
})

test('cash expected uses net cash allocated to sales, manual movements and counted difference',()=>{
  const shift={openingFloatMinor:20000,cashSalesMinor:4500,manualInflowMinor:2500,manualOutflowMinor:2000}
  assert.equal(expectedRetailCash(shift),25000)
  assert.deepEqual(retailCashReconciliation(shift,24800),{expectedCashMinor:25000,countedCashMinor:24800,differenceMinor:-200})
  assert.equal(retailQuantityLabel(750,'g'),'0,75 kg')
  assert.equal(retailQuantityLabel(3,'unit'),'3 u.')
  assert.throws(()=>retailCashReconciliation(shift,-1),/importe válido/)
})

test('sales report separates cash and QR, groups units and grams, and leaves historical sales unattributed',()=>{
  const sales=[
    {saleId:'cash',tenantId:'t',branchId:'main',items:[{productId:'cheese',productNameSnapshot:'Queso',quantity:750,unit:'g',subtotalMinor:4500}],totalMinor:4500,payment:{method:'cash',cashMinor:4500,qrMinor:0,receivedMinor:5000,changeMinor:500},actorUid:'cashier',createdAt:'2026-10-22'},
    {saleId:'mix',tenantId:'t',branchId:'main',items:[{productId:'cheese',productNameSnapshot:'Queso',quantity:250,unit:'g',subtotalMinor:1500},{productId:'water',productNameSnapshot:'Agua',quantity:2,unit:'unit',subtotalMinor:1000}],totalMinor:2500,payment:{method:'mixed',cashMinor:1000,qrMinor:1500,receivedMinor:1000,changeMinor:0},actorUid:'cashier',createdAt:'2026-10-22'},
    {saleId:'legacy',tenantId:'t',branchId:'main',items:[{productId:'water',productNameSnapshot:'Agua',quantity:1,unit:'unit',subtotalMinor:500}],totalMinor:500,payment:{method:'qr',cashMinor:0,qrMinor:500,receivedMinor:0,changeMinor:0},createdAt:'2026-10-20'},
  ]
  const summary=summarizeRetailSales(sales)
  assert.equal(summary.totalSalesMinor,7500)
  assert.equal(summary.cashSalesMinor,5500)
  assert.equal(summary.qrSalesMinor,2000)
  assert.equal(summary.cashOnlySalesMinor,4500)
  assert.equal(summary.qrOnlySalesMinor,500)
  assert.equal(summary.mixedCashMinor,1000)
  assert.equal(summary.mixedQrMinor,1500)
  assert.equal(summary.changeMinor,500)
  assert.equal(summary.mixedCount,1)
  assert.deepEqual(summary.products.map(item=>[item.name,item.unit,item.quantity,item.subtotalMinor]),[['Queso','g',1000,6000],['Agua','unit',3,1500]])
  assert.deepEqual(summary.operators,[{uid:'cashier',salesCount:2,totalMinor:7000}])
})
