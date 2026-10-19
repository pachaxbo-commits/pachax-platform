import { useState, useEffect } from 'react'
import { Shield, ShieldAlert, UserPlus, RefreshCw, CheckCircle2, AlertCircle, FileText, Search } from 'lucide-react'
import { gateway } from '../../../services/gateway'
import type { PlatformRole } from '../../../core/platform'

interface OperatorRecord {
  uid: string
  email: string | null
  role: PlatformRole
  active: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface PlatformAuditRecord {
  id: string
  action: string
  actorUid: string
  actorRole: string
  tenantId?: string | null
  resource?: string | null
  reason?: string | null
  metadata?: Record<string, any>
  createdAt?: string | null
}

export function AdministratorsSection() {
  const [operators, setOperators] = useState<OperatorRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Auditoría de plataforma
  const [auditLogs, setAuditLogs] = useState<PlatformAuditRecord[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditFilter, setAuditFilter] = useState('')

  // Formulario para crear o actualizar un operador
  const [targetUid, setTargetUid] = useState('')
  const [email, setEmail] = useState('')
  const [selectedRole, setSelectedRole] = useState<PlatformRole>('platform_admin')
  const [isActive, setIsActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchOperators = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await gateway<{ operators: OperatorRecord[] }>('platformGateway', {
        action: 'listOperators',
      })
      if (res && Array.isArray(res.operators)) {
        setOperators(res.operators)
      }
    } catch (err: any) {
      setError(err?.message || 'Error cargando lista de operadores autorizados.')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAuditLogs = async () => {
    setAuditLoading(true)
    setAuditError(null)
    try {
      const res = await gateway<PlatformAuditRecord[]>('platformGateway', {
        action: 'queryAudit',
        limit: 50,
      })
      if (Array.isArray(res)) {
        setAuditLogs(res)
      } else if (res && Array.isArray((res as any).logs)) {
        setAuditLogs((res as any).logs)
      }
    } catch (err: unknown) {
      setAuditError(err instanceof Error ? err.message : 'Error cargando bitácora de auditoría.')
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    fetchOperators()
    fetchAuditLogs()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUid.trim() && !email.trim()) {
      setError('Ingresa el UID o correo electrónico del usuario registrado en Firebase.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setFeedback(null)

    try {
      const res = await gateway<{ success: boolean; uid: string; role: PlatformRole; active: boolean }>(
        'platformGateway',
        {
          action: 'manageOperator',
          targetUid: targetUid.trim() || undefined,
          email: email.trim().toLowerCase() || undefined,
          role: selectedRole,
          active: isActive,
        },
      )

      if (res?.success) {
        setFeedback(`Operador ${res.uid} configurado correctamente con rol ${res.role}.`)
        setTargetUid('')
        setEmail('')
        fetchOperators()
      }
    } catch (err: any) {
      setError(err?.message || 'Error al configurar permisos del operador.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const roleBadge = (role: PlatformRole) => {
    switch (role) {
      case 'platform_owner':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">Owner</span>
      case 'platform_admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">Admin</span>
      case 'platform_support':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Support</span>
      case 'platform_content':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Content</span>
      case 'platform_finance':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">Finance</span>
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">{role}</span>
    }
  }

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!auditFilter.trim()) return true
    const term = auditFilter.toLowerCase().trim()
    return (
      log.action.toLowerCase().includes(term) ||
      log.actorUid.toLowerCase().includes(term) ||
      log.actorRole.toLowerCase().includes(term) ||
      (log.tenantId && log.tenantId.toLowerCase().includes(term)) ||
      (log.reason && log.reason.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0066FF]" />
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Administradores de Plataforma
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestión de privilegios y operadores PACHAX Platform mediante Custom Claims criptográficos y backend protegido.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchOperators()
            fetchAuditLogs()
          }}
          disabled={isLoading || auditLoading}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading || auditLoading ? 'animate-spin' : ''}`} />
          <span>Actualizar Todo</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Formulario de Asignación y Tabla de Operadores */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Formulario de Alta / Modificación */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-[#0066FF]" />
            <h3 className="text-sm font-bold text-slate-900">
              Asignar o Modificar Operador
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            Asigna Custom Claims y documento protegido en <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">platformOperators</code>. El usuario debe existir previamente en Firebase Auth.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Correo Electrónico (Firebase Auth)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@ejemplo.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                UID de Firebase (Opcional si usas correo)
              </label>
              <input
                type="text"
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                placeholder="ej: abcd1234xyz..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Rol Administrativo
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as PlatformRole)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
              >
                <option value="platform_admin">Platform Admin (Todo contenido y clientes)</option>
                <option value="platform_content">Platform Content (Vitrina, planes, landing)</option>
                <option value="platform_support">Platform Support (Soporte y lectura clientes)</option>
                <option value="platform_finance">Platform Finance (Finanzas y lecturas)</option>
                <option value="platform_owner">Platform Owner (Control total)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="activeOperatorCheck"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300 text-[#0066FF] focus:ring-[#0066FF]"
              />
              <label htmlFor="activeOperatorCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                Operador habilitado y activo
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white transition-all shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isSubmitting ? 'Guardando en Firebase...' : 'Aplicar rol administrativo'}
            </button>
          </form>
        </div>

        {/* Tabla de Operadores Activos */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Operadores Registrados ({operators.length})
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Solo lectura autorizada para Platform Owner
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0066FF]" />
              Cargando operadores desde Firestore...
            </div>
          ) : operators.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No se encontraron operadores</p>
              <p className="text-slate-400 mt-1">
                Usa el script <code className="font-mono">scripts/bootstrap-platform-owner.cjs</code> para registrar al primer owner.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Operador</th>
                    <th className="py-3 px-4">Rol</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Actualización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {operators.map((op) => (
                    <tr key={op.uid} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{op.email || 'Sin correo asociado'}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">{op.uid}</div>
                      </td>
                      <td className="py-3 px-4">
                        {roleBadge(op.role)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            op.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {op.active ? 'Activo' : 'Desactivado'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500 font-mono text-[10px]">
                        {op.updatedAt ? op.updatedAt.slice(0, 16).replace('T', ' ') : op.createdAt ? op.createdAt.slice(0, 16).replace('T', ' ') : 'Inicial'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bitácora Inmutable de Auditoría de Plataforma */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0066FF]" />
              <h3 className="text-sm font-bold text-slate-900">
                Bitácora Inmutable de Auditoría (platformAuditLogs)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Trazabilidad criptográfica de acciones administrativas, sesiones técnicas y mutaciones de catálogo en el backend.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                placeholder="Filtrar por acción o UID..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
              />
            </div>
            <button
              type="button"
              onClick={fetchAuditLogs}
              disabled={auditLoading}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-950 hover:bg-slate-100 border border-slate-200 cursor-pointer disabled:opacity-50"
              title="Actualizar bitácora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {auditError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{auditError}</span>
          </div>
        )}

        {auditLoading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#0066FF]" />
            Cargando registros de auditoría de servidor...
          </div>
        ) : filteredAuditLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <p>No se encontraron registros de auditoría que coincidan con la búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Acción Registrada</th>
                  <th className="py-2.5 px-3">Operador (UID / Rol)</th>
                  <th className="py-2.5 px-3">Destino / Recurso</th>
                  <th className="py-2.5 px-3">Motivo / Metadatos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {log.createdAt ? log.createdAt.replace('T', ' ').slice(0, 19) : 'Sin fecha'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-[#0066FF] text-[11px] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-[10px] text-slate-800 font-semibold">{log.actorUid ? `${log.actorUid.slice(0, 12)}...` : 'Sistema'}</div>
                      <div className="text-[9px] text-slate-400">{log.actorRole}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      {log.tenantId ? (
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">tenant:{log.tenantId}</span>
                      ) : log.resource ? (
                        <span>{log.resource}</span>
                      ) : (
                        <span className="text-slate-400">Plataforma</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-xs truncate">
                      {log.reason ? (
                        <span className="font-medium text-slate-800 italic">"{log.reason}"</span>
                      ) : log.metadata ? (
                        <span className="font-mono text-[10px] text-slate-400">{JSON.stringify(log.metadata)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
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
