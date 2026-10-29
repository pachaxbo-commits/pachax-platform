/**
 * PACHAX Encomiendas & Edición Sindicato - Tipos y Contratos Canónicos de Dominio.
 * Diseñado para operar con alta cohesión y bajo acoplamiento, apto para la web
 * y listo para la futura persistencia local offline (SQLite / Tauri).
 */

export interface DocumentCompanyContext {
  name: string
  legalName?: string
  phone?: string
  address?: string
  city?: string
  taxId?: string
}

export interface ParcelTariffConfig {
  baseFee: number
  freeWeightKg: number
  extraKgRate: number
  homeDeliveryFee: number
}

export type ParcelEdition = 'standard' | 'sindicato'

export type ParcelDocType = 'CI' | 'NIT' | 'PASAPORTE' | 'OTRO' | 'NINGUNO'

export interface ParcelCustomer {
  id: string
  name: string
  docType: ParcelDocType
  docNumber?: string
  phone: string
  address?: string
  city?: string
  notes?: string
}

export interface ParcelBranch {
  id: string
  name: string
  code: string
  city: string
  department: string
  address: string
  phone: string
  isActive: boolean
}

export type ParcelCategory = 'general' | 'documents' | 'electronics' | 'clothing' | 'fragile' | 'perishable' | 'parts' | 'other'

export type ParcelPackaging = 'caja' | 'sobre' | 'bolsa' | 'paquete' | 'fardo' | 'bidon' | 'otro'

export interface ParcelItemDeclaration {
  description: string
  category: ParcelCategory
  quantity: number
  packaging: ParcelPackaging
  weightKg?: number
  declaredValue?: number
  isFragile: boolean
  handlingNotes?: string
}

export type ParcelShipmentStatus =
  | 'received'          // Recibida en agencia de origen
  | 'pending_dispatch'  // Asignada a salida / lista para cargar
  | 'dispatched'        // En manifiesto despachado
  | 'in_transit'        // En viaje en carretera
  | 'received_at_dest'  // Recibida en agencia de destino
  | 'ready_for_pickup'  // Lista para entrega al destinatario
  | 'delivered'         // Entregada satisfactoriamente
  | 'incident'          // Incidencia (daño, extravío, retención)
  | 'returned'          // Devuelta a origen

export type PaymentTiming = 'origin_paid' | 'destination_cod' // Pagado en origen vs Cobro contraentrega en destino

export type PaymentStatus = 'paid' | 'pending' | 'refunded'

export type PaymentMethod = 'cash' | 'qr' | 'transfer' | 'card'

export interface ParcelStatusLog {
  timestamp: string
  status: ParcelShipmentStatus
  location: string
  operatorName: string
  note?: string
}

export interface ParcelDeliveryRecord {
  deliveredAt: string
  deliveredByUid: string
  deliveredByName: string
  receivedByName: string
  receivedByDoc: string
  recipientRelationship: 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro'
  signatureCaptured?: string // SVG/Base64 o indicación de firma física comprobada
  deliveryNotes?: string
}

export interface ParcelShipment {
  id: string
  trackingCode: string
  createdAt: string
  originBranchId: string
  originCity: string
  destinationBranchId: string
  destinationCity: string
  deliveryType: 'agency' | 'home'
  deliveryAddress?: string
  
  // Actores
  sender: ParcelCustomer
  recipient: ParcelCustomer
  
  // Contenido declarado obligatorio
  items: ParcelItemDeclaration[]
  declaredSummary: string
  packageCount: number
  totalWeightKg: number
  declaredValueTotal: number
  isFragile: boolean
  specialInstructions?: string
  prohibitedGoodsNoticeAccepted: boolean
  
  // Finanzas del envío
  shippingFee: number
  discount: number
  finalAmount: number
  paymentTiming: PaymentTiming
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  paidAt?: string
  paidBy?: 'sender' | 'recipient'
  cashierUid: string
  cashierName: string
  
  // Trazabilidad
  status: ParcelShipmentStatus
  dispatchManifestId?: string
  history: ParcelStatusLog[]
  
  // Entrega
  delivery?: ParcelDeliveryRecord
  incidentNotes?: string
  returnReason?: string
}

export interface DispatchManifest {
  id: string
  manifestNumber: string
  createdAt: string
  originBranchId: string
  destinationBranchId: string
  destinationCity: string
  driverOrResponsible: string
  vehiclePlate?: string
  status: 'created' | 'dispatched' | 'received' | 'closed_with_discrepancy'
  parcelIds: string[]
  totalPackages: number
  totalWeightKg: number
  departureTime?: string
  arrivalTime?: string
  arrivalNotes?: string
  receivedByName?: string
}

