import type {
  CashMovement,
  CashRegister,
  CashSession,
  CashShiftSummary,
  DenominationDetail,
} from '../../types/cash'

export class CashService {
  private static instance: CashService
  private registers = new Map<string, CashRegister>()
  private sessions = new Map<string, CashSession>()
  private movements = new Map<string, CashMovement[]>() // sessionId -> CashMovement[]
  private activeSessionByRegister = new Map<string, string>() // registerId -> sessionId

  static getInstance(): CashService {
    if (!CashService.instance) {
      CashService.instance = new CashService()
      CashService.instance.bootstrapDefaultRegister()
    }
    return CashService.instance
  }

  private bootstrapDefaultRegister() {
    const defaultReg: CashRegister = {
      id: 'reg-caja-principal',
      restaurantId: 'principal',
      branchId: 'main',
      name: 'Caja Principal 01',
      code: 'POS-01',
      assignedTerminalIds: ['term-01'],
      isActive: true,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    }
    this.registers.set(defaultReg.id, defaultReg)
  }

  registerCashRegister(reg: CashRegister): void {
    this.registers.set(reg.id, reg)
  }

  getCashRegister(id: string): CashRegister | undefined {
    return this.registers.get(id)
  }

  /**
   * Open a new Cash Session / Shift
   */
  async openSession(input: {
    restaurantId: string
    branchId: string
    cashRegisterId: string
    terminalId: string
    openedByUid: string
    openingAmount: number
    notes?: string
    idempotencyKey?: string
  }): Promise<CashSession> {
    const existingSessionId = this.activeSessionByRegister.get(input.cashRegisterId)
    if (existingSessionId) {
      const activeSession = this.sessions.get(existingSessionId)
      if (activeSession && activeSession.status === 'open') {
        throw new Error(`[CashService] La caja "${input.cashRegisterId}" ya tiene una sesión abierta activa (${activeSession.id}).`)
      }
    }

    if (input.openingAmount < 0) {
      throw new Error('[CashService] El monto inicial de apertura no puede ser negativo.')
    }

    const sessionId = input.idempotencyKey || `session-${input.cashRegisterId}-${Date.now()}`
    const newSession: CashSession = {
      id: sessionId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      cashRegisterId: input.cashRegisterId,
      terminalId: input.terminalId,
      openedByUid: input.openedByUid,
      openedAtIso: new Date().toISOString(),
      openingAmount: input.openingAmount,
      status: 'open',
      notes: input.notes,
      schemaVersion: 1,
    }

    this.sessions.set(sessionId, newSession)
    this.activeSessionByRegister.set(input.cashRegisterId, sessionId)
    this.movements.set(sessionId, [])

    // Record opening movement
    await this.addMovement({
      cashSessionId: sessionId,
      type: 'opening',
      amount: input.openingAmount,
      paymentMethod: 'cash',
      category: 'Apertura',
      description: 'Monto inicial de apertura de turno',
      createdByUid: input.openedByUid,
    })

    return newSession
  }

  getActiveSession(cashRegisterId: string): CashSession | undefined {
    const sessionId = this.activeSessionByRegister.get(cashRegisterId)
    if (!sessionId) return undefined
    return this.sessions.get(sessionId)
  }

  /**
   * Add a financial movement to the active session
   */
  async addMovement(input: {
    cashSessionId: string
    type: CashMovement['type']
    amount: number
    paymentMethod: CashMovement['paymentMethod']
    category: string
    description: string
    createdByUid: string
    orderId?: string
    paymentId?: string
  }): Promise<CashMovement> {
    const session = this.sessions.get(input.cashSessionId)
    if (!session || session.status !== 'open') {
      throw new Error(`[CashService] No se puede registrar movimiento en una sesión inexistente o cerrada (${input.cashSessionId}).`)
    }

    if (input.amount < 0) {
      throw new Error('[CashService] El monto del movimiento no puede ser negativo.')
    }

    const movement: CashMovement = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      cashRegisterId: session.cashRegisterId,
      cashSessionId: input.cashSessionId,
      type: input.type,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      category: input.category,
      description: input.description,
      createdByUid: input.createdByUid,
      createdAtIso: new Date().toISOString(),
      orderId: input.orderId,
      paymentId: input.paymentId,
      status: 'active',
    }

    const list = this.movements.get(input.cashSessionId) || []
    list.push(movement)
    this.movements.set(input.cashSessionId, list)

