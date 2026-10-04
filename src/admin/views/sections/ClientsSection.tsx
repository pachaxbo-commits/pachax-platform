import { useState, useEffect } from 'react'
import { Search, Clock, RefreshCw, AlertCircle, Building2 } from 'lucide-react'
import { gateway } from '../../../services/gateway'
import { getFirebaseContext } from '../../../lib/firebase'
import { collection, getDocs, limit, query } from 'firebase/firestore'

export interface RealTenantRecord {
  tenantId: string
  name: string
  businessType: string
  status: string
  subscriptionStatus?: string | null
  planKey?: string | null
  userCount?: number | null
  branchCount?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  contactEmail?: string | null
  ownerUid?: string | null
}

export function ClientsSection() {
  const [tenants, setTenants] = useState<RealTenantRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string>('all')

  const fetchTenants = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      // 1. Intentar mediante la función canónica platformGateway
      const result = await gateway<{ tenants: RealTenantRecord[] }>('platformGateway', {
        action: 'listTenants',
        limit: 50,
      })
      if (result && Array.isArray(result.tenants)) {
        setTenants(result.tenants)
        setIsLoading(false)
        return
      }
    } catch (err: any) {
      console.warn('Fallo consulta platformGateway para listTenants, probando Firestore directo:', err?.message)
    }

    try {
      // 2. Consulta directa a Firestore como fallback
      const ctx = await getFirebaseContext()
      if (ctx) {
        const q = query(collection(ctx.db, 'tenants'), limit(50))
        const snap = await getDocs(q)
        const loaded: RealTenantRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data()
          return {
            tenantId: docSnap.id,
            name: d.name || 'Sin nombre',
            businessType: d.businessType || 'No disponible',
            status: d.status || 'active',
            subscriptionStatus: d.subscriptionStatus ?? null,
            planKey: d.planKey ?? null,
            userCount: d.userCount ?? null,
            branchCount: d.branchCount ?? null,
            createdAt: d.createdAt ? (typeof d.createdAt === 'string' ? d.createdAt : d.createdAt?.toDate?.()?.toISOString() || null) : null,
            updatedAt: d.updatedAt ? (typeof d.updatedAt === 'string' ? d.updatedAt : d.updatedAt?.toDate?.()?.toISOString() || null) : null,
            contactEmail: d.contactEmail ?? null,
            ownerUid: d.ownerUid ?? null,
          }
        })
        setTenants(loaded)
      } else {
        setLoadError('Firebase no disponible para consultar empresas registradas.')
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Error cargando empresas registradas.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  const formatBusinessType = (type: string) => {
    switch (type) {
      case 'restaurant_pos':
      case 'restaurant':
        return 'Restaurante'
      case 'route_distribution':
      case 'distribution':
        return 'Distribuidora'
      case 'nightclub_lounge':
      case 'nightclub':
        return 'Nightclub & Lounge'
      case 'gelateria_weight_cafe':
      case 'retail':
        return 'Ventas Express / Balanza'
      default:
        return type || 'No disponible'
    }
  }

  const filteredTenants = tenants.filter((t) => {
    const term = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !term ||
      t.name.toLowerCase().includes(term) ||
      t.tenantId.toLowerCase().includes(term) ||
      (t.contactEmail && t.contactEmail.toLowerCase().includes(term))

    const matchesType =
      selectedFilter === 'all' ||
      t.businessType === selectedFilter ||
      (selectedFilter === 'restaurant' && (t.businessType === 'restaurant_pos' || t.businessType === 'restaurant')) ||
      (selectedFilter === 'distribution' && (t.businessType === 'route_distribution' || t.businessType === 'distribution')) ||
      (selectedFilter === 'nightclub' && (t.businessType === 'nightclub_lounge' || t.businessType === 'nightclub')) ||
      (selectedFilter === 'retail' && (t.businessType === 'gelateria_weight_cafe' || t.businessType === 'retail'))

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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTenants}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Facturación: Sin integración de pasarela. Manual activa.</span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o ID de empresa..."
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
            Todos ({tenants.length})
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
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0066FF]" />
            Cargando empresas registradas desde la base de datos...
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No se encontraron empresas registradas</p>
            <p className="text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro término de búsqueda.' : 'Las nuevas empresas dadas de alta mediante onboarding aparecerán aquí en tiempo real.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Rubro / Plantilla</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Fecha de Alta</th>
                  <th className="py-3 px-4">Membresías</th>
                  <th className="py-3 px-4">Sucursales</th>
                  <th className="py-3 px-4 text-right">Owner / Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.map((tenant) => (
                  <tr key={tenant.tenantId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{tenant.name}</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{tenant.tenantId}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {formatBusinessType(tenant.businessType)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-700">
                        {tenant.planKey || 'No disponible'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          tenant.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {tenant.status === 'active' ? 'Activo' : tenant.status || 'No disponible'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                      {tenant.createdAt ? tenant.createdAt.slice(0, 10) : 'No disponible'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-mono text-center">
                      {tenant.userCount != null ? tenant.userCount : 'No disponible'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-mono text-center">
                      {tenant.branchCount != null ? tenant.branchCount : 'No disponible'}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-600">
                      <div>{tenant.contactEmail || 'No disponible'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {tenant.ownerUid ? `UID: ${tenant.ownerUid.slice(0, 8)}...` : 'No disponible'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
