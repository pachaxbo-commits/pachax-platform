import { useState, useMemo, useRef, useEffect } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Grid2X2,
  ChefHat,
  History,
  Wallet,
  Boxes,
  Package,
  Users,
  UserCheck,
  BarChart3,
  Settings,
  Printer,
  LogOut,
  Menu,
  ChevronDown,
  MoreHorizontal,
  BookOpen,
} from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { useBackButtonBridge } from '../../../hooks/useBackHandler'
import { RestaurantDashboard } from '../components/RestaurantDashboard'
import { RestaurantPOS } from '../components/RestaurantPOS'
import { RestaurantTables } from '../components/RestaurantTables'
import type { RestaurantSector, RestaurantTable } from '../types'
import type { FloorAction } from '../domain/restaurantFloor'
import { visibleTables } from '../domain/restaurantFloor'
import type { InventoryCount, InventoryShiftSnapshot, InventoryMovement, InventoryMovementType, InventoryShiftRow } from '../domain/inventoryEngine'
import { stockAwareProducts } from '../domain/inventoryEngine'
import type { CashMovement } from '../domain/cashEngine'
import { RestaurantOrders } from '../components/RestaurantOrders'
import { RestaurantKitchen } from '../components/RestaurantKitchen'
import { RestaurantHistory } from '../components/RestaurantHistory'
import { RestaurantCash } from '../components/RestaurantCash'
import { RestaurantInventory } from '../components/RestaurantInventory'
import { RestaurantProducts } from '../components/RestaurantProducts'
import { RestaurantCustomers } from '../components/RestaurantCustomers'
import type { RestaurantCustomer } from '../domain/restaurantCustomers'
import type { CustomerDraft } from '../components/RestaurantCustomerForm'
import { RestaurantUsers, type RestaurantMember, type Role } from '../components/RestaurantUsers'
import { RestaurantReports } from '../components/RestaurantReports'
import { RestaurantSettings } from '../components/RestaurantSettings'
import { RestaurantPrinters } from '../components/RestaurantPrinters'
import { RestaurantSetupGuide } from '../components/RestaurantSetupGuide'
import { RestaurantInteractiveTour } from '../components/RestaurantInteractiveTour'
import type { KitchenPrinterConfig } from '../components/kitchenPrinterConfig'
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { buildBusinessDocumentContext } from '../../../core/businessIdentity'
import { CanonicalReceiptModal } from '../../../components/receipt/CanonicalReceiptModal'
import { orderToReceiptData } from '../../../core/receiptService'
import { getActiveReceiptPrinter } from '../../../services/printing/printerBootstrap'
import { PrintEngineService } from '../../../services/printing/printEngineService'
import type { KitchenTicketJob } from '../domain/kitchenPrint'
import type { CatalogCategory, Order, OrderStatus, Product, ProductExtra } from '../../../types'
import { getRestaurantSetupSteps, mayManageRestaurantSetup, restaurantSetupGuidePreferenceKey } from '../domain/restaurantSetupGuide'
import { restaurantPosMobileTourSteps, restaurantPosTourPreferenceKey, restaurantPosTourSteps } from '../domain/restaurantPosTour'
import { buildRestaurantCounterServiceTourSteps, restaurantCounterServiceTourPreferenceKey } from '../domain/restaurantCounterServiceTour'
import { restaurantTablesMobileTourSteps, restaurantTablesTourPreferenceKey, restaurantTablesTourSteps } from '../domain/restaurantTablesTour'
import { restaurantKitchenMobileTourSteps, restaurantKitchenTourPreferenceKey, restaurantKitchenTourSteps } from '../domain/restaurantKitchenTour'
import { restaurantCashMobileTourSteps, restaurantCashTourPreferenceKey, restaurantCashTourSteps } from '../domain/restaurantCashTour'
import { restaurantProductsMobileTourSteps, restaurantProductsTourPreferenceKey, restaurantProductsTourSteps } from '../domain/restaurantProductsTour'
import { restaurantInventoryMobileTourSteps, restaurantInventoryTourPreferenceKey, restaurantInventoryTourSteps } from '../domain/restaurantInventoryTour'
import { buildRestaurantCustomersTourSteps, restaurantCustomersMobileTourSteps, restaurantCustomersTourPreferenceKey } from '../domain/restaurantCustomersTour'
import { buildRestaurantLearningTutorials, restaurantLearningTutorialIdsForProfile, restaurantTutorialStatusFromStorage, type RestaurantTutorialId, type RestaurantTutorialStatus } from '../domain/restaurantLearningCenter'
import { RestaurantLearningCenter } from '../components/RestaurantLearningCenter'

import { DEFAULT_RESTAURANT_THEME, restaurantThemeStyle, type RestaurantThemeColors } from './restaurantTheme'
import './restaurantKiosk.css'

export type RestaurantExperienceProfile = 'restaurant' | 'counter_service'

export type RestaurantModuleId =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'tables'
  | 'kitchen'
  | 'history'
  | 'cash'
  | 'inventory'
  | 'products'
  | 'customers'
  | 'users'
  | 'reports'
  | 'settings'
  | 'printers'

export interface RestaurantSession {
  tenantId: string
  restaurantName: string
  uid: string
  userName: string
  role: string
  /** Studio can simulate a role without changing its shared team session. */
  setupRole?: string
  can?: (permission: string) => boolean
}

export type RestaurantShift = {
  id: string
  openedAt: string
  openedBy: string
  openingFloat: number
  closedAt?: string
  closedBy?: string
  expectedCashAtClose?: number
  stockSnapshot?: InventoryShiftSnapshot
  inventoryCounts?: Record<string, InventoryCount>
  inventoryClosure?: { rows: InventoryShiftRow[]; countedAt: string; countedBy: string }
  reconciliation?: {
    countedCash?: number
    difference?: number
    expenses?: number
  }
}

export interface RestaurantExperienceProps {
  session: RestaurantSession
  logoUrl?: string
  companyName?: string
  orders: Order[]
  tables: RestaurantTable[]
  sectors: RestaurantSector[]
  products: Product[]
  customers?: RestaurantCustomer[]
  shift: RestaurantShift | null
  shiftHistory?: RestaurantShift[]
  isShiftOpen?: boolean
  categories?: CatalogCategory[]
  quickExtras?: ProductExtra[]

