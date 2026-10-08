import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { useBackButtonBridge } from '../../../hooks/useBackHandler'
import { RestaurantDashboard } from '../../../demo/restaurant/RestaurantDashboard'
import { RestaurantPOS } from '../../../demo/restaurant/RestaurantPOS'
import { RestaurantTables } from '../../../demo/restaurant/RestaurantTables'
import type { RestaurantSector } from '../../../demo/mocks/restaurantMock'
import type { FloorAction } from '../domain/restaurantFloor'
import { visibleTables } from '../domain/restaurantFloor'
import type { InventoryCount, InventoryShiftSnapshot, InventoryMovement, InventoryMovementType, InventoryShiftRow } from '../domain/inventoryEngine'
import { stockAwareProducts } from '../domain/inventoryEngine'
import { RestaurantOrders } from '../../../demo/restaurant/RestaurantOrders'
import { RestaurantKitchen } from '../../../demo/restaurant/RestaurantKitchen'
import { RestaurantHistory } from '../../../demo/restaurant/RestaurantHistory'
import { RestaurantCash } from '../../../demo/restaurant/RestaurantCash'
import { RestaurantInventory } from '../../../demo/restaurant/RestaurantInventory'
import { RestaurantProducts } from '../../../demo/restaurant/RestaurantProducts'
import { RestaurantCustomers } from '../../../demo/restaurant/RestaurantCustomers'
import type { RestaurantCustomer } from '../domain/restaurantCustomers'
import type { CustomerDraft } from '../../../demo/restaurant/RestaurantCustomerForm'
import { RestaurantUsers } from '../../../demo/restaurant/RestaurantUsers'
import { RestaurantReports } from '../../../demo/restaurant/RestaurantReports'
import { RestaurantSettings } from '../../../demo/restaurant/RestaurantSettings'
import { RestaurantPrinters } from '../../../demo/restaurant/RestaurantPrinters'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_EXTRAS,
  type RestaurantTable,
} from '../../../demo/mocks/restaurantMock'
import type { Order, OrderStatus, Product } from '../../../types'
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
  categories?: typeof RESTAURANT_CATEGORIES
  quickExtras?: typeof RESTAURANT_EXTRAS
  onStartShift: (amount: number, openedAt: string, openedBy: string) => void
  onCloseShift: (countedCash?: number) => boolean
  onAddOrder: (order: Order) => boolean
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onAdvanceItemStatus?: (orderId: string, itemId: string, status: 'preparing' | 'ready' | 'delivered') => Promise<boolean>
  onCancelOrder: (orderId: string) => Promise<boolean>
  onPayment: (orderId: string, input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }) => void
  onOpenTableOrder: (table: RestaurantTable & { customerId?: string; customerName?: string; customerPhone?: string }) => void
  onSaveCustomer?: (draft: CustomerDraft, id?: string) => RestaurantCustomer | null
  onArchiveCustomer?: (id: string) => void
  onAssignCustomer?: (orderId: string, customerId: string | undefined) => void
  onUpdateTableStatus: (tableId: string, status: RestaurantTable['status']) => void
  onRequestBill: (tableId: string) => void
  onReopenBill: (tableId: string) => void
  onAddProduct: (orderId: string, input: { productId: string; quantity: number; note: string }) => void
  onPrintBatch: (orderId: string) => boolean
  onCreateProduct: (
    tableId: string,
    input: { name: string; categoryName: string; price: number; preparationArea: string },
    orderId?: string
  ) => void
  onFloorAction: (action: FloorAction) => { ok: boolean; error?: string }
  onSaveProducts?: (products: Product[]) => void
  stockMovements?: InventoryMovement[]
  onInventoryMovement?: (productId: string, nextStock: number, type: Exclude<InventoryMovementType, 'sale' | 'cancellation_return' | 'command_consumption' | 'migration_reconciliation'>, reason: string) => { ok: boolean; error?: string }
  onCountInventoryItem?: (productId: string, physical: number, note?: string) => void
  onCancelOrderItem?: (orderId: string, itemId: string, quantity: number) => boolean
  onResetDemo?: () => void
  onSelectRole?: (roleId: string) => void
  onSignOut?: () => void | Promise<void>
  onOpenPrinterSettings?: () => void
  initialModule?: RestaurantModuleId
  onModuleChange?: (module: RestaurantModuleId) => void
  themeColors?: RestaurantThemeColors
  onSaveTheme?: (colors: RestaurantThemeColors) => Promise<void> | void
  profile?: RestaurantExperienceProfile
}

