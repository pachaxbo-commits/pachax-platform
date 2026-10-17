import test from 'node:test'
import assert from 'node:assert/strict'
import {
  round2,
  computeMoneySummary,
  computeSellerBreakdown,
  validateCollection,
  validateSalePayment,
  splitPayment,
  computeSoldByProduct,
  collectionQrAmount,
} from '../src/modules/distribution/domain/engine.ts'
import type {
  DistReceivable,
  DistCollection,
  DistSale,
  DistExpense,
  DistCreditOverride,
  DistCreditStatus,
  DistCollectionAllocation,
} from '../src/modules/distribution/types.ts'

// In-memory simulation of the server-authoritative FIFO and individual collection engine matching operations.cjs
function applyFifoCollection(params: {
  debts: DistReceivable[]
  amount: number
  method: 'cash' | 'qr' | 'mixed'
  cashAmount?: number
  qrAmount?: number
  receivableId?: string
  customerId: string
  customerName: string
  routeId: string
  collectorUid: string
  collectorName: string
  note?: string
}) {
  const amount = round2(params.amount)
  assert.ok(amount > 0, 'El monto debe ser mayor a 0.')
  assert.ok(['cash', 'qr', 'mixed'].includes(params.method), 'Método inválido.')

  let cashAmount = 0
  let qrAmount = 0
  if (params.method === 'cash') {
    cashAmount = amount
  } else if (params.method === 'qr') {
    qrAmount = amount
  } else if (params.method === 'mixed') {
    assert.ok(Number.isFinite(params.cashAmount) && (params.cashAmount ?? 0) > 0, 'Monto en efectivo inválido.')
    assert.ok(Number.isFinite(params.qrAmount) && (params.qrAmount ?? 0) > 0, 'Monto en QR inválido.')
    cashAmount = round2(params.cashAmount ?? 0)
    qrAmount = round2(params.qrAmount ?? 0)
    assert.ok(Math.abs(round2(cashAmount + qrAmount) - amount) < 0.01, 'Suma de efectivo y QR debe coincidir.')
  }

  const specificReceivableId = params.receivableId
  let sortedDebts: DistReceivable[] = []
  if (specificReceivableId) {
    const target = params.debts.find((d) => d.id === specificReceivableId)
    assert.ok(target && target.balance > 0, 'La deuda no existe o ya está pagada.')
    assert.ok(amount <= target.balance, 'El cobro supera el saldo de la deuda.')
    sortedDebts = [target]
  } else {
    sortedDebts = params.debts
      .filter((d) => d.balance > 0)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id))
  }

  const portfolioBalanceBefore = round2(sortedDebts.reduce((sum, d) => sum + d.balance, 0))
  assert.ok(amount <= portfolioBalanceBefore, 'El cobro supera el saldo pendiente.')

  let remaining = amount
  const allocations: DistCollectionAllocation[] = []

  for (const d of sortedDebts) {
    if (remaining <= 0.0001) break
    const applied = round2(Math.min(remaining, d.balance))
    const balanceBefore = d.balance
    const balanceAfter = round2(balanceBefore - applied)
    d.paidAmount = round2((d.paidAmount || 0) + applied)
    d.balance = balanceAfter
    d.status = balanceAfter === 0 ? 'PAID' : 'PARTIAL'
    allocations.push({
      receivableId: d.id,
      saleId: d.saleId,
      originRouteId: d.routeId,
      balanceBefore,
      appliedAmount: applied,
      balanceAfter,
    })
    remaining = round2(remaining - applied)
  }

  const portfolioBalanceAfter = round2(portfolioBalanceBefore - amount)

  const collectionDoc: DistCollection = {
    id: `col-${Date.now()}`,
    tenantId: 'tenant-test',
    branchId: 'main',
    createdAt: new Date().toISOString(),
    createdBy: params.collectorUid,
    dayKey: '2026-10-16',
    schemaVersion: 2,
    operationId: `col-op-${Date.now()}`,
    receivableId: sortedDebts.length === 1 ? sortedDebts[0].id : (allocations[0]?.receivableId || ''),
    allocations,
    portfolioBalanceBefore,
    portfolioBalanceAfter,
    customerId: params.customerId,
    customerName: params.customerName,
    routeId: params.routeId,
    originRouteId: sortedDebts[0]?.routeId || params.routeId,
    collectedByUid: params.collectorUid,
    collectedByName: params.collectorName,
    amount,
    method: params.method,
    cashAmount,
    qrAmount,
    note: params.note || '',
  }

  return { collection: collectionDoc, updatedDebts: sortedDebts }
}