  onStartShift: (amount: number, openedAt: string, openedBy: string) => void | Promise<void>
  onCloseShift: (countedCash?: number) => boolean | Promise<boolean>
  onAddOrder: (order: Order) => boolean | Promise<boolean>
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onAdvanceItemStatus?: (orderId: string, itemId: string, status: 'preparing' | 'ready' | 'delivered') => Promise<boolean>
  onCancelOrder: (orderId: string) => Promise<boolean>
  onPayment: (orderId: string, input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }) => void | Promise<void>
  onOpenTableOrder: (table: RestaurantTable & { customerId?: string; customerName?: string; customerPhone?: string }) => void | Promise<void>
  onSaveCustomer?: (draft: CustomerDraft, id?: string) => (RestaurantCustomer | null) | Promise<RestaurantCustomer | null>
  onArchiveCustomer?: (id: string) => void | Promise<void>
  onAssignCustomer?: (orderId: string, customerId: string | undefined) => void | Promise<void>
  onUpdateTableStatus: (tableId: string, status: RestaurantTable['status']) => void | Promise<void>
  onRequestBill: (tableId: string) => void | Promise<void>
  onReopenBill: (tableId: string) => void | Promise<void>
  onAddProduct: (orderId: string, input: { productId: string; quantity: number; note: string }) => void | Promise<void>
  onPrintBatch: (orderId: string) => boolean | Promise<boolean>
  onCreateProduct: (
    tableId: string,
    input: { name: string; categoryName: string; price: number; preparationArea: string },
    orderId?: string
  ) => void | Promise<void>
  onFloorAction: (action: FloorAction) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>
  onSaveProducts?: (products: Product[]) => void | Promise<void>
  stockMovements?: InventoryMovement[]
  onInventoryMovement?: (productId: string, nextStock: number, type: Exclude<InventoryMovementType, 'sale' | 'cancellation_return' | 'command_consumption' | 'migration_reconciliation'>, reason: string) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>
  onCountInventoryItem?: (productId: string, physical: number, note?: string) => void | Promise<void>
  onCancelOrderItem?: (orderId: string, itemId: string, quantity: number) => boolean | Promise<boolean>
  onResetDemo?: () => void
  onSelectRole?: (roleId: string) => void
  onSignOut?: () => void | Promise<void>
  onOpenPrinterSettings?: () => void
  kitchenPrinterConfig?: KitchenPrinterConfig
  kitchenPrintJobs?: KitchenTicketJob[]
  onSaveKitchenPrinterConfig?: (config: KitchenPrinterConfig) => void
  onPrintKitchenTest?: () => void
  onRetryKitchenPrint?: (jobId: string) => void
  onReprintLatestKitchenTicket?: () => void
  initialModule?: RestaurantModuleId
  onModuleChange?: (module: RestaurantModuleId) => void
  themeColors?: RestaurantThemeColors
  onSaveTheme?: (colors: RestaurantThemeColors) => Promise<void> | void
  profile?: RestaurantExperienceProfile
  members?: RestaurantMember[]
  onCreateMember?: (data: { name: string; email: string; role: Role; active: boolean; password?: string }) => Promise<void> | void
  onUpdateMember?: (id: string, data: { name: string; role: Role; active: boolean }) => Promise<void> | void
  onDeleteMember?: (id: string) => Promise<void> | void
  cashMovements?: CashMovement[]
  onCreateCashMovement?: (movement: Omit<CashMovement, 'id' | 'createdAt'>) => Promise<void> | void
  onCancelCashMovement?: (movementId: string, reason?: string) => Promise<void> | void
  onUpdateCashMovement?: (movementId: string, updates: Partial<CashMovement>) => Promise<void> | void
  onArchiveProduct?: (productId: string) => Promise<void> | void
  onDeleteProduct?: (productId: string) => Promise<void> | void
  businessIdentity?: BusinessIdentity
  onSaveBusinessIdentity?: (identity: BusinessIdentity) => Promise<void> | void
  onUploadLogo?: (file: File) => Promise<string>
}

const MODULE_DEFINITIONS: Array<{
  id: RestaurantModuleId
  label: string
  icon: typeof LayoutDashboard
  roles: string[]
}> = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin', 'cashier'] },
  { id: 'pos', label: 'POS', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier', 'waiter'] },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'waiter', 'kitchen'] },
  { id: 'tables', label: 'Mesas', icon: Grid2X2, roles: ['owner', 'admin', 'cashier', 'waiter'] },
  { id: 'kitchen', label: 'Cocina', icon: ChefHat, roles: ['owner', 'admin', 'kitchen'] },
  { id: 'cash', label: 'Caja', icon: Wallet, roles: ['owner', 'admin', 'cashier'] },
  { id: 'inventory', label: 'Inventario', icon: Boxes, roles: ['owner', 'admin', 'inventory', 'kitchen'] },
  { id: 'products', label: 'Productos', icon: Package, roles: ['owner', 'admin', 'inventory'] },
  { id: 'customers', label: 'Clientes', icon: Users, roles: ['owner', 'admin', 'cashier', 'waiter'] },
  { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['owner', 'admin'] },
  { id: 'history', label: 'Historial', icon: History, roles: ['owner', 'admin', 'cashier'] },
  { id: 'users', label: 'Usuarios', icon: UserCheck, roles: ['owner', 'admin'] },
  { id: 'settings', label: 'Configuración', icon: Settings, roles: ['owner', 'admin'] },
  { id: 'printers', label: 'Impresoras', icon: Printer, roles: ['owner', 'admin', 'cashier'] },
]

const PRIMARY_MODULE_IDS: RestaurantModuleId[] = [
  'dashboard',
  'pos',
  'orders',
  'tables',
  'kitchen',
  'cash',
  'inventory',
  'products',
  'customers',
  'reports',
]

const SECONDARY_MODULE_IDS: RestaurantModuleId[] = [
  'history',
  'users',
  'settings',
  'printers',
]

