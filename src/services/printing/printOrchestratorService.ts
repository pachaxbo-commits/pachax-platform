import { PrintEngineService } from './printEngineService'
import { PrintMigrationService } from './printMigrationService'
import type { PrintableItemPayload, PrintJob, PrintJobPayload } from '../../types/printing'

export interface OrderItemInput {
  id: string
  name: string
  price: number
  quantity: number
  stationId?: string
  modifiersText?: string[]
  note?: string
  commandedInBatch?: number
}

export interface OrderInput {
  id: string
  sequenceNumber?: number
  displayNumber?: string
  fulfillmentType?: string
  tableInfo?: string
  customerName?: string
  customerPhone?: string
  deliveryAddress?: string
  subtotal: number
  discountTotal?: number
  taxTotal?: number
  deliveryFee?: number
  grandTotal: number
  paymentMethod?: string
  cashReceived?: number
  changeAmount?: number
  items: OrderItemInput[]
}

export class PrintOrchestratorService {
  private static instance: PrintOrchestratorService
  private engine = PrintEngineService.getInstance()
  private migration = PrintMigrationService.getInstance()

  static getInstance(): PrintOrchestratorService {
    if (!PrintOrchestratorService.instance) {
      PrintOrchestratorService.instance = new PrintOrchestratorService()
    }
    return PrintOrchestratorService.instance
  }

  /**
   * Dispatch Kitchen Command Tickets per Station for a specific Batch Number
   */
  async printKitchenOrderBatch(order: OrderInput, batchNumber: number, _operatorUid: string): Promise<PrintJob[]> {
    if (!this.migration.isNewEngineEnabled()) {
      return [] // Legacy mode fallback
    }

    // Filter items belonging to this batch
    const batchItems = order.items.filter((item) => (item.commandedInBatch || 1) === batchNumber)
    if (batchItems.length === 0) return []

    // Group items by stationId
    const itemsByStation = new Map<string, OrderItemInput[]>()
    for (const item of batchItems) {
      const station = item.stationId || 'default-kitchen'
      if (!itemsByStation.has(station)) {
        itemsByStation.set(station, [])
      }
      itemsByStation.get(station)!.push(item)
    }

    const jobs: PrintJob[] = []

    for (const [stationId, items] of itemsByStation.entries()) {
      const printableItems: PrintableItemPayload[] = items.map((i) => ({
        name: i.name,
        basePrice: i.price,
        quantity: i.quantity,
        modifiersText: i.modifiersText,
        note: i.note,
        lineTotal: i.price * i.quantity,
      }))

      const payload: PrintJobPayload = {
        payloadSchemaVersion: 1,
        templateVersion: 'v1.0-kitchen',
        restaurantName: 'PACHAX Flow',
        branchName: 'Sucursal Central',
        orderId: order.id,
        sequenceNumber: order.sequenceNumber || 1,
        displayNumber: order.displayNumber || `#${order.id.slice(0, 4)}`,
        fulfillmentType: order.fulfillmentType || 'table',
        tableInfo: order.tableInfo || 'Mesa',
        customerName: order.customerName,
        items: printableItems,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal || 0,
        taxTotal: order.taxTotal || 0,
        deliveryFee: order.deliveryFee || 0,
        grandTotal: order.grandTotal,
        isCopy: false,
        copies: 1,
        createdIso: new Date().toISOString(),
      }

      try {
        const job = await this.engine.submitPrintRequest({
          targetType: 'kitchen_ticket',
          stationId,
          orderId: order.id,
          idempotencyKey: `ord-${order.id}-batch-${batchNumber}-station-${stationId}`,
          payload,
        })
        jobs.push(job)
      } catch (err) {
        // Non-blocking error handling for kitchen printing
      }
    }

    return jobs
  }

  /**
   * Dispatch Receipt Print Request upon Payment Completion
   */
  async printOrderReceipt(order: OrderInput, _operatorUid: string, paymentId?: string, financialRevision = 1): Promise<PrintJob | null> {
    if (!this.migration.isNewEngineEnabled()) {
      return null // Legacy mode fallback
    }

    const printableItems: PrintableItemPayload[] = order.items.map((i) => ({
      name: i.name,
      basePrice: i.price,
      quantity: i.quantity,
      modifiersText: i.modifiersText,
      note: i.note,
      lineTotal: i.price * i.quantity,
    }))

    const payload: PrintJobPayload = {
      payloadSchemaVersion: 1,
      templateVersion: 'v1.0-receipt',
      restaurantName: 'PACHAX Flow Restaurant',
      branchName: 'Sucursal Central',
      orderId: order.id,
      sequenceNumber: order.sequenceNumber,
      displayNumber: order.displayNumber,
      fulfillmentType: order.fulfillmentType,
      tableInfo: order.tableInfo,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      items: printableItems,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal || 0,
      taxTotal: order.taxTotal || 0,
      deliveryFee: order.deliveryFee || 0,
      grandTotal: order.grandTotal,
      paymentMethod: order.paymentMethod || 'cash',
      cashReceived: order.cashReceived,
      changeAmount: order.changeAmount,
      isCopy: false,
      copies: 1,
      createdIso: new Date().toISOString(),
    }

    const stablePaymentId = paymentId || 'pay-main'
    try {
      return await this.engine.submitPrintRequest({
        targetType: 'receipt',
        orderId: order.id,
        idempotencyKey: `receipt:${order.id}:${stablePaymentId}:v${financialRevision}`,
        payload,
      })
    } catch (err) {
      return null
    }
  }

  /**
   * Dispatch Cancellation Ticket Notice
   */
  async printOrderCancellationNotice(order: OrderInput, canceledItems: OrderItemInput[], reason: string, operatorUid: string): Promise<PrintJob | null> {
    if (!this.migration.isNewEngineEnabled()) return null

    const printableItems: PrintableItemPayload[] = canceledItems.map((i) => ({
      name: i.name,
      basePrice: i.price,
      quantity: i.quantity,
      lineTotal: i.price * i.quantity,
    }))

    const payload: PrintJobPayload = {
      payloadSchemaVersion: 1,
      templateVersion: 'v1.0-cancel',
      restaurantName: 'PACHAX Flow',
      branchName: 'Sucursal Central',
      orderId: order.id,
      displayNumber: order.displayNumber,
      tableInfo: order.tableInfo,
      customerName: order.customerName,
      items: printableItems,
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      deliveryFee: 0,
      grandTotal: 0,
      customMessage: `*** CANCELADO ***\nMotivo: ${reason}\nOperador: ${operatorUid}`,
      isCopy: false,
      copies: 1,
      createdIso: new Date().toISOString(),
    }

    try {
      return await this.engine.submitPrintRequest({
        targetType: 'cancellation_ticket',
        orderId: order.id,
        idempotencyKey: `cancel-${order.id}-${Date.now()}`,
        payload,
      })
    } catch (err) {
      return null
    }
  }

  /**
   * Dispatch Independent Cash Drawer Kick
   */
  async kickCashDrawerIndependent(operatorUid: string, reason: string): Promise<PrintJob | null> {
    if (!this.migration.isNewEngineEnabled()) return null

    try {
      return await this.engine.kickCashDrawer({
        userUid: operatorUid,
        terminalId: this.engine.queueManager.terminalId,
        reason,
      })
    } catch (err) {
      return null
    }
  }
}