export type CashMovementType = 'income' | 'expense'

export type CashCategory =
  | 'shipping_origin'
  | 'shipping_destination'
  | 'union_due'
  | 'worker_payment'
  | 'utility_rent'
  | 'utility_services'
  | 'maintenance'
  | 'supplies'
  | 'fuel'
  | 'other_income'
  | 'other_expense'

export interface CashMovement {
  id: string
  shiftId: string
  timestamp: string
  type: CashMovementType
  category: CashCategory
  amount: number
  paymentMethod: PaymentMethod
  concept: string
  referenceId?: string // Vinculado a shipmentId, dueId, workerPaymentId
  operatorUid: string
  operatorName: string
  notes?: string
  isCancelled?: boolean
}

export interface CashShift {
  id: string
  branchId: string
  openedAt: string
  closedAt?: string
  operatorUid: string
  operatorName: string
  initialCash: number
  totalCashIn: number
  totalCashOut: number
  totalQrIn: number
  expectedCash: number
  actualCash?: number
  difference?: number
  status: 'open' | 'closed'
  notes?: string
}

// =========================================================================
// MÓDULOS DE LA EXTENSIÓN SINDICATO (edition: 'sindicato')
// =========================================================================

export type MemberStatus = 'active' | 'inactive' | 'suspended' | 'honorary'

export type MemberCategory = 'propietario_transporte' | 'conductor' | 'socio_general'

export interface UnionMember {
  id: string
  memberNumber: string
  fullName: string
  ci: string
  phone: string
  address?: string
  joinedAt: string
  status: MemberStatus
  category: MemberCategory
  vehiclePlate?: string
  monthlyFee: number
  notes?: string
}

export type DueStatus = 'paid' | 'partial' | 'pending' | 'overdue'

export interface UnionDuePayment {
  id: string
  receiptNumber: string
  date: string
  amount: number
  paymentMethod: PaymentMethod
  cashierName: string
  notes?: string
}

export interface UnionMonthlyDue {
  id: string
  memberId: string
  memberNumber: string
  memberName: string
  period: string // AAAA-MM (ej. 2026-10)
  periodLabel: string // ej. Octubre 2026
  amount: number
  dueDate: string
  status: DueStatus
  paidAmount: number
  balance: number
  payments: UnionDuePayment[]
  notes?: string
}

export interface UnionWorker {
  id: string
  fullName: string
  ci: string
  role: string
  phone: string
  paymentModality: 'monthly' | 'biweekly' | 'per_trip' | 'daily'
  agreedAmount: number
  status: 'active' | 'inactive'
  joinedAt: string
  notes?: string
}

export interface UnionWorkerPayment {
  id: string
  receiptNumber: string
  workerId: string
  workerName: string
  date: string
  periodOrConcept: string
  type: 'salary' | 'advance' | 'bonus' | 'travel_allowance'
  amount: number
  paymentMethod: PaymentMethod
  registeredBy: string
  notes?: string
}

export interface UnionExpense {
  id: string
  receiptNumber: string
  date: string
  category: 'alquiler' | 'energia_electrica' | 'agua' | 'internet_telefonia' | 'mantenimiento' | 'suministros' | 'combustible' | 'tramites_legales' | 'otro'
  description: string
  amount: number
  paymentMethod: PaymentMethod
  registeredBy: string
  invoiceOrVoucherNumber?: string
  isWorkerPaymentLinked?: boolean
}

// =========================================================================
// ESTADO AGREGADO DEL SISTEMA (PARCEL + SINDICATO)
// =========================================================================

export interface ParcelAppState {
  edition: ParcelEdition
  currentBranchId: string
  branches: ParcelBranch[]
  customers: ParcelCustomer[]
  shipments: ParcelShipment[]
  manifests: DispatchManifest[]
  shifts: CashShift[]
  activeShift: CashShift | null
  cashMovements: CashMovement[]
  
  companyInfo?: DocumentCompanyContext
  tariffConfig?: ParcelTariffConfig
  
  // Extensiones exclusivas de Sindicato
  members: UnionMember[]
  dues: UnionMonthlyDue[]
  workers: UnionWorker[]
  workerPayments: UnionWorkerPayment[]
  unionExpenses: UnionExpense[]
}