export function RestaurantExperience({
  session,
  logoUrl,
  companyName,
  orders,
  tables,
  sectors,
  products,
  customers = [],
  shift,
  shiftHistory = [],
  isShiftOpen,
  categories = [],
  quickExtras = [],
  onStartShift,

  onCloseShift,
  onAddOrder,
  onAdvanceStatus,
  onAdvanceItemStatus,
  onCancelOrder,
  onPayment,
  onOpenTableOrder,
  onSaveCustomer,
  onArchiveCustomer,
  onAssignCustomer,
  onUpdateTableStatus,
  onRequestBill,
  onReopenBill,
  onAddProduct,
  onPrintBatch,
  onCreateProduct,
  onFloorAction,
  onSaveProducts,
  stockMovements = [],
  onInventoryMovement,
  onCountInventoryItem,
  onCancelOrderItem,
  onResetDemo,
  onSelectRole,
  onSignOut,
  onOpenPrinterSettings,
  kitchenPrinterConfig,
  kitchenPrintJobs,
  onSaveKitchenPrinterConfig,
  onPrintKitchenTest,
  onRetryKitchenPrint,
  onReprintLatestKitchenTicket,
  initialModule,
  onModuleChange,
  themeColors = DEFAULT_RESTAURANT_THEME,
  onSaveTheme,
  profile = 'restaurant',
  members,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
  cashMovements,
  onCreateCashMovement,
  onCancelCashMovement,
  onUpdateCashMovement,
  onArchiveProduct,
  onDeleteProduct,
  businessIdentity,
  onSaveBusinessIdentity,
  onUploadLogo,
}: RestaurantExperienceProps) {
  const isCounterService = profile === 'counter_service'
  const operationalShiftOpen = isShiftOpen !== undefined ? isShiftOpen : Boolean(shift)
  const [currentModule, setCurrentModule] = useState<RestaurantModuleId>(
    initialModule ?? (isCounterService ? 'pos' : 'dashboard')
  )
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<Order | null>(null)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isMoreDesktopOpen, setIsMoreDesktopOpen] = useState(false)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const setupGuideStorageKey = restaurantSetupGuidePreferenceKey(session.tenantId, session.uid)
  const posTourStorageKey = restaurantPosTourPreferenceKey(session.tenantId, session.uid)
  const counterPosTourStorageKey = restaurantCounterServiceTourPreferenceKey(session.tenantId, session.uid)
  const tablesTourStorageKey = restaurantTablesTourPreferenceKey(session.tenantId, session.uid)
  const kitchenTourStorageKey = restaurantKitchenTourPreferenceKey(session.tenantId, session.uid)
  const cashTourStorageKey = restaurantCashTourPreferenceKey(session.tenantId, session.uid)
  const productsTourStorageKey = restaurantProductsTourPreferenceKey(session.tenantId, session.uid)
  const inventoryTourStorageKey = restaurantInventoryTourPreferenceKey(session.tenantId, session.uid)
  const customersTourStorageKey = restaurantCustomersTourPreferenceKey(session.tenantId, session.uid)
  const learningStorageKeys: Record<RestaurantTutorialId, string> = {
    pos: posTourStorageKey,
    counter_pos: counterPosTourStorageKey,
    tables: tablesTourStorageKey,
    kitchen: kitchenTourStorageKey,
    cash: cashTourStorageKey,
    products: productsTourStorageKey,
    inventory: inventoryTourStorageKey,
    customers: customersTourStorageKey,
  }
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(setupGuideStorageKey) === null
  })
  const [isPosTourOpen, setIsPosTourOpen] = useState(false)
  const [isTablesTourOpen, setIsTablesTourOpen] = useState(false)
  const [isKitchenTourOpen, setIsKitchenTourOpen] = useState(false)
  const [isCashTourOpen, setIsCashTourOpen] = useState(false)
  const [isProductsTourOpen, setIsProductsTourOpen] = useState(false)
  const [isInventoryTourOpen, setIsInventoryTourOpen] = useState(false)
  const [isCustomersTourOpen, setIsCustomersTourOpen] = useState(false)
  const [isLearningCenterOpen, setIsLearningCenterOpen] = useState(false)
  const [learningStatuses, setLearningStatuses] = useState<Partial<Record<RestaurantTutorialId, RestaurantTutorialStatus>>>({})
  const learningCenterOriginRef = useRef(false)
  const moreDropdownRef = useRef<HTMLDivElement>(null)
  const saleProducts = useMemo(() => stockAwareProducts(products), [products])
  const fallbackCustomerManager = ['owner', 'admin', 'team'].includes(session.role)
  const canViewCustomerHistory = session.can ? session.can('orders.read') || session.can('sales.read') || session.can('cash.close') : fallbackCustomerManager
  const canManageCustomers = session.can ? session.can('customers.manage') : fallbackCustomerManager
  const canCreateCustomer = Boolean(onSaveCustomer) && (session.can ? session.can('sales.create') : true)
  const customersTourSteps = useMemo(() => buildRestaurantCustomersTourSteps({ canManage: canManageCustomers, canViewHistory: canViewCustomerHistory, canCreate: canCreateCustomer, hasCustomers: customers.length > 0, hasWhatsAppContact: customers.some((customer) => Boolean(customer.normalizedPhone)) }), [canViewCustomerHistory, canManageCustomers, canCreateCustomer, customers])

  useEffect(() => {
    if (!isSetupGuideOpen || typeof window === 'undefined') return
    if (window.localStorage.getItem(setupGuideStorageKey) === null) {
      window.localStorage.setItem(setupGuideStorageKey, 'seen')
    }
  }, [isSetupGuideOpen, setupGuideStorageKey])

  const setupRole = session.setupRole ?? session.role
  const canManageSetup = mayManageRestaurantSetup(setupRole, session.can?.('settings.manage'))
  const hasSetupAdminRole = ['owner', 'admin', 'team'].includes(setupRole)
  const readLearningStatuses = () => Object.fromEntries(
    Object.entries(learningStorageKeys).map(([id, key]) => [id, restaurantTutorialStatusFromStorage(typeof window === 'undefined' ? null : window.localStorage.getItem(key))]),
  ) as Partial<Record<RestaurantTutorialId, RestaurantTutorialStatus>>
  const openLearningCenter = () => {
    setLearningStatuses(readLearningStatuses())
    setIsLearningCenterOpen(true)
  }
  const writeTutorialStatus = (id: RestaurantTutorialId, status: RestaurantTutorialStatus) => {
    if (typeof window !== 'undefined') {
      const storageValue = status === 'in-progress' ? 'started' : status === 'not-started' ? null : status
      const key = learningStorageKeys[id]
      if (storageValue) window.localStorage.setItem(key, storageValue)
      else window.localStorage.removeItem(key)
    }
    setLearningStatuses((current) => ({ ...current, [id]: status }))
  }
  const finishLearningLaunchedTour = () => {
    if (!learningCenterOriginRef.current) return
    learningCenterOriginRef.current = false
    openLearningCenter()
  }
  const dismissTutorial = (id: RestaurantTutorialId, close: (open: boolean) => void) => {
    if (typeof window === 'undefined' || window.localStorage.getItem(learningStorageKeys[id]) !== 'completed') {
      writeTutorialStatus(id, 'skipped')
    }
    close(false)
    finishLearningLaunchedTour()
  }
  const setupSteps = useMemo(() => getRestaurantSetupSteps({
    hasBusinessIdentity: Boolean(businessIdentity?.tradeName?.trim()),
    sectors,
    tables,
    products,
    members,
    shift,
    shiftHistory,
  }), [businessIdentity?.tradeName, members, products, sectors, shift, shiftHistory, tables])
  const dismissSetupGuide = () => {
    setIsSetupGuideOpen(false)
    window.localStorage.setItem(setupGuideStorageKey, 'dismissed')
  }

  const displayName = businessIdentity?.tradeName || companyName || session.restaurantName || 'Bistró Demo'
  const effectiveLogoUrl = businessIdentity?.showLogo !== false ? (businessIdentity?.logoUrl || logoUrl) : undefined

  const documentContext = useMemo(
    () =>
      buildBusinessDocumentContext(businessIdentity, {
        companyName: displayName,
        logoUrl: effectiveLogoUrl,
        branchName: 'Principal',
      }),
    [businessIdentity, displayName, effectiveLogoUrl]
  )

  useEffect(() => {
    if (!isMoreDesktopOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(event.target as Node)) {
        setIsMoreDesktopOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreDesktopOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMoreDesktopOpen])

  // Módulos visibles según permisos canónicos de la sesión
  const visibleModules = useMemo(() => {
    const role = session.role || 'admin'
    const counterModules: RestaurantModuleId[] = [
      'pos',
      'orders',
      'kitchen',
      'cash',
      'inventory',
      'products',
      'customers',
      'users',
      'reports',
      'settings',
      'printers',
      'history',
    ]
    const modules = isCounterService
      ? MODULE_DEFINITIONS.filter((module) => counterModules.includes(module.id))
      : MODULE_DEFINITIONS

    if (session.can) {
      return modules.filter((m) => {
        switch (m.id) {
          case 'dashboard':
            return session.can!('cash.close') || session.can!('reports.read') || session.can!('settings.manage')
          case 'pos':
            return session.can!('sales.create')
          case 'orders':
            return session.can!('orders.read')
          case 'tables':
            return session.can!('orders.read')
          case 'kitchen':
            return session.can!('orders.manage')
          case 'cash':
            return session.can!('cash.close')
          case 'inventory':
            return session.can!('inventory.read')
          case 'products':
            return session.can!('products.manage')
          case 'customers':
            return session.can!('customers.read') || session.can!('customers.manage') || session.can!('settings.manage')
          case 'reports':
            return session.can!('reports.read')
          case 'history':
            return session.can!('orders.read') || session.can!('sales.read')
          case 'users':
            return session.can!('users.manage')
          case 'settings':
            return session.can!('settings.manage')
          case 'printers':
            return session.can!('settings.manage') || session.can!('orders.manage') || session.can!('cash.close')
          default:
            return false
        }
      })
    }

    if (role === 'admin' || role === 'owner' || role === 'team') {
      return modules
    }
    return modules.filter((m) => m.roles.includes(role))
  }, [session.can, session.role, isCounterService])


  const primaryModules = useMemo(() => {
    if (isCounterService) {
      const counterPrimary: RestaurantModuleId[] = ['pos', 'orders', 'kitchen', 'cash', 'inventory', 'products', 'customers']
      return visibleModules.filter((m) => counterPrimary.includes(m.id))
    }
    return visibleModules.filter((m) => PRIMARY_MODULE_IDS.includes(m.id))
  }, [visibleModules, isCounterService])

  const secondaryModules = useMemo(() => {
    if (isCounterService) {
      const counterSecondary: RestaurantModuleId[] = ['users', 'reports', 'settings', 'printers', 'history']
      return visibleModules.filter((m) => counterSecondary.includes(m.id))
    }
    return visibleModules.filter((m) => SECONDARY_MODULE_IDS.includes(m.id))
  }, [visibleModules, isCounterService])

  const activeModule = visibleModules.some((m) => m.id === currentModule)
    ? currentModule
    : visibleModules[0]?.id ?? 'dashboard'

  const isSecondaryActive = useMemo(() => {
    return secondaryModules.some((m) => m.id === activeModule)
  }, [secondaryModules, activeModule])

  useBackButtonBridge(() => {
    if (activeModule !== visibleModules[0]?.id) {
      const defaultId = visibleModules[0]?.id ?? 'dashboard'
      setCurrentModule(defaultId)
      onModuleChange?.(defaultId)
      return true
    }
    return false
  })

  const selectModule = (id: RestaurantModuleId) => {
    setIsMoreOpen(false)
    setIsMoreDesktopOpen(false)
    if (id === 'printers' && onOpenPrinterSettings) {
      onOpenPrinterSettings()
      return
    }
    setCurrentModule(id)
    onModuleChange?.(id)
    window.scrollTo({ top: 0 })
  }

  const openSetupGuide = () => {
    setIsSetupGuideOpen(true)
    window.localStorage.setItem(setupGuideStorageKey, 'seen')
    selectModule('dashboard')
  }

  const startPosTour = () => {
    const tutorialId: RestaurantTutorialId = isCounterService ? 'counter_pos' : 'pos'
    writeTutorialStatus(tutorialId, 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule(isCounterService ? 'pos' : 'dashboard')
    setIsPosTourOpen(true)
  }

  const dismissPosTour = () => {
    dismissTutorial(isCounterService ? 'counter_pos' : 'pos', setIsPosTourOpen)
  }

  const completePosTour = () => {
    writeTutorialStatus(isCounterService ? 'counter_pos' : 'pos', 'completed')
  }

  const startTablesTour = () => {
    writeTutorialStatus('tables', 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule('dashboard')
    setIsTablesTourOpen(true)
  }

  const dismissTablesTour = () => {
    dismissTutorial('tables', setIsTablesTourOpen)
  }

  const completeTablesTour = () => {
    writeTutorialStatus('tables', 'completed')
  }

  const startKitchenTour = () => {
    writeTutorialStatus('kitchen', 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule('dashboard')
    setIsKitchenTourOpen(true)
  }

  const dismissKitchenTour = () => {
    dismissTutorial('kitchen', setIsKitchenTourOpen)
  }

  const completeKitchenTour = () => {
    writeTutorialStatus('kitchen', 'completed')
  }

  const startCashTour = () => {
    writeTutorialStatus('cash', 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule('dashboard')
    setIsCashTourOpen(true)
  }

  const dismissCashTour = () => {
    dismissTutorial('cash', setIsCashTourOpen)
  }

  const completeCashTour = () => {
    writeTutorialStatus('cash', 'completed')
  }

  const startProductsTour = () => {
    writeTutorialStatus('products', 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule('dashboard')
    if (window.matchMedia('(max-width: 1023px)').matches) setIsMoreOpen(false)
    else if (secondaryModules.some((module) => module.id === 'products')) setIsMoreDesktopOpen(true)
    setIsProductsTourOpen(true)
  }

  const dismissProductsTour = () => {
    dismissTutorial('products', setIsProductsTourOpen)
  }

  const completeProductsTour = () => {
    writeTutorialStatus('products', 'completed')
  }

  const startInventoryTour = () => {
    writeTutorialStatus('inventory', 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule('dashboard')
    if (window.matchMedia('(max-width: 1023px)').matches) setIsMoreOpen(false)
    else if (secondaryModules.some((module) => module.id === 'inventory')) setIsMoreDesktopOpen(true)
    setIsInventoryTourOpen(true)
  }

  const dismissInventoryTour = () => {
    dismissTutorial('inventory', setIsInventoryTourOpen)
  }

  const completeInventoryTour = () => {
    writeTutorialStatus('inventory', 'completed')
  }

  const startCustomersTour = () => {
    writeTutorialStatus('customers', 'in-progress')
    setIsSetupGuideOpen(false)
    selectModule('dashboard')
    setIsMoreOpen(false)
    if (!window.matchMedia('(max-width: 1023px)').matches && secondaryModules.some((module) => module.id === 'customers')) setIsMoreDesktopOpen(true)
    setIsCustomersTourOpen(true)
  }

  const dismissCustomersTour = () => {
    dismissTutorial('customers', setIsCustomersTourOpen)
  }

  const completeCustomersTour = () => writeTutorialStatus('customers', 'completed')

  const roleLabel =
    session.role === 'owner'
      ? 'Dueño'
      : session.role === 'admin'
      ? 'Administración'
      : session.role === 'cashier'
      ? 'Caja'
      : session.role === 'waiter'
      ? 'Mesero'
      : session.role === 'kitchen'
      ? 'Cocina'
      : session.role === 'inventory'
      ? 'Inventario'
      : isCounterService ? 'Mostrador' : 'Restaurante'

  const canRunPosTour = visibleModules.some((module) => module.id === 'pos')
  const canRunTablesTour = visibleModules.some((module) => module.id === 'tables')
  const canRunKitchenTour = visibleModules.some((module) => module.id === 'kitchen')
  const canRunCashTour = visibleModules.some((module) => module.id === 'cash')
  const canRunProductsTour = visibleModules.some((module) => module.id === 'products')
  const canRunInventoryTour = visibleModules.some((module) => module.id === 'inventory')
  const canRunCustomersTour = visibleModules.some((module) => module.id === 'customers')
  const availableLearningIds: RestaurantTutorialId[] = restaurantLearningTutorialIdsForProfile([
    ...(canRunPosTour ? ['pos' as const] : []),
    ...(canRunTablesTour ? ['tables' as const] : []),
    ...(canRunKitchenTour ? ['kitchen' as const] : []),
    ...(canRunCashTour ? ['cash' as const] : []),
    ...(canRunProductsTour ? ['products' as const] : []),
    ...(canRunInventoryTour ? ['inventory' as const] : []),
    ...(canRunCustomersTour ? ['customers' as const] : []),
  ], isCounterService ? 'counter_service' : 'restaurant')
  const learningTutorials = buildRestaurantLearningTutorials(availableLearningIds, learningStatuses)
  const counterServiceTour = useMemo(() => buildRestaurantCounterServiceTourSteps({
    canViewKitchen: canRunKitchenTour,
    canViewOrders: visibleModules.some((module) => module.id === 'orders'),
    canViewHistory: visibleModules.some((module) => module.id === 'history'),
  }), [canRunKitchenTour, visibleModules])
  const canOpenSetupFromLearning = !isCounterService && hasSetupAdminRole && canManageSetup
  const showLearningCenter = learningTutorials.length > 0 || canOpenSetupFromLearning
  const startTutorialFromLearning = (id: RestaurantTutorialId) => {
    const startById: Record<RestaurantTutorialId, () => void> = {
      pos: startPosTour,
      counter_pos: startPosTour,
      tables: startTablesTour,
      kitchen: startKitchenTour,
      cash: startCashTour,
      products: startProductsTour,
      inventory: startInventoryTour,
      customers: startCustomersTour,
    }
    learningCenterOriginRef.current = true
    setIsLearningCenterOpen(false)
    startById[id]()
  }
  const openSetupGuideFromLearning = () => {
    learningCenterOriginRef.current = false
    setIsLearningCenterOpen(false)
    openSetupGuide()
  }
  const startAvailableTour = activeModule === 'tables' && canRunTablesTour
    ? startTablesTour
    : activeModule === 'kitchen' && canRunKitchenTour
      ? startKitchenTour
      : activeModule === 'cash' && canRunCashTour
        ? startCashTour
        : activeModule === 'products' && canRunProductsTour
          ? startProductsTour
          : activeModule === 'inventory' && canRunInventoryTour
            ? startInventoryTour
            : activeModule === 'customers' && canRunCustomersTour
              ? startCustomersTour
            : canRunPosTour
              ? startPosTour
              : canRunTablesTour
                ? startTablesTour
                : canRunKitchenTour
                  ? startKitchenTour
                  : canRunCashTour
                    ? startCashTour
                    : canRunProductsTour
                      ? startProductsTour
                      : canRunInventoryTour
                        ? startInventoryTour
                        : startCustomersTour

  return (
    <div
      className="restaurant-shell flex min-h-[100dvh] w-full min-w-0 flex-col"
      style={restaurantThemeStyle(themeColors)}
    >
      <header className={`restaurant-header ${isCounterService ? 'is-counter-service' : ''}`}>
        <div className="restaurant-header-inner">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={effectiveLogoUrl || '/brand/pachax-logo.png'}
              alt={displayName}
              className="h-9 w-11 shrink-0 object-contain rounded-md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="truncate text-sm font-extrabold leading-tight tracking-tight text-slate-900 sm:text-base">
                  {displayName}
                </h1>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-slate-500 sm:text-[11px]">
                {roleLabel} · {session.userName}
              </p>
            </div>
          </div>
          <div className="restaurant-header-actions">
            <span className={`restaurant-shift-status ${operationalShiftOpen ? 'is-open' : 'is-closed'}`}>
              {operationalShiftOpen ? 'Turno abierto' : 'Turno cerrado'}
            </span>

            {!isCounterService && hasSetupAdminRole && canManageSetup && (
              <button
                type="button"
                onClick={openSetupGuide}
                className="restaurant-header-setup inline-flex rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Guía inicial
              </button>
            )}
            {(canRunPosTour || canRunTablesTour || canRunKitchenTour || canRunCashTour || canRunProductsTour || canRunInventoryTour || canRunCustomersTour) && (
              <button
                type="button"
                onClick={startAvailableTour}
                className="restaurant-header-tour inline-flex rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                ¿Cómo funciona?
              </button>
            )}
            {showLearningCenter && <button
              type="button"
              onClick={openLearningCenter}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              aria-haspopup="dialog"
              aria-label="Abrir Centro de aprendizaje"
              title="Aprender a usar PACHAX"
            ><BookOpen size={14} /><span className="hidden sm:inline">Aprender</span></button>}

            {onSignOut && (
              <button
                type="button"
                onClick={() => setIsSignOutOpen(true)}
                className="restaurant-signout-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition"
                title="Cerrar sesión"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            )}
            <button
              type="button"
              className="restaurant-menu-toggle"
              data-tour="restaurant-menu-toggle"
              aria-label="Abrir menú"
              aria-expanded={isMoreOpen}
              onClick={() => setIsMoreOpen(true)}
            >
              <Menu size={19} />
              <span>Menú</span>
            </button>
          </div>
        </div>

        {/* Navegación de escritorio: SIEMPRE VISIBLE y fija bajo el header en PC */}
        <nav
          aria-label={isCounterService ? 'Secciones de Mostrador' : 'Navegación principal de restaurante'}
          className="restaurant-desktop-nav-bar"
        >
          <div className="restaurant-nav-items-container">
            {primaryModules.map((module) => {
              const Icon = module.icon
              const isActive = module.id === activeModule
              return (
                <button
                  key={module.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => selectModule(module.id)}
                  className={`restaurant-nav-btn ${isActive ? 'is-active' : ''}`}
                  data-tour={module.id === 'pos' ? 'restaurant-nav-pos' : module.id === 'orders' ? 'restaurant-nav-orders' : module.id === 'tables' ? 'restaurant-nav-tables' : module.id === 'kitchen' ? 'restaurant-nav-kitchen' : module.id === 'cash' ? 'restaurant-nav-cash' : module.id === 'products' ? 'restaurant-nav-products' : module.id === 'inventory' ? 'restaurant-nav-inventory' : module.id === 'customers' ? 'restaurant-nav-customers' : undefined}
                >
                  <Icon size={15} />
                  <span>{module.label}</span>
                </button>
              )
            })}

            {secondaryModules.length > 0 && (
              <div className="restaurant-more-container relative" ref={moreDropdownRef}>
                <button
                  type="button"
                  data-tour="restaurant-nav-more"
                  onClick={() => setIsMoreDesktopOpen((prev) => !prev)}
                  className={`restaurant-nav-btn restaurant-nav-more ${isSecondaryActive ? 'is-active' : ''}`}
                  aria-expanded={isMoreDesktopOpen}
                  aria-haspopup="true"
                >
                  <MoreHorizontal size={15} />
                  <span>Más</span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-150 ${isMoreDesktopOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isMoreDesktopOpen && (
                  <div className="restaurant-more-dropdown shadow-xl">
                    {secondaryModules.map((module) => {
                      const Icon = module.icon
                      const isActive = module.id === activeModule
                      return (
                        <button
                          key={module.id}
                          type="button"
                          onClick={() => {
                            setIsMoreDesktopOpen(false)
                            selectModule(module.id)
                          }}
                          className={`restaurant-dropdown-item ${isActive ? 'is-active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          data-tour={module.id === 'products' ? 'restaurant-nav-products' : module.id === 'inventory' ? 'restaurant-nav-inventory' : module.id === 'customers' ? 'restaurant-nav-customers' : module.id === 'history' ? 'restaurant-nav-history' : undefined}
                        >
                          <Icon size={15} />
                          <span>{module.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>
      </header>
      <div className="restaurant-workspace">
        <main className="restaurant-main" id="restaurant-main-content">
          {!isCounterService && hasSetupAdminRole && canManageSetup && isSetupGuideOpen && activeModule === 'dashboard' && (
            <RestaurantSetupGuide
              steps={setupSteps}
              onNavigate={selectModule}
              onDismiss={dismissSetupGuide}
              onStartPosTour={canRunPosTour ? startPosTour : undefined}
            />
          )}
          {activeModule === 'dashboard' && (
            <RestaurantDashboard
              orders={orders}
              tables={tables}
              shift={shift}
              userName={session.userName}
              onStartShift={onStartShift}
              onCloseShift={onCloseShift}
              onNavigate={(module) => selectModule(module as RestaurantModuleId)}
              onOpenTable={(table) => {
                setSelectedTableId(table.id)
                selectModule('tables')
              }}
            />
          )}
          {activeModule === 'pos' && (
            <RestaurantPOS
              categories={categories}
              products={saleProducts}
              quickExtras={quickExtras}
              orders={orders}
              onAddOrder={onAddOrder}
              onSetOrderStatus={onAdvanceStatus}
              onConfirmPayment={onPayment}
              onCancelOrder={onCancelOrder}
              userRole={session.role}
              userName={session.userName}
              userId={session.uid}
              enabled={operationalShiftOpen}
              tables={visibleTables(tables)}

              customers={customers}

              counterServiceMode={isCounterService}
            />
          )}
          {activeModule === 'tables' && (
            <RestaurantTables
              tables={tables}
              sectors={sectors}
              canManageFloor={session.can ? session.can('settings.manage') : ['owner', 'admin', 'team'].includes(session.role)}
              onStartTour={canRunTablesTour ? startTablesTour : undefined}
              onFloorAction={onFloorAction}
              orders={orders}
              initialTableId={selectedTableId}
              enabled={operationalShiftOpen}

              products={saleProducts}
              customers={customers}
              onSaveCustomer={onSaveCustomer}
              onAssignCustomer={onAssignCustomer}
              onOpenTableOrder={onOpenTableOrder}
              onUpdateTableStatus={onUpdateTableStatus}
              onRequestBill={onRequestBill}
              onReopenBill={onReopenBill}
              onPayment={onPayment}
              onAddProduct={onAddProduct}
              onPrintBatch={onPrintBatch}
              onCancelOrderItem={onCancelOrderItem}
              onCreateProduct={onCreateProduct}
            />
          )}
          {activeModule === 'orders' && (
            <RestaurantOrders
              orders={orders}
              onAdvanceStatus={onAdvanceStatus}
              onViewReceipt={(order) => setViewingReceiptOrder(order)}
            />
          )}
          {activeModule === 'kitchen' && (
            <RestaurantKitchen orders={orders} onAdvanceStatus={onAdvanceStatus} onAdvanceItemStatus={onAdvanceItemStatus} onStartTour={canRunKitchenTour ? startKitchenTour : undefined} />
          )}
          {activeModule === 'history' && (
            <RestaurantHistory orders={orders} shiftHistory={shiftHistory} onAdvanceStatus={onAdvanceStatus} onCancelOrder={onCancelOrder} />
          )}
          {activeModule === 'cash' && (
            <RestaurantCash
              shift={shift}
              orders={orders}
              tables={tables}
              userName={session.userName}
              restaurantName={displayName}
              onStartShift={onStartShift}
              onCloseShift={onCloseShift}
              products={products}
              stockMovements={stockMovements}
              onCountInventoryItem={onCountInventoryItem}
              onViewTables={() => selectModule('tables')}
              movements={cashMovements}
              staffMembers={members}
              onCreateMovement={onCreateCashMovement}
              onCancelMovement={onCancelCashMovement}
              onUpdateMovement={onUpdateCashMovement}
              onStartTour={canRunCashTour ? startCashTour : undefined}
            />
          )}
          {activeModule === 'inventory' && <RestaurantInventory products={products} catalogCategories={categories} shift={shift} movements={stockMovements} onInventoryMovement={onInventoryMovement} onSaveProducts={onSaveProducts || (() => {})} onStartTour={canRunInventoryTour ? startInventoryTour : undefined} />}
          {activeModule === 'products' && (
            <RestaurantProducts
              categories={categories}
              products={products}
              orders={orders}
              onSaveProducts={onSaveProducts || (() => {})}
              onArchiveProduct={onArchiveProduct}
              onDeleteProduct={onDeleteProduct}
              onStartTour={canRunProductsTour ? startProductsTour : undefined}
            />
          )}
          {activeModule === 'customers' && <RestaurantCustomers orders={orders} customers={customers} restaurantName={displayName} canManage={canManageCustomers} canViewHistory={canViewCustomerHistory} canCreateCustomer={canCreateCustomer} onSaveCustomer={onSaveCustomer} onArchiveCustomer={onArchiveCustomer} onStartTour={canRunCustomersTour ? startCustomersTour : undefined} />}
          {activeModule === 'users' && (
            <RestaurantUsers
              currentRole={session.role}
              onSelectRole={onSelectRole}
              members={members}
              onCreateMember={onCreateMember}
              onUpdateMember={onUpdateMember}
              onDeleteMember={onDeleteMember}
            />
          )}
          {activeModule === 'reports' && <RestaurantReports orders={orders} shift={shift} stockMovements={stockMovements} />}
          {activeModule === 'settings' && (
            <RestaurantSettings
              key={`${themeColors.primary}:${themeColors.accent}`}
              onResetDemo={onResetDemo}
              themeColors={themeColors}
              onSaveTheme={onSaveTheme}
              tables={tables}
              sectors={sectors}
              onFloorAction={onFloorAction}
              isCounterService={isCounterService}
              businessIdentity={businessIdentity}
              onSaveBusinessIdentity={onSaveBusinessIdentity}
              onUploadLogo={onUploadLogo}
              canManage={['owner', 'admin'].includes(session.role)}
            />
          )}
          {activeModule === 'printers' && <RestaurantPrinters tenantId={session.tenantId} branchId="main" config={kitchenPrinterConfig} jobs={kitchenPrintJobs} onSave={onSaveKitchenPrinterConfig} onPrintTest={onPrintKitchenTest} onRetry={onRetryKitchenPrint} onReprintLatest={onReprintLatestKitchenTicket} />}
        </main>
      </div>

      {/* Modal de Cerrar sesión */}
      {onSignOut && (
        <Modal
          isOpen={isSignOutOpen}
          onClose={() => setIsSignOutOpen(false)}
          title="Cerrar sesión"
          footer={
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsSignOutOpen(false)}
                className="min-h-[44px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
              >
                Seguir trabajando
              </button>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="min-h-[44px] rounded-2xl px-4 text-sm font-extrabold"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                Cerrar sesión
              </button>
            </div>
          }
        >
          <p className="text-sm font-semibold text-slate-700">
            ¿Deseas cerrar tu sesión actual?
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">
            Asegúrate de haber cerrado el turno o guardado tus operaciones antes de salir.
          </p>
        </Modal>
      )}

      <Modal isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} title="Menú del restaurante" subtitle={`${displayName} · ${roleLabel} · ${session.userName}`}>
        <div className="restaurant-mobile-menu-grid">
          {visibleModules.map((m) => {
            const Icon = m.icon
            const isActive = m.id === activeModule
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectModule(m.id)}
                aria-current={isActive ? 'page' : undefined}
                data-tour={m.id === 'pos' ? 'restaurant-mobile-nav-pos' : m.id === 'orders' ? 'restaurant-mobile-nav-orders' : m.id === 'tables' ? 'restaurant-mobile-nav-tables' : m.id === 'kitchen' ? 'restaurant-mobile-nav-kitchen' : m.id === 'cash' ? 'restaurant-mobile-nav-cash' : m.id === 'products' ? 'restaurant-mobile-nav-products' : m.id === 'inventory' ? 'restaurant-mobile-nav-inventory' : m.id === 'customers' ? 'restaurant-mobile-nav-customers' : m.id === 'history' ? 'restaurant-mobile-nav-history' : undefined}
                className={`flex min-h-[56px] items-center gap-2.5 rounded-2xl border px-3 text-left text-xs font-extrabold ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0 break-words leading-tight">{m.label}</span>
              </button>
            )
          })}
          {onSignOut && (
            <button
              type="button"
              onClick={() => {
                setIsMoreOpen(false)
                setIsSignOutOpen(true)
              }}
              className="flex min-h-[56px] items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-left text-xs font-extrabold text-rose-700"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600">
                <LogOut size={16} />
              </span>
              Cerrar sesión
            </button>
          )}
        </div>
      </Modal>

      {isPosTourOpen && (
        <RestaurantInteractiveTour
          steps={isCounterService ? counterServiceTour.steps : restaurantPosTourSteps}
          mobileSteps={isCounterService ? counterServiceTour.mobileSteps : restaurantPosMobileTourSteps}
          activeModule={activeModule}
          tourLabel={isCounterService ? 'Tutorial Restaurante Rápido' : 'Tutorial POS'}
          onDismiss={dismissPosTour}
          onComplete={completePosTour}
        />
      )}

      {isTablesTourOpen && (
        <RestaurantInteractiveTour
          steps={restaurantTablesTourSteps}
          mobileSteps={restaurantTablesMobileTourSteps}
          activeModule={activeModule}
          tourLabel="Tutorial Mesas"
          onDismiss={dismissTablesTour}
          onComplete={completeTablesTour}
        />
      )}

      {isKitchenTourOpen && (
        <RestaurantInteractiveTour
          steps={restaurantKitchenTourSteps}
          mobileSteps={restaurantKitchenMobileTourSteps}
          activeModule={activeModule}
          tourLabel="Tutorial Cocina"
          onDismiss={dismissKitchenTour}
          onComplete={completeKitchenTour}
        />
      )}

      {isCashTourOpen && (
        <RestaurantInteractiveTour
          steps={restaurantCashTourSteps}
          mobileSteps={restaurantCashMobileTourSteps}
          activeModule={activeModule}
          tourLabel="Tutorial Caja"
          onDismiss={dismissCashTour}
          onComplete={completeCashTour}
        />
      )}

      {isProductsTourOpen && (
        <RestaurantInteractiveTour
          steps={restaurantProductsTourSteps}
          mobileSteps={restaurantProductsMobileTourSteps}
          activeModule={activeModule}
          tourLabel="Tutorial Productos"
          onDismiss={dismissProductsTour}
          onComplete={completeProductsTour}
        />
      )}

      {isInventoryTourOpen && (
        <RestaurantInteractiveTour
          steps={restaurantInventoryTourSteps}
          mobileSteps={restaurantInventoryMobileTourSteps}
          activeModule={activeModule}
          tourLabel="Tutorial Inventario"
          onDismiss={dismissInventoryTour}
          onComplete={completeInventoryTour}
        />
      )}

      {isCustomersTourOpen && (
        <RestaurantInteractiveTour
          steps={customersTourSteps}
          mobileSteps={restaurantCustomersMobileTourSteps(customersTourSteps)}
          activeModule={activeModule}
          tourLabel="Tutorial Clientes"
          onDismiss={dismissCustomersTour}
          onComplete={completeCustomersTour}
        />
      )}

      <RestaurantLearningCenter
        isOpen={isLearningCenterOpen}
        tutorials={learningTutorials}
        canOpenSetupGuide={canOpenSetupFromLearning}
        onClose={() => setIsLearningCenterOpen(false)}
        onStartTutorial={startTutorialFromLearning}
        onOpenSetupGuide={openSetupGuideFromLearning}
      />

      {viewingReceiptOrder && (
        <CanonicalReceiptModal
          isOpen={!!viewingReceiptOrder}
          onClose={() => setViewingReceiptOrder(null)}
          receiptData={orderToReceiptData(
            viewingReceiptOrder,
            customers.find((c) => c.id === viewingReceiptOrder.customerId)
          )}
          documentContext={documentContext}
          onPrint={async () => {
            const printer = getActiveReceiptPrinter(session.tenantId, 'main')
            if (printer) {
              await PrintEngineService.getInstance().submitPrintRequest({
                targetType: 'receipt',
                orderId: viewingReceiptOrder.id,
                printerProfileId: printer.id,
                payload: {
                  payloadSchemaVersion: 1,
                  templateVersion: '1.0',
                  restaurantName: documentContext.companyName,
                  branchName: documentContext.branchName || 'Principal',
                  branchAddress: documentContext.address,
                  branchPhone: documentContext.phone,
                  logoUrl: documentContext.logoUrl,
                  headerDetails: documentContext.formattedHeaderLines,
                  orderId: viewingReceiptOrder.id,
                  displayNumber: viewingReceiptOrder.displayNumber || viewingReceiptOrder.id.slice(-6).toUpperCase(),
                  customerName: viewingReceiptOrder.customerName,
                  customerPhone: viewingReceiptOrder.customerPhone,
                  deliveryAddress: viewingReceiptOrder.deliveryAddress,
                  items: viewingReceiptOrder.items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    basePrice: item.basePrice ?? (item.lineTotal / (item.quantity || 1)),
                    quantity: item.quantity,
                    lineTotal: item.lineTotal,
                    modifiersText: Array.isArray(item.modifiers)
                      ? item.modifiers
                      : item.modifiers?.note
                      ? [item.modifiers.note]
                      : undefined,
                    note: typeof item.modifiers?.note === 'string' ? item.modifiers.note : undefined,
                  })),
                  subtotal: viewingReceiptOrder.productSubtotal ?? viewingReceiptOrder.total,
                  discountTotal: 0,
                  taxTotal: 0,
                  deliveryFee: viewingReceiptOrder.deliveryFee || 0,
                  grandTotal: viewingReceiptOrder.total,
                  paymentMethod: viewingReceiptOrder.paymentMethod || 'PAGADO',
                  footerMessage: documentContext.receiptFooter,
                  showManagedBy: documentContext.showManagedBy,
                  isCopy: false,
                  copies: 1,
                  createdIso: new Date().toISOString(),
                },
              })
            }
          }}
        />
      )}
    </div>
  )
}