test('D2 TEST 30: Cobranza canónica FIFO por cliente sobre múltiples deudas abiertas', () => {
  // Cliente Doña Martha tiene 3 deudas consecutivas
  const debts: DistReceivable[] = [
    {
      id: 'rec-01',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-10T08:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-10',
      schemaVersion: 2,
      saleId: 'sale-01',
      customerId: 'cust-martha',
      customerName: 'Doña Martha',
      routeId: 'route-norte',
      distributorUid: 'seller-1',
      distributorName: 'Hugo Choque',
      originalAmount: 100,
      paidAmount: 0,
      balance: 100,
      status: 'OPEN',
    },
    {
      id: 'rec-02',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-12T09:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-12',
      schemaVersion: 2,
      saleId: 'sale-02',
      customerId: 'cust-martha',
      customerName: 'Doña Martha',
      routeId: 'route-norte',
      distributorUid: 'seller-1',
      distributorName: 'Hugo Choque',
      originalAmount: 150,
      paidAmount: 0,
      balance: 150,
      status: 'OPEN',
    },
    {
      id: 'rec-03',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-15T10:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-15',
      schemaVersion: 2,
      saleId: 'sale-03',
      customerId: 'cust-martha',
      customerName: 'Doña Martha',
      routeId: 'route-norte',
      distributorUid: 'seller-1',
      distributorName: 'Hugo Choque',
      originalAmount: 200,
      paidAmount: 0,
      balance: 200,
      status: 'OPEN',
    },
  ]

  // Saldo total previo = 450 Bs.
  // Se registra cobro de 180 Bs en efectivo.
  const { collection, updatedDebts } = applyFifoCollection({
    debts,
    amount: 180,
    method: 'cash',
    customerId: 'cust-martha',
    customerName: 'Doña Martha',
    routeId: 'route-norte',
    collectorUid: 'seller-1',
    collectorName: 'Hugo Choque',
    note: 'Pago parcial a cuenta',
  })

  // 1. Verificación de la colección
  assert.equal(collection.amount, 180)
  assert.equal(collection.portfolioBalanceBefore, 450)
  assert.equal(collection.portfolioBalanceAfter, 270)
  assert.equal(collection.allocations?.length, 2)

  // 2. Primera deuda (rec-01) pagada por completo (100 Bs)
  const alloc1 = collection.allocations?.[0]
  assert.equal(alloc1?.receivableId, 'rec-01')
  assert.equal(alloc1?.appliedAmount, 100)
  assert.equal(alloc1?.balanceBefore, 100)
  assert.equal(alloc1?.balanceAfter, 0)
  const debt1 = updatedDebts.find((d) => d.id === 'rec-01')
  assert.equal(debt1?.status, 'PAID')
  assert.equal(debt1?.balance, 0)
  assert.equal(debt1?.paidAmount, 100)

  // 3. Segunda deuda (rec-02) pagada parcialmente con los 80 Bs restantes
  const alloc2 = collection.allocations?.[1]
  assert.equal(alloc2?.receivableId, 'rec-02')
  assert.equal(alloc2?.appliedAmount, 80)
  assert.equal(alloc2?.balanceBefore, 150)
  assert.equal(alloc2?.balanceAfter, 70)
  const debt2 = updatedDebts.find((d) => d.id === 'rec-02')
  assert.equal(debt2?.status, 'PARTIAL')
  assert.equal(debt2?.balance, 70)
  assert.equal(debt2?.paidAmount, 80)

  // 4. Tercera deuda (rec-03) permanece intacta
  const debt3 = updatedDebts.find((d) => d.id === 'rec-03')
  assert.equal(debt3?.status, 'OPEN')
  assert.equal(debt3?.balance, 200)
  assert.equal(debt3?.paidAmount, 0)
})

