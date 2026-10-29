import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateTrackingCode,
  generateManifestNumber,
  generateReceiptNumber,
  canTransitionParcelStatus,
  transitionParcelStatus,
  calculateParcelPricing,
  validateParcelDelivery,
  generateMonthlyDuesForPeriod,
  applyDuePayment,
  revertDuePayment,
  calculateFinancialSummary,
} from '../src/modules/parcel/domain/parcelEngine.ts'
import { DemoParcelController } from '../src/demo/parcel/demoParcelController.ts'
import type { ParcelShipment, UnionMember, CashMovement } from '../src/modules/parcel/types.ts'

test('1. Generador de códigos únicos de guía, manifiesto y recibos', () => {
  const codes = ['ENC-2026-00101', 'ENC-2026-00102']
  const nextCode = generateTrackingCode(codes, 2026)
  assert.equal(nextCode, 'ENC-2026-00103')

  const manifests = ['MAN-2026-0001', 'MAN-2026-0004']
  const nextMan = generateManifestNumber(manifests, 2026)
  assert.equal(nextMan, 'MAN-2026-0005')

  const receipts = ['CUOTA-2026-00010']
  const nextRec = generateReceiptNumber(receipts, 'CUOTA', 2026)
  assert.equal(nextRec, 'CUOTA-2026-00011')
})

test('2. Transiciones de estado de encomiendas y protección contra entregas duplicadas', () => {
  assert.equal(canTransitionParcelStatus('received', 'dispatched'), true)
  assert.equal(canTransitionParcelStatus('dispatched', 'in_transit'), true)
  assert.equal(canTransitionParcelStatus('ready_for_pickup', 'delivered'), true)

  // Encomienda entregada es estado terminal y no puede volver a despacharse
  assert.equal(canTransitionParcelStatus('delivered', 'dispatched'), false)
  assert.equal(canTransitionParcelStatus('delivered', 'delivered'), true) // idempotente

  const fakeShipment: ParcelShipment = {
    id: 's-1',
    trackingCode: 'ENC-2026-00001',
    createdAt: new Date().toISOString(),
    originBranchId: 'cbb',
    originCity: 'Cochabamba',
    destinationBranchId: 'lpz',
    destinationCity: 'La Paz',
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'Juan', docType: 'CI', phone: '7000' },
    recipient: { id: 'c2', name: 'Pedro', docType: 'CI', phone: '7100' },
    items: [],
    declaredSummary: 'Caja',
    packageCount: 1,
    totalWeightKg: 5,
    declaredValueTotal: 100,
    isFragile: false,
    prohibitedGoodsNoticeAccepted: true,
    shippingFee: 40,
    discount: 0,
    finalAmount: 40,
    paymentTiming: 'origin_paid',
    paymentStatus: 'paid',
    cashierUid: 'u1',
    cashierName: 'Operador',
    status: 'received',
    history: [],
  }

  const dispatched = transitionParcelStatus(fakeShipment, 'dispatched', 'Operador', 'Cochabamba')
  assert.equal(dispatched.status, 'dispatched')
  assert.equal(dispatched.history.length, 1)

  assert.throws(() => {
    transitionParcelStatus(dispatched, 'delivered', 'Operador', 'Cochabamba')
  }, /Transición inválida/)
})

test('3. Cálculo de precios y validación de cobro contraentrega (COD)', () => {
  // Base 30, exceso 2kg a Bs 5/kg -> subtotal 40, descuento 5 -> 35
  const pricing = calculateParcelPricing(30, 5, 5, 5)
  assert.equal(pricing.baseFee, 30)
  assert.equal(pricing.weightSurcharge, 10)
  assert.equal(pricing.discount, 5)
  assert.equal(pricing.finalAmount, 35)

  // Validación de entrega con cobro pendiente
  const codShipment: ParcelShipment = {
    id: 's-cod',
    trackingCode: 'ENC-2026-00099',
    createdAt: new Date().toISOString(),
    originBranchId: 'cbb',
    originCity: 'Cochabamba',
    destinationBranchId: 'scz',
    destinationCity: 'Santa Cruz',
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'A', docType: 'CI', phone: '1' },
    recipient: { id: 'c2', name: 'B', docType: 'CI', phone: '2' },
    items: [],
    declaredSummary: 'Paquete',
    packageCount: 1,
    totalWeightKg: 2,
    declaredValueTotal: 0,
    isFragile: false,
    prohibitedGoodsNoticeAccepted: true,
    shippingFee: 50,
    discount: 0,
    finalAmount: 50,
    paymentTiming: 'destination_cod',
    paymentStatus: 'pending',
    cashierUid: 'u1',
    cashierName: 'Op',
    status: 'ready_for_pickup',
    history: [],
  }

  // Sin cobrar no permite entregar
  const valFail = validateParcelDelivery(codShipment, 'Destinatario', '123456', false)
  assert.equal(valFail.canDeliver, false)
  assert.match(valFail.error || '', /Cobro pendiente obligatorio/)

  // Al cobrar simultáneamente permite entregar
  const valSuccess = validateParcelDelivery(codShipment, 'Destinatario', '123456', true)
  assert.equal(valSuccess.canDeliver, true)
})

test('4. Sindicato: generación de cuotas sin duplicados y pagos parciales', () => {
  const members: UnionMember[] = [
    {
      id: 'm1',
      memberNumber: 'SOC-001',
      fullName: 'Socio Uno',
      ci: '100',
      phone: '700',
      joinedAt: '2020-01-01',
      status: 'active',
      category: 'propietario_transporte',
      monthlyFee: 150,
    },
    {
      id: 'm2',
      memberNumber: 'SOC-002',
      fullName: 'Socio Dos',
      ci: '200',
      phone: '800',
      joinedAt: '2021-01-01',
      status: 'active',
      category: 'conductor',
      monthlyFee: 100,
    },
  ]

  const { createdDues, skippedCount } = generateMonthlyDuesForPeriod(
    members,
    [],
    '2026-10',
    'Octubre 2026',
    '2026-10-31'
  )
  assert.equal(createdDues.length, 2)
  assert.equal(skippedCount, 0)

  // Intentar regenerar el mismo período no duplica obligaciones
  const repeat = generateMonthlyDuesForPeriod(
    members,
    createdDues,
    '2026-10',
    'Octubre 2026',
    '2026-10-31'
  )
  assert.equal(repeat.createdDues.length, 0)
  assert.equal(repeat.skippedCount, 2)

  // Pago parcial
  const due = createdDues[0] // 150 Bs
  const partial = applyDuePayment(due, 70, 'cash', 'Cajero', 'REC-001')
  assert.equal(partial.paidAmount, 70)
  assert.equal(partial.balance, 80)
  assert.equal(partial.status, 'partial')

  // Segundo pago que liquida la cuota
  const complete = applyDuePayment(partial, 80, 'qr', 'Cajero', 'REC-002')
  assert.equal(complete.paidAmount, 150)
  assert.equal(complete.balance, 0)
  assert.equal(complete.status, 'paid')
})

