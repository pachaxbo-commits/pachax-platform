import { useState } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Wallet,
  Boxes,
  Package,
  Users,
  UserCheck,
  BarChart3,
  Settings,
} from 'lucide-react'
import {
  type RetailProduct,
  type CompletedRetailSale,
} from '../mocks/retailMock'
import { createRetailDataset } from '../datasets'
import type { DemoDatasetMode } from '../datasets/types'
import { QuickRetailDashboard } from './QuickRetailDashboard'
import { QuickRetailPOS } from './QuickRetailPOS'
import { QuickRetailSales } from './QuickRetailSales'
import { QuickRetailCash } from './QuickRetailCash'
import { QuickRetailInventory } from './QuickRetailInventory'
import { QuickRetailProducts } from './QuickRetailProducts'
import { QuickRetailCustomers } from './QuickRetailCustomers'
import { QuickRetailUsers } from './QuickRetailUsers'
import { QuickRetailReports } from './QuickRetailReports'
import { QuickRetailSettings } from './QuickRetailSettings'

export type QuickRetailModuleId =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'cash'
  | 'inventory'
  | 'products'
  | 'customers'
  | 'users'
  | 'reports'
  | 'settings'

const QUICK_RETAIL_MODULES = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin', 'cashier', 'sales'] },
  { id: 'pos', label: 'Nueva venta / POS', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier', 'sales'] },
  { id: 'sales', label: 'Ventas', icon: Receipt, roles: ['owner', 'admin', 'cashier'] },
  { id: 'cash', label: 'Caja', icon: Wallet, roles: ['owner', 'admin', 'cashier'] },
  { id: 'inventory', label: 'Inventario', icon: Boxes, roles: ['owner', 'admin', 'inventory'] },
  { id: 'products', label: 'Productos', icon: Package, roles: ['owner', 'admin', 'inventory'] },
  { id: 'customers', label: 'Clientes', icon: Users, roles: ['owner', 'admin', 'cashier', 'sales'] },
  { id: 'users', label: 'Usuarios', icon: UserCheck, roles: ['owner', 'admin'] },
  { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['owner', 'admin'] },
  { id: 'settings', label: 'Configuración', icon: Settings, roles: ['owner', 'admin'] },
] as const

export function QuickRetailDemo({
  mode = 'team',
  simulatedRole = 'admin',
  onSelectRole,
  datasetMode = 'full',
  resetKey: _resetKey = 0,
  companyName,
  isStudioEmbed = false,
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
  datasetMode?: DemoDatasetMode
  resetKey?: number
  companyName?: string
  logoUrl?: string
  themeColors?: { primary: string; accent: string }
  isStudioEmbed?: boolean
}) {
  void _resetKey
  const [activeModule, setActiveModule] = useState<QuickRetailModuleId>('dashboard')
  const [products] = useState<RetailProduct[]>(() => createRetailDataset(datasetMode).products)
  const [sales, setSales] = useState<CompletedRetailSale[]>(() => createRetailDataset(datasetMode).sales)



  const visibleModules = QUICK_RETAIL_MODULES.filter((m) => {
    if (mode === 'team') return true
    return (m.roles as readonly string[]).includes(simulatedRole)
  })

  if (mode === 'simulated_role' && !visibleModules.some(m => m.id === activeModule)) {
    setActiveModule(visibleModules[0]?.id || 'dashboard')
  }

  const handleCompleteSale = (newSale: CompletedRetailSale) => {
    setSales((prev) => [newSale, ...prev])
  }

  return (
    <div className={`w-full flex flex-col space-y-5 ${isStudioEmbed ? 'p-3 sm:p-5' : ''}`}>
        {companyName && !isStudioEmbed && (
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{companyName}</div>
        )}
      {/* Barra horizontal de módulos */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 min-w-max">
          {visibleModules.map((m) => {
            const Icon = m.icon
            const isActive = activeModule === m.id
            return (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id as QuickRetailModuleId)}
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

      {/* Contenido del Módulo */}
      <div className="w-full">
        {activeModule === 'dashboard' && (
          <QuickRetailDashboard
            sales={sales}
            companyName={companyName}
            onNavigate={(mod) => setActiveModule(mod as QuickRetailModuleId)}
          />
        )}
        {activeModule === 'pos' && (
          <QuickRetailPOS products={products} onCompleteSale={handleCompleteSale} />
        )}
        {activeModule === 'sales' && <QuickRetailSales sales={sales} />}
        {activeModule === 'cash' && <QuickRetailCash sales={sales} />}
        {activeModule === 'inventory' && <QuickRetailInventory products={products} />}
        {activeModule === 'products' && <QuickRetailProducts products={products} />}
        {activeModule === 'customers' && <QuickRetailCustomers />}
        {activeModule === 'users' && (
          <QuickRetailUsers currentRole={simulatedRole} onSelectRole={onSelectRole} />
        )}
        {activeModule === 'reports' && <QuickRetailReports />}
        {activeModule === 'settings' && <QuickRetailSettings />}
      </div>
    </div>
  )
}
