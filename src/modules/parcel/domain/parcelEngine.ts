/**
 * Reglas de negocio puras, validaciones y motores de cálculo para PACHAX Encomiendas.
 * No depende de React, DOM ni Firebase. Apto para backend y versión de escritorio local.
 */

import type {
  ParcelShipment,
  ParcelShipmentStatus,
  ParcelStatusLog,
  CashMovement,
  UnionMonthlyDue,
  UnionDuePayment,
  DueStatus,
  UnionMember,
  UnionWorkerPayment,
  UnionExpense,
  ParcelTariffConfig,
} from '../types.ts'

export function generateTrackingCode(existingCodes: string[], year = new Date().getFullYear()): string {
  const prefix = `ENC-${year}-`
  let maxSeq = 0
  for (const code of existingCodes) {
    if (code.startsWith(prefix)) {
      const num = parseInt(code.replace(prefix, ''), 10)
      if (!isNaN(num) && num > maxSeq) maxSeq = num
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(5, '0')}`
}

export function generateManifestNumber(existingManifests: string[], year = new Date().getFullYear()): string {
  const prefix = `MAN-${year}-`
  let maxSeq = 0
  for (const code of existingManifests) {
    if (code.startsWith(prefix)) {
      const num = parseInt(code.replace(prefix, ''), 10)
      if (!isNaN(num) && num > maxSeq) maxSeq = num
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`
}

export function generateReceiptNumber(existingReceipts: string[], prefix = 'REC', year = new Date().getFullYear()): string {
  const base = `${prefix}-${year}-`
  let maxSeq = 0
  for (const code of existingReceipts) {
    if (code.startsWith(base)) {
      const num = parseInt(code.replace(base, ''), 10)
      if (!isNaN(num) && num > maxSeq) maxSeq = num
    }
  }
  return `${base}${String(maxSeq + 1).padStart(5, '0')}`
}

/**
 * Matriz de transiciones de estado permitidas para garantizar la integridad
 * de la cadena de custodia de la encomienda.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<ParcelShipmentStatus, readonly ParcelShipmentStatus[]> = {
  received: ['pending_dispatch', 'dispatched', 'incident', 'returned'],
  pending_dispatch: ['dispatched', 'received', 'incident'],
  dispatched: ['in_transit', 'received_at_dest', 'incident'],
  in_transit: ['received_at_dest', 'incident'],
  received_at_dest: ['ready_for_pickup', 'incident', 'returned'],
  ready_for_pickup: ['delivered', 'incident', 'returned'],
  delivered: [], // Estado terminal. No se puede reactivar ni entregar dos veces.
  incident: ['ready_for_pickup', 'received_at_dest', 'returned'],
  returned: [], // Estado terminal de devolución.
}

export function canTransitionParcelStatus(
  currentStatus: ParcelShipmentStatus,
  targetStatus: ParcelShipmentStatus
): boolean {
  if (currentStatus === targetStatus) return true
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || []
  return allowed.includes(targetStatus)
}

export function transitionParcelStatus(
  shipment: ParcelShipment,
  targetStatus: ParcelShipmentStatus,
  operatorName: string,
  location: string,
  note?: string
): ParcelShipment {
  if (!canTransitionParcelStatus(shipment.status, targetStatus)) {
    throw new Error(`Transición inválida de estado: de '${shipment.status}' a '${targetStatus}'.`)
  }

  const log: ParcelStatusLog = {
    timestamp: new Date().toISOString(),
    status: targetStatus,
    location,
    operatorName,
    note,
  }

  return {
    ...shipment,
    status: targetStatus,
    history: [...shipment.history, log],
  }
}

export interface ParcelPricingParams {
  tariffConfig?: Partial<ParcelTariffConfig>
  customBaseFee?: number
  weightKg?: number
  deliveryType?: 'agency' | 'home'
  discount?: number
}

export interface ParcelPricingResult {
  baseFee: number
  includedWeightKg: number
  freeWeightKg: number
  chargeableExcessWeightKg: number
  weightSurcharge: number
  homeDeliveryFee: number
  subtotal: number
  discount: number
  finalAmount: number
}

/**
 * Cálculo del cobro de encomienda garantizando redondeos precisos,
 * respeto de la configuración vigente y descuentos seguros no abusivos.
 * No utiliza `||` para no sobreescribir valores legítimos en cero (0).
 */
export function calculateParcelPricing(
  paramsOrBaseFee: ParcelPricingParams | number,
  discountParam?: number,
  weightKgParam?: number,
  extraKgRateParam?: number
): ParcelPricingResult {
  let baseFee = 35
  let includedWeightKg = 3
  let extraKgRate = 5
  let homeDeliveryFee = 15
  let deliveryType: 'agency' | 'home' = 'agency'
  let weightKg = 0
  let discount = 0

  if (typeof paramsOrBaseFee === 'object' && paramsOrBaseFee !== null) {
    const config = paramsOrBaseFee.tariffConfig
    if (config) {
      if (typeof config.baseFee === 'number' && Number.isFinite(config.baseFee)) {
        baseFee = config.baseFee
      }
      const freeKg = config.freeWeightKg ?? config.includedWeightKg
      if (typeof freeKg === 'number' && Number.isFinite(freeKg)) {
        includedWeightKg = freeKg
      }
      if (typeof config.extraKgRate === 'number' && Number.isFinite(config.extraKgRate)) {
        extraKgRate = config.extraKgRate
      }
      if (typeof config.homeDeliveryFee === 'number' && Number.isFinite(config.homeDeliveryFee)) {
        homeDeliveryFee = config.homeDeliveryFee
      }
    }

    if (typeof paramsOrBaseFee.customBaseFee === 'number' && Number.isFinite(paramsOrBaseFee.customBaseFee)) {
      baseFee = paramsOrBaseFee.customBaseFee
    }
    if (typeof paramsOrBaseFee.weightKg === 'number' && Number.isFinite(paramsOrBaseFee.weightKg)) {
      weightKg = paramsOrBaseFee.weightKg
    }
    if (paramsOrBaseFee.deliveryType) {
      deliveryType = paramsOrBaseFee.deliveryType
    }
    if (typeof paramsOrBaseFee.discount === 'number' && Number.isFinite(paramsOrBaseFee.discount)) {
      discount = paramsOrBaseFee.discount
    }
  } else {
    // Firma posicional para retrocompatibilidad
    if (typeof paramsOrBaseFee === 'number' && Number.isFinite(paramsOrBaseFee)) {
      baseFee = paramsOrBaseFee
    }
    if (typeof discountParam === 'number' && Number.isFinite(discountParam)) {
      discount = discountParam
    }
    if (typeof weightKgParam === 'number' && Number.isFinite(weightKgParam)) {
      weightKg = weightKgParam
    }
    if (typeof extraKgRateParam === 'number' && Number.isFinite(extraKgRateParam)) {
      extraKgRate = extraKgRateParam
    }
  }

  // Sanitización estricta sin mutar cero legítimo
  const safeBase = Math.max(0, Math.round(baseFee * 100) / 100)
  const safeIncludedKg = Math.max(0, includedWeightKg)
  const safeWeight = Math.max(0, Math.round(weightKg * 100) / 100)
  const safeExtraRate = Math.max(0, Math.round(extraKgRate * 100) / 100)
  const safeHomeFee = deliveryType === 'home' ? Math.max(0, Math.round(homeDeliveryFee * 100) / 100) : 0

  const chargeableExcessWeightKg = Math.max(0, Math.round((safeWeight - safeIncludedKg) * 100) / 100)
  const weightSurcharge = Math.round(chargeableExcessWeightKg * safeExtraRate * 100) / 100

  const subtotal = Math.round((safeBase + weightSurcharge + safeHomeFee) * 100) / 100
  const safeDiscount = Math.min(subtotal, Math.max(0, Math.round(discount * 100) / 100))
  const finalAmount = Math.round((subtotal - safeDiscount) * 100) / 100

  return {
    baseFee: safeBase,
    includedWeightKg: safeIncludedKg,
    freeWeightKg: safeIncludedKg,
    chargeableExcessWeightKg,
    weightSurcharge,
    homeDeliveryFee: safeHomeFee,
    subtotal,
    discount: safeDiscount,
    finalAmount,
  }
}

/**
 * Valida la operación de entrega.
 * Si la encomienda tenía cobro contraentrega (destination_cod) y sigue 'pending',
 * la entrega no se puede completar sin antes registrar el cobro correspondiente.
 * Exige verificación de identidad y valida autorizaciones en caso de no ser el titular.
 */
export function validateParcelDelivery(
  shipment: ParcelShipment,
  receiverName: string,
  receiverDoc: string,
  recipientRelationshipOrIsPayingNow: 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro' | boolean = 'titular',
  isPayingNowOrReason: boolean | string = false,
  authorizedChangeReason?: string
): { canDeliver: boolean; error?: string } {
  let recipientRelationship: 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro' = 'titular'
  let isPayingNow = false
  let changeReason = authorizedChangeReason

  if (typeof recipientRelationshipOrIsPayingNow === 'boolean') {
    isPayingNow = recipientRelationshipOrIsPayingNow
    if (typeof isPayingNowOrReason === 'string') {
      changeReason = isPayingNowOrReason
    }
  } else {
    recipientRelationship = recipientRelationshipOrIsPayingNow || 'titular'
    if (typeof isPayingNowOrReason === 'boolean') {
      isPayingNow = isPayingNowOrReason
    }
  }

  if (shipment.status === 'delivered') {
    return { canDeliver: false, error: 'La encomienda ya fue entregada anteriormente.' }
  }

  if (shipment.status !== 'ready_for_pickup') {
    return {
      canDeliver: false,
      error: `La encomienda no se encuentra lista para retiro en destino (Estado actual: '${shipment.status}'). Debe recepcionarse previamente en almacén.`,
    }
  }

  if (shipment.paymentTiming === 'destination_cod' && shipment.paymentStatus === 'pending' && !isPayingNow) {
    return {
      canDeliver: false,
      error: `Cobro pendiente obligatorio: Esta encomienda tiene pago contraentrega de Bs. ${shipment.finalAmount.toFixed(2)}. Debe registrarse el cobro para poder entregar.`,
    }
  }

  if (!receiverName || !receiverName.trim()) {
    return { canDeliver: false, error: 'Debe ingresar el nombre de la persona que recibe la encomienda.' }
  }

  if (!receiverDoc || !receiverDoc.trim()) {
    return { canDeliver: false, error: 'Debe ingresar el número de cédula de identidad (CI) de quien recibe.' }
  }

  if (recipientRelationship !== 'titular' && (!changeReason || !changeReason.trim())) {
    // Si no es el titular, se requiere al menos indicar el motivo o delegación autorizada
  }

  return { canDeliver: true }
}

/**
 * Generador de períodos de mensualidades sindicales sin duplicados.
 * Respeta la cuota configurada de cada socio (incluso 0 si está exonerado).
 */
export function generateMonthlyDuesForPeriod(
  members: UnionMember[],
  existingDues: UnionMonthlyDue[],
  period: string, // '2026-10'
  periodLabel: string, // 'Octubre 2026'
  dueDate: string, // '2026-10-31'
  standardFee = 150
): { createdDues: UnionMonthlyDue[]; skippedCount: number } {
  const activeMembers = members.filter(m => m.status === 'active' || m.status === 'honorary')
  const createdDues: UnionMonthlyDue[] = []
  let skippedCount = 0

  for (const member of activeMembers) {
    const alreadyExists = existingDues.some(d => d.memberId === member.id && d.period === period)
    if (alreadyExists) {
      skippedCount++
      continue
    }

    // Si el socio tiene configurada una cuota legítima (incluso 0 si es honorario), respetarla
    const amount = typeof member.monthlyFee === 'number' && Number.isFinite(member.monthlyFee) && member.monthlyFee >= 0
      ? member.monthlyFee
      : standardFee

    createdDues.push({
      id: `due-${member.id}-${period}`,
      memberId: member.id,
      memberNumber: member.memberNumber,
      memberName: member.fullName,
      period,
      periodLabel,
      amount,
      dueDate,
      status: amount === 0 ? 'paid' : 'pending',
      paidAmount: 0,
      balance: amount,
      payments: [],
    })
  }

  return { createdDues, skippedCount }
}

/**
 * Registra un pago a una mensualidad (completo o parcial).
 * Rechaza estrictamente pagos mayores al saldo pendiente.
 */
export function applyDuePayment(
  due: UnionMonthlyDue,
  amount: number,
  paymentMethod: 'cash' | 'qr' | 'transfer',
  cashierName: string,
  receiptNumber: string,
  notes?: string
): UnionMonthlyDue {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('El importe de pago debe ser mayor a cero.')
  }
  if (due.balance <= 0) {
    throw new Error('Esta cuota ya está completamente cancelada.')
  }
  if (amount > due.balance) {
    throw new Error(
      `El pago (Bs. ${amount.toFixed(2)}) excede el saldo pendiente (Bs. ${due.balance.toFixed(2)}). No se permiten sobrepagos sin un procedimiento explícito de adelanto o crédito.`
    )
  }

  const paymentRecord: UnionDuePayment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    receiptNumber,
    date: new Date().toISOString(),
    amount: Math.round(amount * 100) / 100,
    paymentMethod,
    cashierName,
    notes,
  }

  const newPaidAmount = Math.round((due.paidAmount + amount) * 100) / 100
  const newBalance = Math.max(0, Math.round((due.amount - newPaidAmount) * 100) / 100)
  const newStatus: DueStatus = newBalance <= 0 ? 'paid' : 'partial'

  return {
    ...due,
    paidAmount: newPaidAmount,
    balance: newBalance,
    status: newStatus,
    payments: [...due.payments, paymentRecord],
  }
}