test('5. Balance financiero integral y desduplicación de egresos', () => {
  const summary = calculateFinancialSummary({
    movements: [
      {
        id: '1',
        shiftId: 's1',
        timestamp: '2026-10-28',
        type: 'income',
        category: 'shipping_origin',
        amount: 100,
        paymentMethod: 'cash',
        concept: 'Envío',
        operatorUid: 'u1',
        operatorName: 'Op',
      },
      {
        id: '2',
        shiftId: 's1',
        timestamp: '2026-10-28',
        type: 'income',
        category: 'union_due',
        amount: 150,
        paymentMethod: 'qr',
        concept: 'Cuota',
        operatorUid: 'u1',
        operatorName: 'Op',
      },
      {
        id: '3',
        shiftId: 's1',
        timestamp: '2026-10-28',
        type: 'expense',
        category: 'worker_payment',
        amount: 50,
        paymentMethod: 'cash',
        concept: 'Adelanto chofer',
        operatorUid: 'u1',
        operatorName: 'Op',
      },
    ],
    workerPayments: [
      {
        id: 'w1',
        receiptNumber: 'PAG-1',
        workerId: 'wrk1',
        workerName: 'Chofer',
        date: '2026-10-28',
        periodOrConcept: 'Adelanto',
        type: 'advance',
        amount: 50,
        paymentMethod: 'cash',
        registeredBy: 'Hacienda',
      },
    ],
    unionExpenses: [
      {
        id: 'u1',
        receiptNumber: 'GAS-1',
        date: '2026-10-28',
        category: 'energia_electrica',
        description: 'Luz',
        amount: 60,
        paymentMethod: 'cash',
        registeredBy: 'Hacienda',
      },
    ],
    initialCash: 200,
  })

  // Caja física: 200 inicial + 100 ingreso efectivo - 50 egreso efectivo = 250
  assert.equal(summary.expectedCashInDrawer, 250)
  // QR ingresado: 150
  assert.equal(summary.totalQrIn, 150)
  // Ingreso total todos los métodos: 100 + 150 = 250
  assert.equal(summary.totalIncomeAllMethods, 250)
  // Egresos operativos: 50 (trabajador) + 60 (luz) = 110
  assert.equal(summary.expenses.totalOperationalExpenses, 110)
  // Balance neto del período: 250 - 110 = 140
  assert.equal(summary.netOperatingBalance, 140)
})

test('6. DemoParcelController: ciclo completo de recepción, manifiesto y entrega', () => {
  const controller = new DemoParcelController('sindicato', 'full')
  const initialShipmentsCount = controller.getState().shipments.length

  // Registro de nueva encomienda
  const shipment = controller.registerShipment({
    originBranchId: 'branch-cbb',
    destinationBranchId: 'branch-lpz',
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'Cliente Remitente', docType: 'CI', docNumber: '111', phone: '7001' },
    recipient: { id: 'c2', name: 'Cliente Receptor', docType: 'CI', docNumber: '222', phone: '7002' },
    items: [{ description: 'Caja con zapatos', category: 'clothing', quantity: 2, packaging: 'caja', weightKg: 4, isFragile: false }],
    shippingFee: 50,
    paymentTiming: 'destination_cod',
    prohibitedGoodsNoticeAccepted: true,
  })

  assert.ok(shipment.trackingCode.startsWith('ENC-2026-'))
  assert.equal(shipment.status, 'received')
  assert.equal(controller.getState().shipments.length, initialShipmentsCount + 1)

  // Despacho en Manifiesto
  const manifest = controller.createDispatchManifest({
    originBranchId: 'branch-cbb',
    destinationBranchId: 'branch-lpz',
    driverOrResponsible: 'Donato Flores Mamani',
    vehiclePlate: '1422-XBC',
    parcelIds: [shipment.id],
  })
  assert.ok(manifest.manifestNumber.startsWith('MAN-2026-'))
  assert.equal(controller.getState().shipments.find(s => s.id === shipment.id)?.status, 'dispatched')

  // Recepción en destino
  controller.receiveManifestAtDestination(manifest.id, 'Operador La Paz')
  assert.equal(controller.getState().shipments.find(s => s.id === shipment.id)?.status, 'ready_for_pickup')

  // Intento de entrega sin pagar contraentrega debe fallar
  assert.throws(() => {
    controller.deliverShipment({
      shipmentId: shipment.id,
      receiverName: 'Cliente Receptor',
      receiverDoc: '222',
      recipientRelationship: 'titular',
      isPayingNow: false,
    })
  }, /Cobro pendiente obligatorio/)

  // Entrega con cobro registrado en efectivo
  const delivered = controller.deliverShipment({
    shipmentId: shipment.id,
    receiverName: 'Cliente Receptor',
    receiverDoc: '222',
    recipientRelationship: 'titular',
    isPayingNow: true,
    paymentMethod: 'cash',
  })

  assert.equal(delivered.status, 'delivered')
  assert.equal(delivered.paymentStatus, 'paid')
  assert.equal(delivered.delivery?.receivedByName, 'Cliente Receptor')
})