    return movement
  }

  /**
   * Calculate exact expected cash and totals using the safe financial formula:
   * Expected Cash = Opening Amount + Cash Sales + Cash Income + Cash Tips - Cash Expenses - Cash Withdrawals - Cash Refunds
   */
  calculateShiftSummary(sessionId: string, countedCash?: number, tolerance = 1.0): CashShiftSummary {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`[CashService] Sesión no encontrada: ${sessionId}`)
    }

    const moves = this.movements.get(sessionId) || []
    const activeMoves = moves.filter((m) => m.status === 'active')

    let openingAmount = session.openingAmount
    let totalSalesCash = 0
    let totalSalesQr = 0
    let totalSalesCard = 0
    let totalSalesOther = 0

    let totalIncomeCash = 0
    let totalExpenseCash = 0
    let totalWithdrawalsCash = 0
    let totalRefundsCash = 0
    let totalTipsCash = 0

    for (const m of activeMoves) {
      if (m.type === 'sale') {
        if (m.paymentMethod === 'cash') totalSalesCash += m.amount
        else if (m.paymentMethod === 'qr') totalSalesQr += m.amount
        else if (m.paymentMethod === 'card') totalSalesCard += m.amount
        else totalSalesOther += m.amount
      } else if (m.type === 'income' || m.type === 'cashIn') {
        if (m.paymentMethod === 'cash') totalIncomeCash += m.amount
      } else if (m.type === 'expense') {
        if (m.paymentMethod === 'cash') totalExpenseCash += m.amount
      } else if (m.type === 'withdrawal') {
        totalWithdrawalsCash += m.amount
      } else if (m.type === 'refund') {
        if (m.paymentMethod === 'cash') totalRefundsCash += m.amount
      } else if (m.type === 'tip') {
        if (m.paymentMethod === 'cash') totalTipsCash += m.amount
      }
    }

    const totalSalesGrand = totalSalesCash + totalSalesQr + totalSalesCard + totalSalesOther

    const expectedCash =
      openingAmount +
      totalSalesCash +
      totalIncomeCash +
      totalTipsCash -
      totalExpenseCash -
      totalWithdrawalsCash -
      totalRefundsCash

    let difference: number | undefined
    let differenceType: 'exact' | 'sobrante' | 'faltante' | undefined
    let isWithinTolerance: boolean | undefined

    if (countedCash !== undefined) {
      difference = countedCash - expectedCash
      if (Math.abs(difference) <= tolerance) {
        differenceType = 'exact'
        isWithinTolerance = true
      } else if (difference > 0) {
        differenceType = 'sobrante'
        isWithinTolerance = false
      } else {
        differenceType = 'faltante'
        isWithinTolerance = false
      }
    }

    return {
      openingAmount,
      totalSalesCash,
      totalSalesQr,
      totalSalesCard,
      totalSalesOther,
      totalSalesGrand,
      totalIncomeCash,
      totalExpenseCash,
      totalWithdrawalsCash,
      totalRefundsCash,
      totalTipsCash,
      expectedCash,
      countedCash,
      difference,
      differenceType,
      isWithinTolerance,
    }
  }

  /**
   * Close Cash Session with immutable snapshot data
   */
  async closeSession(input: {
    sessionId: string
    closedByUid: string
    countedCash: number
    differenceReason?: string
    isBlindClosure?: boolean
    denominations?: DenominationDetail[]
    approvedByUid?: string
  }): Promise<CashSession> {
    const session = this.sessions.get(input.sessionId)
    if (!session || session.status !== 'open') {
      throw new Error(`[CashService] La sesión (${input.sessionId}) no existe o ya está cerrada.`)
    }

    const summary = this.calculateShiftSummary(input.sessionId, input.countedCash)

    const updatedSession: CashSession = {
      ...session,
      status: 'closed',
      closedByUid: input.closedByUid,
      closedAtIso: new Date().toISOString(),
      expectedCash: summary.expectedCash,
      countedCash: input.countedCash,
      difference: summary.difference,
      differenceReason: input.differenceReason,
      isBlindClosure: input.isBlindClosure,
      denominations: input.denominations,
      approvedByUid: input.approvedByUid,
      snapshotData: {
        summary,
        movementsCount: (this.movements.get(input.sessionId) || []).length,
      },
    }

    this.sessions.set(input.sessionId, updatedSession)
    this.activeSessionByRegister.delete(session.cashRegisterId)

    return updatedSession
  }
}
