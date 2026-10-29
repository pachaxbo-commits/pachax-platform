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