test('7. Generación de documentos y comprobantes en PDF (A4 y 80mm)', async () => {
  const {
    generateShipmentReceptionPdf,
    generateDeliveryReceiptPdf,
    generateUnionDueReceiptPdf,
    generateManifestPdf,
    generateOperationalReportPdf,
  } = await import('../src/modules/parcel/domain/parcelDocuments.ts')
  const { createFullParcelDataset } = await import('../src/demo/datasets/parcel/parcelDatasets.ts')

  const data = createFullParcelDataset('sindicato')
  const shipment = data.shipments[0]

  // Mock URL.createObjectURL para entorno Node
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => `blob:mock-url-${blob?.size || 0}`,
      writable: true,
      configurable: true,
    })
  }

  // 1. Guía A4
  const a4Doc = await generateShipmentReceptionPdf(shipment, { format: 'a4' })
  assert.ok(a4Doc.blob.size > 1000)
  assert.match(a4Doc.filename, /Guia-ENC-2026-00101-A4\.pdf/)

  // 2. Ticket térmico 80mm
  const ticketDoc = await generateShipmentReceptionPdf(shipment, { format: '80mm' })
  assert.ok(ticketDoc.blob.size > 1000)
  assert.match(ticketDoc.filename, /Guia-ENC-2026-00101-80mm\.pdf/)

  // 3. Constancia de entrega
  const deliveredShipment = data.shipments.find(s => s.status === 'delivered')!
  const deliveryDoc = await generateDeliveryReceiptPdf(deliveredShipment, deliveredShipment.delivery!)
  assert.ok(deliveryDoc.blob.size > 1000)
  assert.match(deliveryDoc.filename, /Entrega-ENC-2026-00104\.pdf/)

  // 4. Recibo de cuota sindical
  const due = data.dues[0]
  const dueDoc = await generateUnionDueReceiptPdf(due, due.payments[0])
  assert.ok(dueDoc.blob.size > 1000)
  assert.match(dueDoc.filename, /Recibo-Cuota-CUOTA-2026-0045\.pdf/)

  // 5. Manifiesto
  const manifest = data.manifests[0]
  const manDoc = await generateManifestPdf(manifest, data.shipments)
  assert.ok(manDoc.blob.size > 1000)
  assert.match(manDoc.filename, /Manifiesto-MAN-2026-0001\.pdf/)

  // 6. Reporte operativo
  const repDoc = await generateOperationalReportPdf({
    title: 'Reporte General de Encomiendas',
    subtitle: 'Consolidado de despachos y entregas',
    headers: ['Guía', 'Origen', 'Destino', 'Remitente', 'Destinatario', 'Estado', 'Monto'],
    rows: data.shipments.map(s => [s.trackingCode, s.originCity, s.destinationCity, s.sender.name, s.recipient.name, s.status, s.finalAmount]),
    summaryLines: ['Total Encomiendas: 4', 'Total Facturado: Bs 245.00'],
  })
  assert.ok(repDoc.blob.size > 1000)
  assert.match(repDoc.filename, /reporte-general-de-encomiendas\.pdf/)
})

test('8. Configuración dinámica: agencias, tarifas, datos de empresa y registro de personal', () => {
  const controller = new DemoParcelController('sindicato', 'empty')

  // 1. Agregar nueva agencia
  const branch = controller.addBranch({
    name: 'Sucre - Terminal Interdepartamental',
    city: 'Sucre',
    department: 'Chuquisaca',
    address: 'Av. Ostria Gutiérrez',
    phone: '4-6451234',
    code: 'SUC-01',
    isActive: true,
  })
  assert.ok(branch.id.startsWith('branch-'))
  assert.equal(controller.getState().branches.find(b => b.code === 'SUC-01')?.city, 'Sucre')

  // 2. Desactivar / Activar agencia
  controller.toggleBranchActive(branch.id)
  assert.equal(controller.getState().branches.find(b => b.id === branch.id)?.isActive, false)
  controller.toggleBranchActive(branch.id)
  assert.equal(controller.getState().branches.find(b => b.id === branch.id)?.isActive, true)

  // 3. Modificar tarifas de encomienda
  controller.updateTariffConfig({ baseFee: 20, freeWeightKg: 5, extraKgRate: 3 })
  assert.equal(controller.getState().tariffConfig?.baseFee, 20)
  assert.equal(controller.getState().tariffConfig?.freeWeightKg, 5)

  // 4. Modificar datos de empresa
  controller.updateCompanyInfo({ name: 'TRANS-ANDINA SINDICATO MIXTO', taxId: '987654321' })
  assert.equal(controller.getState().companyInfo?.name, 'TRANS-ANDINA SINDICATO MIXTO')
  assert.equal(controller.getState().companyInfo?.taxId, '987654321')

  // 5. Agregar nuevo trabajador
  const worker = controller.addWorker({
    fullName: 'David Mamani Quispe',
    ci: '7654321 LP',
    phone: '71234567',
    role: 'Conductor Titular',
    paymentModality: 'monthly',
    agreedAmount: 3200,
    status: 'active',
    joinedAt: '2026-10-28',
  })
  assert.ok(worker.id.startsWith('wrk-'))
  assert.equal(controller.getState().workers.find(w => w.id === worker.id)?.fullName, 'David Mamani Quispe')
})

test('9. Motor de Tarifas: respeta configuración dinámica, tarifa cero legítima y entrega a domicilio', () => {
  // Caso 1: Tarifa promocional con baseFee = 0 (no debe sobreescribirse con 35 mediante ||)
  const zeroBase = calculateParcelPricing({
    tariffConfig: { baseFee: 0, includedWeightKg: 2, extraKgRate: 4, homeDeliveryFee: 12 },
    weightKg: 2,
    deliveryType: 'agency',
    discount: 0,
  })
  assert.equal(zeroBase.baseFee, 0)
  assert.equal(zeroBase.weightSurcharge, 0)
  assert.equal(zeroBase.homeDeliveryFee, 0)
  assert.equal(zeroBase.finalAmount, 0)

  // Caso 2: Entrega a domicilio con exceso de peso y decimales
  const homeWithExcess = calculateParcelPricing({
    tariffConfig: { baseFee: 25, includedWeightKg: 3, extraKgRate: 5, homeDeliveryFee: 15 },
    weightKg: 5.5, // 2.5 kg exceso * 5 = 12.50
    deliveryType: 'home', // +15
    discount: 2.5,
  })
  assert.equal(homeWithExcess.baseFee, 25)
  assert.equal(homeWithExcess.chargeableExcessWeightKg, 2.5)
  assert.equal(homeWithExcess.weightSurcharge, 12.5)
  assert.equal(homeWithExcess.homeDeliveryFee, 15)
  assert.equal(homeWithExcess.subtotal, 52.5)
  assert.equal(homeWithExcess.discount, 2.5)
  assert.equal(homeWithExcess.finalAmount, 50)

  // Caso 3: Descuento que no puede superar el subtotal
  const excessiveDiscount = calculateParcelPricing({
    tariffConfig: { baseFee: 30, includedWeightKg: 3, extraKgRate: 0, homeDeliveryFee: 0 },
    weightKg: 1,
    deliveryType: 'agency',
    discount: 100, // no debe dar negativo
  })
  assert.equal(excessiveDiscount.subtotal, 30)
  assert.equal(excessiveDiscount.discount, 30)
  assert.equal(excessiveDiscount.finalAmount, 0)
})

