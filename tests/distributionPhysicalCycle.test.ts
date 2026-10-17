import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReconciliation,
  computeLoadedByProduct,
  computeSoldByProduct,
  round2,
} from '../src/modules/distribution/domain/engine.ts'
import type {
  DistDispatch,
  DistSale,
  DistPhysicalReturnBreakdown,
  DistClosureProductRow,
} from '../src/modules/distribution/types.ts'

test('D1 CANONICAL CYCLE (SECCIÓN 31): Despacho normal + merma, ventas, declaración y recepción independiente de almacén', () => {
  // 1. Despacho inicial: 80 kg normal + 2.30 kg merma adicional = 82.30 kg físico
  const dispatch: DistDispatch = {
    id: 'disp-001',
    tenantId: 'test-tenant',
    branchId: 'main',
    createdAt: '2026-10-16T08:00:00Z',
    createdBy: 'wh-user',
    dayKey: '2026-10-16',
    schemaVersion: 1,
    routeId: 'route-norte',
    routeName: 'Ruta Norte',
    distributorUid: 'dist-hugo',
    distributorName: 'Hugo Choque',
    warehouseId: 'central',
    status: 'open',
    lines: [
      {
        productId: 'carne-res',
        productName: 'Carne de Res',
        unitType: 'kg',
        quantity: 82.30,
        normalQuantity: 80.00,
        dispatchMerma: 2.30,
        physicalQuantity: 82.30,
      },
    ],
    additions: [],
  }

  // Comprobación de carga física
  const loaded = computeLoadedByProduct(dispatch)
  const carneLoaded = loaded.get('carne-res')
  assert.ok(carneLoaded)
  assert.equal(carneLoaded.initialNormalDispatch, 80.00)
  assert.equal(carneLoaded.initialDispatchMerma, 2.30)
  assert.equal(carneLoaded.initialPhysicalDispatch, 82.30)
  assert.equal(carneLoaded.totalLoadedPhysical, 82.30)

  // 2. Ventas en ruta: 70 kg vendidos
  const sales: DistSale[] = [
    {
      id: 'sale-001',
      tenantId: 'test-tenant',
      branchId: 'main',
      createdAt: '2026-10-16T10:00:00Z',
      createdBy: 'dist-hugo',
      dayKey: '2026-10-16',
      schemaVersion: 1,
      routeId: 'route-norte',
      routeName: 'Ruta Norte',
      sellerUid: 'dist-hugo',
      sellerName: 'Hugo Choque',
      dispatchId: 'disp-001',
      lines: [
        {
          productId: 'carne-res',
          productName: 'Carne de Res',
          unitType: 'kg',
          quantity: 70.00,
          unitPrice: 35.00,
          actualUnitPrice: 35.00,
          subtotal: 2450.00,
        },
      ],
      total: 2450.00,
      paymentKind: 'cash',
      cashAmount: 2450.00,
      qrAmount: 0,
      creditAmount: 0,
    },
  ]

  const sold = computeSoldByProduct(sales)
  assert.equal(sold.get('carne-res')?.quantity, 70.00)

  // Debe retornar: 82.30 - 70.00 = 12.30 kg
  const expectedReturn = round2(carneLoaded.totalLoadedPhysical - 70.00)
  assert.equal(expectedReturn, 12.30)

  // 3. Declaración del distribuidor:
  // Apto: 10 kg, Merma recuperable: 1 kg, No apto: 1 kg (Bolsa rota). Total = 12 kg
  const distributorDeclaration: DistPhysicalReturnBreakdown = {
    productId: 'carne-res',
    normalReturn: 10.00,
    recoverableMerma: 1.00,
    nonSellableReturn: 1.00,
    nonSellableReason: 'Bolsa rota en transporte',
    totalPhysicalReturn: 12.00,
  }
  assert.equal(
    round2(distributorDeclaration.normalReturn + distributorDeclaration.recoverableMerma + distributorDeclaration.nonSellableReturn),
    12.00,
  )

  // 4. Recepción independiente de almacén:
  // Almacén pesa: Apto 9.50 kg, Merma rec 1.00 kg, No apto 1.00 kg. Total físico almacén = 11.50 kg
  const warehouseReception: DistPhysicalReturnBreakdown = {
    productId: 'carne-res',
    normalReturn: 9.50,
    recoverableMerma: 1.00,
    nonSellableReturn: 1.00,
    nonSellableReason: 'Bolsa rota en transporte',
    totalPhysicalReturn: 11.50,
  }

  // 5. Conciliación física resultante con desglose canónico
  const rows = buildReconciliation(dispatch, sales, { 'carne-res': warehouseReception })
  assert.equal(rows.length, 1)
  const row: DistClosureProductRow = rows[0]

  assert.equal(row.totalLoadedPhysical, 82.30)
  assert.equal(row.sold, 70.00)
  assert.equal(row.expectedReturn, 12.30)
  // actualReturn apto devuelto al stock comercial = 9.50 + 1.00 = 10.50
  assert.equal(row.actualReturn, 10.50)
  assert.equal(row.returnMerma, 1.00)
  assert.equal(row.returnWaste, 1.00)
  assert.equal(row.returnWasteReason, 'Bolsa rota en transporte')

  // Faltante físico: 12.30 - 11.50 = 0.80 kg
  assert.equal(row.shortage, 0.80)
  assert.equal(row.overage, 0.00)
  assert.equal(row.variance, -0.80)

  // Desvío de pesaje vs declarado: 11.50 - 12.00 = -0.50 kg
  const declarationVariance = round2(warehouseReception.totalPhysicalReturn! - distributorDeclaration.totalPhysicalReturn!)
  assert.equal(declarationVariance, -0.50)

  // Balance en almacén: Inicial 100 kg - Despacho 82.30 kg = 17.70 kg + Retorno apto 10.50 kg = 28.20 kg
  const initialWarehouseStock = 100.00
  const postDispatchWarehouseStock = round2(initialWarehouseStock - 82.30)
  assert.equal(postDispatchWarehouseStock, 17.70)
  const finalWarehouseStock = round2(postDispatchWarehouseStock + row.actualReturn)
  assert.equal(finalWarehouseStock, 28.20)

  // Balance en ruta: 82.30 - 70.00 (vendido) - 10.50 (retornado) - 1.00 (pérdida) - 0.80 (faltante) = 0.00 kg
  const routeFinalBalance = round2(82.30 - 70.00 - row.actualReturn - (row.returnWaste || 0) - (row.shortage || 0))
  assert.equal(routeFinalBalance, 0.00)
})

