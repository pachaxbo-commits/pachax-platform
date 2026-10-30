import { useState, useEffect } from 'react'
import {
  Search,
  Clock,
  RefreshCw,
  AlertCircle,
  Building2,
  X,
  ShieldAlert,
  CheckCircle2,
  Users,
  Palette,
  Eye,
  Wrench,
  Key,
} from 'lucide-react'
import { gateway } from '../../../services/gateway'
import { formatTenantDate } from '../../tenantDate'

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

export interface TenantMemberRecord {
  uid: string
  displayName: string
  email: string
  roleId: string
  status: string
  branchIds: string[]
  routeIds: string[]
}

export interface TenantRoleRecord {
  id: string
  name: string
  permissions: string[]
}

export interface TenantDetailResponse {
  tenant: RealTenantRecord & {
    branding?: Record<string, any>
    configuration?: Record<string, any>
    templateVersion?: string
  }
  members: TenantMemberRecord[]
  roles?: TenantRoleRecord[]
}

export interface SupportSessionState {
  id: string
  tenantId: string
  viewedRoleId: string
  mode: 'read-only' | 'editing'
  expiresAt: string
}

export function ClientsSection() {
  const [tenants, setTenants] = useState<RealTenantRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string>('all')

  // Estado del detalle de empresa seleccionada
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [tenantDetailData, setTenantDetailData] = useState<TenantDetailResponse | null>(null)

  // Estado de sesión de soporte técnico
  const [activeSession, setActiveSession] = useState<SupportSessionState | null>(null)
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportError, setSupportError] = useState<string | null>(null)
  const [supportFeedback, setSupportFeedback] = useState<string | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('owner')

  // Modal de elevación a sesión de edición
  const [showElevateModal, setShowElevateModal] = useState(false)
  const [elevationReason, setElevationReason] = useState('')
  const [elevationConfirmed, setElevationConfirmed] = useState(false)

  const fetchTenants = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const result = await gateway<{ tenants: RealTenantRecord[] }>('platformGateway', {
        action: 'listTenants',
        limit: 50,
      })
      if (!result || !Array.isArray(result.tenants)) throw new Error('La pasarela no devolvió una lista válida de empresas.')
      setTenants(result.tenants)
    } catch (err: unknown) {
      setTenants([])
      setLoadError(err instanceof Error ? err.message : 'Error cargando empresas registradas.')
    } finally {
      setIsLoading(false)
    }
  }

  const openTenantDetail = async (tenantId: string) => {
    setSelectedTenantId(tenantId)
    setDetailLoading(true)
    setDetailError(null)
    setTenantDetailData(null)
    setSupportError(null)
    setSupportFeedback(null)

    try {
      const res = await gateway<TenantDetailResponse>('platformGateway', {
        action: 'tenantDetail',
        tenantId,
      })
      if (!res || !res.tenant) throw new Error('No se pudo obtener el detalle de la empresa.')
      setTenantDetailData(res)
      if (res.roles && res.roles.length > 0) {
        setSelectedRoleId(res.roles[0].id)
      } else {
        setSelectedRoleId('owner')
      }
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Error cargando detalle de empresa.')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeTenantDetail = () => {
    setSelectedTenantId(null)
    setTenantDetailData(null)
    setDetailError(null)
    setShowElevateModal(false)
  }

  const handleBeginSupport = async () => {
    if (!selectedTenantId) return
    setSupportLoading(true)
    setSupportError(null)
    setSupportFeedback(null)

    try {
      const session = await gateway<SupportSessionState>('platformGateway', {
        action: 'beginSupport',
        tenantId: selectedTenantId,
        viewedRoleId: selectedRoleId || 'owner',
      })
      if (!session || !session.id) throw new Error('No se pudo iniciar la sesión de soporte.')
      setActiveSession(session)
      setSupportFeedback(`Sesión técnica iniciada en modo lectura (Rol: ${selectedRoleId}). Expira: ${new Date(session.expiresAt).toLocaleTimeString()}`)
    } catch (err: unknown) {
      setSupportError(err instanceof Error ? err.message : 'Error al iniciar sesión de soporte.')
    } finally {
      setSupportLoading(false)
    }
  }

  const handleElevateSupport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession) return
    if (!elevationReason.trim() || elevationReason.trim().length < 8) {
      setSupportError('El motivo de elevación debe tener al menos 8 caracteres explicativos.')
      return
    }
    if (!elevationConfirmed) {
      setSupportError('Debes confirmar expresamente la elevación auditada.')
      return
    }

    setSupportLoading(true)
    setSupportError(null)
    try {
      const elevated = await gateway<SupportSessionState>('platformGateway', {
        action: 'elevateSupport',
        sessionId: activeSession.id,
        reason: elevationReason.trim(),
        confirmed: true,
      })
      setActiveSession(elevated)
      setShowElevateModal(false)
      setElevationReason('')
      setElevationConfirmed(false)
      setSupportFeedback('Sesión de soporte elevada exitosamente a modo edición con registro auditado.')
    } catch (err: unknown) {
      setSupportError(err instanceof Error ? err.message : 'Error elevando sesión de soporte.')
    } finally {
      setSupportLoading(false)
    }
  }

  const handleEndSupport = async () => {
    if (!activeSession) return
    setSupportLoading(true)
    setSupportError(null)
    try {
      await gateway<{ ended: boolean }>('platformGateway', {
        action: 'endSupport',
        sessionId: activeSession.id,
      })
      setActiveSession(null)
      setSupportFeedback('Sesión de soporte finalizada y registrada en auditoría de plataforma.')
    } catch (err: unknown) {
      setSupportError(err instanceof Error ? err.message : 'Error finalizando sesión de soporte.')
    } finally {
      setSupportLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(fetchTenants)
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
          <button
            type="button"
            onClick={() => setSelectedFilter('retail')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${selectedFilter === 'retail' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Comercio
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
                  <th className="py-3 px-4 text-center">Acciones</th>
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
                      {formatTenantDate(tenant.createdAt)}
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
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => openTenantDetail(tenant.tenantId)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-[#0066FF] text-slate-700 hover:text-white transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detalle</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal / Drawer de Detalle y Soporte de Empresa */}
      {selectedTenantId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#0066FF] flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {tenantDetailData?.tenant.name || selectedTenantId}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[11px] text-slate-500">{selectedTenantId}</span>
                    {tenantDetailData?.tenant.businessType && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                        {formatBusinessType(tenantDetailData.tenant.businessType)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeTenantDetail}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {detailLoading ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0066FF]" />
                  <span>Cargando datos completos de la empresa desde Firestore...</span>
                </div>
              ) : detailError ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{detailError}</span>
                </div>
              ) : tenantDetailData ? (
                <>
                  {/* Feedback / Error de Soporte */}
                  {supportFeedback && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{supportFeedback}</span>
                    </div>
                  )}
                  {supportError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{supportError}</span>
                    </div>
                  )}

                  {/* Panel de Sesión de Soporte Técnico */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/50 to-indigo-50/40 border border-blue-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-[#0066FF]" />
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Sesión de Soporte Técnico Regulada
                        </h4>
                      </div>
                      {activeSession && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            activeSession.mode === 'editing'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}
                        >
                          Modo: {activeSession.mode === 'editing' ? 'Edición Elevada' : 'Solo Lectura'}
                        </span>
                      )}
                    </div>

                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      El acceso técnico a los datos de la empresa está regulado por tokens auditados con expiración fija. Las elevaciones requieren motivo explícito y se registran en <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[10px]">platformAuditLogs</code>.
                    </p>

                    {!activeSession ? (
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-bold text-slate-700">Rol a emular:</label>
                          <select
                            value={selectedRoleId}
                            onChange={(e) => setSelectedRoleId(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
                          >
                            {tenantDetailData.roles && tenantDetailData.roles.length > 0 ? (
                              tenantDetailData.roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({r.id})
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="owner">Owner (Propietario)</option>
                                <option value="admin">Administrador</option>
                              </>
                            )}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={handleBeginSupport}
                          disabled={supportLoading}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Key className="w-3.5 h-3.5" />
                          <span>{supportLoading ? 'Iniciando sesión...' : 'Iniciar Sesión Técnica (Solo Lectura)'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-2 border-t border-blue-200/60">
                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-700">
                          <div>
                            <span className="text-slate-400">ID de Sesión:</span>{' '}
                            <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                              {activeSession.id.slice(0, 12)}...
                            </code>
                          </div>
                          <div>
                            <span className="text-slate-400">Expira:</span>{' '}
                            <span className="font-mono font-semibold">
                              {new Date(activeSession.expiresAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {activeSession.mode === 'read-only' ? (
                            <button
                              type="button"
                              onClick={() => setShowElevateModal(true)}
                              disabled={supportLoading}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Elevar a Edición (Auditado)</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Modo edición activo. Operaciones autorizadas.</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={handleEndSupport}
                            disabled={supportLoading}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Finalizar Sesión</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resumen General y Branding */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-200 space-y-2 bg-slate-50/50">
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ficha Técnica de Empresa</span>
                      </h4>
                      <div className="space-y-1.5 text-[11px] text-slate-700 divide-y divide-slate-100">
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Plan Asignado:</span>
                          <span className="font-bold">{tenantDetailData.tenant.planKey || 'No asignado'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Versión Plantilla:</span>
                          <span className="font-mono">{tenantDetailData.tenant.templateVersion || '1.0.0'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Correo Contacto:</span>
                          <span>{tenantDetailData.tenant.contactEmail || 'No informado'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Propietario UID:</span>
                          <span className="font-mono text-[10px]">{tenantDetailData.tenant.ownerUid || 'No asignado'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Sucursales registradas:</span>
                          <span className="font-bold">{tenantDetailData.tenant.branchCount ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 space-y-2 bg-slate-50/50">
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-slate-500" />
                        <span>Personalización & Branding</span>
                      </h4>
                      {tenantDetailData.tenant.branding ? (
                        <div className="space-y-2 text-[11px] text-slate-700">
                          <div>
                            <span className="text-slate-500">Título de App:</span>{' '}
                            <span className="font-semibold">{tenantDetailData.tenant.branding.appTitle || 'Por defecto'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">Colores:</span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-4 h-4 rounded-full border border-slate-300"
                                style={{ backgroundColor: tenantDetailData.tenant.branding.primaryColor || '#0066FF' }}
                                title="Color primario"
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-slate-300"
                                style={{ backgroundColor: tenantDetailData.tenant.branding.accentColor || '#10B981' }}
                                title="Color de acento"
                              />
                            </div>
                          </div>
                          {tenantDetailData.tenant.branding.logoUrl && (
                            <div>
                              <span className="text-slate-500 block mb-1">Logo configurado:</span>
                              <img
                                src={tenantDetailData.tenant.branding.logoUrl}
                                alt="Logo empresa"
                                className="h-8 max-w-xs object-contain border border-slate-200 rounded p-1 bg-white"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-[11px]">Utiliza configuración de marca por defecto del sistema.</p>
                      )}
                    </div>
                  </div>

                  {/* Tabla de Membresías */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>Personal Registrado ({tenantDetailData.members.length})</span>
                    </h4>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-3">Usuario / Nombre</th>
                            <th className="py-2.5 px-3">Correo</th>
                            <th className="py-2.5 px-3">Rol Tenant</th>
                            <th className="py-2.5 px-3">Estado</th>
                            <th className="py-2.5 px-3 text-right">Sucursales / Rutas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {tenantDetailData.members.map((m) => (
                            <tr key={m.uid} className="hover:bg-slate-50/60">
                              <td className="py-2 px-3">
                                <div className="font-bold text-slate-900">{m.displayName || 'Sin nombre'}</div>
                                <div className="font-mono text-[9px] text-slate-400">{m.uid}</div>
                              </td>
                              <td className="py-2 px-3 text-slate-600">{m.email || 'Sin correo'}</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {m.roleId}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    m.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {m.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[10px] text-slate-500">
                                {m.branchIds?.length || 0} sucs / {m.routeIds?.length || 0} rutas
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={closeTenantDetail}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modal de Elevación de Soporte */}
      {showElevateModal && activeSession && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">
                Elevar Sesión a Modo Edición
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción otorgará permisos de escritura sobre configuraciones de la empresa durante 15 minutos. El motivo que ingreses quedará registrado de forma inalterable en el registro de auditoría de la plataforma.
            </p>

            <form onSubmit={handleElevateSupport} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Motivo obligatorio de la elevación (mínimo 8 caracteres):
                </label>
                <textarea
                  value={elevationReason}
                  onChange={(e) => setElevationReason(e.target.value)}
                  placeholder="ej: Ajuste de timezone y resolución de incidencia técnica reportada por el cliente."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
                />
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="confirmElevationCheck"
                  checked={elevationConfirmed}
                  onChange={(e) => setElevationConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#0066FF] focus:ring-[#0066FF]"
                />
                <label htmlFor="confirmElevationCheck" className="text-[11px] text-slate-700 font-medium cursor-pointer">
                  Confirmo expresamente que esta intervención técnica está autorizada y asumo la responsabilidad auditada.
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowElevateModal(false)}
                  disabled={supportLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={supportLoading || !elevationConfirmed || elevationReason.trim().length < 8}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {supportLoading ? 'Elevando...' : 'Confirmar Elevación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