test('10. Conciliación y Caja Cerrada: todas las operaciones conservan movimiento financiero trazable', () => {
  const controller = new DemoParcelController('sindicato', 'empty')
  // Asegurar que no hay turno abierto
  assert.equal(controller.getState().activeShift, null)

  const initialMovements = controller.getState().cashMovements.length

  // Registrar envío pagado en origen con caja cerrada
  const shipment = controller.registerShipment({
    originBranchId: controller.getState().branches[0].id,
    destinationBranchId: controller.getState().branches[1].id,
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'Remitente Test', docType: 'CI', phone: '7000' },
    recipient: { id: 'c2', name: 'Receptor Test', docType: 'CI', phone: '7001' },
    items: [{ description: 'Sobre de documentos', category: 'documents', quantity: 1, packaging: 'sobre', weightKg: 0.5, isFragile: false }],
    paymentTiming: 'origin_paid',
    paymentMethod: 'qr',
    prohibitedGoodsNoticeAccepted: true,
  })
  assert.equal(shipment.paymentStatus, 'paid')

  // Se registró el movimiento con shiftId 'pending_reconciliation'
  const movementsAfterShipment = controller.getState().cashMovements
  assert.equal(movementsAfterShipment.length, initialMovements + 1)
  const movShipment = movementsAfterShipment[0]
  assert.equal(movShipment.shiftId, 'pending_reconciliation')
  assert.equal(movShipment.paymentMethod, 'qr')
  assert.equal(movShipment.amount, shipment.finalAmount)

  // Registrar gasto sindical con caja cerrada
  const expense = controller.registerUnionExpense({
    category: 'combustible_mantenimiento',
    description: 'Gasolina auxilio mecánico',
    amount: 80,
    paymentMethod: 'cash',
    receiptNumber: 'GAS-0099',
  })
  assert.equal(expense.amount, 80)

  const movementsAfterExpense = controller.getState().cashMovements
  assert.equal(movementsAfterExpense.length, initialMovements + 2)
  const movExpense = movementsAfterExpense.find(m => m.referenceId === expense.id) || movementsAfterExpense[movementsAfterExpense.length - 1]
  assert.equal(movExpense.shiftId, 'pending_reconciliation')
  assert.equal(movExpense.type, 'expense')
  assert.equal(movExpense.amount, 80)

  // El resumen financiero incluye los movimientos aun con turno cerrado
  const summary = calculateFinancialSummary({
    movements: controller.getState().cashMovements,
    workerPayments: controller.getState().workerPayments,
    unionExpenses: controller.getState().unionExpenses,
  })
  assert.ok(summary.totalIncomeAllMethods > 0)
})

test('11. Mensualidades Sindicales: rechazo de sobrepagos, cuota cero y reversión de pago', () => {
  const member: UnionMember = {
    id: 'm-test',
    memberNumber: 'SOC-999',
    fullName: 'Socio De Prueba',
    ci: '999999',
    phone: '799999',
    joinedAt: '2026-01-01',
    status: 'active',
    category: 'propietario_transporte',
    monthlyFee: 200,
  }

  const { createdDues } = generateMonthlyDuesForPeriod([member], [], '2026-11', 'Noviembre 2026', '2026-11-30')
  const due = createdDues[0]
  assert.equal(due.amount, 200)
  assert.equal(due.balance, 200)

  // 1. Intento de sobrepago debe ser estrictamente rechazado
  assert.throws(() => {
    applyDuePayment(due, 250, 'cash', 'Cajero', 'REC-ERR')
  }, /No se permiten sobrepagos sin un procedimiento explícito de adelanto o crédito/)

  // 2. Pago parcial legítimo
  const partial = applyDuePayment(due, 120, 'transfer', 'Cajero', 'REC-001')
  assert.equal(partial.paidAmount, 120)
  assert.equal(partial.balance, 80)
  assert.equal(partial.status, 'partial')
  const paymentId = partial.payments[0].id

  // 3. Reversión del pago
  const { updatedDue, revertedPayment } = revertDuePayment(partial, paymentId, 'Supervisor', 'Error en comprobante bancario')
  assert.equal(revertedPayment.isReversed, true)
  assert.match(revertedPayment.reversalReason || '', /Error en comprobante/)
  assert.equal(updatedDue.paidAmount, 0)
  assert.equal(updatedDue.balance, 200)
  assert.equal(updatedDue.status, 'pending')

  // 4. Socio con cuota 0 (exonerado u honorario)
  const exemptMember: UnionMember = {
    ...member,
    id: 'm-exempt',
    memberNumber: 'SOC-000',
    status: 'honorary',
    monthlyFee: 0,
  }
  const { createdDues: exemptDues } = generateMonthlyDuesForPeriod([exemptMember], [], '2026-11', 'Noviembre 2026', '2026-11-30')
  assert.equal(exemptDues[0].amount, 0)
  assert.equal(exemptDues[0].status, 'paid')
})

test('12. Aislamiento estricto de perfiles: Standard no accede ni copia datos sindicales', () => {
  const controller = new DemoParcelController('sindicato', 'full')
  assert.ok(controller.getState().members.length > 0)
  assert.ok(controller.getState().workers.length > 0)

  // Al conmutar al perfil standard, los datos sindicales se aíslan y limpian
  controller.setEdition('standard')
  assert.equal(controller.getEdition(), 'standard')
  assert.equal(controller.getState().members.length, 0)
  assert.equal(controller.getState().workers.length, 0)
  assert.equal(controller.getState().dues.length, 0)
  assert.equal(controller.getState().workerPayments.length, 0)
  assert.equal(controller.getState().unionExpenses.length, 0)

  // Los métodos de sindicato quedan bloqueados lanzando error
  assert.throws(() => {
    controller.payDue({ dueId: 'any', amount: 50, paymentMethod: 'cash' })
  }, /Operación no permitida: Esta función es exclusiva de la edición Sindicato/i)

  assert.throws(() => {
    controller.registerWorkerPayment({
      workerId: 'w1',
      workerName: 'Pedro',
      amount: 100,
      paymentMethod: 'cash',
      type: 'salary',
      periodOrConcept: 'Semana',
    })
  }, /Operación no permitida: Esta función es exclusiva de la edición Sindicato/i)

  assert.throws(() => {
    controller.registerUnionExpense({
      category: 'impresion_facturacion',
      description: 'Papelería',
      amount: 30,
      paymentMethod: 'cash',
    })
  }, /Operación no permitida: Esta función es exclusiva de la edición Sindicato/i)
})

