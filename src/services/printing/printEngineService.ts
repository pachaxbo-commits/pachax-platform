import type {
  IndependentDrawerKickInput,
  KitchenStation,
  PrinterAdapter,
  PrinterProfile,
  PrintJob,
  PrintJobPayload,
  PrintJobResolution,
  PrintJobStatus,
  PrintJobStorage,
  PrintJobTarget,
  RequestReprintInput,
  SubmitPrintRequestInput,
} from '../../types/printing.ts'
import { getActiveTenant } from '../../store/activeTenant.ts'
import { isDemoModeActive } from '../../demo/core/demoContext.ts'
import { assertDocumentCapability, requiredPrintCapability } from '../../core/documents/documentCapabilities.ts'
import { DiagnosticPrinterAdapter } from './diagnosticPrinterAdapter.ts'
import { PrintQueueManager } from './printQueueManager.ts'

export type PrintJobOutcomeCategory = 'success' | 'pending' | 'uncertain' | 'failed'

export interface PrintJobOutcome {
  category: PrintJobOutcomeCategory
  status: PrintJobStatus
  isSuccess: boolean
  message: string
  job?: PrintJob
}

export function resolvePrintRequestScope(
  active: { tenantId: string; branchId: string } | null,
  requested: { tenantId?: string; branchId?: string },
  isolatedDemo = false,
): { tenantId?: string; branchId?: string } {
  if (!active) {
    if (!isolatedDemo) throw new Error('La empresa y sucursal activa deben cargarse antes de imprimir.')
    return { tenantId: requested.tenantId, branchId: requested.branchId }
  }
  if (requested.tenantId && requested.tenantId !== active.tenantId) {
    throw new Error('El documento no coincide con la empresa activa.')
  }
  if (requested.branchId && requested.branchId !== active.branchId) {
    throw new Error('El documento no coincide con la sucursal activa.')
  }
  return { tenantId: active.tenantId, branchId: active.branchId }
}

export function classifyPrintJobOutcome(job: PrintJob, contextLabel: string = 'Impresión'): PrintJobOutcome {
  switch (job.status) {
    case 'confirmed':
      return {
        category: 'success',
        status: job.status,
        isSuccess: true,
        message: `${contextLabel} confirmada por hardware.`,
        job,
      }
    case 'transmitted':
      if (job.connectionType === 'browser_dialog') {
        return {
          category: 'pending',
          status: job.status,
          isSuccess: false,
          message: 'Se abrió el diálogo del navegador; la impresión física no está confirmada.',
          job,
        }
      }
      return {
        category: 'success',
        status: job.status,
        isSuccess: true,
        message: `${contextLabel} enviada a la impresora.`,
        job,
      }
    case 'resolved':
      return {
        category: 'success',
        status: job.status,
        isSuccess: true,
        message: `${contextLabel} enviada a la impresora.`,
        job,
      }
    case 'queued':
    case 'routing':
    case 'formatting':
    case 'processing':
    case 'connecting':
    case 'transmitting':
    case 'retrying':
      return {
        category: 'pending',
        status: job.status,
        isSuccess: false,
        message: 'Impresión pendiente de reintento.',
        job,
      }
    case 'unknown':
      return {
        category: 'uncertain',
        status: job.status,
        isSuccess: false,
        message: 'No se pudo confirmar si la impresión salió.',
        job,
      }
    case 'failed':
    case 'cancelled':
    default:
      return {
        category: 'failed',
        status: job.status,
        isSuccess: false,
        message: `Falló la impresión${job.lastError ? `: ${job.lastError}` : '.'}`,
        job,
      }
  }
}

export class PrintEngineService {
  private static instance: PrintEngineService | null = null
  public queueManager: PrintQueueManager
  private printers = new Map<string, PrinterProfile>()
  private stations = new Map<string, KitchenStation>()

  private constructor(storage?: PrintJobStorage) {
    this.queueManager = new PrintQueueManager(storage)
    // Register default diagnostic mock adapter
    this.queueManager.registerAdapter(new DiagnosticPrinterAdapter('success_transmitted'))
  }

