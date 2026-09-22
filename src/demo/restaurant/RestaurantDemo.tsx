import { useState } from 'react'
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
} from 'lucide-react'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_PRODUCTS,
  RESTAURANT_EXTRAS,
  INITIAL_TABLES,
  INITIAL_RESTAURANT_ORDERS,
  type RestaurantTable,
} from '../mocks/restaurantMock'
import type { Order, OrderStatus } from '../../types'
import { RestaurantDashboard } from './RestaurantDashboard'
import { RestaurantPOS } from './RestaurantPOS'
import { RestaurantTables } from './RestaurantTables'
import { RestaurantOrders } from './RestaurantOrders'
import { RestaurantKitchen } from './RestaurantKitchen'
import { RestaurantHistory } from './RestaurantHistory'
import { RestaurantCash } from './RestaurantCash'
import { RestaurantInventory } from './RestaurantInventory'
import { RestaurantProducts } from './RestaurantProducts'
import { RestaurantCustomers } from './RestaurantCustomers'
import { RestaurantUsers } from './RestaurantUsers'
import { RestaurantReports } from './RestaurantReports'
import { RestaurantSettings } from './RestaurantSettings'
import { RestaurantPrinters } from './RestaurantPrinters'

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

const RESTAURANT_MODULES = [
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
] as const

export function RestaurantDemo({
  mode = 'team',
  simulatedRole = 'admin',
  onSelectRole,
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
}) {
  const [activeModule, setActiveModule] = useState<RestaurantModuleId>('dashboard')
  const [orders, setOrders] = useState<Order[]>(INITIAL_RESTAURANT_ORDERS)
  const [tables, setTables] = useState<RestaurantTable[]>(INITIAL_TABLES)
  const [products, setProducts] = useState(RESTAURANT_PRODUCTS)

  // In 'team' mode: show all modules. In 'simulated_role' mode: filter by role.
  const visibleModules = RESTAURANT_MODULES.filter((m) => {
    if (mode === 'team') return true
    return m.roles.includes(simulatedRole as any)
  })

  const handleAdvanceStatus = async (orderId: string, nextStatus: OrderStatus): Promise<boolean> => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o))
    )
    return true
  }

  const handleCancelOrder = async (orderId: string): Promise<boolean> => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled', updatedAt: new Date().toISOString() } : o))
    )
    return true
  }

  const handleToggleProductActive = (productId: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isActive: p.isActive === false ? true : false } : p))
    )
  }

  const handleUpdateTableStatus = (tableId: string, status: RestaurantTable['status']) => {
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status } : t)))
  }

  return (
    <div className="w-full flex flex-col space-y-5">
      {/* Horizontal navigation bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 min-w-max">
          {visibleModules.map((m) => {
            const Icon = m.icon
            const isActive = activeModule === m.id
            return (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id as RestaurantModuleId)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Module Content */}
      <div className="w-full">
        {activeModule === 'dashboard' && (
          <RestaurantDashboard
            orders={orders}
            tables={tables}
            onNavigate={(mod) => setActiveModule(mod as RestaurantModuleId)}
          />
        )}
        {activeModule === 'pos' && (
          <RestaurantPOS
            categories={RESTAURANT_CATEGORIES}
            products={products}
            quickExtras={RESTAURANT_EXTRAS}
            orders={orders}
            onAddOrder={(newOrd) => setOrders((prev) => [newOrd, ...prev])}
            onSetOrderStatus={handleAdvanceStatus}
            userRole={simulatedRole}
          />
        )}
        {activeModule === 'tables' && (
          <RestaurantTables
            tables={tables}
            orders={orders}
            onOpenTableOrder={() => setActiveModule('pos')}
            onUpdateTableStatus={handleUpdateTableStatus}
          />
        )}
        {activeModule === 'orders' && (
          <RestaurantOrders orders={orders} onAdvanceStatus={handleAdvanceStatus} />
        )}
        {activeModule === 'kitchen' && (
          <RestaurantKitchen orders={orders} onAdvanceStatus={handleAdvanceStatus} />
        )}
        {activeModule === 'history' && (
          <RestaurantHistory
            orders={orders}
            onAdvanceStatus={handleAdvanceStatus}
            onCancelOrder={handleCancelOrder}
          />
        )}
        {activeModule === 'cash' && <RestaurantCash />}
        {activeModule === 'inventory' && <RestaurantInventory />}
        {activeModule === 'products' && (
          <RestaurantProducts
            categories={RESTAURANT_CATEGORIES}
            products={products}
            onToggleProductActive={handleToggleProductActive}
          />
        )}
        {activeModule === 'customers' && <RestaurantCustomers />}
        {activeModule === 'users' && (
          <RestaurantUsers currentRole={simulatedRole} onSelectRole={onSelectRole} />
        )}
        {activeModule === 'reports' && <RestaurantReports />}
        {activeModule === 'settings' && <RestaurantSettings />}
        {activeModule === 'printers' && <RestaurantPrinters />}
      </div>
    </div>
  )
}
