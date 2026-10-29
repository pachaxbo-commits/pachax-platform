/**
 * Controlador reactivo local y aislado para PACHAX Encomiendas y Sindicato.
 * Almacena en sessionStorage bajo clave aislada por edición y datasetMode.
 * Cero llamadas de red, cero escrituras a Firebase.
 */

import type {
  ParcelAppState,
  ParcelEdition,
  ParcelShipment,
  ParcelItemDeclaration,
  ParcelCustomer,
  ParcelBranch,
  ParcelDeliveryRecord,
  DocumentCompanyContext,
  ParcelTariffConfig,
  UnionWorker,
  DispatchManifest,
  CashMovement,
  CashCategory,
  CashShift,
  UnionMember,
  UnionMonthlyDue,
  UnionWorkerPayment,
  UnionExpense,
} from '../../modules/parcel/types.ts'
import {
  createFullParcelDataset,
  createEmptyParcelDataset,
} from '../datasets/parcel/parcelDatasets.ts'
import {
  generateTrackingCode,
  generateManifestNumber,
  generateReceiptNumber,
  transitionParcelStatus,
  calculateParcelPricing,
  validateParcelDelivery,
  generateMonthlyDuesForPeriod,
  applyDuePayment,
  revertDuePayment,
} from '../../modules/parcel/domain/parcelEngine.ts'

export type DemoDatasetMode = 'full' | 'empty'

const STORAGE_PREFIX = 'pachax:parcel-studio'

function getStorageKey(edition: ParcelEdition, mode: DemoDatasetMode): string {
  return `${STORAGE_PREFIX}:${edition}:${mode}:v1`
}

export class DemoParcelController {
  private state: ParcelAppState
  private edition: ParcelEdition
  private datasetMode: DemoDatasetMode
  private listeners: Set<(state: ParcelAppState) => void> = new Set()

  constructor(edition: ParcelEdition = 'sindicato', datasetMode: DemoDatasetMode = 'full') {
    this.edition = edition
    this.datasetMode = datasetMode
    this.state = this.loadInitialState()
  }