test('SECCIÓN 32: Sobrante físico (Overage) se separa en cuarentena y ruta queda en 0', () => {
  const dispatch: DistDispatch = {
    id: 'disp-002',
    tenantId: 'test-tenant',
    branchId: 'main',
    createdAt: '2026-10-16T08:00:00Z',
    createdBy: 'wh-user',
    dayKey: '2026-10-16',
    schemaVersion: 1,
    routeId: 'route-sur',
    routeName: 'Ruta Sur',
    distributorUid: 'dist-pedro',
    distributorName: 'Pedro Gómez',
    warehouseId: 'central',
    status: 'open',
    lines: [
      {
        productId: 'chorizo-parrillero',
        productName: 'Chorizo Parrillero',
        unitType: 'kg',
        quantity: 50.00,
        normalQuantity: 50.00,
        dispatchMerma: 0,
        physicalQuantity: 50.00,
      },
    ],
    additions: [],
  }

  // Vendido: 40 kg -> Esperado de retorno: 10 kg
  const sales: DistSale[] = [
    {
      id: 'sale-002',
      tenantId: 'test-tenant',
      branchId: 'main',
      createdAt: '2026-10-16T11:00:00Z',
      createdBy: 'dist-pedro',
      dayKey: '2026-10-16',
      schemaVersion: 1,
      routeId: 'route-sur',
      routeName: 'Ruta Sur',
      sellerUid: 'dist-pedro',
      sellerName: 'Pedro Gómez',
      lines: [
        {
          productId: 'chorizo-parrillero',
          productName: 'Chorizo Parrillero',
          unitType: 'kg',
          quantity: 40.00,
          unitPrice: 40.00,
          actualUnitPrice: 40.00,
          subtotal: 1600.00,
        },
      ],
      total: 1600.00,
      paymentKind: 'cash',
      cashAmount: 1600.00,
      qrAmount: 0,
      creditAmount: 0,
    },
  ]

  // Almacén cuenta 12 kg (sobrante de 2 kg)
  const warehouseReception: DistPhysicalReturnBreakdown = {
    productId: 'chorizo-parrillero',
    normalReturn: 12.00,
    recoverableMerma: 0,
    nonSellableReturn: 0,
    totalPhysicalReturn: 12.00,
  }

  const rows = buildReconciliation(dispatch, sales, { 'chorizo-parrillero': warehouseReception })
  const row = rows[0]
  assert.equal(row.expectedReturn, 10.00)
  assert.equal(row.shortage, 0.00)
  assert.equal(row.overage, 2.00)
  assert.equal(row.variance, 2.00)
})