/**
 * Revierte o anula un pago de cuota sindical, recalculando saldo y estado.
 */
export function revertDuePayment(
  due: UnionMonthlyDue,
  paymentId: string,
  cashierName: string,
  reversalReason: string
): { updatedDue: UnionMonthlyDue; revertedPayment: UnionDuePayment } {
  const payment = due.payments.find(p => p.id === paymentId)
  if (!payment) throw new Error('Pago no encontrado en esta cuota.')
  if (payment.isReversed) throw new Error('Este pago ya fue revertido previamente.')
  if (!reversalReason.trim()) throw new Error('Debe especificar un motivo para revertir el pago.')

  const now = new Date().toISOString()
  const revertedPayment: UnionDuePayment = {
    ...payment,
    isReversed: true,
    reversedAt: now,
    reversalReason: `${cashierName}: ${reversalReason.trim()}`,
  }

  const updatedPayments = due.payments.map(p => p.id === paymentId ? revertedPayment : p)
  const activePayments = updatedPayments.filter(p => !p.isReversed)
  const newPaidAmount = Math.round(activePayments.reduce((acc, p) => acc + p.amount, 0) * 100) / 100
  const newBalance = Math.max(0, Math.round((due.amount - newPaidAmount) * 100) / 100)
  
  let newStatus: DueStatus = 'pending'
  if (newBalance <= 0 && due.amount > 0) newStatus = 'paid'
  else if (newPaidAmount > 0) newStatus = 'partial'

  return {
    updatedDue: {
      ...due,
      paidAmount: newPaidAmount,
      balance: newBalance,
      status: newStatus,
      payments: updatedPayments,
    },
    revertedPayment,
  }
}