test('D2 TEST 31: Cobro cruzado de cartera entre rutas (Ruta A y B cobradas en Ruta C)', () => {
  const debts: DistReceivable[] = [
    {
      id: 'rec-route-a',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-11T08:00:00Z',
      createdBy: 'seller-a',
      dayKey: '2026-10-11',
      schemaVersion: 2,
      saleId: 'sale-a',
      customerId: 'cust-comercial',
      customerName: 'Comercial El Carmen',
      routeId: 'route-a',
      distributorUid: 'seller-a',
      distributorName: 'Vendedor Ruta A',
      originalAmount: 120,
      paidAmount: 0,
      balance: 120,
      status: 'OPEN',
    },
    {
      id: 'rec-route-b',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-13T08:00:00Z',
      createdBy: 'seller-b',
      dayKey: '2026-10-13',
      schemaVersion: 2,
      saleId: 'sale-b',
      customerId: 'cust-comercial',
      customerName: 'Comercial El Carmen',
      routeId: 'route-b',
      distributorUid: 'seller-b',
      distributorName: 'Vendedor Ruta B',
      originalAmount: 80,
      paidAmount: 0,
      balance: 80,
      status: 'OPEN',
    },
  ]

  // Cobrador de Ruta C cobra 150 Bs
  const { collection } = applyFifoCollection({
    debts,
    amount: 150,
    method: 'cash',
    customerId: 'cust-comercial',
    customerName: 'Comercial El Carmen',
    routeId: 'route-c',
    collectorUid: 'seller-c',
    collectorName: 'Vendedor Ruta C',
  })

  // El efectivo pertenece a Ruta C (caja de quien cobra)
  assert.equal(collection.routeId, 'route-c')
  assert.equal(collection.amount, 150)

  // Cada asignación conserva la ruta de origen de la deuda
  assert.equal(collection.allocations?.[0].originRouteId, 'route-a')
  assert.equal(collection.allocations?.[0].appliedAmount, 120)
  assert.equal(collection.allocations?.[1].originRouteId, 'route-b')
  assert.equal(collection.allocations?.[1].appliedAmount, 30)
})

test('D2 TEST 32: Cobro mixto Efectivo + QR y su impacto en resúmenes financieros', () => {
  const debts: DistReceivable[] = [
    {
      id: 'rec-mora',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-14T08:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-14',
      schemaVersion: 2,
      saleId: 'sale-mora',
      customerId: 'cust-mora',
      customerName: 'Tienda San Juan',
      routeId: 'route-norte',
      distributorUid: 'seller-1',
      distributorName: 'Hugo Choque',
      originalAmount: 300,
      paidAmount: 0,
      balance: 300,
      status: 'OPEN',
    },
  ]

  // Cobro mixto: 120 Bs en efectivo + 80 Bs en QR = 200 Bs total
  const { collection } = applyFifoCollection({
    debts,
    amount: 200,
    method: 'mixed',
    cashAmount: 120,
    qrAmount: 80,
    customerId: 'cust-mora',
    customerName: 'Tienda San Juan',
    routeId: 'route-norte',
    collectorUid: 'seller-1',
    collectorName: 'Hugo Choque',
  })

  assert.equal(collection.method, 'mixed')
  assert.equal(collection.amount, 200)
  assert.equal(collection.cashAmount, 120)
  assert.equal(collection.qrAmount, 80)

  // Evaluación en el motor contable de Distribution (computeMoneySummary)
  const sales: DistSale[] = [
    {
      id: 'sale-dummy',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-16T10:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-16',
      schemaVersion: 2,
      operationId: 'op-sale-dummy',
      sourceLocation: 'route',
      routeId: 'route-norte',
      routeName: 'Ruta Norte',
      sellerUid: 'seller-1',
      sellerName: 'Hugo Choque',
      lines: [],
      total: 100,
      paymentKind: 'cash',
      cashAmount: 100,
      qrAmount: 0,
      creditAmount: 0,
    },
  ]

  const expenses: DistExpense[] = [
    {
      id: 'exp-1',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-16T11:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-16',
      schemaVersion: 2,
      operationId: 'op-exp-1',
      concept: 'Gasolina',
      amount: 30,
      routeId: 'route-norte',
      routeName: 'Ruta Norte',
      registeredByUid: 'seller-1',
      registeredByName: 'Hugo Choque',
    },
  ]

  const moneySummary = computeMoneySummary(sales, [collection], expenses)
  assert.equal(moneySummary.cashSales, 100)
  assert.equal(moneySummary.cashCollections, 120)
  assert.equal(moneySummary.qrCollections, 80)
  assert.equal(moneySummary.collectionsTotal, 200)
  assert.equal(moneySummary.cashExpenses, 30)
  // expectedCash = 100 (ventas ef) + 120 (cobros ef) - 30 (gastos) = 190
  assert.equal(moneySummary.expectedCash, 190)

  // Evaluación del desglose por vendedor
  const breakdowns = computeSellerBreakdown(sales, [collection], expenses)
  assert.equal(breakdowns.length, 1)
  assert.equal(breakdowns[0].sellerUid, 'seller-1')
  assert.equal(breakdowns[0].collected, 200)
  assert.equal(breakdowns[0].expectedCash, 190)
})