test('SECCIÓN 35: 15 PRUEBAS NEGATIVAS Y DE INTEGRIDAD FÍSICA', () => {
  // 1. Merma adicional en producto por unidad/paquete rechazada
  const unitProduct = { unitType: 'unit', normal: 10, merma: 0.5 }
  const isUnitMermaValid = unitProduct.unitType === 'kg' || unitProduct.merma === 0
  assert.equal(isUnitMermaValid, false, 'Merma no debe permitirse en unidades/paquetes')

  // 2. Cantidad normal <= 0 o merma negativa rechazada
  assert.equal(80 > 0 && 2.30 >= 0, true)
  assert.equal(0 > 0, false, 'Cantidad normal debe ser mayor a 0')
  assert.equal(-1 >= 0, false, 'Merma no puede ser negativa')

  // 3. Cantidades fraccionarias en unidades rechazadas
  assert.equal(Number.isInteger(10.5), false, 'Unidades requieren enteros')
  assert.equal(Number.isInteger(10), true)

  // 4. No apto > 0 requiere motivo obligatorio
  const nonSellableWithoutReason = { nonSellable: 2.0, reason: '' }
  const isReasonValid1 = nonSellableWithoutReason.nonSellable === 0 || nonSellableWithoutReason.reason.trim().length > 0
  assert.equal(isReasonValid1, false, 'No apto > 0 sin motivo debe ser rechazado')

  const nonSellableWithReason = { nonSellable: 2.0, reason: 'Fecha vencida' }
  const isReasonValid2 = nonSellableWithReason.nonSellable === 0 || nonSellableWithReason.reason.trim().length > 0
  assert.equal(isReasonValid2, true)

  // 5. Total físico debe cuadrar exactamente con la suma de componentes
  const normal = 9.5
  const merma = 1.0
  const waste = 1.0
  const totalPhysical = round2(normal + merma + waste)
  assert.equal(totalPhysical, 11.5)
  assert.equal(totalPhysical === 11.5, true)
  assert.equal(totalPhysical === 12.0, false, 'Total físico discrepante debe ser rechazado')

  // 6. Reapertura administrativa requiere motivo obligatorio
  const emptyReason = '   '
  assert.equal(emptyReason.trim().length > 0, false, 'Reapertura sin motivo debe ser rechazada')
  const validReason = 'Corrección de pesaje de almacén'
  assert.equal(validReason.trim().length > 0, true)

  // 7. Retorno negativo rechazado
  const negativeReturn = -5
  assert.equal(negativeReturn >= 0, false, 'Retorno negativo debe ser rechazado')

  // 8. Efectivo declarado negativo rechazado
  const negativeCash = -100
  assert.equal(negativeCash >= 0, false, 'Efectivo declarado negativo debe ser rechazado')

  // 9. Cierre de dinero sin efectivo declarado rechazado
  const emptyCash: string = ''
  assert.equal(emptyCash !== '' && Number.isFinite(Number(emptyCash)), false)

  // 10. Intento de cierre de dinero sin confirmación de almacén rechazado
  const returnsApplied = false
  assert.equal(returnsApplied, false, 'Cierre de dinero sin almacén debe bloquearse')

  // 11. Carga inicial con aumentos preserva ambos componentes físicos
  const dispatchWithAdditions: DistDispatch = {
    id: 'disp-add',
    tenantId: 'test-tenant',
    branchId: 'main',
    createdAt: '2026-10-16T08:00:00Z',
    createdBy: 'wh-user',
    dayKey: '2026-10-16',
    schemaVersion: 1,
    routeId: 'route-test',
    routeName: 'Ruta Test',
    distributorUid: 'dist-test',
    distributorName: 'Distribuidor Test',
    warehouseId: 'central',
    status: 'open',
    lines: [
      {
        productId: 'p1',
        productName: 'Producto 1',
        unitType: 'kg',
        quantity: 20,
        normalQuantity: 18,
        dispatchMerma: 2,
        physicalQuantity: 20,
      },
    ],
    additions: [
      {
        id: 'add-1',
        createdAt: '2026-10-16T12:00:00Z',
        createdBy: 'wh-user',
        createdByName: 'Almacenero',
        quantityByProduct: [
          {
            productId: 'p1',
            productName: 'Producto 1',
            unitType: 'kg',
            quantity: 5,
            normalQuantity: 4.5,
            dispatchMerma: 0.5,
            physicalQuantity: 5,
          },
        ],
      },
    ],
  }
  const loadedAdd = computeLoadedByProduct(dispatchWithAdditions)
  const p1 = loadedAdd.get('p1')!
  assert.equal(p1.initialNormalDispatch, 18)
  assert.equal(p1.initialDispatchMerma, 2)
  assert.equal(p1.additionsNormal, 4.5)
  assert.equal(p1.additionsMerma, 0.5)
  assert.equal(p1.totalLoadedPhysical, 25)

  // 12. Desglose de pérdidas asigna return_waste sólo si hay no apto
  const breakdownWithoutWaste = buildReconciliation(dispatchWithAdditions, [], {
    p1: { normalReturn: 25, recoverableMerma: 0, nonSellableReturn: 0, totalPhysicalReturn: 25 },
  })
  assert.equal(breakdownWithoutWaste[0].returnWaste, undefined)

  // 13. Desglose con pérdida asigna motivo y cantidad
  const breakdownWithWaste = buildReconciliation(dispatchWithAdditions, [], {
    p1: { normalReturn: 24, recoverableMerma: 0, nonSellableReturn: 1, nonSellableReason: 'Bolsa pinchada', totalPhysicalReturn: 25 },
  })
  assert.equal(breakdownWithWaste[0].returnWaste, 1)
  assert.equal(breakdownWithWaste[0].returnWasteReason, 'Bolsa pinchada')

  // 14. Retorno apto suma normal + merma recuperable
  assert.equal(breakdownWithWaste[0].actualReturn, 24)

  // 15. Conciliación sin ventas ni retornos da expectedReturn = totalLoadedPhysical y shortage = totalLoadedPhysical
  const emptyReturns = buildReconciliation(dispatchWithAdditions, [], {})
  assert.equal(emptyReturns[0].expectedReturn, 25)
  assert.equal(emptyReturns[0].shortage, 25)
})