test('13. Declaración de mercancías restringidas e integridad de entregas', () => {
  const controller = new DemoParcelController('standard', 'empty')

  // Rechazo por no aceptar la declaración jurada
  assert.throws(() => {
    controller.registerShipment({
      originBranchId: controller.getState().branches[0].id,
      destinationBranchId: controller.getState().branches[1].id,
      deliveryType: 'agency',
      sender: { id: 'c1', name: 'Rem', docType: 'CI', phone: '1' },
      recipient: { id: 'c2', name: 'Rec', docType: 'CI', phone: '2' },
      items: [{ description: 'Caja', category: 'general', quantity: 1, packaging: 'caja', weightKg: 1, isFragile: false }],
      paymentTiming: 'origin_paid',
      prohibitedGoodsNoticeAccepted: false,
    })
  }, /Debe aceptarse la declaración jurada sobre sustancias prohibidas/)

  // Entrega no permite doble entrega
  const fakeDeliveredShipment: ParcelShipment = {
    id: 's-delivered',
    trackingCode: 'ENC-2026-00050',
    createdAt: new Date().toISOString(),
    originBranchId: 'cbb',
    originCity: 'Cochabamba',
    destinationBranchId: 'lpz',
    destinationCity: 'La Paz',
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'A', docType: 'CI', phone: '1' },
    recipient: { id: 'c2', name: 'B', docType: 'CI', phone: '2' },
    items: [],
    declaredSummary: 'Paquete',
    packageCount: 1,
    totalWeightKg: 1,
    declaredValueTotal: 0,
    isFragile: false,
    prohibitedGoodsNoticeAccepted: true,
    shippingFee: 35,
    discount: 0,
    finalAmount: 35,
    paymentTiming: 'origin_paid',
    paymentStatus: 'paid',
    cashierUid: 'u1',
    cashierName: 'Op',
    status: 'delivered',
    history: [],
  }

  const dupDelivery = validateParcelDelivery(fakeDeliveredShipment, 'Receptor', '999', 'titular')
  assert.equal(dupDelivery.canDeliver, false)
  assert.match(dupDelivery.error || '', /ya fue entregada anteriormente/)
})

test('14. Filtros de rango de fechas en Resultado Operativo & Resumen Financiero', () => {
  const movements: CashMovement[] = [
    { id: '1', shiftId: 's1', timestamp: '2026-10-01T10:00:00Z', type: 'income', category: 'shipping_origin', amount: 100, paymentMethod: 'cash', concept: 'Envío 1', operatorUid: 'u1', operatorName: 'Op' },
    { id: '2', shiftId: 's1', timestamp: '2026-10-15T10:00:00Z', type: 'income', category: 'shipping_origin', amount: 200, paymentMethod: 'cash', concept: 'Envío 2', operatorUid: 'u1', operatorName: 'Op' },
    { id: '3', shiftId: 's1', timestamp: '2026-10-28T10:00:00Z', type: 'income', category: 'shipping_origin', amount: 300, paymentMethod: 'cash', concept: 'Envío 3', operatorUid: 'u1', operatorName: 'Op' },
  ]

  // Sin filtro toma todos: 600
  const totalAll = calculateFinancialSummary({ movements, workerPayments: [], unionExpenses: [] })
  assert.equal(totalAll.totalCashIn, 600)

  // Con filtro entre 2026-10-10 y 2026-10-20 toma solo el de 200
  const filtered = calculateFinancialSummary({
    movements,
    workerPayments: [],
    unionExpenses: [],
    dateRange: { startDate: '2026-10-10', endDate: '2026-10-20' },
  })
  assert.equal(filtered.totalCashIn, 200)
  assert.equal(filtered.totalIncomeAllMethods, 200)
})

test('15. Validación estricta de entregas a terceros sin autorización o justificación', () => {
  const controller = new DemoParcelController('standard', 'empty')
  const branch1 = controller.getState().branches[0]
  const branch2 = controller.getState().branches[1]

  // Abrir turno para operar con importe numérico válido
  controller.openCashShift(100, 'Operador Destino')
  assert.equal(controller.getState().activeShift?.initialCash, 100)
  assert.equal(controller.getState().activeShift?.operatorName, 'Operador Destino')

  const shipment = controller.registerShipment({
    originBranchId: branch1.id,
    destinationBranchId: branch2.id,
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'Carlos Remitente', docType: 'CI', phone: '70001111' },
    recipient: { id: 'c2', name: 'Elena Titular', docType: 'CI', phone: '70002222' },
    items: [{ description: 'Documentos importantes', category: 'documentos', quantity: 1, packaging: 'sobre', weightKg: 0.5, isFragile: false }],
    paymentTiming: 'origin_paid',
    paymentMethod: 'cash',
    prohibitedGoodsNoticeAccepted: true,
  })

  // Despachar en manifiesto y recepcionar en destino
  const manifest = controller.createDispatchManifest({
    originBranchId: branch1.id,
    destinationBranchId: branch2.id,
    driverOrResponsible: 'Conductor 445566',
    vehiclePlate: '1234-XYZ',
    parcelIds: [shipment.id],
  })
  controller.receiveManifestAtDestination(manifest.id, 'Operador Destino')

  // 1. Intentar entregar a un familiar o apoderado SIN justificación ni autorización
  assert.throws(() => {
    controller.deliverShipment({
      shipmentId: shipment.id,
      receiverName: 'Mario Hermano',
      receiverDoc: '998877 CI',
      recipientRelationship: 'familiar',
      // Sin authorizedChangeReason
    })
  }, /Al no ser el titular quien recibe.*es obligatorio registrar la justificación/i)

  // 2. Intentar entregar a un apoderado con justificación vacía (espacios)
  assert.throws(() => {
    controller.deliverShipment({
      shipmentId: shipment.id,
      receiverName: 'Abogado Perez',
      receiverDoc: '332211 CI',
      recipientRelationship: 'apoderado',
      authorizedChangeReason: '   ',
    })
  }, /Al no ser el titular quien recibe.*es obligatorio registrar la justificación/i)

  // 3. Entregar con justificación válida y debidamente respaldada
  const delivered = controller.deliverShipment({
    shipmentId: shipment.id,
    receiverName: 'Mario Hermano',
    receiverDoc: '998877 CI',
    recipientRelationship: 'familiar',
    authorizedChangeReason: 'Poder notariado nro. 45/2026 y copia de cédula del titular',
    deliveryNotes: 'Verificada cédula original en ventanilla',
    signatureCaptured: 'data:image/svg+xml;base64,mockSign',
  })

  assert.equal(delivered.status, 'delivered')
  assert.equal(delivered.delivery?.receivedByName, 'Mario Hermano')
  assert.equal(delivered.delivery?.recipientRelationship, 'familiar')
  assert.equal(delivered.delivery?.authorizedChangeReason, 'Poder notariado nro. 45/2026 y copia de cédula del titular')
})

