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
  UnionMember,
  UnionWorkerPayment,
  UnionExpense,
} from '../types.ts'

export function generateTrackingCode(existingCodes: string[], year = 2026): string {
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

export function generateManifestNumber(existingManifests: string[], year = 2026): string {
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

export function generateReceiptNumber(existingReceipts: string[], prefix = 'REC', year = 2026): string {
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

/**
 * Cálculo del cobro de encomienda garantizando redondeos precisos y descuentos no abusivos.
 */
export function calculateParcelPricing(
  baseFee: number,
  discount = 0,
  weightKg = 0,
  extraKgRate = 0
): { baseFee: number; weightSurcharge: number; discount: number; finalAmount: number } {
  const safeBase = Math.max(0, Number(baseFee) || 0)
  const safeWeight = Math.max(0, Number(weightKg) || 0)
  const safeExtraRate = Math.max(0, Number(extraKgRate) || 0)

  // Primeros 3 kg incluidos en baseFee; exceso se cobra según extraKgRate
  const chargeableExcessWeight = Math.max(0, safeWeight - 3)
  const weightSurcharge = Math.round(chargeableExcessWeight * safeExtraRate * 100) / 100

  const subtotal = safeBase + weightSurcharge
  const safeDiscount = Math.min(subtotal, Math.max(0, Number(discount) || 0))
  const finalAmount = Math.round((subtotal - safeDiscount) * 100) / 100

  return {
    baseFee: safeBase,
    weightSurcharge,
    discount: safeDiscount,
    finalAmount,
  }
}

/**
 * Valida la operación de entrega.
 * Si la encomienda tenía cobro contraentrega (destination_cod) y sigue 'pending',
 * la entrega no se puede completar sin antes registrar el cobro correspondiente.
 */
export function validateParcelDelivery(
  shipment: ParcelShipment,
  receiverName: string,
  receiverDoc: string,
  isPayingNow = false
): { canDeliver: boolean; error?: string } {
  if (shipment.status === 'delivered') {
    return { canDeliver: false, error: 'La encomienda ya fue entregada anteriormente.' }
  }

  if (shipment.paymentTiming === 'destination_cod' && shipment.paymentStatus === 'pending' && !isPayingNow) {
    return {
      canDeliver: false,
      error: `Cobro pendiente obligatorio: Esta encomienda tiene pago contraentrega de Bs. ${shipment.finalAmount.toFixed(2)}. Debe registrarse el cobro para poder entregar.`,
    }
  }

  if (!receiverName.trim()) {
    return { canDeliver: false, error: 'Debe ingresar el nombre de la persona que recibe la encomienda.' }
  }

  if (!receiverDoc.trim()) {
    return { canDeliver: false, error: 'Debe ingresar el número de documento (CI/Doc) de quien recibe.' }
  }

  return { canDeliver: true }
}

/**
 * Generador de períodos de mensualidades sindicales sin duplicados.
 */
export function generateMonthlyDuesForPeriod(
  members: UnionMember[],
  existingDues: UnionMonthlyDue[],
  period: string, // '2026-10'
  periodLabel: string, // 'Octubre 2026'
  dueDate: string // '2026-10-31'
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

    const amount = member.monthlyFee > 0 ? member.monthlyFee : 150 // Tarifa estándar sugerida Bs 150
    createdDues.push({
      id: `due-${member.id}-${period}`,
      memberId: member.id,
      memberNumber: member.memberNumber,
      memberName: member.fullName,
      period,
      periodLabel,
      amount,
      dueDate,
      status: 'pending',
      paidAmount: 0,
      balance: amount,
      payments: [],
    })
  }

  return { createdDues, skippedCount }
}

/**
 * Registra un pago a una mensualidad (completo o parcial).
 */
export function applyDuePayment(
  due: UnionMonthlyDue,
  amount: number,
  paymentMethod: 'cash' | 'qr' | 'transfer',
  cashierName: string,
  receiptNumber: string,
  notes?: string
): UnionMonthlyDue {
  if (amount <= 0) throw new Error('El importe de pago debe ser mayor a cero.')
  if (due.balance <= 0) throw new Error('Esta cuota ya está completamente cancelada.')

  const paymentRecord = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    receiptNumber,
    date: new Date().toISOString(),
    amount,
    paymentMethod,
    cashierName,
    notes,
  }

  const newPaidAmount = Math.round((due.paidAmount + amount) * 100) / 100
  const newBalance = Math.max(0, Math.round((due.amount - newPaidAmount) * 100) / 100)
  const newStatus = newBalance <= 0 ? 'paid' : 'partial'

  return {
    ...due,
    paidAmount: newPaidAmount,
    balance: newBalance,
    status: newStatus,
    payments: [...due.payments, paymentRecord],
  }
}

/**
 * Balance financiero integral de la operación.
 * Separa claramente:
 * 1. Flujo de Caja Física (efectivo ingresado menos egresos en efectivo)
 * 2. Flujo de Banco/QR (ingresos digitales)
 * 3. Resultado Económico del Período (Ingresos reconocidos vs Gastos totales)
 * Y evita duplicar pagos a trabajadores si ya se reflejaron como gastos.
 */
export function calculateFinancialSummary(params: {
  movements: CashMovement[]
  workerPayments: UnionWorkerPayment[]
  unionExpenses: UnionExpense[]
  initialCash?: number
}) {
  const { movements, workerPayments, unionExpenses, initialCash = 0 } = params

  let totalCashIn = 0
  let totalCashOut = 0
  let totalQrIn = 0
  let totalTransferIn = 0

  let shippingOriginIncome = 0
  let shippingDestIncome = 0
  let unionDuesIncome = 0
  let otherIncome = 0

  for (const mov of movements) {
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
  const totalWorkerPayments = workerPayments.reduce((acc, wp) => acc + wp.amount, 0)
  // Gastos sindicales que NO provienen de un registro duplicado de trabajador
  const standaloneUnionExpenses = unionExpenses
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