  private loadInitialState(): ParcelAppState {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const raw = window.sessionStorage.getItem(getStorageKey(this.edition, this.datasetMode))
        if (raw) {
          const parsed = JSON.parse(raw) as ParcelAppState
          if (parsed && Array.isArray(parsed.shipments)) {
            parsed.edition = this.edition
            if (this.edition === 'standard') {
              parsed.members = []
              parsed.dues = []
              parsed.workers = []
              parsed.workerPayments = []
              parsed.unionExpenses = []
            }
            return parsed
          }
        }
      } catch {
        // Fallback al dataset base si falla el almacenamiento
      }
    }

    return this.datasetMode === 'empty'
      ? createEmptyParcelDataset(this.edition)
      : createFullParcelDataset(this.edition)
  }

  private saveState(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(
          getStorageKey(this.edition, this.datasetMode),
          JSON.stringify(this.state)
        )
      } catch {
        // Ignorar excepciones de cuota en navegadores privados
      }
    }
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener({ ...this.state })
    }
  }

  public subscribe(listener: (state: ParcelAppState) => void): () => void {
    this.listeners.add(listener)
    listener({ ...this.state })
    return () => this.listeners.delete(listener)
  }

  public getState(): ParcelAppState {
    return { ...this.state }
  }

  public getEdition(): ParcelEdition {
    return this.edition
  }

  /**
   * Valida que la edición activa sea Sindicato antes de ejecutar operaciones gremiales.
   */
  public ensureSyndicateEdition(): void {
    if (this.edition !== 'sindicato') {
      throw new Error('Operación no permitida: Esta función es exclusiva de la edición Sindicato.')
    }
  }

  public setEdition(newEdition: ParcelEdition): void {
    if (this.edition === newEdition) return
    // 1. Guardar el estado de la edición saliente en su clave propia
    this.saveState()
    // 2. Cambiar de edición y cargar su estado independiente
    this.edition = newEdition
    this.state = this.loadInitialState()
    if (newEdition === 'standard') {
      this.state.edition = 'standard'
      this.state.members = []
      this.state.dues = []
      this.state.workers = []
      this.state.workerPayments = []
      this.state.unionExpenses = []
    }
    // 3. Guardar el nuevo estado aislado y notificar
    this.saveState()
  }

  public resetDataset(mode?: DemoDatasetMode): void {
    if (mode) this.datasetMode = mode
    this.state = this.datasetMode === 'empty'
      ? createEmptyParcelDataset(this.edition)
      : createFullParcelDataset(this.edition)
    this.saveState()
  }

  public switchBranch(branchId: string): void {
    if (!this.state.branches.some(b => b.id === branchId)) return
    this.state = {
      ...this.state,
      currentBranchId: branchId,
    }
    this.saveState()
  }

  // =========================================================================
  // OPERACIONES DE ENCOMIENDAS (PERFIL ESTÁNDAR)
  // =========================================================================

  public registerShipment(params: {
    originBranchId: string
    destinationBranchId: string
    deliveryType: 'agency' | 'home'
    deliveryAddress?: string
    sender: ParcelCustomer
    recipient: ParcelCustomer
    items: ParcelItemDeclaration[]
    shippingFee?: number
    discount?: number
    paymentTiming: 'origin_paid' | 'destination_cod'
    paymentMethod?: 'cash' | 'qr' | 'transfer'
    operatorName?: string
    signatureCaptured?: string
    prohibitedGoodsNoticeAccepted?: boolean
  }): ParcelShipment {
    if (params.prohibitedGoodsNoticeAccepted !== true) {
      throw new Error('Debe aceptarse la declaración jurada sobre sustancias prohibidas y mercancías restringidas.')
    }

    const originBranch = this.state.branches.find(b => b.id === params.originBranchId) || this.state.branches[0]
    const destBranch = this.state.branches.find(b => b.id === params.destinationBranchId) || this.state.branches[1]
    const cashierName = params.operatorName || (this.state.activeShift?.operatorName || 'Operador de Ventanilla')

    const existingCodes = this.state.shipments.map(s => s.trackingCode)
    const trackingCode = generateTrackingCode(existingCodes)

    const totalWeightKg = params.items.reduce(
      (acc, it) => acc + (typeof it.weightKg === 'number' && Number.isFinite(it.weightKg) ? Math.max(0, it.weightKg) : 0),
      0
    )

    const pricing = calculateParcelPricing({
      tariffConfig: this.state.tariffConfig,
      customBaseFee: typeof params.shippingFee === 'number' && Number.isFinite(params.shippingFee) ? params.shippingFee : undefined,
      weightKg: totalWeightKg,
      deliveryType: params.deliveryType,
      discount: typeof params.discount === 'number' && Number.isFinite(params.discount) ? params.discount : 0,
    })

    const packageCount = params.items.reduce((acc, it) => acc + (it.quantity || 1), 0)
    const declaredValueTotal = params.items.reduce((acc, it) => acc + (it.declaredValue || 0), 0)
    const isFragile = params.items.some(it => it.isFragile)
    const declaredSummary = params.items.map(it => `${it.quantity} ${it.packaging}(s) con ${it.description}`).join('; ')

    const now = new Date().toISOString()
    const isPaidNow = params.paymentTiming === 'origin_paid'

    const shipment: ParcelShipment = {
      id: `ship-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackingCode,
      createdAt: now,
      originBranchId: originBranch.id,
      originCity: originBranch.city,
      destinationBranchId: destBranch.id,
      destinationCity: destBranch.city,
      deliveryType: params.deliveryType,
      deliveryAddress: params.deliveryAddress,
      sender: params.sender,
      recipient: params.recipient,
      items: params.items,
      declaredSummary,
      packageCount,
      totalWeightKg: Math.round(totalWeightKg * 10) / 10,
      declaredValueTotal,
      isFragile,
      prohibitedGoodsNoticeAccepted: true,
      shippingFee: pricing.baseFee,
      discount: pricing.discount,
      finalAmount: pricing.finalAmount,
      paymentTiming: params.paymentTiming,
      paymentStatus: isPaidNow ? 'paid' : 'pending',
      paymentMethod: isPaidNow ? (params.paymentMethod || 'cash') : undefined,
      paidAt: isPaidNow ? now : undefined,
      paidBy: isPaidNow ? 'sender' : undefined,
      cashierUid: this.state.activeShift?.operatorUid || 'unassigned-shift',
      cashierName,
      status: 'received',
      history: [
        {
          timestamp: now,
          status: 'received',
          location: originBranch.name,
          operatorName: cashierName,
          note: `Recepción inicial. Tarifa: Bs. ${pricing.finalAmount.toFixed(2)} (${isPaidNow ? 'Pagado en origen' : 'Cobro en destino'}).`,
        },
      ],
    }

    // Registrar cliente si es nuevo
    const updatedCustomers = [...this.state.customers]
    if (!updatedCustomers.some(c => c.name.toLowerCase() === params.sender.name.toLowerCase())) {
      updatedCustomers.push({ ...params.sender, id: `cust-${Date.now()}-1` })
    }
    if (!updatedCustomers.some(c => c.name.toLowerCase() === params.recipient.name.toLowerCase())) {
      updatedCustomers.push({ ...params.recipient, id: `cust-${Date.now()}-2` })
    }

    // Trazabilidad financiera: Toda cobranza debe conservar un movimiento trazable
    const updatedMovements = [...this.state.cashMovements]
    const updatedShift = this.state.activeShift ? { ...this.state.activeShift } : null

    if (isPaidNow) {
      const paymentMethod = params.paymentMethod || 'cash'
      const movement: CashMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shiftId: updatedShift ? updatedShift.id : 'pending_reconciliation',
        timestamp: now,
        type: 'income',
        category: 'shipping_origin',
        amount: pricing.finalAmount,
        paymentMethod,
        concept: updatedShift
          ? `Envío ${trackingCode} a ${destBranch.city}`
          : `[Caja sin turno / Pendiente conciliación] Envío ${trackingCode} a ${destBranch.city}`,
        referenceId: shipment.id,
        operatorUid: updatedShift?.operatorUid || 'unassigned-shift',
        operatorName: cashierName,
        notes: updatedShift ? undefined : 'Cobro registrado sin turno abierto de caja. Requiere conciliación.',
      }
      updatedMovements.push(movement)

      if (updatedShift) {
        if (paymentMethod === 'cash') {
          updatedShift.totalCashIn += pricing.finalAmount
          updatedShift.expectedCash += pricing.finalAmount
        } else if (paymentMethod === 'qr') {
          updatedShift.totalQrIn += pricing.finalAmount
        }
      }
    }

    this.state = {
      ...this.state,
      customers: updatedCustomers,
      shipments: [shipment, ...this.state.shipments],
      cashMovements: updatedMovements,
      activeShift: updatedShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return shipment
  }

  public createDispatchManifest(params: {
    originBranchId: string
    destinationBranchId: string
    driverOrResponsible: string
    vehiclePlate?: string
    parcelIds: string[]
    operatorName?: string
  }): DispatchManifest {
    const originBranch = this.state.branches.find(b => b.id === params.originBranchId) || this.state.branches[0]
    const destBranch = this.state.branches.find(b => b.id === params.destinationBranchId) || this.state.branches[1]
    const operator = params.operatorName || 'Encargado de Almacén'

    const existingManifests = this.state.manifests.map(m => m.manifestNumber)
    const manifestNumber = generateManifestNumber(existingManifests)

    const selectedParcels = this.state.shipments.filter(s => params.parcelIds.includes(s.id))
    const totalPackages = selectedParcels.reduce((acc, s) => acc + s.packageCount, 0)
    const totalWeightKg = selectedParcels.reduce((acc, s) => acc + s.totalWeightKg, 0)
    const now = new Date().toISOString()

    const manifest: DispatchManifest = {
      id: `man-${Date.now()}`,
      manifestNumber,
      createdAt: now,
      originBranchId: originBranch.id,
      destinationBranchId: destBranch.id,
      destinationCity: destBranch.city,
      driverOrResponsible: params.driverOrResponsible,
      vehiclePlate: params.vehiclePlate,
      status: 'dispatched',
      parcelIds: params.parcelIds,
      totalPackages,
      totalWeightKg: Math.round(totalWeightKg * 10) / 10,
      departureTime: now,
    }

    // Actualizar estado de las encomiendas a 'dispatched'
    const updatedShipments = this.state.shipments.map(s => {
      if (params.parcelIds.includes(s.id)) {
        return transitionParcelStatus(
          { ...s, dispatchManifestId: manifest.id },
          'dispatched',
          operator,
          originBranch.name,
          `Despachado en Manifiesto ${manifestNumber} (Conductor: ${params.driverOrResponsible}).`
        )
      }
      return s
    })

    this.state = {
      ...this.state,
      manifests: [manifest, ...this.state.manifests],
      shipments: updatedShipments,
    }

    this.saveState()
    return manifest
  }

  public receiveManifestAtDestination(manifestId: string, operatorName?: string): void {
    const manifest = this.state.manifests.find(m => m.id === manifestId)
    if (!manifest) throw new Error('Manifiesto no encontrado.')

    const destBranch = this.state.branches.find(b => b.id === manifest.destinationBranchId) || this.state.branches[0]
    const operator = operatorName || 'Operador de Recepción Destino'
    const now = new Date().toISOString()

    const updatedManifests = this.state.manifests.map(m => {
      if (m.id === manifestId) {
        return {
          ...m,
          status: 'received' as const,
          arrivalTime: now,
          receivedByName: operator,
        }
      }
      return m
    })

    const updatedShipments = this.state.shipments.map(s => {
      if (manifest.parcelIds.includes(s.id)) {
        const received = transitionParcelStatus(
          s,
          'received_at_dest',
          operator,
          destBranch.name,
          `Arribo de transporte. Manifiesto ${manifest.manifestNumber} recepcionado.`
        )
        return transitionParcelStatus(
          received,
          'ready_for_pickup',
          operator,
          destBranch.name,
          'Disponible en estantería para retiro de cliente.'
        )
      }
      return s
    })

    this.state = {
      ...this.state,
      manifests: updatedManifests,
      shipments: updatedShipments,
    }
    this.saveState()
  }

  public deliverShipment(params: {
    shipmentId: string
    receiverName: string
    receiverDoc: string
    recipientRelationship: 'titular' | 'familiar' | 'apoderado' | 'empleado' | 'otro'
    deliveryNotes?: string
    authorizedChangeReason?: string
    isPayingNow?: boolean
    paymentMethod?: 'cash' | 'qr' | 'transfer'
    operatorName?: string
    signatureCaptured?: string
  }): ParcelShipment {
    const shipment = this.state.shipments.find(s => s.id === params.shipmentId)
    if (!shipment) throw new Error('Encomienda no encontrada.')

    const validation = validateParcelDelivery(
      shipment,
      params.receiverName,
      params.receiverDoc,
      params.recipientRelationship,
      params.isPayingNow,
      params.authorizedChangeReason
    )
    if (!validation.canDeliver) {
      throw new Error(validation.error || 'No se puede entregar la encomienda.')
    }

    const now = new Date().toISOString()
    const operator = params.operatorName || (this.state.activeShift?.operatorName || 'Ventanilla de Entrega')
    const currentBranch = this.state.branches.find(b => b.id === shipment.destinationBranchId) || this.state.branches[0]

    const deliveryRecord: ParcelDeliveryRecord = {
      deliveredAt: now,
      deliveredByUid: this.state.activeShift?.operatorUid || 'unassigned-shift',
      deliveredByName: operator,
      receivedByName: params.receiverName.trim(),
      receivedByDoc: params.receiverDoc.trim(),
      recipientRelationship: params.recipientRelationship,
      authorizedChangeReason: params.authorizedChangeReason,
      signatureCaptured: params.signatureCaptured,
      deliveryNotes: params.deliveryNotes,
    }

    // Transición de estado a 'delivered'
    let updatedShipment = transitionParcelStatus(
      shipment,
      'delivered',
      operator,
      currentBranch.name,
      `Entregado a ${params.receiverName} (${params.receiverDoc}). Relación: ${params.recipientRelationship}.`
    )

    // Si se realizó cobro contraentrega (COD)
    const updatedMovements = [...this.state.cashMovements]
    const updatedShift = this.state.activeShift ? { ...this.state.activeShift } : null

    if (shipment.paymentTiming === 'destination_cod' && shipment.paymentStatus === 'pending') {
      const paymentMethod = params.paymentMethod || 'cash'
      updatedShipment = {
        ...updatedShipment,
        paymentStatus: 'paid',
        paymentMethod,
        paidAt: now,
        paidBy: 'recipient',
      }

      const mov: CashMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shiftId: updatedShift ? updatedShift.id : 'pending_reconciliation',
        timestamp: now,
        type: 'income',
        category: 'shipping_destination',
        amount: shipment.finalAmount,
        paymentMethod,
        concept: updatedShift
          ? `Cobro contraentrega (COD) guía ${shipment.trackingCode}`
          : `[Caja sin turno / Pendiente conciliación] Cobro contraentrega (COD) guía ${shipment.trackingCode}`,
        referenceId: shipment.id,
        operatorUid: updatedShift?.operatorUid || 'unassigned-shift',
        operatorName: operator,
        notes: updatedShift ? undefined : 'Cobro COD sin turno abierto de caja. Requiere conciliación.',
      }
      updatedMovements.push(mov)

      if (updatedShift) {
        if (paymentMethod === 'cash') {
          updatedShift.totalCashIn += shipment.finalAmount
          updatedShift.expectedCash += shipment.finalAmount
        } else if (paymentMethod === 'qr') {
          updatedShift.totalQrIn += shipment.finalAmount
        }
      }
    }

    updatedShipment.delivery = deliveryRecord

    this.state = {
      ...this.state,
      shipments: this.state.shipments.map(s => s.id === shipment.id ? updatedShipment : s),
      cashMovements: updatedMovements,
      activeShift: updatedShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return updatedShipment
  }

  // =========================================================================
  // CAJA Y ARQUEOS
  // =========================================================================

  public openCashShift(initialCash: number, operatorName = 'Juan José Rocha'): CashShift {
    const safeInitial = typeof initialCash === 'number' && Number.isFinite(initialCash) ? Math.max(0, initialCash) : 0
    const shift: CashShift = {
      id: `shift-${Date.now()}`,
      branchId: this.state.currentBranchId,
      openedAt: new Date().toISOString(),
      operatorUid: 'op-01',
      operatorName,
      initialCash: safeInitial,
      totalCashIn: 0,
      totalCashOut: 0,
      totalQrIn: 0,
      expectedCash: safeInitial,
      status: 'open',
    }

    this.state = {
      ...this.state,
      activeShift: shift,
      shifts: [shift, ...this.state.shifts],
    }
    this.saveState()
    return shift
  }

  public closeCashShift(actualCash: number, notes?: string): CashShift {
    if (!this.state.activeShift) throw new Error('No hay turno abierto.')

    const expected = this.state.activeShift.expectedCash
    const diff = Math.round((actualCash - expected) * 100) / 100

    const closed: CashShift = {
      ...this.state.activeShift,
      closedAt: new Date().toISOString(),
      actualCash,
      difference: diff,
      status: 'closed',
      notes,
    }

    this.state = {
      ...this.state,
      activeShift: null,
      shifts: this.state.shifts.map(s => s.id === closed.id ? closed : s),
    }
    this.saveState()
    return closed
  }

  public reconcilePendingMovements(params: {
    movementIds: string[]
    supervisorName: string
    targetShiftId?: string
    notes?: string
  }): { reconciledCount: number; assignedShiftId?: string } {
    if (!params.movementIds || params.movementIds.length === 0) {
      throw new Error('Debe seleccionar al menos un movimiento para conciliar.')
    }
    if (!params.supervisorName || !params.supervisorName.trim()) {
      throw new Error('Debe especificar el nombre del responsable de la conciliación.')
    }

    const targetShift = params.targetShiftId
      ? this.state.shifts.find(s => s.id === params.targetShiftId)
      : this.state.activeShift

    if (!targetShift) {
      throw new Error('No se pueden conciliar movimientos porque no hay un turno de caja abierto para incorporar los fondos.')
    }

    if (targetShift.status !== 'open') {
      throw new Error('Operación rechazada: No se pueden asignar movimientos pendientes a un turno de caja que ya está cerrado.')
    }

    const now = new Date().toISOString()
    const targetShiftId = targetShift ? targetShift.id : undefined
    const updatedShift = targetShift && this.state.activeShift?.id === targetShift.id
      ? { ...this.state.activeShift }
      : null

    let reconciledCount = 0

    const updatedMovements = this.state.cashMovements.map(m => {
      if (params.movementIds.includes(m.id)) {
        if (m.shiftId !== 'pending_reconciliation') {
          return m // Ya no está pendiente
        }

        reconciledCount++

        if (updatedShift) {
          if (m.type === 'income') {
            if (m.paymentMethod === 'cash') {
              updatedShift.totalCashIn += m.amount
              updatedShift.expectedCash += m.amount
            } else if (m.paymentMethod === 'qr') {
              updatedShift.totalQrIn += m.amount
            }
          } else if (m.type === 'expense') {
            if (m.paymentMethod === 'cash') {
              updatedShift.totalCashOut += m.amount
              updatedShift.expectedCash -= m.amount
            }
          } else if (m.type === 'reversal') {
            // Caso 2: Diferenciar anulación documental de devolución efectiva.
            // Una anulación documental (documentary_void) o sin salida de dinero físico
            // NUNCA debe convertirse en egreso físico ni descontar la caja.
            if (m.reversalType === 'refund') {
              if (m.isPhysicalCashOut || (m.paymentMethod === 'cash' && m.isPhysicalCashOut !== false)) {
                updatedShift.totalCashOut += m.amount
                updatedShift.expectedCash -= m.amount
              }
            } else {
              // documentary_void: corrección documental sin salida física de gaveta
            }
          }
        }

        const auditNote = `[Conciliado el ${now.slice(0, 10)} por ${params.supervisorName.trim()}${targetShiftId ? ` en turno ${targetShiftId}` : ''}${params.notes ? `: ${params.notes.trim()}` : ''}]`

        return {
          ...m,
          shiftId: targetShiftId || 'reconciled_audit',
          reconciledShiftId: targetShiftId,
          reconciledAt: now,
          reconciledBy: params.supervisorName.trim(),
          notes: m.notes ? `${m.notes} · ${auditNote}` : auditNote,
        }
      }
      return m
    })

    this.state = {
      ...this.state,
      cashMovements: updatedMovements,
      activeShift: updatedShift || this.state.activeShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return { reconciledCount, assignedShiftId: targetShiftId }
  }

  // =========================================================================
  // MÓDULOS DE LA EXTENSIÓN SINDICATO
  // =========================================================================

  public createMember(member: Omit<UnionMember, 'id' | 'memberNumber'>): UnionMember {
    this.ensureSyndicateEdition()
    const existingCount = this.state.members.length + 1
    const memberNumber = `SOC-${String(existingCount).padStart(3, '0')}`

    const newMember: UnionMember = {
      ...member,
      id: `mem-${Date.now()}`,
      memberNumber,
    }

    this.state = {
      ...this.state,
      members: [newMember, ...this.state.members],
    }
    this.saveState()
    return newMember
  }

  public generateDuesPeriod(period: string, periodLabel: string, dueDate: string, standardFee = 150) {
    this.ensureSyndicateEdition()
    const { createdDues, skippedCount } = generateMonthlyDuesForPeriod(
      this.state.members,
      this.state.dues,
      period,
      periodLabel,
      dueDate,
      standardFee
    )

    this.state = {
      ...this.state,
      dues: [...createdDues, ...this.state.dues],
    }
    this.saveState()
    return { createdCount: createdDues.length, skippedCount }
  }

  public payDue(params: {
    dueId: string
    amount: number
    paymentMethod: 'cash' | 'qr' | 'transfer'
    notes?: string
    cashierName?: string
  }): UnionMonthlyDue {
    this.ensureSyndicateEdition()
    const due = this.state.dues.find(d => d.id === params.dueId)
    if (!due) throw new Error('Cuota no encontrada.')

    const cashier = params.cashierName || (this.state.activeShift?.operatorName || 'Secretaría de Hacienda')
    const receiptNumber = generateReceiptNumber(
      this.state.dues.flatMap(d => d.payments.map(p => p.receiptNumber)),
      'CUOTA'
    )

    const updatedDue = applyDuePayment(
      due,
      params.amount,
      params.paymentMethod,
      cashier,
      receiptNumber,
      params.notes
    )

    // Trazabilidad financiera: registrar siempre el movimiento
    const updatedMovements = [...this.state.cashMovements]
    const updatedShift = this.state.activeShift ? { ...this.state.activeShift } : null

    const mov: CashMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shiftId: updatedShift ? updatedShift.id : 'pending_reconciliation',
      timestamp: new Date().toISOString(),
      type: 'income',
      category: 'union_due',
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      concept: updatedShift
        ? `Cuota ${due.periodLabel} - ${due.memberName} (${due.memberNumber})`
        : `[Caja sin turno / Pendiente conciliación] Cuota ${due.periodLabel} - ${due.memberName} (${due.memberNumber})`,
      referenceId: due.id,
      operatorUid: updatedShift?.operatorUid || 'unassigned-shift',
      operatorName: cashier,
      notes: updatedShift ? undefined : 'Cobro de cuota registrado sin turno abierto de caja. Requiere conciliación.',
    }
    updatedMovements.push(mov)

    if (updatedShift) {
      if (params.paymentMethod === 'cash') {
        updatedShift.totalCashIn += params.amount
        updatedShift.expectedCash += params.amount
      } else if (params.paymentMethod === 'qr') {
        updatedShift.totalQrIn += params.amount
      }
    }

    this.state = {
      ...this.state,
      dues: this.state.dues.map(d => d.id === due.id ? updatedDue : d),
      cashMovements: updatedMovements,
      activeShift: updatedShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return updatedDue
  }

  public revertDuePayment(
    dueIdOrParams: string | {
      dueId: string
      paymentId: string
      reason: string
      cashierName?: string
      reversalType?: 'documentary_void' | 'refund'
      refundMethod?: 'none' | 'cash' | 'transfer'
    },
    paymentIdParam?: string,
    reasonParam?: string,
    cashierNameParam?: string,
    reversalTypeParam: 'documentary_void' | 'refund' = 'documentary_void',
    refundMethodParam: 'none' | 'cash' | 'transfer' = 'none'
  ): UnionMonthlyDue {
    this.ensureSyndicateEdition()

    const dueId = typeof dueIdOrParams === 'object' ? dueIdOrParams.dueId : dueIdOrParams
    const paymentId = typeof dueIdOrParams === 'object' ? dueIdOrParams.paymentId : paymentIdParam!
    const reason = typeof dueIdOrParams === 'object' ? dueIdOrParams.reason : reasonParam!
    const cashierName = typeof dueIdOrParams === 'object' ? dueIdOrParams.cashierName : cashierNameParam
    const reversalType = typeof dueIdOrParams === 'object'
      ? (dueIdOrParams.reversalType || 'documentary_void')
      : reversalTypeParam
    const refundMethod = typeof dueIdOrParams === 'object'
      ? (dueIdOrParams.refundMethod || 'none')
      : refundMethodParam

    const due = this.state.dues.find(d => d.id === dueId)
    if (!due) throw new Error('Cuota no encontrada.')

    const cashier = cashierName || (this.state.activeShift?.operatorName || 'Secretaría de Hacienda')
    const { updatedDue, revertedPayment } = revertDuePayment(
      due,
      paymentId,
      cashier,
      reason,
      reversalType,
      refundMethod
    )

    const updatedMovements = [...this.state.cashMovements]
    const updatedShift = this.state.activeShift ? { ...this.state.activeShift } : null

    // Caso 1: Registrar el medio real de devolución y no descontar incorrectamente la caja física
    const effectivePaymentMethod = reversalType === 'refund'
      ? (refundMethod && refundMethod !== 'none' ? refundMethod : revertedPayment.paymentMethod)
      : revertedPayment.paymentMethod

    const isPhysicalCashOut = reversalType === 'refund' && effectivePaymentMethod === 'cash'

    const mov: CashMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shiftId: updatedShift ? updatedShift.id : 'pending_reconciliation',
      timestamp: new Date().toISOString(),
      type: 'reversal',
      category: 'reversal',
      amount: revertedPayment.amount,
      paymentMethod: effectivePaymentMethod,
      concept: reversalType === 'refund'
        ? `Devolución efectiva (${effectivePaymentMethod.toUpperCase()}) de aporte recibo ${revertedPayment.receiptNumber} (${due.memberName}). Motivo: ${reason}`
        : `Anulación de registro recibo ${revertedPayment.receiptNumber} (${due.memberName}). Motivo: ${reason}`,
      referenceId: due.id,
      operatorUid: updatedShift?.operatorUid || 'unassigned-shift',
      operatorName: cashier,
      reversalType,
      isPhysicalCashOut,
    }
    updatedMovements.push(mov)

    // Ajustes en el turno de caja activo:
    if (updatedShift) {
      if (isPhysicalCashOut) {
        // Devolución física real: dinero en efectivo sale de la gaveta
        updatedShift.totalCashOut += revertedPayment.amount
        updatedShift.expectedCash -= revertedPayment.amount
      } else if (reversalType === 'documentary_void' && revertedPayment.paymentMethod === 'cash') {
        // Anulación documental: corrección de un ingreso que no debe computarse como efectivo en gaveta
        updatedShift.totalCashIn = Math.max(0, updatedShift.totalCashIn - revertedPayment.amount)
        updatedShift.expectedCash = Math.max(0, updatedShift.expectedCash - revertedPayment.amount)
      } else if (reversalType === 'documentary_void' && revertedPayment.paymentMethod === 'qr') {
        updatedShift.totalQrIn = Math.max(0, updatedShift.totalQrIn - revertedPayment.amount)
      }
    }

    this.state = {
      ...this.state,
      dues: this.state.dues.map(d => d.id === due.id ? updatedDue : d),
      cashMovements: updatedMovements,
      activeShift: updatedShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return updatedDue
  }

  public registerWorkerPayment(params: {
    workerId: string
    periodOrConcept: string
    type: 'salary' | 'advance' | 'bonus' | 'travel_allowance'
    amount: number
    paymentMethod: 'cash' | 'transfer'
    notes?: string
    registeredBy?: string
  }): UnionWorkerPayment {
    this.ensureSyndicateEdition()
    const worker = this.state.workers.find(w => w.id === params.workerId)
    if (!worker) throw new Error('Trabajador no encontrado.')
    if (params.amount <= 0) throw new Error('El importe debe ser mayor a cero.')

    const existingReceipts = this.state.workerPayments.map(p => p.receiptNumber)
    const receiptNumber = generateReceiptNumber(existingReceipts, 'PAGO-TRAB')
    const now = new Date().toISOString()
    const operator = params.registeredBy || 'Secretaría de Hacienda'

    const payment: UnionWorkerPayment = {
      id: `wpay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      receiptNumber,
      workerId: worker.id,
      workerName: worker.fullName,
      workerRole: worker.role,
      date: now,
      periodOrConcept: params.periodOrConcept,
      type: params.type,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      registeredBy: operator,
      notes: params.notes,
    }

    // Trazabilidad financiera: registrar siempre el egreso
    const updatedMovements = [...this.state.cashMovements]
    const updatedShift = this.state.activeShift ? { ...this.state.activeShift } : null

    const mov: CashMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shiftId: updatedShift ? updatedShift.id : 'pending_reconciliation',
      timestamp: now,
      type: 'expense',
      category: 'worker_payment',
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      concept: updatedShift
        ? `${params.periodOrConcept} - ${worker.fullName}`
        : `[Caja sin turno / Pendiente conciliación] ${params.periodOrConcept} - ${worker.fullName}`,
      referenceId: payment.id,
      operatorUid: updatedShift?.operatorUid || 'unassigned-shift',
      operatorName: operator,
      notes: updatedShift ? undefined : 'Egreso a trabajador registrado sin turno abierto de caja. Requiere conciliación.',
    }
    updatedMovements.push(mov)

    if (updatedShift && params.paymentMethod === 'cash') {
      updatedShift.totalCashOut += params.amount
      updatedShift.expectedCash -= params.amount
    }

    this.state = {
      ...this.state,
      workerPayments: [payment, ...this.state.workerPayments],
      cashMovements: updatedMovements,
      activeShift: updatedShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return payment
  }

  public registerUnionExpense(params: {
    category: UnionExpense['category']
    description: string
    amount: number
    paymentMethod: 'cash' | 'transfer' | 'qr'
    invoiceOrVoucherNumber?: string
    registeredBy?: string
  }): UnionExpense {
    this.ensureSyndicateEdition()
    if (params.amount <= 0) throw new Error('El importe del gasto debe ser mayor a cero.')

    const existingReceipts = this.state.unionExpenses.map(e => e.receiptNumber)
    const receiptNumber = generateReceiptNumber(existingReceipts, 'GASTO')
    const now = new Date().toISOString()
    const operator = params.registeredBy || 'Secretaría de Hacienda'

    const expense: UnionExpense = {
      id: `uexp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      receiptNumber,
      date: now,
      category: params.category,
      description: params.description,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      registeredBy: operator,
      invoiceOrVoucherNumber: params.invoiceOrVoucherNumber,
      isWorkerPaymentLinked: false,
    }

    // Trazabilidad financiera: registrar siempre el egreso
    const updatedMovements = [...this.state.cashMovements]
    const updatedShift = this.state.activeShift ? { ...this.state.activeShift } : null

    const mov: CashMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shiftId: updatedShift ? updatedShift.id : 'pending_reconciliation',
      timestamp: now,
      type: 'expense',
      category: params.category as CashCategory,
      expenseCategory: params.category,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      concept: updatedShift
        ? `${params.description}`
        : `[Caja sin turno / Pendiente conciliación] ${params.description}`,
      referenceId: expense.id,
      operatorUid: updatedShift?.operatorUid || 'unassigned-shift',
      operatorName: operator,
      notes: updatedShift ? undefined : 'Gasto sindical registrado sin turno abierto de caja. Requiere conciliación.',
    }
    updatedMovements.push(mov)

    if (updatedShift && params.paymentMethod === 'cash') {
      updatedShift.totalCashOut += params.amount
      updatedShift.expectedCash -= params.amount
    }

    this.state = {
      ...this.state,
      unionExpenses: [expense, ...this.state.unionExpenses],
      cashMovements: updatedMovements,
      activeShift: updatedShift,
      shifts: updatedShift
        ? this.state.shifts.map(s => s.id === updatedShift.id ? updatedShift : s)
        : this.state.shifts,
    }

    this.saveState()
    return expense
  }
  public addBranch(params: Omit<ParcelBranch, 'id'>): ParcelBranch {
    const newBranch: ParcelBranch = {
      ...params,
      id: `branch-${Date.now()}`,
    }
    this.state = {
      ...this.state,
      branches: [...this.state.branches, newBranch],
    }
    this.saveState()
    return newBranch
  }

  public toggleBranchActive(branchId: string): void {
    this.state = {
      ...this.state,
      branches: this.state.branches.map(b => (b.id === branchId ? { ...b, isActive: !b.isActive } : b)),
    }
    this.saveState()
  }

  public updateCompanyInfo(info: Partial<DocumentCompanyContext>): void {
    const current = this.state.companyInfo || {
      name: 'TRANS-BOLIVIA ENCOMIENDAS & LOGÍSTICA',
      legalName: 'Sindicato Mixto de Transporte & Encomiendas Interdepartamental',
      taxId: '1029384021',
      phone: '4-4251234 / 70712345',
      address: 'Av. Ayacucho #452 (Frente a Terminal de Buses)',
      city: 'Cochabamba - Bolivia',
    }
    this.state = {
      ...this.state,
      companyInfo: { ...current, ...info },
    }
    this.saveState()
  }

  public updateTariffConfig(config: Partial<ParcelTariffConfig>): void {
    const current = this.state.tariffConfig || {
      baseFee: 15,
      freeWeightKg: 3,
      extraKgRate: 2,
      homeDeliveryFee: 10,
    }
    this.state = {
      ...this.state,
      tariffConfig: { ...current, ...config },
    }
    this.saveState()
  }

  public addWorker(params: Omit<UnionWorker, 'id'>): UnionWorker {
    this.ensureSyndicateEdition()
    const newWorker: UnionWorker = {
      ...params,
      id: `wrk-${Date.now()}`,
    }
    this.state = {
      ...this.state,
      workers: [...this.state.workers, newWorker],
    }
    this.saveState()
    return newWorker
  }
}