test('16. Anulación vs Reversión de mensualidades y comprobación contable sin dobles registros', () => {
  const member: UnionMember = {
    id: 'm-audit',
    memberNumber: 'SOC-900',
    fullName: 'Roberto Valdivia',
    ci: '5566778',
    phone: '77665544',
    status: 'active',
    joinedAt: '2026-01-01',
    monthlyFee: 200,
  }

  const { createdDues } = generateMonthlyDuesForPeriod([member], [], '2026-10', 'Octubre 2026', '2026-10-31')
  let due = createdDues[0]

  // Paso 1: Registrar dos pagos parciales de Bs. 100 cada uno
  due = applyDuePayment(due, 100, 'cash', 'Cajero 1', 'REC-001')
  due = applyDuePayment(due, 100, 'cash', 'Cajero 1', 'REC-002')
  assert.equal(due.status, 'paid')
  assert.equal(due.paidAmount, 200)
  assert.equal(due.balance, 0)

  const payment1 = due.payments[0]
  const payment2 = due.payments[1]

  // Movimientos iniciales de caja correspondientes a los pagos
  const initialMovements: CashMovement[] = [
    {
      id: 'mov-due-1',
      shiftId: 's1',
      timestamp: '2026-10-10T10:00:00Z',
      type: 'income',
      category: 'union_due',
      amount: 100,
      paymentMethod: 'cash',
      concept: 'Cuota Octubre SOC-900 Recibo REC-001',
      referenceId: payment1.id,
      operatorUid: 'u1',
      operatorName: 'Cajero 1',
    },
    {
      id: 'mov-due-2',
      shiftId: 's1',
      timestamp: '2026-10-12T10:00:00Z',
      type: 'income',
      category: 'union_due',
      amount: 100,
      paymentMethod: 'cash',
      concept: 'Cuota Octubre SOC-900 Recibo REC-002',
      referenceId: payment2.id,
      operatorUid: 'u1',
      operatorName: 'Cajero 1',
    },
  ]

  // Resumen inicial: Ingreso total 200, Caja 200, Resultado operativo 200
  const summaryInitial = calculateFinancialSummary({
    movements: initialMovements,
    workerPayments: [],
    unionExpenses: [],
  })
  assert.equal(summaryInitial.byCategory.unionDuesIncome, 200)
  assert.equal(summaryInitial.totalCashIn, 200)
  assert.equal(summaryInitial.totalCashOut, 0)
  assert.equal(summaryInitial.netOperatingBalance, 200)

  // Paso 2: Anulación Documental (documentary_void) del pago 1 (error de digitación, no hubo salida física de dinero)
  const voidResult = revertDuePayment({
    due,
    paymentId: payment1.id,
    revertedBy: 'Supervisor Contable',
    reason: 'Error de tipeo en folio, duplicación documental involuntaria',
    reversalType: 'documentary_void',
    refundMethod: 'none',
  })
  due = voidResult.updatedDue
  assert.equal(due.paidAmount, 100)
  assert.equal(due.balance, 100)
  assert.equal(due.status, 'partial')

  // Movimiento de anulación documental
  const voidMovement: CashMovement = {
    id: 'mov-void-1',
    shiftId: 's1',
    timestamp: '2026-10-15T11:00:00Z',
    type: 'reversal',
    category: 'reversal',
    amount: 100,
    paymentMethod: 'cash',
    concept: 'Anulación documental de cuota REC-001',
    referenceId: payment1.id,
    operatorUid: 'u2',
    operatorName: 'Supervisor Contable',
    reversalType: 'documentary_void',
    isPhysicalCashOut: false,
  }

  const movementsAfterVoid = [...initialMovements, voidMovement]
  const summaryAfterVoid = calculateFinancialSummary({
    movements: movementsAfterVoid,
    workerPayments: [],
    unionExpenses: [],
  })

  // Ingreso neto de cuotas debe descontar la anulación (200 - 100 = 100)
  assert.equal(summaryAfterVoid.byCategory.unionDuesIncome, 100)
  // Al ser documental, NO debe inflar la salida física de caja
  assert.equal(summaryAfterVoid.totalCashOut, 0)
  // El ingreso total reconocido baja a 100
  assert.equal(summaryAfterVoid.totalIncomeAllMethods, 100)
  // Resultado operativo exacto: 100
  assert.equal(summaryAfterVoid.netOperatingBalance, 100)

  // Paso 3: Devolución Efectiva (refund) del pago 2 (devolución física de efectivo de Bs. 100 al socio)
  const refundResult = revertDuePayment({
    due,
    paymentId: payment2.id,
    revertedBy: 'Supervisor Contable',
    reason: 'Socio solicitó baja y devolución en ventanilla',
    reversalType: 'refund',
    refundMethod: 'cash',
  })
  due = refundResult.updatedDue
  assert.equal(due.paidAmount, 0)
  assert.equal(due.balance, 200)
  assert.equal(due.status, 'pending')

  // Movimiento de devolución en efectivo
  const refundMovement: CashMovement = {
    id: 'mov-refund-2',
    shiftId: 's1',
    timestamp: '2026-10-16T12:00:00Z',
    type: 'reversal',
    category: 'reversal',
    amount: 100,
    paymentMethod: 'cash',
    concept: 'Devolución en efectivo de cuota REC-002',
    referenceId: payment2.id,
    operatorUid: 'u2',
    operatorName: 'Supervisor Contable',
    reversalType: 'refund',
    isPhysicalCashOut: true,
  }

  const movementsAfterRefund = [...movementsAfterVoid, refundMovement]
  const summaryAfterRefund = calculateFinancialSummary({
    movements: movementsAfterRefund,
    workerPayments: [],
    unionExpenses: [],
  })

  // Ambos ingresos quedaron anulados/revertidos
  assert.equal(summaryAfterRefund.byCategory.unionDuesIncome, 0)
  // Salida física de caja registra exactamente los Bs. 100 devueltos
  assert.equal(summaryAfterRefund.totalCashOut, 100)
  // Saldo en gaveta: 100 neto de efectivo ingresado - 100 devuelto = 0
  assert.equal(summaryAfterRefund.expectedCashInDrawer, 0)
  // Resultado operativo: 0 neto de cuotas - 0 gastos operativos = 0
  assert.equal(summaryAfterRefund.netOperatingBalance, 0)
})

test('17. Conciliación de caja: Bloqueo a turnos cerrados y asignación auditable a turno abierto', () => {
  const controller = new DemoParcelController('sindicato', 'empty')
  const branch = controller.getState().branches[0]

  // Operación registrada con caja cerrada -> genera movimiento 'pending_reconciliation'
  const shipment = controller.registerShipment({
    originBranchId: branch.id,
    destinationBranchId: controller.getState().branches[1].id,
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'Ana Lopez', docType: 'CI', phone: '70003333' },
    recipient: { id: 'c2', name: 'Carlos Ramos', docType: 'CI', phone: '70004444' },
    items: [{ description: 'Caja repuestos', category: 'repuestos', quantity: 1, packaging: 'caja', weightKg: 2, isFragile: false }],
    paymentTiming: 'origin_paid',
    paymentMethod: 'cash',
    prohibitedGoodsNoticeAccepted: true,
  })

  const pending = controller.getState().cashMovements.find(m => m.shiftId === 'pending_reconciliation')
  assert.ok(pending, 'Debe existir un movimiento pendiente de conciliación')
  assert.equal(pending.amount, shipment.finalAmount)

  // 1. Intentar conciliar cuando no hay turno abierto -> debe rechazarse
  assert.throws(() => {
    controller.reconcilePendingMovements({
      movementIds: [pending.id],
      supervisorName: 'Supervisor General',
      notes: 'Intento sin turno',
    })
  }, /No se pueden conciliar movimientos porque no hay un turno de caja abierto/i)

  // 2. Abrir turno en la sucursal
  controller.openCashShift(50, 'Cajero Oficial')
  const openShiftId = controller.getState().activeShift?.id
  assert.ok(openShiftId)

  // 3. Conciliar exitosamente al turno abierto
  controller.reconcilePendingMovements({
    movementIds: [pending.id],
    supervisorName: 'Supervisor General',
    notes: 'Revisado y validado en arqueo físico',
  })

  // Comprobar que el movimiento fue incorporado al turno
  const reconciled = controller.getState().cashMovements.find(m => m.id === pending.id)
  assert.equal(reconciled?.shiftId, openShiftId)
  assert.equal(reconciled?.reconciledBy, 'Supervisor General')
  assert.equal(reconciled?.reconciledShiftId, openShiftId)
  assert.ok(reconciled?.reconciledAt)

  // Comprobar que el turno activo incorporó el monto en efectivo
  const activeShift = controller.getState().activeShift
  assert.equal(activeShift?.totalCashIn, shipment.finalAmount)
  assert.equal(activeShift?.expectedCash, 50 + shipment.finalAmount)
})

