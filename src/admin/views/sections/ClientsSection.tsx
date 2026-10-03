import { useState } from 'react'
import { Search, Clock } from 'lucide-react'

interface TenantRecord {
  id: string
  companyName: string
  businessType: 'restaurant' | 'distribution' | 'nightclub' | 'retail'
  businessLabel: string
  planName: string
  status: 'active' | 'trial' | 'suspended'
  createdAt: string
  contactEmail: string
  contactPhone: string
  ownerUid: string
  branchCount: number
}

const SYSTEM_TENANTS: TenantRecord[] = [
  {
    id: 'tenant_don_cangrejo',
    companyName: 'Don Cangrejo Grill & Bar',
    businessType: 'restaurant',
    businessLabel: 'Restaurante',
    planName: 'Restaurante Pro',
    status: 'active',
    createdAt: '2026-08-14',
    contactEmail: 'admin@doncangrejo.bo',
    contactPhone: '+591 70012345',
    ownerUid: 'usr_cangrejo_owner',
    branchCount: 1,
  },
  {
    id: 'tenant_dist_sanjuan',
    companyName: 'Distribuidora San Juan Mayorista',
    businessType: 'distribution',
    businessLabel: 'Distribuidora',
    planName: 'Distribución Pro',
    status: 'active',
    createdAt: '2026-08-28',
    contactEmail: 'logistica@distribuidorasanjuan.com',
    contactPhone: '+591 71234567',
    ownerUid: 'usr_sanjuan_owner',
    branchCount: 2,
  },
  {
    id: 'tenant_club_elite',
    companyName: 'Club Élite Lounge & VIP',
    businessType: 'nightclub',
    businessLabel: 'Nightclub & Lounge',
    planName: 'Lounge & VIP Pro',
    status: 'trial',
    createdAt: '2026-09-12',
    contactEmail: 'gerencia@clubelitelounge.bo',
    contactPhone: '+591 77889900',
    ownerUid: 'usr_elite_owner',
    branchCount: 1,
  },
  {
    id: 'tenant_gelato_express',
    companyName: 'Gelatería & Café Express',
    businessType: 'retail',
    businessLabel: 'Ventas Express',
    planName: 'Comercio Balanza',
    status: 'trial',
    createdAt: '2026-09-29',
    contactEmail: 'contacto@gelatoexpress.com',
    contactPhone: '+591 76543210',
    ownerUid: 'usr_gelato_owner',
    branchCount: 1,
  },
]

export function ClientsSection() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'restaurant' | 'distribution' | 'nightclub' | 'retail'>('all')

  const filteredTenants = SYSTEM_TENANTS.filter((t) => {
    const matchesSearch =
      t.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedFilter === 'all' || t.businessType === selectedFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Clientes y Empresas Registradas
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Supervisa las empresas activas en el entorno multitenant de PACHAX Platform.
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Pasarela de pagos en línea: Pendiente de integración. Facturación manual activa.</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, correo o ID de tenant..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setSelectedFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedFilter === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({SYSTEM_TENANTS.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('restaurant')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedFilter === 'restaurant'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Restaurante
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('distribution')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedFilter === 'distribution'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Distribuidora
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('nightclub')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedFilter === 'nightclub'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nightclub
          </button>
        </div>
      </div>

      {/* Tabla de Tenants */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Empresa</th>
                <th className="py-3 px-4">Rubro / Motor</th>
                <th className="py-3 px-4">Plan Actual</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Fecha de Alta</th>
                <th className="py-3 px-4">Contacto</th>
                <th className="py-3 px-4 text-right">Sucursales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{tenant.companyName}</div>
                    <div className="font-mono text-[10px] text-slate-400 mt-0.5">{tenant.id}</div>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    {tenant.businessLabel}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-slate-900">{tenant.planName}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        tenant.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {tenant.status === 'active' ? 'Activo' : 'Prueba'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-mono">
                    {tenant.createdAt}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <div>{tenant.contactEmail}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{tenant.contactPhone}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                    {tenant.branchCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
