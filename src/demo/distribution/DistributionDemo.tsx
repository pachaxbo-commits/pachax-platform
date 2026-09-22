import { useState } from 'react'
import {
  LayoutDashboard,
  Boxes,
  Package,
  Warehouse,
  Truck,
  ShoppingCart,
  Users,
  CreditCard,
  HandCoins,
  Receipt,
  RotateCcw,
  QrCode,
  CheckSquare,
  BarChart3,
  UserCheck,
  Settings,
  Printer,
} from 'lucide-react'
import { previewData } from '../../preview-data'
import { DashboardView } from '../../modules/distribution/views/DashboardView'
import { InventoryView } from '../../modules/distribution/views/InventoryView'
import { ProductsView } from '../../modules/distribution/views/ProductsView'
import { WarehousesView } from '../../modules/distribution/views/WarehousesView'
import { DispatchesView } from '../../modules/distribution/views/DispatchesView'
import { SellView } from '../../modules/distribution/views/SellView'
import { CustomersView } from '../../modules/distribution/views/CustomersView'
import { CreditsView } from '../../modules/distribution/views/CreditsView'
import { CollectionsView } from '../../modules/distribution/views/CollectionsView'
import { ExpensesView } from '../../modules/distribution/views/ExpensesView'
import { ClaimsView } from '../../modules/distribution/views/ClaimsView'
import { QrView } from '../../modules/distribution/views/QrView'
import { ClosureView } from '../../modules/distribution/views/ClosureView'
import { ReportsView } from '../../modules/distribution/views/ReportsView'
import { UsersView } from '../../modules/distribution/views/UsersView'
import { SupportView } from '../../modules/distribution/views/SupportView'
import { DistributionPrinterModal } from '../../modules/distribution/views/DistributionPrinterModal'
import type { UserRole } from '../../types'
import type { DistributionSession } from '../../modules/distribution/views/DistributionApp'

export type DistributionModuleId =
  | 'dashboard'
  | 'inventory'
  | 'products'
  | 'warehouses'
  | 'dispatches'
  | 'sales'
  | 'customers'
  | 'credits'
  | 'collections'
  | 'expenses'
  | 'claims'
  | 'qr'
  | 'closure'
  | 'reports'
  | 'users'
  | 'support'
  | 'printers'

const DISTRIBUTION_MODULES = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['admin', 'warehouse', 'distributor'] },
  { id: 'inventory', label: 'Inventario', icon: Boxes, roles: ['admin', 'warehouse'] },
  { id: 'products', label: 'Productos', icon: Package, roles: ['admin', 'warehouse'] },
  { id: 'warehouses', label: 'Almacenes', icon: Warehouse, roles: ['admin', 'warehouse'] },
  { id: 'dispatches', label: 'Despachos', icon: Truck, roles: ['admin', 'warehouse'] },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart, roles: ['admin', 'distributor'] },
  { id: 'customers', label: 'Clientes', icon: Users, roles: ['admin', 'distributor'] },
  { id: 'credits', label: 'Créditos', icon: CreditCard, roles: ['admin', 'distributor'] },
  { id: 'collections', label: 'Cobros', icon: HandCoins, roles: ['admin', 'distributor'] },
  { id: 'expenses', label: 'Gastos', icon: Receipt, roles: ['admin', 'distributor'] },
  { id: 'claims', label: 'Cambios y devoluciones', icon: RotateCcw, roles: ['admin', 'distributor'] },
  { id: 'qr', label: 'QR', icon: QrCode, roles: ['admin', 'distributor'] },
  { id: 'closure', label: 'Cierre', icon: CheckSquare, roles: ['admin', 'warehouse', 'distributor'] },
  { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['admin'] },
  { id: 'users', label: 'Usuarios', icon: UserCheck, roles: ['admin'] },
  { id: 'support', label: 'Configuración', icon: Settings, roles: ['admin'] },
  { id: 'printers', label: 'Impresoras', icon: Printer, roles: ['admin', 'warehouse', 'distributor'] },
] as const

export function DistributionDemo({
  mode = 'team',
  simulatedRole = 'admin',
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
}) {
  const [activeModule, setActiveModule] = useState<DistributionModuleId>('dashboard')
  const [isPrinterOpen, setIsPrinterOpen] = useState(false)
  const role = (simulatedRole as UserRole) || 'admin'

  const session: DistributionSession = {
    tenantId: 'preview-distribution',
    restaurantName: 'Distribuidora Demo',
    uid: 'demo-distributor-uid',
    userName: role === 'distributor' ? 'Hugo Distribuidor' : role === 'warehouse' ? 'Almacén Central' : 'Administrador',
    role,
    warehouseId: 'central',
    routeId: role === 'distributor' ? 'route-norte' : null,
    can: () => true,
    dayKeys: ['2026-09-08'],
    setDayKeys: () => undefined,
  }

  const viewProps = { session, data: previewData }

  // En modo equipo: los 17 accesos. En modo rol simulado: según perfil.
  const visibleModules = DISTRIBUTION_MODULES.filter((m) => {
    if (mode === 'team') return true
    return m.roles.includes(role as any)
  })

  return (
    <div className="w-full flex flex-col space-y-5">
      {/* 17 accesos en barra horizontal */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 min-w-max">
          {visibleModules.map((m) => {
            const Icon = m.icon
            const isActive = activeModule === m.id
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (m.id === 'printers') {
                    setIsPrinterOpen(true)
                  } else {
                    setActiveModule(m.id as DistributionModuleId)
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
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

      {/* Contenido del Módulo */}
      <div className="w-full">
        {activeModule === 'dashboard' && <DashboardView {...viewProps} />}
        {activeModule === 'inventory' && <InventoryView {...viewProps} />}
        {activeModule === 'products' && <ProductsView {...viewProps} />}
        {activeModule === 'warehouses' && <WarehousesView {...viewProps} />}
        {activeModule === 'dispatches' && <DispatchesView {...viewProps} />}
        {activeModule === 'sales' && <SellView {...viewProps} />}
        {activeModule === 'customers' && <CustomersView {...viewProps} />}
        {activeModule === 'credits' && <CreditsView {...viewProps} />}
        {activeModule === 'collections' && <CollectionsView {...viewProps} />}
        {activeModule === 'expenses' && <ExpensesView {...viewProps} />}
        {activeModule === 'claims' && <ClaimsView {...viewProps} />}
        {activeModule === 'qr' && <QrView {...viewProps} />}
        {activeModule === 'closure' && <ClosureView {...viewProps} />}
        {activeModule === 'reports' && <ReportsView {...viewProps} />}
        {activeModule === 'users' && (
          <UsersView
            {...viewProps}
            membersOverride={[
              { uid: 'admin-1', email: 'admin@distribuidorademo.test', displayName: 'Administración PACHAX', role: 'admin', active: true },
              { uid: 'warehouse-1', email: 'almacen@distribuidorademo.test', displayName: 'Almacén Central', role: 'warehouse', warehouseId: 'central', active: true },
              { uid: 'seller-1', email: 'hugo@distribuidorademo.test', displayName: 'Distribuidor A (Hugo)', role: 'distributor', routeId: 'route-norte', active: true },
            ]}
          />
        )}
        {activeModule === 'support' && <SupportView onOpenPrinterSettings={() => setIsPrinterOpen(true)} />}
      </div>

      {isPrinterOpen && (
        <DistributionPrinterModal tenantId="preview-distribution" onClose={() => setIsPrinterOpen(false)} />
      )}
    </div>
  )
}