test('18. Soporte multianual de cuotas sindicales (2027 y posteriores)', () => {
  const member: UnionMember = {
    id: 'm-future',
    memberNumber: 'SOC-2027',
    fullName: 'David Quiroga',
    ci: '8877665',
    phone: '71122334',
    status: 'active',
    joinedAt: '2026-12-01',
    monthlyFee: 150,
  }

  // Generar cuota para Febrero de 2027
  const { createdDues } = generateMonthlyDuesForPeriod([member], [], '2027-02', 'Febrero 2027', '2027-02-28')
  assert.equal(createdDues.length, 1)
  assert.equal(createdDues[0].period, '2027-02')
  assert.equal(createdDues[0].periodLabel, 'Febrero 2027')
  assert.equal(createdDues[0].dueDate, '2027-02-28')
  assert.equal(createdDues[0].amount, 150)
  assert.equal(createdDues[0].balance, 150)
})

test('19. Conservación de categoría auténtica de egresos sindicales', () => {
  const controller = new DemoParcelController('sindicato', 'empty')
  controller.openCashShift(500, 'Tesorero Sindicato')
  assert.equal(controller.getState().activeShift?.initialCash, 500)
  assert.equal(controller.getState().activeShift?.operatorName, 'Tesorero Sindicato')

  const expense = controller.registerUnionExpense({
    category: 'combustible_mantenimiento',
    description: 'Compra de diésel para furgón de ruta interprovincial',
    amount: 180,
    paymentMethod: 'cash',
    invoiceOrVoucherNumber: 'FAC-9912',
  })

  assert.equal(expense.category, 'combustible_mantenimiento')
  const movement = controller.getState().cashMovements.find(m => m.referenceId === expense.id)
  assert.ok(movement)
  assert.equal(movement.category, 'combustible_mantenimiento')
  assert.equal(movement.expenseCategory, 'combustible_mantenimiento')
  assert.equal(movement.amount, 180)
})

test('20. Caso 1: Aporte cobrado en efectivo y posteriormente devuelto mediante transferencia', () => {
  const controller = new DemoParcelController('sindicato', 'empty')
  
  // Abrir turno con Bs. 300 de fondo de cambio
  controller.openCashShift(300, 'Cajero Principal')
  assert.equal(controller.getState().activeShift?.expectedCash, 300)

  // Crear un socio y su cuota de Bs. 150
  const member: UnionMember = {
    id: 'm-trans-ref',
    memberNumber: 'SOC-777',
    fullName: 'Gonzalo Morales',
    ci: '4455667',
    phone: '77889900',
    status: 'active',
    joinedAt: '2026-01-01',
    monthlyFee: 150,
  }
  controller.getState().members.push(member)

  const { createdDues } = generateMonthlyDuesForPeriod([member], [], '2026-10', 'Octubre 2026', '2026-10-31')
  controller.getState().dues.push(...createdDues)
  const due = createdDues[0]

  // Paso 1: Cobrar la cuota en EFECTIVO
  const paidDue = controller.payDue({
    dueId: due.id,
    amount: 150,
    paymentMethod: 'cash',
    cashierName: 'Cajero Principal',
    notes: 'Pago en ventanilla efectivo',
  })
  assert.equal(paidDue.status, 'paid')
  assert.equal(paidDue.paidAmount, 150)
  assert.equal(paidDue.balance, 0)

  // En el turno activo: ingresaron 150 en efectivo, expectedCash = 300 + 150 = 450
  assert.equal(controller.getState().activeShift?.totalCashIn, 150)
  assert.equal(controller.getState().activeShift?.totalCashOut, 0)
  assert.equal(controller.getState().activeShift?.expectedCash, 450)

  // Paso 2: Devolver el aporte mediante TRANSFERENCIA BANCARIA (desde cuenta del sindicato)
  const paymentId = paidDue.payments[0].id
  const updatedDue = controller.revertDuePayment({
    dueId: due.id,
    paymentId,
    reason: 'Socio solicitó devolución por transferencia bancaria de la directiva',
    cashierName: 'Secretaría de Hacienda',
    reversalType: 'refund',
    refundMethod: 'transfer',
  })

  assert.equal(updatedDue.balance, 150)
  assert.equal(updatedDue.paidAmount, 0)
  assert.equal(updatedDue.status, 'pending')

  // Movimiento de reversión debe registrar estrictamente 'transfer' y isPhysicalCashOut = false
  const reversalMov = controller.getState().cashMovements.find(m => m.referenceId === due.id && m.type === 'reversal')
  assert.ok(reversalMov, 'Debe existir el movimiento de reversión')
  assert.equal(reversalMov?.paymentMethod, 'transfer')
  assert.equal(reversalMov?.reversalType, 'refund')
  assert.equal(reversalMov?.isPhysicalCashOut, false)
  assert.match(reversalMov?.concept || '', /TRANSFER/i)

  // ¡VERIFICACIÓN CRÍTICA!: La caja física (gaveta) NO debe descontarse, porque no salió efectivo
  const activeShift = controller.getState().activeShift
  assert.equal(activeShift?.totalCashOut, 0, 'No debe haber egreso de caja física por devolución bancaria')
  assert.equal(activeShift?.expectedCash, 450, 'El efectivo cobrado previamente continúa físicamente en la gaveta')

  // En el resumen financiero global:
  const summary = calculateFinancialSummary({
    movements: controller.getState().cashMovements,
    workerPayments: [],
    unionExpenses: [],
    initialCash: 300,
  })
  assert.equal(summary.totalCashOut, 0, 'Salida de caja física es 0')
  assert.equal(summary.expectedCashInDrawer, 450, 'Efectivo en gaveta se preserva en 450')
  assert.equal(summary.byCategory.unionDuesIncome, 0, 'Ingreso neto de cuota queda en 0 por la reversión')
  assert.equal(summary.netOperatingBalance, 0, 'Resultado operativo queda en 0')
})

