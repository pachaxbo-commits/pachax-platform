import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { StudioBranding } from '../../../studio/branding/brandingTypes'
import { BarChart3, Bell, Boxes, ChevronRight, CircleDollarSign, ClipboardList, Clock3, GlassWater, Handshake, LayoutGrid, LogOut, Menu, Music2, ReceiptText, Settings, Star, Users, Wine } from 'lucide-react'
import type { NightclubCommissionPaymentDraft, NightclubCourtesyDraft, NightclubCustomer, NightclubCustomerStatus, NightclubDataset, NightclubInventoryItem, NightclubInventoryMovementType, NightclubMember, NightclubModuleId, NightclubPaymentDraft, NightclubProduct, NightclubProductExchangeDraft, NightclubRoundDraft, NightclubServiceTarget, NightclubStaff } from '../domain/nightclubAccounts'
import { nightclubCan, nightclubCashSummary, normalizeNightclubRole } from '../domain/nightclubAccounts'
import type { NightclubUserRole } from '../domain/nightclubUsers'
import { hasNightclubPermission } from '../domain/nightclubPermissions'
import type { ReservationDraft, TableDraft, ZoneDraft } from '../domain/nightclubFloor'
import type { NightclubIncidentDraft } from '../domain/nightclubCustomerIncidents'
import type { NightclubConsumptionDraft, NightclubLoungeSaleDraft, NightclubPromoter, NightclubPromoterEvent, NightclubSaleDraft } from '../domain/nightclubPromoters'
import { NightclubAccounts } from './NightclubAccounts'
import { NightclubBar } from './NightclubBar'
import { NightclubBarHistory } from './NightclubBarHistory'
import { NightclubCash } from './NightclubCash'
import { NightclubCustomers } from './NightclubCustomers'
import { NightclubCommissions } from './NightclubCommissions'
import { NightclubPromoters } from './NightclubPromoters'
import { NightclubUsers } from './NightclubUsers'
import { NightclubInventory } from './NightclubInventory'
import { NightclubProductiveInventory } from './NightclubProductiveInventory'
import { NightclubBottleInventory } from './NightclubBottleInventory'
import { NightclubInventoryCosts, NightclubCourtesyInventoryMovements } from './NightclubInventoryCosts'
import { NightclubCourtesyDialog, NightclubCourtesyReport, NightclubMembers } from './NightclubMembers'
import { NightclubPOS } from './NightclubPOS'
import { NightclubProducts } from './NightclubProducts'
import { NightclubReports } from './NightclubReports'
import { NightclubSettings } from './NightclubSettings'
import { NightclubZones } from './NightclubZones'
import { createNightclubActionRunner, resolveNightclubVisibleModules } from '../application/nightclubActionRunner'
import { buildBusinessDocumentContext, type BusinessDocumentContext, type BusinessIdentity } from '../../../core/businessIdentity'
import { CanonicalReceiptModal } from '../../../components/receipt/CanonicalReceiptModal'
import { nightclubAccountToReceiptData, buildNightclubBarTicketPayload, nightclubReceiptToPrintPayload } from '../domain/nightclubReceipt'
import { PrintEngineService, classifyPrintJobOutcome, type PrintJobOutcome } from '../../../services/printing/printEngineService'
import { getActiveBarPrinter } from '../../../services/printing/printerBootstrap'
import type { NightclubRound, NightclubAccount } from '../domain/nightclubAccounts'