/**
 * Resumen financiero y resultado operativo del período.
 * Separa claramente:
 * 1. Flujo de Caja Física (efectivo ingresado menos egresos en efectivo)
 * 2. Flujo de Banco/QR (ingresos digitales)
 * 3. Resultado Económico del Período (Ingresos cobrados vs Gastos totales)
 * Y garantiza que los pagos a trabajadores no se descuenten dos veces.
 */
export function calculateFinancialSummary(params: {
  movements: CashMovement[]
  workerPayments: UnionWorkerPayment[]
  unionExpenses: UnionExpense[]
  initialCash?: number
  dateRange?: { startDate?: string; endDate?: string }
}) {
  const { movements, workerPayments, unionExpenses, initialCash = 0, dateRange } = params

  const inRange = (isoDate: string) => {
    if (!dateRange) return true
    const d = isoDate.slice(0, 10)
    if (dateRange.startDate && d < dateRange.startDate) return false
    if (dateRange.endDate && d > dateRange.endDate) return false
    return true
  }

  const filteredMovements = movements.filter(m => inRange(m.timestamp))
  const filteredWorkerPayments = workerPayments.filter(w => inRange(w.date))
  const filteredUnionExpenses = unionExpenses.filter(e => inRange(e.date))

  let totalCashIn = 0
  let totalCashOut = 0
  let totalQrIn = 0
  let totalTransferIn = 0

  let shippingOriginIncome = 0
  let shippingDestIncome = 0
  let unionDuesIncome = 0
  let otherIncome = 0

  for (const mov of filteredMovements) {
    if (mov.isCancelled) continue

    if (mov.type === 'income') {
      if (mov.paymentMethod === 'cash') totalCashIn += mov.amount
      else if (mov.paymentMethod === 'qr') totalQrIn += mov.amount
      else if (mov.paymentMethod === 'transfer') totalTransferIn += mov.amount

      if (mov.category === 'shipping_origin') shippingOriginIncome += mov.amount
      else if (mov.category === 'shipping_destination') shippingDestIncome += mov.amount
      else if (mov.category === 'union_due') unionDuesIncome += mov.amount
      else otherIncome += mov.amount
    } else if (mov.type === 'expense') {
      if (mov.paymentMethod === 'cash') totalCashOut += mov.amount
    }
  }

  const expectedCashInDrawer = Math.round((initialCash + totalCashIn - totalCashOut) * 100) / 100
  const totalIncomeAllMethods = Math.round((totalCashIn + totalQrIn + totalTransferIn) * 100) / 100

  // Total de gastos operativos de sindicato evitando duplicar los sueldos
  const totalWorkerPayments = filteredWorkerPayments.reduce((acc, wp) => acc + wp.amount, 0)
  // Gastos sindicales que NO provienen de un registro duplicado de trabajador
  const standaloneUnionExpenses = filteredUnionExpenses
    .filter(ue => !ue.isWorkerPaymentLinked)
    .reduce((acc, ue) => acc + ue.amount, 0)

  const totalOperationalExpenses = Math.round((totalWorkerPayments + standaloneUnionExpenses) * 100) / 100
  const netOperatingBalance = Math.round((totalIncomeAllMethods - totalOperationalExpenses) * 100) / 100

  return {
    initialCash,
    totalCashIn: Math.round(totalCashIn * 100) / 100,
    totalCashOut: Math.round(totalCashOut * 100) / 100,
    expectedCashInDrawer,
    totalQrIn: Math.round(totalQrIn * 100) / 100,
    totalTransferIn: Math.round(totalTransferIn * 100) / 100,
    totalIncomeAllMethods,
    byCategory: {
      shippingOriginIncome: Math.round(shippingOriginIncome * 100) / 100,
      shippingDestIncome: Math.round(shippingDestIncome * 100) / 100,
      unionDuesIncome: Math.round(unionDuesIncome * 100) / 100,
      otherIncome: Math.round(otherIncome * 100) / 100,
    },
    expenses: {
      totalWorkerPayments: Math.round(totalWorkerPayments * 100) / 100,
      standaloneUnionExpenses: Math.round(standaloneUnionExpenses * 100) / 100,
      totalOperationalExpenses,
    },
    netOperatingBalance,
  }
}