  public static getInstance(storage?: PrintJobStorage): PrintEngineService {
    if (!PrintEngineService.instance) {
      PrintEngineService.instance = new PrintEngineService(storage)
    }
    return PrintEngineService.instance
  }

  registerPrinterProfile(printer: PrinterProfile): void {
    this.printers.set(printer.id, printer)
  }

  unregisterPrinterProfile(id: string): void {
    this.printers.delete(id)
  }

  registerKitchenStation(station: KitchenStation): void {
    this.stations.set(station.id, station)
  }

  registerAdapter(adapter: PrinterAdapter): void {
    this.queueManager.registerAdapter(adapter)
  }

  getPrinterProfile(id: string): PrinterProfile | undefined {
    return this.printers.get(id)
  }

  listPrinterProfiles(tenantId?: string, branchId?: string): PrinterProfile[] {
    const tid = tenantId || getActiveTenant()?.tenantId || ''
    return Array.from(this.printers.values()).filter(p => {
      const matchTenant = !tid || p.restaurantId === tid || p.tenantId === tid
      const matchBranch = !branchId || p.branchId === branchId
      return matchTenant && matchBranch
    })
  }

  /** Resolves destination printer for target or station */
  resolveDestinationPrinters(
    targetType: PrintJobTarget,
    stationId?: string,
    tenantId?: string,
    branchId?: string
  ): { primary: PrinterProfile; backup?: PrinterProfile } {
    if (stationId && this.stations.has(stationId)) {
      const station = this.stations.get(stationId)!
      const primary = this.printers.get(station.primaryPrinterId)
      const backup = station.backupPrinterId ? this.printers.get(station.backupPrinterId) : undefined
      if (primary) {
        const matchTenant = !tenantId || primary.restaurantId === tenantId || primary.tenantId === tenantId
        const matchBranch = !branchId || primary.branchId === branchId
        if (matchTenant && matchBranch) {
          return { primary, backup }
        }
      }
    }

    // Default lookup by role scoped strictly by tenantId and branchId
    const activePrinters = this.listPrinterProfiles(tenantId, branchId).filter((p) => p.isActive)
    const roleMatch = activePrinters.find((p) => {
      if (targetType === 'kitchen_ticket') return p.role === 'kitchen'
      if (targetType === 'bar_ticket') return p.role === 'bar'
      if (targetType === 'receipt' || targetType === 'cash_report') return p.role === 'receipt'
      return false
    })
    const fallback = roleMatch || activePrinters.find(p => p.role === 'general') || activePrinters[0] || this.createDefaultFallbackProfile()

    return { primary: fallback }
  }

  private createDefaultFallbackProfile(): PrinterProfile {
    return {
      id: 'default-diagnostic',
      restaurantId: 'principal',
      branchId: 'main',
      name: 'Impresora Diagnostico Virtual',
      role: 'general',
      connectionType: 'virtual_pdf',
      paperWidth: '80mm',
      copies: 1,
      autoPrintOnOrderCreated: true,
      autoPrintOnOrderPaid: true,
      kickDrawerOnPrint: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      capabilities: {
        supportsCashDrawerKick: true,
        supportsPaperCut: true,
        supportsBeep: true,
        supportsBarcode: true,
        supportsQrCode: true,
        supportsImages: true,
        supportsRealtimeStatus: false,
        columnsPerLine: 48,
        codePage: 'CP850',
        encoding: 'utf-8',
        chunkSize: 1024,
        chunkDelayMs: 50,
        connectionTimeoutMs: 5000,
        writeTimeoutMs: 5000,
        feedLinesEnd: 3,
      },
    }
  }