type NightclubModule = NightclubModuleId
type ControllerContract = {
  data: NightclubDataset
  incidentResponsibleLabel: string
  onSaveBranding?: (branding: NonNullable<NightclubDataset['branding']>) => void | Promise<unknown>
  onSaveZone: (draft: ZoneDraft) => boolean | void | Promise<boolean | void>
  onSaveTable: (draft: TableDraft) => boolean | void | Promise<boolean | void>
  onDeleteZone: (id: string) => boolean | void | Promise<boolean | void>
  onDeleteTable: (id: string) => boolean | void | Promise<boolean | void>
  onStartShift: (openingFloat: number) => boolean | void | Promise<boolean | void>
  onCloseShift: (countedCash: number) => boolean | void | Promise<boolean | void>
  onOpenAccount: (target: string | NightclubServiceTarget) => string | Promise<string>
  onGetRound?: (roundId: string) => Promise<NightclubRound | null>
  onSendRound: (accountId: string, draft: NightclubRoundDraft[], operationId: string, customerId?: string | null, serviceStaffId?: string) => boolean | void | any | Promise<boolean | void | any>
  onSettleRound: (accountId: string, draft: NightclubRoundDraft[], payment: NightclubPaymentDraft, operationId: string, sellerStaffId?: string) => boolean | void | any | Promise<boolean | void | any>
  onRequestBill: (accountId: string) => boolean | void | Promise<boolean | void>
  onReopenBill: (accountId: string) => boolean | void | Promise<boolean | void>
  onRecordPayment: (accountId: string, payment: NightclubPaymentDraft) => boolean | void | Promise<boolean | void>
  onAdvanceRound: (accountId: string, roundId: string) => boolean | void | Promise<boolean | void>
  onDeliverRound: (accountId: string, roundId: string) => boolean | void | Promise<boolean | void>
  onFinishAccount: (accountId: string) => boolean | void | Promise<boolean | void>
  onRefundRound: (accountId: string, roundId: string, reason: string, returnToStock?: boolean, items?: Array<{ itemId: string; quantity: number; returnToStock: boolean }>) => boolean | void | Promise<boolean | void>
  onExchangePaidProduct?: (draft: NightclubProductExchangeDraft) => boolean | void | Promise<boolean | void>
  onCancelRound?: (accountId: string, roundId: string, reason: string) => boolean | void | Promise<boolean | void>
  onSaveReservation?: (draft: ReservationDraft) => boolean | void | Promise<boolean | void>
  onCancelReservation?: (id: string) => boolean | void | Promise<boolean | void>
  onArriveReservation?: (id: string) => string | Promise<string>
  onCashMovement?: (value: any) => boolean | void | Promise<boolean | void>
  onAdjustInventory: (inventoryId: string, quantity: number, type?: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'>, reason?: string) => boolean | void | Promise<boolean | void>
  onOpenBottle?: (inventoryId: string) => boolean | void | Promise<boolean | void>
  onOpenBottleExit?: (inventoryId: string, ml: number, type: any, reason: string) => boolean | void | Promise<boolean | void>
  onSaveBottleInventory?: (draft: any) => boolean | void | Promise<boolean | void>
  onSaveSimpleInventoryProduct?: (draft: any) => boolean | void | Promise<boolean | void>
  onSaveInventory: (item: NightclubInventoryItem) => boolean | void | Promise<boolean | void>
  onSaveProduct: (product: NightclubProduct) => boolean | void | Promise<boolean | void>
  onSaveCustomer: (customer: NightclubCustomer) => boolean | void | Promise<boolean | void>
  onSetCustomerStatus?: (customerId: string, status: NightclubCustomerStatus) => boolean | void | Promise<boolean | void>
  onSaveCustomerIncident?: (incident: NightclubIncidentDraft) => boolean | void | Promise<boolean | void>
  onDeleteCustomerIncident?: (customerId: string, incidentId: string) => boolean | void | Promise<boolean | void>
  onAssignCustomer?: (accountId: string, customerId: string) => boolean | void | Promise<boolean | void>
  onSaveStaff: (user: NightclubStaff, initialPassword?: string) => boolean | void | Promise<boolean | void>
  onDeleteStaff: (id: string) => boolean | void | Promise<boolean | void>
  onSaveUserRolePreset: (roleId: NightclubUserRole, permissions: string[]) => boolean | void | Promise<boolean | void>
  onSaveCustomRole?: (draft: { id?: `custom:${string}`; label: string; permissions: string[] }) => boolean | void | Promise<boolean | void>
  onDeleteCustomRole?: (id: string) => boolean | void | Promise<boolean | void>
  onPayCommissions?: (draft: NightclubCommissionPaymentDraft) => boolean | void | Promise<boolean | void>
  onSaveMember?: (member: NightclubMember) => boolean | void | Promise<boolean | void>
  onRegisterCourtesy?: (draft: NightclubCourtesyDraft) => boolean | void | Promise<boolean | void>
  onCancelCourtesy?: (id: string) => boolean | void | Promise<boolean | void>
  onSavePromoterEvent?: (event: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'>) => boolean | void | Promise<boolean | void>
  onSavePromoter?: (promoter: NightclubPromoter) => boolean | void | Promise<boolean | void>
  onDeletePromoter?: (id: string) => boolean | void | Promise<boolean | void>
  onSavePromoterSale?: (sale: NightclubSaleDraft) => boolean | void | Promise<boolean | void>
  onSavePromoterLoungeSale?: (sale: NightclubLoungeSaleDraft) => boolean | void | Promise<boolean | void>
  onMarkPromoterLoungePaid?: (id: string) => boolean | void | Promise<boolean | void>
  onSavePromoterConsumption?: (consumption: NightclubConsumptionDraft) => boolean | void | Promise<boolean | void>
  onSelectCashbox?: (id: string, confirmPending?: boolean) => void | Promise<unknown>
  onInitializeNightclubInfrastructure?: (operationId: string) => Promise<{ status: string }>
  onCreateNightclubCashbox?: (name: string, operationId: string) => Promise<{ cashboxId: string; locationId: string }>
  onStartCashboxShift?: (id: string, amount: number) => void | Promise<unknown>
  onCloseCashboxShift?: (id: string, counted: number, expected: number) => void | Promise<unknown>
  onReceiveWarehouseIntake?: (receipt: any, operationId: string) => Promise<unknown>
  onConfirmPhysicalCount?: (count: any, operationId: string) => Promise<unknown>
  onRequestInventoryTransfer?: (draftOrLines: any, operationId?: string) => unknown
  onDispatchInventoryTransfer?: (transferId: string, operationId?: string) => unknown
  onReceiveInventoryTransfer?: (transferId: string, operationId?: string) => unknown
  onRequestTransfer?: (draftOrLines: any, operationId?: string) => unknown
  onDispatchTransfer?: (transferId: string, operationId?: string) => unknown
  onReceiveTransfer?: (transferId: string, operationId?: string) => unknown
  activeCashboxId?: string | null
  activeLocationId?: string | null
}
type Props = ControllerContract & {
  companyName: string
  logoUrl?: string
  studioBranding?: StudioBranding | null
  userName: string
  role: string
  onSignOut?: () => void | Promise<void>
  demoPermissions?: ReadonlySet<string> | null
  permissions?: ReadonlySet<string> | null
  demoUserId?: string
  onSelectDemoUser?: (id: string) => void
  mode?: 'tenant' | 'demo' | 'studio'
  businessIdentity?: BusinessIdentity
  onSaveBusinessIdentity?: (identity: BusinessIdentity) => Promise<void> | void
  onUploadLogo?: (file: File) => Promise<string>
  tenantId?: string
  branchId?: string
}
const allModules: Array<{ id: NightclubModule; label: string; icon: typeof Music2 }> = [
  { id: 'dashboard', label: 'Inicio', icon: BarChart3 }, { id: 'floor', label: 'Zonas', icon: LayoutGrid }, { id: 'pos', label: 'POS', icon: CircleDollarSign }, { id: 'accounts', label: 'Cuentas', icon: ReceiptText }, { id: 'bar', label: 'Barra', icon: GlassWater }, { id: 'inventory', label: 'Inventario', icon: Boxes }, { id: 'products', label: 'Productos', icon: Wine }, { id: 'cash', label: 'Caja', icon: ClipboardList }, { id: 'history', label: 'Historial', icon: Clock3 }, { id: 'customers', label: 'Clientes', icon: Users }, { id: 'promoters', label: 'Relacionadores', icon: Handshake }, { id: 'members', label: 'Socios', icon: Star }, { id: 'users', label: 'Usuarios', icon: Users }, { id: 'reports', label: 'Reportes', icon: BarChart3 }, { id: 'settings', label: 'Configuración', icon: Settings },
]
const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const bottleSavedMessage = (value: { name: string; closedBottles: number; capacityMl: number; capacityUnit?: 'ml' | 'l' }) => { const capacity = value.capacityUnit === 'l' ? `${value.capacityMl / 1000} L` : `${value.capacityMl} ml`; return `Producto guardado correctamente. ${value.name.trim()}: ${value.closedBottles} botellas de ${capacity} - ${(value.closedBottles * value.capacityMl).toLocaleString('es-BO')} ml disponibles en total.` }
const roleLabels = { owner: 'Propietario', admin: 'Administración', partner: 'Socio / Dueño', cashier: 'Caja', waiter: 'Mesero', service: 'Servicio', bar: 'Barra', promoter: 'Relacionador', supervisor: 'Supervisor', inventory: 'Inventario', restricted: 'Acceso limitado' } as const

export function NightclubExperience(props: Props) {
  const { companyName, logoUrl, userName, role, data, onSignOut } = props
  const configuredCashboxes = data.cashboxes || []
  const effectivePermissions = props.permissions !== undefined ? props.permissions : props.demoPermissions
  const normalizedRole = normalizeNightclubRole(role)
  const canPrintComanda = ['owner', 'admin', 'bar'].includes(normalizedRole)
  const canAccessReceipt = ['owner', 'admin', 'cashier'].includes(normalizedRole)
  const effectiveTenantId = props.tenantId || (props.mode === 'tenant' ? 'principal' : props.mode || 'demo')
  const effectiveBranchId = props.branchId || 'main'
  const effectiveCompanyName = props.businessIdentity?.tradeName || companyName || 'PACHAX Platform'
  const effectiveLogoUrl = props.businessIdentity?.showLogo !== false ? (props.businessIdentity?.logoUrl || logoUrl) : undefined

  const documentContext: BusinessDocumentContext = useMemo(
    () =>
      buildBusinessDocumentContext(props.businessIdentity, {
        companyName: effectiveCompanyName,
        logoUrl: effectiveLogoUrl,
        branchName: 'Principal',
      }),
    [props.businessIdentity, effectiveCompanyName, effectiveLogoUrl]
  )

  const [receiptModalAccount, setReceiptModalAccount] = useState<NightclubAccount | null>(null)

  const handlePrintReceipt = async (): Promise<string> => {
    if (!receiptModalAccount) return ''
    if (!canAccessReceipt) {
      setNotice('No tienes permiso para imprimir recibos.')
      return 'No tienes permiso para imprimir recibos.'
    }
    try {
      const receiptData = nightclubAccountToReceiptData(receiptModalAccount, data, props.businessIdentity)
      const payload = nightclubReceiptToPrintPayload(receiptData, documentContext, receiptModalAccount.id)
      const job = await PrintEngineService.getInstance().submitPrintRequest({
        targetType: 'receipt',
        tenantId: effectiveTenantId,
        branchId: effectiveBranchId,
        idempotencyKey: `receipt:${effectiveTenantId}:${effectiveBranchId}:${receiptModalAccount.id}:${Date.now()}`,
        payload,
      })
      const outcome = classifyPrintJobOutcome(job, 'Recibo')
      if (outcome.isSuccess) {
        setNotice('Recibo enviado a la impresora.')
        return 'Recibo enviado a la impresora.'
      } else if (outcome.category === 'uncertain') {
        setNotice('No se pudo confirmar si la impresión salió.')
        return 'No se pudo confirmar si la impresión salió.'
      } else if (outcome.category === 'pending') {
        setNotice('Impresión de recibo pendiente de reintento.')
        return 'Impresión de recibo pendiente de reintento.'
      } else {
        setNotice(outcome.message)
        return outcome.message
      }
    } catch (err: unknown) {
      const msg = `Falló la impresión: ${err instanceof Error ? err.message : String(err)}`
      setNotice(msg)
      return msg
    }
  }

  const handleAutoPrintBar = async (round: NightclubRound, accountId: string): Promise<PrintJobOutcome | null> => {
    try {
      const activeBarPrinter = getActiveBarPrinter(effectiveTenantId, effectiveBranchId)
      if (!activeBarPrinter || !activeBarPrinter.autoPrintOnOrderCreated) return null

      const account = data.accounts.find(a => a.id === accountId)
      const payload = buildNightclubBarTicketPayload({
        account,
        round,
        tableName: account?.tableNameSnapshot,
        businessIdentity: props.businessIdentity,
        companyName: effectiveCompanyName,
        isReprint: false,
        staffName: userName,
      })
      if (!payload) return null

      const job = await PrintEngineService.getInstance().submitPrintRequest({
        targetType: 'bar_ticket',
        printerProfileId: activeBarPrinter.id,
        tenantId: effectiveTenantId,
        branchId: effectiveBranchId,
        idempotencyKey: `print:${effectiveTenantId}:${effectiveBranchId}:${round.id}:original`,
        payload,
      })
      return classifyPrintJobOutcome(job, 'Comanda')
    } catch (err: unknown) {
      console.warn('[Nightclub] Aviso de impresión de comanda:', err)
      return {
        category: 'failed',
        status: 'failed',
        isSuccess: false,
        message: `Falló la impresión: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  const handlePrintBarComanda = async (accountId: string, roundId: string, isReprint = false) => {
    if (!canPrintComanda) {
      setNotice('No tienes permiso para imprimir comandas.')
      return
    }
    try {
      const account = data.accounts.find(a => a.id === accountId)
      const round = account?.rounds.find(r => r.id === roundId)
      if (!round) {
        setNotice('Ronda no encontrada.')
        return
      }

      const payload = buildNightclubBarTicketPayload({
        account,
        round,
        tableName: account?.tableNameSnapshot,
        businessIdentity: props.businessIdentity,
        companyName: effectiveCompanyName,
        isReprint,
        staffName: userName,
      })
      if (!payload) {
        setNotice('Esta ronda no contiene productos para Barra.')
        return
      }

      const idempotencyKey = isReprint
        ? `reprint:${effectiveTenantId}:${effectiveBranchId}:${round.id}:${Date.now()}`
        : `print:${effectiveTenantId}:${effectiveBranchId}:${round.id}:original`

      const job = await PrintEngineService.getInstance().submitPrintRequest({
        targetType: 'bar_ticket',
        tenantId: effectiveTenantId,
        branchId: effectiveBranchId,
        idempotencyKey,
        payload,
      })
      const outcome = classifyPrintJobOutcome(job, isReprint ? 'Reimpresión' : 'Comanda')
      if (outcome.isSuccess) {
        setNotice(isReprint ? 'Reimpresión enviada a Barra.' : 'Comanda enviada a Barra.')
      } else if (outcome.category === 'uncertain') {
        setNotice('No se pudo confirmar si la impresión salió.')
      } else if (outcome.category === 'pending') {
        setNotice('Impresión pendiente de reintento.')
      } else {
        setNotice(outcome.message)
      }
    } catch (err: unknown) {
      setNotice(`Error al imprimir comanda: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const visibleModules = useMemo(() => {
    const allowed = resolveNightclubVisibleModules({
      mode: props.mode,
      role,
      permissions: effectivePermissions,
    })
    return allModules.filter(item => allowed.includes(item.id))
  }, [role, effectivePermissions, props.mode])
  const [activeModule, setActiveModule] = useState<NightclubModule>('dashboard')
  const [moreOpen, setMoreOpen] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [draft, setDraft] = useState<NightclubRoundDraft[]>([])
  const [courtesyAccountId, setCourtesyAccountId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [demoTopbarHeight, setDemoTopbarHeight] = useState(0)
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-demo-topbar]')
    if (!bar) return
    const measure = () => setDemoTopbarHeight(bar.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])
  const uniqueStaffName = (data.staff || []).filter(person => person.name === userName).length === 1
  const operationData = props.demoUserId && ['waiter', 'service'].includes(normalizedRole) && !effectivePermissions?.has('special.viewOtherEmployees') ? { ...data, accounts: data.accounts.filter(account => (uniqueStaffName && (account.openedBy === userName || account.waiterName === userName)) || account.rounds.some(round => round.serviceStaffId === props.demoUserId)) } : data
  const posData = props.demoUserId && ['waiter', 'service'].includes(normalizedRole) ? { ...operationData, staff: (operationData.staff || []).filter(person => person.id === props.demoUserId && person.role === 'waiter') } : operationData
  const activeAccounts = operationData.accounts.filter(account => account.status !== 'closed')
  const barRounds = activeAccounts.flatMap(account => account.rounds.map(batch => ({ ...batch, account, table: data.tables.find(table => table.id === account.tableId) }))).filter(batch => !!batch.authorization && (batch.status === 'pending' || batch.status === 'preparing'))
  const readyRounds = hasNightclubPermission(effectivePermissions ?? null, 'accounts') && ['owner', 'admin', 'waiter', 'service'].includes(normalizedRole) ? activeAccounts.flatMap(account => account.rounds.filter(batch => !!batch.authorization && batch.status === 'ready').map(batch => ({ batch, account }))) : []
  const summary = nightclubCashSummary(data)
  const [runningAction, setRunningAction] = useState(false)
  const run = useMemo(
    () => createNightclubActionRunner(() => runningAction, setRunningAction, setNotice),
    [runningAction]
  )
  const canDeliver = (effectivePermissions !== undefined ? hasNightclubPermission(effectivePermissions, 'accounts', 'edit') : ['owner', 'admin', 'waiter', 'service'].includes(normalizedRole)) && normalizedRole !== 'bar'
  const canRefund = effectivePermissions !== undefined ? (effectivePermissions === null || (hasNightclubPermission(effectivePermissions, 'accounts', 'delete') && effectivePermissions.has('special.approveOperations'))) : ['owner', 'admin'].includes(normalizedRole)
  const canManageUsers = effectivePermissions === undefined || effectivePermissions === null || effectivePermissions.has('special.manageUsers')
  const canViewUsers = effectivePermissions === undefined ? nightclubCan(normalizedRole, 'users') : hasNightclubPermission(effectivePermissions, 'users')
  const canManageInventory = effectivePermissions !== undefined
    ? hasNightclubPermission(effectivePermissions, 'inventory', 'edit') || hasNightclubPermission(effectivePermissions, 'inventory', 'create')
    : ['owner', 'admin', 'inventory'].includes(normalizedRole)
  const mobilePriority: NightclubModule[] = normalizedRole === 'bar' ? ['bar', 'history'] : normalizedRole === 'inventory' ? ['inventory', 'products', 'history'] : normalizedRole === 'cashier' ? ['accounts', 'cash', 'pos'] : normalizedRole === 'waiter' || normalizedRole === 'service' ? ['floor', 'pos', 'accounts'] : ['dashboard', 'floor', 'reports']
  const mobileModules = mobilePriority.map(id => visibleModules.find(item => item.id === id)).filter((item): item is (typeof allModules)[number] => !!item)
  const moreModules = visibleModules.filter(item => !mobileModules.some(primary => primary.id === item.id))
  const currentModule = visibleModules.some(item => item.id === activeModule) ? activeModule : visibleModules[0]?.id || 'dashboard'
  const savedBranding = data.branding || { businessName: effectiveCompanyName, subtitle: 'Club nocturno / Lounge', logoDataUrl: effectiveLogoUrl, primaryColor: props.businessIdentity?.primaryColor || '#d8a84e', accentColor: props.businessIdentity?.accentColor || '#35d0a0', surfaceColor: '#0d1720' }
  const branding = props.studioBranding ? { ...savedBranding, businessName: props.studioBranding.companyName, logoDataUrl: props.studioBranding.logoUrl, primaryColor: props.studioBranding.primaryColor, accentColor: props.studioBranding.accentColor, surfaceColor: props.studioBranding.surfaceColor, theme: props.studioBranding.theme || savedBranding.theme } : { ...savedBranding, businessName: effectiveCompanyName, logoDataUrl: effectiveLogoUrl, primaryColor: props.businessIdentity?.primaryColor || savedBranding.primaryColor, accentColor: props.businessIdentity?.accentColor || savedBranding.accentColor }

  const [localTheme, setLocalTheme] = useState<'dark' | 'light' | null>(null)
  const effectiveTheme: 'dark' | 'light' = props.studioBranding?.theme || localTheme || branding.theme || (typeof window !== 'undefined' ? (localStorage.getItem('pachax:nightclub-theme') as 'dark' | 'light') : null) || 'dark'
  const isLight = effectiveTheme === 'light'

  const handleThemeChange = (nextTheme: 'dark' | 'light') => {
    setLocalTheme(nextTheme)
    const nextBranding = { ...branding, theme: nextTheme }
    if (props.onSaveBranding) {
      try { props.onSaveBranding(nextBranding) } catch { /* Optional in sandbox */ }
    }
    try { localStorage.setItem('pachax:nightclub-theme', nextTheme) } catch { /* Optional in private browser */ }
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'PACHAX_STUDIO_BRANDING',
          templateId: 'nightclub',
          branding: {
            companyName: nextBranding.businessName,
            logoUrl: nextBranding.logoDataUrl,
            primaryColor: nextBranding.primaryColor,
            accentColor: nextBranding.accentColor,
            surfaceColor: nextBranding.surfaceColor,
            theme: nextTheme,
          },
        },
        window.location.origin
      )
    }
  }

  const shellStyle = (isLight ? {
    '--night-gold': '#b45309',
    '--night-positive': '#047857',
    '--night-surface': '#ffffff',
    '--night-surface-secondary': '#f8fafc',
    '--night-background': '#f1f5f9',
    '--night-sidebar': '#e2e8f0',
    '--night-header': '#ffffff',
    '--night-text': '#0f172a',
    '--night-text-secondary': '#334155',
    '--night-muted': '#475569',
    '--night-border': '#cbd5e1',
  } : {
    '--night-gold': branding.primaryColor,
    '--night-positive': branding.accentColor,
    '--night-surface': branding.surfaceColor,
    '--night-surface-secondary': '#121b20',
    '--night-background': props.studioBranding?.backgroundColor || '#050c13',
    '--night-sidebar': props.studioBranding?.sidebarColor || '#07111a',
    '--night-header': '#07111a',
    '--night-text': '#f8fafc',
    '--night-text-secondary': '#94a3b8',
    '--night-muted': '#64748b',
    '--night-border': 'rgba(255, 255, 255, 0.1)',
  }) as CSSProperties
  const go = (module: NightclubModule) => { if (!visibleModules.some(item => item.id === module)) { setNotice('No tienes acceso a esta sección.'); return }; setActiveModule(module); setMoreOpen(false) }
  useEffect(() => {
    if (currentModule !== 'bar') return
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0))
    return () => cancelAnimationFrame(frame)
  }, [currentModule])

  return <div className={`nightclub-shell min-h-screen w-full ${isLight ? 'theme-light' : 'theme-dark'}`} data-theme={isLight ? 'light' : 'dark'} style={shellStyle}>
    <div className="flex min-h-screen w-full">
      <aside className="sticky hidden w-[232px] shrink-0 flex-col border-r border-white/10 bg-[#07111a] lg:flex" style={{ top: demoTopbarHeight, height: `calc(100dvh - ${demoTopbarHeight}px)` }}><Brand branding={branding} isLight={isLight} /><nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">{visibleModules.map(item => <button key={item.id} onClick={() => go(item.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition ${currentModule === item.id ? 'border border-amber-300/35 bg-amber-300/10 font-bold text-amber-100 shadow-[inset_0_0_24px_rgba(216,168,78,.06)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}><item.icon size={17} strokeWidth={1.7} />{item.label}</button>)}</nav><div className="border-t border-white/10 p-4 text-[10px] uppercase tracking-widest text-slate-600">PACHAX · operación segura</div></aside>
      <div className="min-w-0 flex-1"><header className="sticky z-30 flex min-h-16 items-center justify-between border-b border-white/10 bg-[#07111a]/95 px-4 backdrop-blur md:px-6" style={{ top: demoTopbarHeight }}>
        <div className="lg:hidden"><Brand branding={branding} compact isLight={isLight} /></div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[.025] px-3 py-2 text-xs lg:flex"><span className={`h-2 w-2 rounded-full ${data.shift?.status === 'open' ? 'bg-emerald-400 shadow-[0_0_10px_#35d0a0]' : 'bg-slate-500'}`} /><span className="text-slate-400">Turno</span><strong>{data.shift?.status === 'open' ? 'activo' : 'cerrado'}</strong></div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-700/60 p-1 text-xs" style={{ borderColor: 'var(--night-border, rgba(255,255,255,0.15))' }}>
            <button
              type="button"
              aria-label="Modo oscuro"
              onClick={() => handleThemeChange('dark')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                !isLight
                  ? 'bg-amber-400/20 text-amber-200 border border-amber-300/40 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Modo oscuro estándar"
            >
              <span>🌙</span>
              <span className="hidden sm:inline">Oscuro</span>
            </button>
            <button
              type="button"
              aria-label="Modo claro"
              onClick={() => handleThemeChange('light')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer ${
                isLight
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Modo claro para proyector y luz ambiente"
            >
              <span>☀️</span>
              <span className="hidden sm:inline">Claro</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">{props.onSelectDemoUser && !props.demoUserId && <label className="text-left text-[10px] text-slate-400">Probar como usuario<select aria-label="Probar como usuario" value={props.demoUserId || ''} onChange={event => props.onSelectDemoUser?.(event.target.value)} className="block min-h-9 max-w-[160px] rounded-lg border border-white/10 bg-[#0d1720] px-2 text-xs text-white"><option value="">Volver a Administrador</option>{props.demoUserId && !(data.staff || []).some(person => person.id === props.demoUserId && person.active) && <option value={props.demoUserId} disabled>Usuario inactivo</option>}{(data.staff || []).filter(person => person.active).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}{props.onSelectDemoUser && props.demoUserId && <button className="min-h-9 rounded-lg border border-white/10 px-2 text-xs text-amber-200" onClick={() => props.onSelectDemoUser?.('')}>Volver a Administrador</button>}<button aria-label="Notificaciones" onClick={() => readyRounds.length && go('accounts')} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-300"><Bell size={17} />{readyRounds.length > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-300" />}</button><div className="hidden sm:block"><strong className="block text-xs">{userName}</strong><span className="text-[9px] uppercase tracking-wider text-slate-500">{data.customRoles?.find(item => item.id === role)?.label || roleLabels[normalizedRole]}</span></div>{onSignOut && <button onClick={() => void onSignOut()} aria-label="Cerrar sesión" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-300"><LogOut size={16} /></button>}</div></header>
        <main className="min-w-0 p-4 pb-24 sm:p-6 lg:pb-6 xl:p-7">{notice && <button onClick={() => setNotice('')} role="status" className="mb-4 w-full rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-left text-sm text-amber-100">{notice}</button>}{canDeliver && readyRounds.length > 0 && <button onClick={() => go('accounts')} className="mb-4 flex w-full items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-left text-sm font-bold text-emerald-100"><Bell size={16} />{readyRounds.length} pedido(s) listo(s) para recoger <ChevronRight className="ml-auto" size={16} /></button>}
          {visibleModules.length === 0 && <div className="rounded-xl border border-white/10 p-5 text-sm text-slate-300">Este usuario no tiene secciones habilitadas. Vuelve a Administrador para ajustar sus permisos.</div>}{visibleModules.length > 0 && currentModule === 'dashboard' && (props.demoUserId && normalizedRole !== 'admin' ? <PersonalDashboard data={data} role={role} userName={userName} userId={props.demoUserId} permissions={effectivePermissions ?? new Set()} onGo={go} /> : <Dashboard data={data} activeAccounts={activeAccounts} barRounds={barRounds} sales={summary.totalSales} heroUrl={branding.heroDataUrl} isLight={isLight} mode={props.mode} onGo={go} />)}
          {currentModule === 'floor' && <NightclubZones data={data} mode={props.mode || 'demo'} onOpenAccount={async tableId => { try { const id = await props.onOpenAccount(tableId); if (id) setNotice('Cuenta abierta.'); return id } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo abrir la cuenta.'); return '' } }} onGoToPOS={id => { setSelectedAccountId(id); go('pos') }} onFinishAccount={id => run(() => props.onFinishAccount(id), 'Mesa libre.')} onDeliverRound={(id, roundId) => run(() => props.onDeliverRound(id, roundId), 'Pedido entregado.')} onSaveReservation={value => run(() => props.onSaveReservation?.(value), 'Reserva guardada.')} onCancelReservation={id => run(() => props.onCancelReservation?.(id), 'Reserva cancelada.')} onArriveReservation={async id => { try { const accountId = await props.onArriveReservation?.(id); if (accountId) setNotice('Llegada confirmada y cuenta abierta.'); return accountId || '' } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo confirmar la llegada.'); return '' } }} onAssignCustomer={(accountId, customerId) => run(() => props.onAssignCustomer?.(accountId, customerId), 'Cliente asignado.')} canDeliver={canDeliver} />}
          {currentModule === 'pos' && props.mode === 'tenant' && (!configuredCashboxes.length || !props.activeCashboxId) ? <section role="status" className="mx-auto my-8 max-w-xl rounded-2xl border border-amber-300/25 bg-amber-300/10 p-6 text-amber-50"><h2 className="text-lg font-bold">Caja requerida para operar</h2><p className="mt-2 text-sm text-amber-100/80">{configuredCashboxes.length ? 'Selecciona una caja desde el módulo Caja antes de comenzar una venta.' : 'Debes configurar las cajas y el almacén desde Configuración antes de comenzar a operar.'}</p><button type="button" onClick={() => go(configuredCashboxes.length ? 'cash' : 'settings')} className="mt-4 min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-slate-950">{configuredCashboxes.length ? 'Ir a Caja' : 'Ir a Configuración'}</button></section> : currentModule === 'pos' && <NightclubPOS
            data={posData}
            mode={props.mode || 'demo'}
            currentWaiterId={normalizedRole === 'waiter' ? props.demoUserId : undefined}
            draft={draft}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onDraftChange={setDraft}
            onOpenAccount={async (target: NightclubServiceTarget) => {
              try {
                const id = await props.onOpenAccount(target)
                if (id) setNotice('Cuenta abierta.')
                return id
              } catch (error) {
                setNotice(error instanceof Error ? error.message : 'No se pudo abrir la cuenta.')
                return ''
              }
            }}
            onSendRound={async (id, items, operationId, customerId, serviceStaffId) => {
              return run(async () => {
                const res: any = await props.onSendRound(id, items, operationId, customerId, serviceStaffId)
                const serverRoundId = (res && typeof res === 'object' && res.roundId) ? res.roundId : null
                const targetAccount = data.accounts.find(a => a.id === id)
                let targetRound = targetAccount?.rounds.find(r => (serverRoundId && r.id === serverRoundId) || r.operationId === operationId)
                if (!targetRound && serverRoundId && props.onGetRound) {
                  try {
                    targetRound = (await props.onGetRound(serverRoundId)) || undefined
                  } catch {
                    // ignore
                  }
                }
                let printOutcome: PrintJobOutcome | null = null
                if (targetRound) {
                  printOutcome = await handleAutoPrintBar(targetRound, id)
                } else if (props.mode !== 'tenant') {
                  const syntheticRound: NightclubRound = {
                    id: operationId,
                    operationId,
                    sequence: (targetAccount?.rounds.length || 0) + 1,
                    createdAt: new Date().toISOString(),
                    status: 'pending',
                    authorization: 'account_charge',
                    items: items.map((it, idx) => {
                      const prod = data.products.find(p => p.id === it.productId)
                      const unitPrice = prod?.price || 0
                      return {
                        id: `${operationId}_item_${idx}`,
                        productId: it.productId,
                        name: prod?.name || 'Producto',
                        unitPrice,
                        quantity: it.quantity,
                        lineTotal: unitPrice * it.quantity,
                        preparationArea: prod?.preparationArea || 'Barra',
                      }
                    }),
                  }
                  printOutcome = await handleAutoPrintBar(syntheticRound, id)
                }
                if (printOutcome) {
                  if (printOutcome.category === 'failed' || printOutcome.category === 'pending') {
                    return 'Ronda guardada. Impresión pendiente/fallida.'
                  }
                  if (printOutcome.category === 'uncertain') {
                    return 'Ronda guardada. No se pudo confirmar si la impresión salió.'
                  }
                }
                return 'Ronda enviada; consumo cargado a cuenta e inventario actualizado.'
              }, 'Ronda enviada; consumo cargado a cuenta e inventario actualizado.')
            }}
            onSettleRound={async (id, items, payment, operationId, sellerStaffId) => {
              return run(async () => {
                const res: any = await props.onSettleRound(id, items, payment, operationId, sellerStaffId)
                const serverRoundId = (res && typeof res === 'object' && res.roundId) ? res.roundId : null
                const targetAccount = data.accounts.find(a => a.id === id)
                let targetRound = targetAccount?.rounds.find(r => (serverRoundId && r.id === serverRoundId) || r.operationId === operationId)
                if (!targetRound && serverRoundId && props.onGetRound) {
                  try {
                    targetRound = (await props.onGetRound(serverRoundId)) || undefined
                  } catch {
                    // ignore
                  }
                }
                let printOutcome: PrintJobOutcome | null = null
                if (targetRound) {
                  printOutcome = await handleAutoPrintBar(targetRound, id)
                } else if (props.mode !== 'tenant') {
                  const syntheticRound: NightclubRound = {
                    id: operationId,
                    operationId,
                    sequence: (targetAccount?.rounds.length || 0) + 1,
                    createdAt: new Date().toISOString(),
                    status: 'pending',
                    authorization: 'payment',
                    items: items.map((it, idx) => {
                      const prod = data.products.find(p => p.id === it.productId)
                      const unitPrice = prod?.price || 0
                      return {
                        id: `${operationId}_item_${idx}`,
                        productId: it.productId,
                        name: prod?.name || 'Producto',
                        unitPrice,
                        quantity: it.quantity,
                        lineTotal: unitPrice * it.quantity,
                        preparationArea: prod?.preparationArea || 'Barra',
                      }
                    }),
                  }
                  printOutcome = await handleAutoPrintBar(syntheticRound, id)
                }
                if (printOutcome) {
                  if (printOutcome.category === 'failed' || printOutcome.category === 'pending') {
                    return 'Ronda guardada. Impresión pendiente/fallida.'
                  }
                  if (printOutcome.category === 'uncertain') {
                    return 'Ronda guardada. No se pudo confirmar si la impresión salió.'
                  }
                }
                return 'Ronda cobrada y enviada a preparación.'
              }, 'Ronda cobrada y enviada a preparación.')
            }}
            onCourtesy={setCourtesyAccountId}
            onSaveCustomer={customer => run(() => props.onSaveCustomer(customer), 'Cliente guardado.')}
          />}
          {currentModule === 'accounts' && <NightclubAccounts
            data={operationData}
            mode={props.mode || 'demo'}
            canDeliver={canDeliver}
            canRefund={canRefund}
            canPay={effectivePermissions !== undefined ? hasNightclubPermission(effectivePermissions, 'cash', 'create') : ['owner', 'admin', 'cashier'].includes(normalizedRole)}
            canPrintComanda={canPrintComanda}
            canAccessReceipt={canAccessReceipt}
            onGoToPOS={account => { setSelectedAccountId(account.id); go('pos') }}
            onDeliverRound={(id, roundId) => run(() => props.onDeliverRound(id, roundId), 'Pedido entregado.')}
            onFinishAccount={id => run(() => props.onFinishAccount(id), 'Mesa libre.')}
            onRefundRound={(id, roundId, request) => run(() => props.onRefundRound(id, roundId, request.reason, request.returnToStock, request.items), 'Pedido reembolsado.')}
            onExchangePaidProduct={draft => run(() => props.onExchangePaidProduct?.(draft), 'Cambio de producto registrado.')}
            onRequestBill={id => run(() => props.onRequestBill(id), 'Cuenta solicitada a Caja.')}
            onReopenBill={id => run(() => props.onReopenBill(id), 'Cuenta reabierta.')}
            onRecordPayment={(id, payment) => run(() => props.onRecordPayment(id, payment), 'Pago registrado en Caja.')}
            onOpenReceipt={canAccessReceipt ? (account: NightclubAccount) => setReceiptModalAccount(account) : undefined}
            onPrintComanda={canPrintComanda ? (accountId: string, roundId: string, isReprint?: boolean) => handlePrintBarComanda(accountId, roundId, isReprint) : undefined}
          />}
          {currentModule === 'bar' && <NightclubBar
            data={data}
            cashboxId={props.activeCashboxId || undefined}
            canPrint={canPrintComanda}
            onAdvance={(accountId, roundId) => run(() => props.onAdvanceRound(accountId, roundId), 'Estado de Barra actualizado.')}
            onPrintComanda={canPrintComanda ? (accountId: string, roundId: string, isReprint?: boolean) => handlePrintBarComanda(accountId, roundId, isReprint) : undefined}
          />}
          {currentModule === 'inventory' && (props.mode === 'tenant' ? (
            <NightclubProductiveInventory
              data={data}
              canManage={canManageInventory}
              onReceiveWarehouseIntake={canManageInventory && props.onReceiveWarehouseIntake ? async (receipt, opId) => await props.onReceiveWarehouseIntake!(receipt, opId) : undefined}
              onConfirmPhysicalCount={canManageInventory && props.onConfirmPhysicalCount ? async (count, opId) => await props.onConfirmPhysicalCount!(count, opId) : undefined}
              onRequestTransfer={canManageInventory && (props.onRequestInventoryTransfer || props.onRequestTransfer) ? async (lines, opId) => await (props.onRequestInventoryTransfer || props.onRequestTransfer)!(lines, opId) : undefined}
              onDispatchTransfer={canManageInventory && (props.onDispatchInventoryTransfer || props.onDispatchTransfer) ? async (tId, opId) => await (props.onDispatchInventoryTransfer || props.onDispatchTransfer)!(tId, opId) : undefined}
              onReceiveTransfer={canManageInventory && (props.onReceiveInventoryTransfer || props.onReceiveTransfer) ? async (tId, opId) => await (props.onReceiveInventoryTransfer || props.onReceiveTransfer)!(tId, opId) : undefined}
            />
          ) : (
            <div className="space-y-5">
              <NightclubBottleInventory data={data} onSave={value => run(() => props.onSaveBottleInventory?.(value), bottleSavedMessage(value))} onSaveSimple={value => run(() => props.onSaveSimpleInventoryProduct?.(value), 'Producto de inventario guardado.')} onOpenBottle={id => run(() => props.onOpenBottle?.(id), 'Botella abierta.')} onExit={(id, ml, type, reason) => run(() => props.onOpenBottleExit?.(id, ml, type, reason), 'Salida registrada.')} />
              <NightclubInventory data={data} onMovement={(id, quantity, type, reason) => run(() => props.onAdjustInventory(id, quantity, type, reason), 'Movimiento registrado.')} />
              <NightclubInventoryCosts data={data} onSave={item => run(() => props.onSaveInventory(item), 'Costo actualizado.')} />
              <NightclubCourtesyInventoryMovements data={data} />
            </div>
          ))}
          {currentModule === 'products' && <NightclubProducts data={data} onSave={product => run(() => props.onSaveProduct(product), 'Producto guardado.')} />}
          {currentModule === 'cash' && <NightclubCash
            data={data}
            activeCashboxId={props.activeCashboxId || undefined}
            requireCashboxConfiguration={props.mode === 'tenant'}
            onStartShift={amount => run(() => props.onStartShift(amount), 'Turno abierto.')}
            onCloseShift={counted => run(() => props.onCloseShift(counted), 'Turno cerrado y arqueo guardado.')}
            onCashMovement={value => run(() => props.onCashMovement?.(value), 'Movimiento registrado.')}
            onRecordPayment={(id, payment) => run(() => props.onRecordPayment(id, payment), 'Pago registrado en Caja.')}
            onSelectCashbox={props.onSelectCashbox ? (id, confirm) => run(() => props.onSelectCashbox!(id, confirm), 'Caja de trabajo seleccionada.') : undefined}
            onStartCashboxShift={props.onStartCashboxShift ? (id, amount) => run(() => props.onStartCashboxShift!(id, amount), 'Turno de caja abierto.') : undefined}
            onCloseCashboxShift={props.onCloseCashboxShift ? (id, counted, expected) => run(() => props.onCloseCashboxShift!(id, counted, expected), 'Turno de caja cerrado.') : undefined}
          />}
          {currentModule === 'history' && <div className="space-y-5"><Title title="Historial" subtitle="Pedidos pagados, cortesías y operaciones de cada jornada." /><NightclubBarHistory data={operationData} role={effectivePermissions?.has('special.viewOtherEmployees') ? 'admin' : normalizedRole} canRefundOverride={canRefund} canAccessReceipt={canAccessReceipt} actor={userName} onRefundRound={(id, roundId, reason, returnToStock, items) => run(() => props.onRefundRound(id, roundId, reason, returnToStock, items), 'Pedido reembolsado.')} onOpenReceipt={canAccessReceipt ? (account: NightclubAccount) => setReceiptModalAccount(account) : undefined} /></div>}
          {currentModule === 'members' && <NightclubMembers data={data} role={normalizedRole} canManageOverride={effectivePermissions === undefined ? undefined : hasNightclubPermission(effectivePermissions, 'members', 'edit')} canRegisterOverride={effectivePermissions === undefined ? undefined : hasNightclubPermission(effectivePermissions, 'members', 'create')} onSave={member => run(() => props.onSaveMember?.(member), 'Socio guardado.')} onRegister={value => run(() => props.onRegisterCourtesy?.(value), 'Cortesía registrada.')} onCancel={id => run(() => props.onCancelCourtesy?.(id), 'Cortesía anulada.')} />}
          {currentModule === 'customers' && <NightclubCustomers data={data} mode={props.mode || 'demo'} canCreate={effectivePermissions === undefined || hasNightclubPermission(effectivePermissions, 'customers', 'create')} canEdit={effectivePermissions === undefined || hasNightclubPermission(effectivePermissions, 'customers', 'edit')} companyName={branding.businessName} role={normalizedRole} responsibleLabel={props.incidentResponsibleLabel} onSave={customer => run(() => props.onSaveCustomer(customer), 'Cliente guardado.')} onSetStatus={(id, status) => run(() => props.onSetCustomerStatus?.(id, status), 'Estado actualizado.')} onSaveIncident={incident => run(() => props.onSaveCustomerIncident?.(incident), 'Incidente guardado.')} onDeleteIncident={(customerId, incidentId) => run(() => props.onDeleteCustomerIncident?.(customerId, incidentId), 'Incidente eliminado.')} />}
          {currentModule === 'promoters' && <NightclubPromoters data={data} role={normalizedRole} canManageOverride={effectivePermissions === undefined ? undefined : hasNightclubPermission(effectivePermissions, 'promoters', 'edit')} canSellOverride={effectivePermissions === undefined ? undefined : hasNightclubPermission(effectivePermissions, 'promoters', 'create')} onSaveEvent={value => run(() => props.onSavePromoterEvent?.(value), 'Jornada guardada.')} onSavePromoter={value => run(() => props.onSavePromoter?.(value), 'Relacionador guardado.')} onDeletePromoter={id => run(() => props.onDeletePromoter?.(id), 'Relacionador eliminado.')} onSaveSale={value => run(() => props.onSavePromoterSale?.(value), 'Venta de entradas guardada.')} onSaveLoungeSale={value => run(() => props.onSavePromoterLoungeSale?.(value), 'Lounge guardado.')} onMarkLoungePaid={id => run(() => props.onMarkPromoterLoungePaid?.(id), 'Lounge marcado como pagado.')} onSaveConsumption={value => run(() => props.onSavePromoterConsumption?.(value), 'Consumo administrativo guardado.')} />}
          {currentModule === 'users' && <div className="space-y-5"><Title title="Usuarios" subtitle="Personal y permisos individuales del club." /><NightclubUsers users={data.staff || []} rolePresets={data.userRolePresets} mode={props.mode === 'tenant' ? 'tenant' : 'demo'} view="people" customRoles={data.customRoles} allowCreate={canManageUsers && hasNightclubPermission(effectivePermissions ?? null, 'users', 'create')} allowEdit={canManageUsers && hasNightclubPermission(effectivePermissions ?? null, 'users', 'edit')} allowDelete={canManageUsers && hasNightclubPermission(effectivePermissions ?? null, 'users', 'delete')} canEditPresets={canManageUsers && ['owner', 'admin'].includes(normalizedRole)} onSave={(user, initialPassword) => run(() => props.onSaveStaff(user, initialPassword), 'Usuario guardado.')} onDelete={id => run(() => props.onDeleteStaff(id), 'Acceso retirado.')} onSavePreset={(roleId, permissions) => run(() => props.onSaveUserRolePreset(roleId, permissions), 'Plantilla guardada.')} onSaveCustomRole={draft => run(() => props.onSaveCustomRole?.(draft), 'Rol guardado.')} onDeleteCustomRole={id => run(() => props.onDeleteCustomRole?.(id), 'Rol eliminado.')} /><NightclubCommissions data={data} viewerStaffId={normalizedRole === 'waiter' ? props.demoUserId : undefined} canPay={['owner', 'admin'].includes(normalizedRole)} onPay={value => run(() => props.onPayCommissions?.(value), 'Pago de comisión registrado.')} /></div>}
          {currentModule === 'reports' && <div className="space-y-4"><NightclubReports data={data} companyName={branding.businessName} /><NightclubCourtesyReport data={data} /></div>}
          {currentModule === 'settings' && <NightclubSettings
            key={`${branding.businessName}:${branding.primaryColor}:${branding.accentColor}:${branding.surfaceColor}:${branding.theme}`}
            data={{ ...data, branding }}
            fallbackName={companyName}
            fallbackLogo={logoUrl}
            canViewFloor={effectivePermissions === undefined ? true : hasNightclubPermission(effectivePermissions, 'floor')}
            readOnly={effectivePermissions !== undefined && !hasNightclubPermission(effectivePermissions, 'settings', 'edit')}
            mode={props.mode || 'demo'}
            businessIdentity={props.businessIdentity}
            onSaveBusinessIdentity={props.onSaveBusinessIdentity}
            onUploadLogo={props.onUploadLogo}
            tenantId={effectiveTenantId}
            branchId={effectiveBranchId}
            canManageSettings={['owner', 'admin'].includes(normalizedRole)}
            onInitializeNightclubInfrastructure={props.onInitializeNightclubInfrastructure}
            onCreateNightclubCashbox={props.onCreateNightclubCashbox}
            onSaveBranding={value => { if (value.theme) handleThemeChange(value.theme); return run(() => props.onSaveBranding?.(value), 'Identidad guardada.') }}
            onSaveZone={value => run(() => props.onSaveZone(value), 'Zona guardada.')}
            onSaveTable={value => run(() => props.onSaveTable(value), 'Mesa guardada.')}
            onDeleteZone={id => run(() => props.onDeleteZone(id), 'Zona eliminada.')}
            onDeleteTable={id => run(() => props.onDeleteTable(id), 'Mesa eliminada.')}
            usersPanel={canViewUsers ? <NightclubUsers users={data.staff || []} rolePresets={data.userRolePresets} mode={props.mode === 'tenant' ? 'tenant' : 'demo'} view="roles" customRoles={data.customRoles} allowCreate={canManageUsers && hasNightclubPermission(effectivePermissions ?? null, 'users', 'create')} allowEdit={canManageUsers && hasNightclubPermission(effectivePermissions ?? null, 'users', 'edit')} allowDelete={canManageUsers && hasNightclubPermission(effectivePermissions ?? null, 'users', 'delete')} canEditPresets={canManageUsers && ['owner', 'admin'].includes(normalizedRole)} onSave={(user, initialPassword) => run(() => props.onSaveStaff(user, initialPassword), 'Usuario guardado.')} onDelete={id => run(() => props.onDeleteStaff(id), 'Acceso retirado.')} onSavePreset={(roleId, permissions) => run(() => props.onSaveUserRolePreset(roleId, permissions), 'Plantilla guardada.')} onSaveCustomRole={draft => run(() => props.onSaveCustomRole?.(draft), 'Rol guardado.')} onDeleteCustomRole={id => run(() => props.onDeleteCustomRole?.(id), 'Rol eliminado.')} /> : undefined}
          />}
        </main>
      </div>
    </div>
    {moreOpen && <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMoreOpen(false)}><section aria-label="Más módulos" className="absolute inset-x-0 bottom-[65px] grid max-h-[65vh] grid-cols-2 gap-2 overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0d1720] p-4" onClick={event => event.stopPropagation()}>{moreModules.map(item => <button key={item.id} onClick={() => go(item.id)} className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold ${currentModule === item.id ? 'border-amber-300/40 bg-amber-300/10 text-amber-100' : 'border-white/10'}`}><item.icon size={18} />{item.label}</button>)}</section></div>}
    <nav className="fixed inset-x-0 bottom-0 z-50 grid border-t border-white/10 bg-[#07111a] p-1 pb-safe lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileModules.length + (moreModules.length ? 1 : 0)}, minmax(0, 1fr))` }}>{mobileModules.map(item => <button key={item.id} onClick={() => go(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[10px] ${currentModule === item.id ? 'bg-amber-300 text-[#07111a]' : 'text-slate-400'}`}><item.icon size={17} />{item.label}</button>)}{moreModules.length > 0 && <button onClick={() => setMoreOpen(value => !value)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[10px] ${moreOpen || moreModules.some(item => item.id === currentModule) ? 'bg-amber-300 text-[#07111a]' : 'text-slate-400'}`}><Menu size={17} />Más</button>}</nav>
    {courtesyAccountId !== null && <NightclubCourtesyDialog data={data} accountId={courtesyAccountId} onClose={() => setCourtesyAccountId(null)} onConfirm={value => props.onRegisterCourtesy ? run(() => props.onRegisterCourtesy!(value), 'Cortesía registrada.') : false} />}
    {receiptModalAccount && canAccessReceipt && (
      <CanonicalReceiptModal
        isOpen={!!receiptModalAccount}
        receiptData={nightclubAccountToReceiptData(receiptModalAccount, data, props.businessIdentity)}
        documentContext={documentContext}
        onClose={() => setReceiptModalAccount(null)}
        onPrint={handlePrintReceipt}
      />
    )}
  </div>
}

function Brand({ branding, compact = false, isLight = false }: { branding: NonNullable<Props['data']['branding']>; compact?: boolean; isLight?: boolean }) { return <div className={`flex items-center gap-3 ${compact ? '' : 'min-h-[94px] border-b border-white/10 px-5'}`}>{branding.logoDataUrl ? <img src={branding.logoDataUrl} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className={`grid h-10 w-10 place-items-center rounded-xl border ${isLight ? 'border-amber-500/30 bg-amber-100 text-amber-700' : 'border-amber-300/25 bg-amber-300/10 text-amber-300'}`}><Music2 size={19} /></span>}<div className="min-w-0"><strong className={`${compact ? 'text-sm' : 'font-serif text-xl'} block truncate font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{branding.businessName}</strong><span className={`block truncate text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>{branding.subtitle}</span></div></div> }

function PersonalDashboard({ data, role, userName, userId, permissions, onGo }: { data: Props['data']; role: string; userName: string; userId: string; permissions: ReadonlySet<string>; onGo: (module: NightclubModule) => void }) {
  const can = (section: NightclubModule) => permissions.has(section + '.view')
  const links = allModules.filter(item => item.id !== 'dashboard' && can(item.id))
  const accounts = data.accounts.filter(account => account.status !== 'closed')
  const uniqueStaffName = (data.staff || []).filter(person => person.name === userName).length === 1
  const ownAccounts = accounts.filter(account => (uniqueStaffName && (account.openedBy === userName || account.waiterName === userName)) || account.rounds.some(round => round.serviceStaffId === userId))
  const ownRounds = ownAccounts.flatMap(account => account.rounds.filter(round => round.serviceStaffId === userId))
  const ready = ownRounds.filter(round => round.status === 'ready').length
  const pending = ownRounds.filter(round => round.status === 'pending' || round.status === 'preparing').length
  const barRounds = accounts.flatMap(account => account.rounds.filter(round => !!round.authorization && round.status !== 'cancelled'))
  const pendingBar = barRounds.filter(round => round.status === 'pending' || round.status === 'preparing').length
  const readyBar = barRounds.filter(round => round.status === 'ready').length
  const pendingBills = accounts.filter(account => account.status === 'bill_requested').length
  const inventoryAlerts = data.inventory.filter(item => item.current <= item.minimum).length
  const metrics = role === 'waiter' || role === 'service'
    ? [['Mis cuentas', ownAccounts.length], ['Mis rondas pendientes', pending], ['Listos para recoger', ready]]
    : role === 'cashier'
      ? [['Caja esperada', money(nightclubCashSummary(data).expectedCash)], ['Cobros pendientes', pendingBills], ['Turno', data.shift?.status === 'open' ? 'Abierto' : 'Cerrado']]
      : role === 'bar'
        ? [['Por preparar', pendingBar], ['Listos para entregar', readyBar]]
        : role === 'inventory'
          ? [['Artículos', data.inventory.length], ['Alertas de existencias', inventoryAlerts], ['Movimientos registrados', data.inventoryMovements?.length || 0]]
          : role === 'partner'
            ? [['Ventas del turno', money(nightclubCashSummary(data).totalSales)], ['Cuentas abiertas', accounts.length], ['Mesas ocupadas', data.tables.filter(table => !!table.activeAccountId).length]]
            : []
  return <div className="space-y-4"><Title title={'Inicio · ' + userName} subtitle="Vista según el usuario y sus permisos en esta demo." />
    {metrics.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <Summary key={label} label={String(label)} value={String(value)} />)}</div>}
    {(role === 'waiter' || role === 'service') && !ownAccounts.length && <Empty text="No hay mesas o pedidos asignados a este usuario." />}
    <Panel title="Mis secciones"><div className="flex flex-wrap gap-2">{links.map(item => <button key={item.id} onClick={() => onGo(item.id)} className="rounded-xl border border-white/10 bg-[#07111a] px-4 py-3 text-sm hover:border-amber-300/30">{item.label}</button>)}{!links.length && <Empty text="No hay secciones habilitadas." />}</div></Panel>
    {role === 'waiter' && <NightclubCommissions data={data} viewerStaffId={userId} canPay={false} onPay={() => false} />}
  </div>
}

function Dashboard({ data, activeAccounts, barRounds, sales, heroUrl, isLight = false, mode: _mode = 'demo', onGo }: { data: Props['data']; activeAccounts: Props['data']['accounts']; barRounds: Array<{ id: string; sequence: number; status: string; table?: { name: string } }>; sales: number; heroUrl?: string; isLight?: boolean; mode?: 'tenant' | 'demo' | 'studio'; onGo: (module: NightclubModule) => void }) {
  const occupied = data.tables.filter(table => !!table.activeAccountId).length
  const heroStyle = isLight
    ? heroUrl
      ? { backgroundImage: `linear-gradient(90deg, rgba(255,255,255,.96), rgba(255,255,255,.70)), url(${JSON.stringify(heroUrl).slice(1,-1)})`, border: '1px solid #cbd5e1' }
      : { backgroundImage: 'radial-gradient(circle at 75% 25%, rgba(217,119,6,.14), transparent 30%), linear-gradient(120deg, #ffffff 10%, #f1f5f9 60%, #e2e8f0 100%)', border: '1px solid #cbd5e1' }
    : heroUrl
      ? { backgroundImage: `linear-gradient(90deg, rgba(5,12,19,.96), rgba(5,12,19,.52)), url(${JSON.stringify(heroUrl).slice(1,-1)})` }
      : { backgroundImage: 'radial-gradient(circle at 72% 28%, rgba(216,168,78,.18), transparent 23%), linear-gradient(120deg, #07111a 10%, #101b24 58%, #07111a 100%)' }
  return <div className="space-y-4"><section className="relative overflow-hidden rounded-2xl border border-white/10 bg-cover bg-center px-5 py-8 sm:px-7 sm:py-10" style={heroStyle}><div className="relative max-w-2xl"><p className={`text-[10px] font-bold uppercase tracking-[.24em] ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>Control del turno</p><h1 className={`mt-2 font-serif text-4xl leading-none ${isLight ? 'text-slate-900 font-semibold' : 'text-white'} sm:text-5xl`}>Operación nocturna</h1><p className={`mt-3 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Salón, rondas, inventario y caja en una sola operación.</p></div><div className="absolute right-5 top-5 hidden text-right sm:block"><span className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{new Intl.DateTimeFormat('es-BO', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}</span><strong className={`block font-serif text-2xl font-normal ${isLight ? 'text-amber-700 font-bold' : 'text-amber-300'}`}>{new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</strong></div></section><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={ReceiptText} label="Cuentas abiertas" value={String(activeAccounts.length)} /><Metric icon={LayoutGrid} label="Mesas ocupadas" value={`${occupied} / ${data.tables.length}`} /><Metric icon={GlassWater} label="Rondas en barra" value={String(barRounds.length)} /><Metric icon={BarChart3} label="Ventas del turno" value={money(sales)} /></div><div className="grid gap-4 xl:grid-cols-[1.2fr_.85fr]"><Panel title="Zonas del local" action="Ver zonas" onAction={() => onGo('floor')}><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.zones.map(zone => { const tables = data.tables.filter(table => table.zoneId === zone.id); const inUse = tables.filter(table => table.status !== 'available').length; return <button key={zone.id} onClick={() => onGo('floor')} className="rounded-xl border border-white/10 bg-[#07111a] p-3 text-left transition hover:border-amber-300/30"><div className="flex items-center justify-between"><strong className="text-sm">{zone.name}</strong><span className={`h-2 w-2 rounded-full ${inUse === tables.length && tables.length ? 'bg-amber-300' : 'bg-emerald-400'}`} /></div><span className="mt-2 block text-xs text-slate-500">{inUse}/{tables.length} en uso</span></button>})}</div></Panel><Panel title="Actividad en curso" action="Ver barra" onAction={() => onGo('bar')}><div className="space-y-2">{barRounds.slice(0, 4).map(round => <button key={round.id} onClick={() => onGo('bar')} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#07111a] p-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-300/10 text-amber-300"><GlassWater size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{round.table?.name || 'Pedido en barra'} · Ronda #{round.sequence}</strong><span className="text-xs text-slate-500">{round.status === 'pending' ? 'Pendiente' : 'En preparación'}</span></span><span className="text-[10px] font-bold text-amber-300">EN CURSO</span></button>)}{!barRounds.length && <Empty text="No hay rondas pendientes." />}</div></Panel></div><Panel title="Resumen operativo" action="Ver reportes" onAction={() => onGo('reports')}><div className="grid gap-3 sm:grid-cols-3"><Summary label="Productos activos" value={String(data.products.filter(item => item.active !== false).length)} /><Summary label="Cuentas pendientes" value={String(activeAccounts.filter(item => item.subtotal > 0).length)} /><Summary label="Reservas confirmadas" value={String(data.reservations.filter(item => item.status === 'confirmed').length)} /></div></Panel></div>
}

function Title({ title, subtitle }: { title: string; subtitle: string }) { return <header><h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-slate-400">{subtitle}</p></header> }
function Metric({ icon: Icon, label, value }: { icon: typeof Music2; label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-[#0d1720] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-300"><Icon size={18} /></span><span className="text-xs text-slate-400">{label}</span></div><strong className="mt-4 block text-2xl font-semibold">{value}</strong></div> }
function Panel({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-[#0d1720] p-4"><header className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">{title}</h2>{action && <button onClick={onAction} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs text-slate-300">{action}<ChevronRight size={13} /></button>}</header>{children}</section> }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-[#07111a] p-4"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">{text}</div> }