const MODULE_DEFINITIONS: Array<{
  id: RestaurantModuleId
  label: string
  icon: typeof LayoutDashboard
  roles: string[]
}> = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin', 'cashier'] },
  { id: 'pos', label: 'POS / Caja', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier', 'waiter'] },
  { id: 'orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'waiter', 'kitchen'] },
  { id: 'tables', label: 'Mesas', icon: Grid2X2, roles: ['owner', 'admin', 'cashier', 'waiter'] },
  { id: 'kitchen', label: 'Cocina', icon: ChefHat, roles: ['owner', 'admin', 'kitchen'] },
  { id: 'history', label: 'Historial', icon: History, roles: ['owner', 'admin', 'cashier'] },
  { id: 'cash', label: 'Caja / Turnos', icon: Wallet, roles: ['owner', 'admin', 'cashier'] },
  { id: 'inventory', label: 'Inventario', icon: Boxes, roles: ['owner', 'admin', 'inventory', 'kitchen'] },
  { id: 'products', label: 'Productos', icon: Package, roles: ['owner', 'admin', 'inventory'] },
  { id: 'customers', label: 'Clientes', icon: Users, roles: ['owner', 'admin', 'cashier', 'waiter'] },
  { id: 'users', label: 'Usuarios', icon: UserCheck, roles: ['owner', 'admin'] },
  { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['owner', 'admin'] },
  { id: 'settings', label: 'Configuración', icon: Settings, roles: ['owner', 'admin'] },
  { id: 'printers', label: 'Impresoras', icon: Printer, roles: ['owner', 'admin', 'cashier'] },
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
  categories = RESTAURANT_CATEGORIES,
  quickExtras = RESTAURANT_EXTRAS,
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
  initialModule,
  onModuleChange,
  themeColors = DEFAULT_RESTAURANT_THEME,
  onSaveTheme,
  profile = 'restaurant',
}: RestaurantExperienceProps) {
  const isCounterService = profile === 'counter_service'
  const [currentModule, setCurrentModule] = useState<RestaurantModuleId>(
    initialModule ?? (isCounterService ? 'pos' : 'dashboard')
  )
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isDesktopNavOpen, setIsDesktopNavOpen] = useState(false)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const saleProducts = useMemo(() => stockAwareProducts(products), [products])

  // Módulos visibles según el rol del usuario (o todos en admin/owner/team)
  const visibleModules = useMemo(() => {
    const role = session.role || 'admin'
    const modules = isCounterService
      ? MODULE_DEFINITIONS.filter((module) => ['pos', 'cash', 'kitchen', 'customers', 'inventory', 'products', 'history'].includes(module.id))
      : MODULE_DEFINITIONS
    if (role === 'admin' || role === 'owner' || role === 'team') {
      return modules
    }
    return modules.filter((m) => m.roles.includes(role))
  }, [session.role, isCounterService])

  const activeModule = visibleModules.some((m) => m.id === currentModule)
    ? currentModule
    : visibleModules[0]?.id ?? 'dashboard'

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
    setIsDesktopNavOpen(false)
    if (id === 'printers' && onOpenPrinterSettings) {
      onOpenPrinterSettings()
      return
    }
    setCurrentModule(id)
    onModuleChange?.(id)
    window.scrollTo({ top: 0 })
  }

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

  const displayName = companyName || session.restaurantName || 'Bistró Demo'

  return (
    <div
      className="restaurant-shell flex min-h-[100dvh] w-full min-w-0 flex-col"
      style={restaurantThemeStyle(themeColors)}
    >
      <header className="restaurant-header">
        <div className="restaurant-nav-hotspot" onMouseEnter={() => setIsDesktopNavOpen(true)} aria-hidden="true" />
        <div className="restaurant-header-inner">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={logoUrl || '/brand/pachax-logo.png'}
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
            <span className={`restaurant-shift-status ${shift ? 'is-open' : 'is-closed'}`}>
              {shift ? 'Turno abierto' : 'Turno cerrado'}
            </span>
            <button type="button" className="restaurant-menu-toggle" aria-label="Abrir menú" aria-expanded={isDesktopNavOpen || isMoreOpen} onClick={() => { if (window.matchMedia('(min-width: 1024px)').matches) setIsDesktopNavOpen(value => !value); else setIsMoreOpen(true) }}>
              <Menu size={19} /><span>Menú</span>
            </button>
          </div>
        </div>
        <nav
          aria-label={isCounterService ? 'Secciones de Hamburgueser\u00eda' : 'Secciones de Restaurante'}
          className={`restaurant-top-navigation ${isDesktopNavOpen ? 'is-open' : ''}`}
          onMouseEnter={() => setIsDesktopNavOpen(true)}
          onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setIsDesktopNavOpen(false) }}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDesktopNavOpen(false) }}
          onKeyDown={(event) => { if (event.key === 'Escape') { setIsDesktopNavOpen(false); document.querySelector<HTMLButtonElement>('.restaurant-menu-toggle')?.focus() } }}
        >
          {visibleModules.map((module) => {
            const Icon = module.icon
            return <button key={module.id} type="button" tabIndex={isDesktopNavOpen ? 0 : -1} aria-current={module.id === activeModule ? 'page' : undefined} onClick={() => selectModule(module.id)} className={module.id === activeModule ? 'is-active' : ''}><Icon size={18} /><span>{module.label}</span></button>
          })}
          {onSignOut && <button type="button" tabIndex={isDesktopNavOpen ? 0 : -1} onClick={() => { setIsDesktopNavOpen(false); setIsSignOutOpen(true) }}><LogOut size={18} /><span>Salir</span></button>}
        </nav>
      </header>
      <div className="restaurant-workspace">
        <main className="restaurant-main" id="restaurant-main-content">
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
              enabled={!!shift}
              tables={isCounterService ? [] : visibleTables(tables)}

              customers={customers}

              counterServiceMode={isCounterService}
            />
          )}
          {activeModule === 'tables' && (
            <RestaurantTables
              tables={tables}
              sectors={sectors}
              canManageFloor={['owner', 'admin', 'team'].includes(session.role)}
              onFloorAction={onFloorAction}
              orders={orders}
              initialTableId={selectedTableId}
              enabled={!!shift}
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
            <RestaurantOrders orders={orders} onAdvanceStatus={onAdvanceStatus} />
          )}
          {activeModule === 'kitchen' && (
            <RestaurantKitchen orders={orders} onAdvanceStatus={onAdvanceStatus} onAdvanceItemStatus={onAdvanceItemStatus} />
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
            />
          )}
          {activeModule === 'inventory' && <RestaurantInventory products={products} catalogCategories={categories} shift={shift} movements={stockMovements} onInventoryMovement={onInventoryMovement} onSaveProducts={onSaveProducts || (() => {})} />}
          {activeModule === 'products' && (
            <RestaurantProducts
              categories={categories}
              products={products}
              orders={orders}
              onSaveProducts={onSaveProducts || (() => {})}
            />
          )}
          {activeModule === 'customers' && <RestaurantCustomers orders={orders} customers={customers} restaurantName={displayName} canManage={['owner', 'admin', 'team'].includes(session.role)} onSaveCustomer={onSaveCustomer} onArchiveCustomer={onArchiveCustomer} />}
          {activeModule === 'users' && (
            <RestaurantUsers currentRole={session.role} onSelectRole={onSelectRole} />
          )}
          {activeModule === 'reports' && <RestaurantReports orders={orders} shift={shift} stockMovements={stockMovements} />}
          {activeModule === 'settings' && <RestaurantSettings key={`${themeColors.primary}:${themeColors.accent}`} onResetDemo={onResetDemo} themeColors={themeColors} onSaveTheme={onSaveTheme} />}
          {activeModule === 'printers' && <RestaurantPrinters />}
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
    </div>
  )
}