test('21. Caso 2: Conciliación de movimientos pendientes diferencia anulación documental de devolución efectiva', () => {
  const controller = new DemoParcelController('sindicato', 'empty')

  // Registrar operaciones mientras la caja está CERRADA (shiftId: 'pending_reconciliation')
  // 1. Cobro de encomienda en efectivo: +shipment.finalAmount Bs
  const branch1 = controller.getState().branches[0]
  const branch2 = controller.getState().branches[1]
  const shipment = controller.registerShipment({
    originBranchId: branch1.id,
    destinationBranchId: branch2.id,
    deliveryType: 'agency',
    sender: { id: 'c1', name: 'Remitente', docType: 'CI', phone: '70001111' },
    recipient: { id: 'c2', name: 'Destinatario', docType: 'CI', phone: '70002222' },
    items: [{ description: 'Paquete', category: 'general', quantity: 1, packaging: 'caja', weightKg: 1, isFragile: false }],
    paymentTiming: 'origin_paid',
    paymentMethod: 'cash',
    prohibitedGoodsNoticeAccepted: true,
  })
  const movIncome = controller.getState().cashMovements.find(m => m.referenceId === shipment.id)!
  assert.equal(movIncome.shiftId, 'pending_reconciliation')
  assert.equal(movIncome.amount, shipment.finalAmount)

  // 2. Anulación documental de un recibo erróneo (documentary_void): 100 Bs
  // (No hubo dinero real; fue un error de registro de folio duplicado)
  const movVoid: CashMovement = {
    id: `mov-void-${Date.now()}`,
    shiftId: 'pending_reconciliation',
    timestamp: new Date().toISOString(),
    type: 'reversal',
    category: 'reversal',
    amount: 100,
    paymentMethod: 'cash',
    concept: 'Anulación documental de cuota errónea',
    operatorUid: 'u1',
    operatorName: 'Supervisor',
    reversalType: 'documentary_void',
    isPhysicalCashOut: false,
  }
  controller.getState().cashMovements.push(movVoid)

  // 3. Devolución efectiva de dinero en ventanilla (refund en efectivo): 40 Bs
  // (El socio devolvió su cuota y se le entregaron 40 Bs en mano fuera de turno)
  const movRefund: CashMovement = {
    id: `mov-refund-${Date.now()}`,
    shiftId: 'pending_reconciliation',
    timestamp: new Date().toISOString(),
    type: 'reversal',
    category: 'reversal',
    amount: 40,
    paymentMethod: 'cash',
    concept: 'Devolución física en efectivo a socio en ventanilla',
    operatorUid: 'u1',
    operatorName: 'Supervisor',
    reversalType: 'refund',
    isPhysicalCashOut: true,
  }
  controller.getState().cashMovements.push(movRefund)

  // Ahora se abre un turno de caja formal con fondo de cambio de Bs. 200
  controller.openCashShift(200, 'Cajero de Turno')
  const activeShift = controller.getState().activeShift!
  assert.equal(activeShift.initialCash, 200)
  assert.equal(activeShift.expectedCash, 200)

  // Conciliar los 3 movimientos pendientes
  controller.reconcilePendingMovements({
    movementIds: [movIncome.id, movVoid.id, movRefund.id],
    supervisorName: 'Auditor Financiero',
    notes: 'Conciliación de jornada matutina fuera de turno',
  })

  // VERIFICACIONES CRÍTICAS TRAS CONCILIACIÓN:
  const reconciledShift = controller.getState().activeShift!

  // 1. Los 3 movimientos quedan asociados al turno activo
  assert.equal(controller.getState().cashMovements.find(m => m.id === movIncome.id)?.shiftId, reconciledShift.id)
  assert.equal(controller.getState().cashMovements.find(m => m.id === movVoid.id)?.shiftId, reconciledShift.id)
  assert.equal(controller.getState().cashMovements.find(m => m.id === movRefund.id)?.shiftId, reconciledShift.id)

  // 2. Comportamiento en el turno de caja:
  // - Ingreso en efectivo incorporado: +shipment.finalAmount
  assert.equal(reconciledShift.totalCashIn, shipment.finalAmount)
  // - Egreso en efectivo incorporado: DEBE SER ÚNICAMENTE LOS 40 Bs de la devolución física (refund)
  //   La anulación documental (movVoid de 100 Bs) NUNCA debe convertirse en egreso físico de gaveta.
  assert.equal(reconciledShift.totalCashOut, 40, 'totalCashOut debe sumar solo el refund de 40 Bs, NO la anulación documental de 100 Bs')
  // - Saldo esperado en gaveta: initialCash (200) + income (shipment.finalAmount) - refund (40)
  const expectedFinalCash = 200 + shipment.finalAmount - 40
  assert.equal(reconciledShift.expectedCash, expectedFinalCash)
})

test('22. Integración con PACHAX Core BusinessIdentity en documentos de encomiendas', async () => {
  const { toDocumentCompanyContext, generateShipmentReceptionPdf } = await import('../src/modules/parcel/domain/parcelDocuments.ts')
  const { createFullParcelDataset } = await import('../src/demo/datasets/parcel/parcelDatasets.ts')
  const data = createFullParcelDataset('standard')

  // Mock BusinessIdentity from PACHAX Core
  const coreIdentity = {
    tradeName: 'Logística & Encomiendas Andina',
    legalName: 'Transportes Andina S.R.L.',
    taxId: '5566778899',
    phone: '3-3334455',
    whatsapp: '+59178899000',
    address: 'Av. Santos Dumont #300',
    city: 'Santa Cruz de la Sierra',
    logoUrl: 'https://pachax.app/logos/andina.png',
  }

  const normalized = toDocumentCompanyContext(coreIdentity as any)
  assert.equal(normalized.name, 'Logística & Encomiendas Andina')
  assert.equal(normalized.legalName, 'Transportes Andina S.R.L.')
  assert.equal(normalized.taxId, '5566778899')
  assert.equal(normalized.phone, '3-3334455')
  assert.equal(normalized.city, 'Santa Cruz de la Sierra')
  assert.equal(normalized.logoUrl, 'https://pachax.app/logos/andina.png')

  // Emitir PDF usando BusinessIdentity directamente
  const pdf = await generateShipmentReceptionPdf(data.shipments[0], { company: coreIdentity as any, format: '80mm' })
  assert.ok(pdf.blob.size > 1000)
})