test('D2 TEST 33: Ventas de cortesía auditadas (consumo físico, total 0, snapshot de valor referencial y costo)', () => {
  // Venta de cortesía de 3 kg de Viena Especial (precio de lista 42 Bs/kg, costo 28 Bs/kg)
  const courtesySale: DistSale = {
    id: 'sale-courtesy-01',
    tenantId: 'tenant-test',
    branchId: 'main',
    createdAt: '2026-10-16T10:00:00Z',
    createdBy: 'seller-1',
    dayKey: '2026-10-16',
    schemaVersion: 2,
    operationId: 'op-courtesy-01',
    sourceLocation: 'route',
    routeId: 'route-norte',
    routeName: 'Ruta Norte',
    sellerUid: 'seller-1',
    sellerName: 'Hugo Choque',
    lines: [
      {
        productId: 'p-viena',
        productNameSnapshot: 'Viena Especial',
        quantity: 3,
        unitType: 'kg',
        actualUnitPrice: 0,
        subtotal: 0,
        referenceUnitPriceSnapshot: 42,
        referenceSubtotal: 126,
        costTotal: 84,
      },
    ],
    total: 0,
    paymentKind: 'cash',
    cashAmount: 0,
    qrAmount: 0,
    creditAmount: 0,
    saleKind: 'courtesy',
    courtesyReason: 'Degustación para apertura de nueva sucursal cliente',
    courtesyReferenceValue: 126,
    courtesyCostTotal: 84,
  }

  // 1. Integridad de los importes
  assert.equal(courtesySale.total, 0)
  assert.equal(courtesySale.cashAmount, 0)
  assert.equal(courtesySale.qrAmount, 0)
  assert.equal(courtesySale.creditAmount, 0)
  assert.equal(courtesySale.saleKind, 'courtesy')
  assert.equal(courtesySale.courtesyReason, 'Degustación para apertura de nueva sucursal cliente')
  assert.equal(courtesySale.courtesyReferenceValue, 126)
  assert.equal(courtesySale.courtesyCostTotal, 84)

  // 2. Comprobación de que no infla ventas monetarias pero sí computa consumo físico
  const soldMap = computeSoldByProduct([courtesySale])
  const vienaSold = soldMap.get('p-viena')
  assert.ok(vienaSold)
  assert.equal(vienaSold.quantity, 3) // Descuenta del stock físico de ruta
  assert.equal(vienaSold.amount, 0) // No infla ventas comerciales

  // 3. Resumen financiero general
  const moneySummary = computeMoneySummary([courtesySale], [], [])
  assert.equal(moneySummary.salesTotal, 0)
  assert.equal(moneySummary.cashSales, 0)
  assert.equal(moneySummary.qrSales, 0)
  assert.equal(moneySummary.creditGenerated, 0)
  assert.equal(moneySummary.expectedCash, 0)
})

test('D2 TEST 34: Regla de mora y excepción administrativa de crédito (distCreditOverrides)', () => {
  const customerId = 'cust-moroso-1'
  const creditBlockDays = 7

  // 1. Simulación de deudas del cliente: tiene deuda de hace 10 días
  const debts: DistReceivable[] = [
    {
      id: 'rec-old',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      createdBy: 'seller-1',
      dayKey: '2026-10-06',
      schemaVersion: 2,
      saleId: 'sale-old',
      customerId,
      customerName: 'Cliente Moroso',
      routeId: 'route-norte',
      distributorUid: 'seller-1',
      distributorName: 'Hugo Choque',
      originalAmount: 100,
      paidAmount: 0,
      balance: 100,
      status: 'OPEN',
    },
  ]

  // Función de evaluación del bloqueo de mora
  function checkMoraBlocked(creditAmount: number, activeOverride: DistCreditOverride | null) {
    if (creditAmount === 0) return false // Contado / QR siempre permitido
    const isOverdue = debts.some(
      (d) => d.balance > 0 && new Date(d.createdAt).getTime() + creditBlockDays * 86400000 <= Date.now()
    )
    if (!isOverdue) return false
    return !activeOverride || activeOverride.active === false || (activeOverride.validUntil && activeOverride.validUntil < new Date().toISOString())
  }

  // Caso A: Venta en efectivo a cliente con créditos vencidos -> PERMITIDO
  assert.equal(checkMoraBlocked(0, null), false, 'Venta de contado no debe bloquearse por mora')

  // Caso B: Venta a crédito sin excepción -> BLOQUEADO
  assert.equal(checkMoraBlocked(50, null), true, 'Venta a crédito debe bloquearse por créditos vencidos')

  // Caso C: Admin otorga excepción temporal activa
  const validUntil = new Date(Date.now() + 7 * 86400000).toISOString()
  const override: DistCreditOverride = {
    id: 'ov-001',
    tenantId: 'tenant-test',
    branchId: 'main',
    createdAt: new Date().toISOString(),
    createdBy: 'admin-uid',
    dayKey: '2026-10-16',
    schemaVersion: 2,
    customerId,
    customerName: 'Cliente Moroso',
    reason: 'Autorizado por Gerencia para entrega especial de fin de semana',
    validFrom: new Date().toISOString(),
    validUntil,
    createdByName: 'Administrador General',
    active: true,
  }

  assert.equal(checkMoraBlocked(50, override), false, 'Con excepción activa la venta a crédito debe permitirse')

  // Caso D: Excepción revocada por administración -> BLOQUEADO NUEVAMENTE
  const revokedOverride: DistCreditOverride = {
    ...override,
    active: false,
    revokedAt: new Date().toISOString(),
    revokedBy: 'admin-uid',
    revokedByName: 'Administrador General',
  }
  assert.equal(checkMoraBlocked(50, revokedOverride), true, 'Excepción revocada no autoriza créditos')

  // Caso E: Excepción expirada -> BLOQUEADO
  const expiredOverride: DistCreditOverride = {
    ...override,
    validUntil: new Date(Date.now() - 3600000).toISOString(), // Expiró hace 1 hora
  }
  assert.equal(checkMoraBlocked(50, expiredOverride), true, 'Excepción vencida no autoriza créditos')
})