  /** Main entry point for submitting any print request */
  async submitPrintRequest(input: SubmitPrintRequestInput): Promise<PrintJob> {
    const activeContext = getActiveTenant()
    const scope = resolvePrintRequestScope(
      activeContext ? { tenantId: activeContext.tenantId, branchId: activeContext.branchId } : null,
      input,
      isDemoModeActive(),
    )
    const activeTenant = activeContext?.tenant
    assertDocumentCapability(activeTenant, requiredPrintCapability(input.targetType, input.executionMode))
    const selected = input.printerProfileId ? this.printers.get(input.printerProfileId) : undefined
    if (selected && scope.tenantId && selected.restaurantId !== scope.tenantId && selected.tenantId !== scope.tenantId) {
      throw new Error(`La impresora seleccionada no pertenece a la empresa ${scope.tenantId}`)
    }
    if (selected && scope.branchId && selected.branchId !== scope.branchId) {
      throw new Error(`La impresora seleccionada no pertenece a la sucursal ${scope.branchId}`)
    }
    const { primary, backup } = selected ? { primary: selected, backup: undefined } : this.resolveDestinationPrinters(input.targetType, input.stationId, scope.tenantId, scope.branchId)
    if (primary.id === 'default-diagnostic') throw new Error('Configura una impresora real antes de imprimir.')
    const adapter = this.queueManager.getAdapter(primary.connectionType)
    if (!adapter) throw new Error('No hay un adaptador disponible para esta impresora.')
    const job = await this.queueManager.submitJob(input, primary, backup)

    // Attempt processing immediately if lease acquired
    const acquired = await this.queueManager.acquireLease(job.id)
    if (acquired) {
      return await this.queueManager.processJob(job.id, adapter, primary, backup)
    }

    return job
  }

  /** Trigger independent cash drawer kick action */
  async kickCashDrawer(input: IndependentDrawerKickInput): Promise<PrintJob> {
    const payload: PrintJobPayload = {
      payloadSchemaVersion: 1,
      templateVersion: 'v1.0',
      restaurantName: 'PACHAX',
      branchName: 'Sucursal Central',
      items: [],
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      deliveryFee: 0,
      grandTotal: 0,
      isCopy: false,
      customMessage: `Apertura de gaveta por usuario: ${input.userUid} | Motivo: ${input.reason}`,
      copies: 1,
      createdIso: new Date().toISOString(),
    }

    return await this.submitPrintRequest({
      targetType: 'drawer_kick',
      payload,
      idempotencyKey: `drawer:${input.terminalId}:${Date.now()}`,
    })
  }

  /** Request authorized reprint creating a copy ticket */
  async requestReprint(input: RequestReprintInput, originalJob: PrintJob): Promise<PrintJob> {
    if (!['transmitted', 'confirmed', 'resolved'].includes(originalJob.status)) {
      throw new Error('Solo se puede reimprimir como copia un documento cuya impresión fue resuelta.')
    }
    const activeContext = getActiveTenant()
    const scope = resolvePrintRequestScope(
      activeContext ? { tenantId: activeContext.tenantId, branchId: activeContext.branchId } : null,
      { tenantId: originalJob.restaurantId, branchId: originalJob.branchId },
      isDemoModeActive(),
    )
    assertDocumentCapability(activeContext?.tenant, requiredPrintCapability(originalJob.targetType, 'manual'))
    if (input.originalJobId !== originalJob.id) throw new Error('El trabajo original no coincide con la solicitud de reimpresión.')
    const printer = this.printers.get(originalJob.printerProfileId) || this.createDefaultFallbackProfile()
    if (scope.tenantId && printer.restaurantId !== scope.tenantId && printer.tenantId !== scope.tenantId) {
      throw new Error('La impresora de reimpresión no pertenece a la empresa activa.')
    }
    if (scope.branchId && printer.branchId !== scope.branchId) {
      throw new Error('La impresora de reimpresión no pertenece a la sucursal activa.')
    }
    return await this.queueManager.requestReprint(input, originalJob, printer)
  }

  /** Resolve manual status on an unknown job */
  async resolveUnknownJob(jobId: string, resolution: PrintJobResolution): Promise<PrintJob> {
    return await this.queueManager.resolveUnknownJob(jobId, resolution)
  }

  /** Bootstrap queue recovery on app startup */
  async bootstrap(): Promise<PrintJob[]> {
    return await this.queueManager.bootstrapRecovery()
  }
}