test('D2 TEST 35: Validaciones negativas y casos límite de cobros, pagos mixtos y excepciones', () => {
  // 1. Cobro que supera el saldo total del cliente
  const valOverAmount = validateCollection(500, 300)
  assert.ok(valOverAmount?.includes('saldo pendiente'), 'Debe rechazar cobro superior al saldo')

  // 2. Cobro con monto cero o negativo
  assert.ok(validateCollection(0, 300)?.includes('mayor a cero'), 'Debe rechazar cobro cero')
  assert.ok(validateCollection(-10, 300)?.includes('mayor a cero'), 'Debe rechazar cobro negativo')

  // 3. Desglose de pago de venta que no coincide con el total
  const splitMismatch = validateSalePayment(100, { cashAmount: 50, qrAmount: 40, creditAmount: 0 })
  assert.ok(splitMismatch?.includes('no coincide'), 'Debe rechazar desglose que no suma el total')

  // 4. Montos de pago negativos en la venta
  const splitNegative = validateSalePayment(100, { cashAmount: 110, qrAmount: -10, creditAmount: 0 })
  assert.ok(splitNegative?.includes('no pueden ser negativos'), 'Debe rechazar montos negativos')

  // 5. Cobro mixto donde la suma de partes no coincide con el total solicitado
  assert.throws(
    () => {
      applyFifoCollection({
        debts: [
          {
            id: 'r1',
            tenantId: 'tenant-test',
            branchId: 'main',
            createdAt: '2026-10-16T10:00:00Z',
            createdBy: 'seller-1',
            dayKey: '2026-10-16',
            schemaVersion: 2,
            saleId: 's1',
            customerId: 'c1',
            customerName: 'Cliente 1',
            routeId: 'r1',
            distributorUid: 'seller-1',
            distributorName: 'Hugo',
            originalAmount: 100,
            paidAmount: 0,
            balance: 100,
            status: 'OPEN',
          },
        ],
        amount: 80,
        method: 'mixed',
        cashAmount: 50,
        qrAmount: 20, // 50 + 20 = 70 != 80
        customerId: 'c1',
        customerName: 'Cliente 1',
        routeId: 'r1',
        collectorUid: 'seller-1',
        collectorName: 'Hugo',
      })
    },
    /Suma de efectivo y QR debe coincidir/i,
    'Debe arrojar error si cashAmount + qrAmount no es igual a amount'
  )
})

test('D2.1 TEST 36: Helper canónico collectionQrAmount para cobros mixtos, legacy y contado', () => {
  // A. Cobro mixto: qrAmount = 100, cashAmount = 70, amount = 170 -> 100
  const mixed = collectionQrAmount({ method: 'mixed', amount: 170, cashAmount: 70, qrAmount: 100 })
  assert.equal(mixed, 100, 'Cobro mixto debe devolver exclusivamente el qrAmount')

  // B. Cobro legacy QR: sin qrAmount en documento, method = 'qr', amount = 100 -> 100
  const legacyQr = collectionQrAmount({ method: 'qr', amount: 100 })
  assert.equal(legacyQr, 100, 'Cobro legacy QR sin qrAmount debe devolver amount')

  // C. Cobro QR nuevo: method = 'qr', amount = 100, qrAmount = 100 -> 100
  const newQr = collectionQrAmount({ method: 'qr', amount: 100, qrAmount: 100 })
  assert.equal(newQr, 100, 'Cobro QR con qrAmount debe devolver 100')

  // D. Cobro en efectivo: method = 'cash', amount = 170 -> 0
  const cashOnly = collectionQrAmount({ method: 'cash', amount: 170 })
  assert.equal(cashOnly, 0, 'Cobro en efectivo debe devolver 0 para QR')

  // E. Valores nulos o indefinidos -> 0
  assert.equal(collectionQrAmount(null), 0, 'null debe devolver 0')
  assert.equal(collectionQrAmount(undefined), 0, 'undefined debe devolver 0')
})

test('D2.1 TEST 37: Cobro individual a deuda específica vs cobro general FIFO', () => {
  // Cliente con Deuda A (100, antigua) y Deuda B (50, nueva)
  const debts: DistReceivable[] = [
    {
      id: 'rec-A',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-01T08:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-01',
      schemaVersion: 2,
      saleId: 'sale-A',
      customerId: 'cust-1',
      customerName: 'Cliente 1',
      routeId: 'route-1',
      distributorUid: 'seller-1',
      distributorName: 'Hugo',
      originalAmount: 100,
      paidAmount: 0,
      balance: 100,
      status: 'OPEN',
    },
    {
      id: 'rec-B',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-15T08:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-15',
      schemaVersion: 2,
      saleId: 'sale-B',
      customerId: 'cust-1',
      customerName: 'Cliente 1',
      routeId: 'route-1',
      distributorUid: 'seller-1',
      distributorName: 'Hugo',
      originalAmount: 50,
      paidAmount: 0,
      balance: 50,
      status: 'OPEN',
    },
  ]

  // Paso 1: Usuario abre Deuda B y cobra 30 con "Cobrar esta deuda" (receivableId = 'rec-B')
  const step1 = applyFifoCollection({
    debts,
    amount: 30,
    method: 'cash',
    receivableId: 'rec-B',
    customerId: 'cust-1',
    customerName: 'Cliente 1',
    routeId: 'route-1',
    collectorUid: 'seller-1',
    collectorName: 'Hugo',
  })

  // Resultado esperado:
  // A sigue intacta en 100
  // B queda en 20
  // Exactamente 1 allocation dirigida a rec-B
  const debtA = debts.find((d) => d.id === 'rec-A')!
  const debtB = debts.find((d) => d.id === 'rec-B')!
  assert.equal(debtA.balance, 100, 'Deuda A debe seguir intacta en 100 tras cobro individual de B')
  assert.equal(debtB.balance, 20, 'Deuda B debe quedar en 20 tras cobro individual de 30')
  assert.equal(step1.collection.allocations.length, 1, 'Cobro individual debe generar exactamente 1 allocation')
  assert.equal(step1.collection.allocations[0].receivableId, 'rec-B', 'Allocation debe corresponder a rec-B')

  // Paso 2: Usuario ejecuta cobro general FIFO de 30 (sin receivableId, con customerId)
  const step2 = applyFifoCollection({
    debts,
    amount: 30,
    method: 'cash',
    customerId: 'cust-1',
    customerName: 'Cliente 1',
    routeId: 'route-1',
    collectorUid: 'seller-1',
    collectorName: 'Hugo',
  })

  // Resultado esperado:
  // A (antigua) absorbe los 30 -> saldo 70
  // B se mantiene en 20
  assert.equal(debtA.balance, 70, 'Deuda A (más antigua) debe absorber el cobro FIFO quedando en 70')
  assert.equal(debtB.balance, 20, 'Deuda B debe permanecer en 20')
  assert.equal(step2.collection.allocations.length, 1, 'Allocation debe corresponder a la deuda más antigua')
  assert.equal(step2.collection.allocations[0].receivableId, 'rec-A', 'FIFO debe aplicar primero a rec-A')
})

test('D2.1 TEST 38: Manejo offline de queued FIFO collections sin alterar saldos locales antes de confirmación', () => {
  // Simulador del pipeline de useDistributionStore
  const queuedOperation = {
    id: 'op-col-offline-1',
    type: 'collection',
    status: 'queued',
    createdBy: 'seller-1',
    createdAt: '2026-10-16T15:00:00Z',
    payload: {
      customerId: 'cust-ana',
      customerName: 'Doña Ana',
      amount: 170,
      method: 'mixed',
      cashAmount: 70,
      qrAmount: 100,
      routeId: 'route-1',
      // NOTA: sin receivable ni receivableId
    },
  }

  // Reconstrucción segura de pendingCollections sin dereferenciar p.receivable
  const p = queuedOperation.payload as any
  const rec = p.receivable
  const customerId = p.customerId || rec?.customerId || ''
  const customerName = p.customerName || rec?.customerName || 'Doña Ana'
  const receivableId = rec?.id || p.receivableId || ''
  const amount = Number(p.amount) || 0
  const method = p.method || 'cash'
  const cashAmount = method === 'mixed' ? (Number(p.cashAmount) || 0) : (method === 'cash' ? amount : 0)
  const qrAmount = method === 'mixed' ? (Number(p.qrAmount) || 0) : (method === 'qr' ? amount : 0)

  const pendingCollection: DistCollection = {
    id: queuedOperation.id,
    operationId: queuedOperation.id,
    receivableId,
    allocations: [],
    portfolioBalanceBefore: 0,
    portfolioBalanceAfter: 0,
    customerId,
    customerName,
    customerCode: '',
    saleLines: [],
    routeId: p.routeId,
    originRouteId: p.routeId,
    collectedByUid: queuedOperation.createdBy,
    collectedByName: 'Hugo Choque',
    amount,
    method,
    cashAmount,
    qrAmount,
    note: '',
    createdAt: queuedOperation.createdAt,
    dayKey: '2026-10-16',
    pendingConfirmation: true,
  } as unknown as DistCollection

  assert.equal(pendingCollection.pendingConfirmation, true, 'Debe marcarse como pendiente de confirmación')
  assert.deepEqual(pendingCollection.allocations, [], 'Allocations deben estar vacías offline, no inventar distribución')
  assert.equal(pendingCollection.amount, 170, 'Monto total debe coincidir')

  // Comprobación de que visibleReceivables no resta saldos inventados
  const serverReceivables: DistReceivable[] = [
    {
      id: 'rec-1',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-01T08:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-01',
      schemaVersion: 2,
      saleId: 'sale-1',
      customerId: 'cust-ana',
      customerName: 'Doña Ana',
      routeId: 'route-1',
      distributorUid: 'seller-1',
      distributorName: 'Hugo',
      originalAmount: 100,
      paidAmount: 0,
      balance: 100,
      status: 'OPEN',
    },
    {
      id: 'rec-2',
      tenantId: 'tenant-test',
      branchId: 'main',
      createdAt: '2026-10-05T08:00:00Z',
      createdBy: 'seller-1',
      dayKey: '2026-10-05',
      schemaVersion: 2,
      saleId: 'sale-2',
      customerId: 'cust-ana',
      customerName: 'Doña Ana',
      routeId: 'route-1',
      distributorUid: 'seller-1',
      distributorName: 'Hugo',
      originalAmount: 100,
      paidAmount: 0,
      balance: 100,
      status: 'OPEN',
    },
  ]

  const pendingList = [pendingCollection]
  const visibleReceivables = serverReceivables.map((r) => {
    const hasPending = pendingList.some((c) => c.receivableId === r.id || (c.customerId === r.customerId && !c.receivableId))
    return { ...r, pendingConfirmation: hasPending }
  })

  // Los saldos individuales NO deben reducirse antes de que el servidor devuelva allocations
  assert.equal(visibleReceivables[0].balance, 100, 'Saldo de deuda 1 no debe cambiar mientras esté queued')
  assert.equal(visibleReceivables[1].balance, 100, 'Saldo de deuda 2 no debe cambiar mientras esté queued')
  assert.equal(visibleReceivables[0].pendingConfirmation, true, 'Debe indicar que hay un cobro pendiente')
})

test('D2.1 TEST 39: Validación estricta server-side de validUntil y days en distCreditOverrides', () => {
  // Lógica de validación exacta de operations.cjs
  function validateOverrideValidity(payload: { validUntil?: any; days?: any }) {
    let validUntil = ''
    if (payload.validUntil !== undefined && payload.validUntil !== null && payload.validUntil !== '') {
      assert.ok(typeof payload.validUntil === 'string', 'Fecha de vigencia inválida.')
      const parsedTime = Date.parse(payload.validUntil)
      assert.ok(Number.isFinite(parsedTime), 'Fecha de vigencia inválida.')
      assert.ok(parsedTime > Date.now(), 'La fecha de vigencia debe ser futura.')
      validUntil = new Date(parsedTime).toISOString()
    } else if (payload.days !== undefined && payload.days !== null) {
      assert.ok(Number.isInteger(payload.days) && payload.days >= 1 && payload.days <= 30, 'Los días de vigencia deben ser un entero entre 1 y 30.')
      validUntil = new Date(Date.now() + payload.days * 86400000).toISOString()
    } else {
      validUntil = new Date(Date.now() + 7 * 86400000).toISOString()
    }
    assert.ok(validUntil && typeof validUntil === 'string' && validUntil.length > 0, 'Fecha de vigencia requerida.')
    return validUntil
  }

  // 1. Fecha pasada debe rechazarse
  assert.throws(
    () => validateOverrideValidity({ validUntil: '2020-01-01T00:00:00Z' }),
    /La fecha de vigencia debe ser futura/i,
    'Debe rechazar fecha en el pasado'
  )

  // 2. String basura debe rechazarse
  assert.throws(
    () => validateOverrideValidity({ validUntil: 'basura-no-es-fecha' }),
    /Fecha de vigencia inválida/i,
    'Debe rechazar string no convertible a fecha'
  )

  // 3. days = 31 debe rechazarse
  assert.throws(
    () => validateOverrideValidity({ days: 31 }),
    /Los días de vigencia deben ser un entero entre 1 y 30/i,
    'Debe rechazar días superiores a 30'
  )

  // 4. days = 0 debe rechazarse
  assert.throws(
    () => validateOverrideValidity({ days: 0 }),
    /Los días de vigencia deben ser un entero entre 1 y 30/i,
    'Debe rechazar días iguales a 0'
  )

  // 5. days = -5 debe rechazarse
  assert.throws(
    () => validateOverrideValidity({ days: -5 }),
    /Los días de vigencia deben ser un entero entre 1 y 30/i,
    'Debe rechazar días negativos'
  )

  // 6. days decimal (2.5) debe rechazarse
  assert.throws(
    () => validateOverrideValidity({ days: 2.5 }),
    /Los días de vigencia deben ser un entero entre 1 y 30/i,
    'Debe rechazar días no enteros'
  )

  // 7. days = 7 válido
  const validDaysResult = validateOverrideValidity({ days: 7 })
  assert.ok(Date.parse(validDaysResult) > Date.now(), 'Debe generar fecha futura válida')

  // 8. Sin days ni validUntil -> default 7 días válido
  const defaultResult = validateOverrideValidity({})
  assert.ok(Date.parse(defaultResult) > Date.now(), 'Default debe ser fecha futura válida')
})

test('D2.1 TEST 40: Propagación de override y actualización en tiempo real de distCreditStatus', () => {
  // Simulación de cálculo de creditStatus
  function computeStatus(params: {
    customerId: string
    debts: { createdAt: string; balance: number }[]
    creditBlockDays: number
    activeOverride: { id: string; validUntil: string; reason: string } | null
  }): DistCreditStatus {
    const openDebts = params.debts.filter((d) => d.balance > 0)
    const dates = openDebts.map((d) => d.createdAt).sort()
    const overdueDebts = openDebts.filter(
      (d) => new Date(d.createdAt).getTime() + params.creditBlockDays * 86400000 <= Date.now()
    )
    const overdueDates = overdueDebts.map((d) => d.createdAt).sort()
    const blocked = overdueDebts.length > 0 && !params.activeOverride

    return {
      id: params.customerId,
      tenantId: 'tenant-test',
      branchId: 'main',
      oldestPendingAt: dates[0] || null,
      overduePendingAt: overdueDates[0] || null,
      creditBlockDays: params.creditBlockDays,
      blocked,
      activeOverrideId: params.activeOverride?.id || null,
      overrideValidUntil: params.activeOverride?.validUntil || null,
      overrideReason: params.activeOverride?.reason || null,
      checkedAt: new Date().toISOString(),
    }
  }

  // A. Cliente con deuda vencida de 15 días, sin override
  const initialStatus = computeStatus({
    customerId: 'c-moroso',
    debts: [{ createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), balance: 100 }],
    creditBlockDays: 7,
    activeOverride: null,
  })
  assert.equal(initialStatus.blocked, true, 'Cliente con deuda de 15 días debe estar bloqueado')
  assert.equal(initialStatus.activeOverrideId, null)

  // B. Admin autoriza excepción temporal por 7 días -> override propagado inmediatamente
  const grantedStatus = computeStatus({
    customerId: 'c-moroso',
    debts: [{ createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), balance: 100 }],
    creditBlockDays: 7,
    activeOverride: {
      id: 'ov-admin-1',
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
      reason: 'Autorizado para fiesta patronal',
    },
  })
  assert.equal(grantedStatus.blocked, false, 'Con override activo el cliente queda desbloqueado en distCreditStatus')
  assert.equal(grantedStatus.activeOverrideId, 'ov-admin-1')

  // C. Admin revoca la excepción -> override revocado, vuelve a blocked: true inmediatamente
  const revokedStatus = computeStatus({
    customerId: 'c-moroso',
    debts: [{ createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), balance: 100 }],
    creditBlockDays: 7,
    activeOverride: null,
  })
  assert.equal(revokedStatus.blocked, true, 'Tras revocación, distCreditStatus vuelve a blocked: true de inmediato')
  assert.equal(revokedStatus.activeOverrideId, null)
})
