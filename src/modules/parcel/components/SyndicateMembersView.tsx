import { useState } from 'react'
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  Truck,
  X,
} from 'lucide-react'
import type { UnionMember, UnionMonthlyDue } from '../types'

interface SyndicateMembersViewProps {
  members: UnionMember[]
  dues: UnionMonthlyDue[]
  onAddMember: (member: Omit<UnionMember, 'id' | 'memberNumber'>) => void
}

export function SyndicateMembersView({
  members,
  dues,
  onAddMember,
}: SyndicateMembersViewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<UnionMember | null>(null)

  // Formulario nuevo socio
  const [fullName, setFullName] = useState('')
  const [ci, setCi] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [category, setCategory] = useState<UnionMember['category']>('propietario_transporte')
  const [monthlyFee, setMonthlyFee] = useState(150)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const filteredMembers = members.filter(m => {
    const matchesSearch =
      m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.ci.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.memberNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.vehiclePlate && m.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || m.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!fullName.trim()) {
      setError('Por favor ingresa el nombre completo del socio.')
      return
    }
    if (!ci.trim()) {
      setError('El número de carnet (CI) es obligatorio.')
      return
    }
    if (!phone.trim()) {
      setError('El teléfono de contacto es obligatorio.')
      return
    }

    onAddMember({
      fullName: fullName.trim(),
      ci: ci.trim(),
      phone: phone.trim(),
      address: address.trim() || undefined,
      vehiclePlate: vehiclePlate.trim().toUpperCase() || undefined,
      category,
      monthlyFee: Math.max(0, monthlyFee),
      status: 'active',
      joinedAt: new Date().toISOString().split('T')[0],
      notes: notes.trim() || undefined,
    })

    // Resetear formulario
    setFullName('')
    setCi('')
    setPhone('')
    setAddress('')
    setVehiclePlate('')
    setMonthlyFee(150)
    setNotes('')
    setIsAddModalOpen(false)
  }

  // Cuotas de un socio seleccionado para ver su estado de cuenta
  const memberDues = selectedMember
    ? dues.filter(d => d.memberId === selectedMember.id)
    : []

  const totalPaidByMember = memberDues.reduce((acc, d) => acc + d.paidAmount, 0)
  const totalDebtByMember = memberDues.reduce((acc, d) => acc + d.balance, 0)

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Barra superior de acciones */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-900 border border-amber-300 flex items-center justify-center font-bold">
            <Users className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Padrón de Socios y Afiliados</h3>
            <p className="text-xs text-slate-500">Gestión de propietarios de transporte, choferes y socios honorarios</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-xs flex items-center justify-center gap-2 shadow-sm transition"
        >
          <UserPlus className="w-4 h-4" />
          <span>Registrar Nuevo Socio</span>
        </button>
      </div>

      {/* Buscador y filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, CI, N° de socio o placa de vehículo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg transition ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            Todos ({members.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded-lg transition ${statusFilter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('honorary')}
            className={`px-3 py-1 rounded-lg transition ${statusFilter === 'honorary' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            Honorarios
          </button>
        </div>
      </div>

      {/* Grid de tarjetas de socios */}
      {filteredMembers.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          No se encontraron socios registrados con los criterios indicados.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMembers.map(m => {
            const duesOfMember = dues.filter(d => d.memberId === m.id)
            const hasOverdue = duesOfMember.some(d => d.balance > 0)
            const unpaidCount = duesOfMember.filter(d => d.balance > 0).length

            return (
              <div
                key={m.id}
                onClick={() => setSelectedMember(m)}
                className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                      {m.memberNumber}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                    >
                      {m.status === 'active' ? 'Activo' : 'Honorario'}
                    </span>
                  </div>

                  <h4 className="font-black text-slate-900 text-sm">{m.fullName}</h4>
                  <div className="text-xs text-slate-500 mt-0.5">CI: {m.ci} · Tel: {m.phone}</div>

                  {m.vehiclePlate && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800">
                      <Truck className="w-3.5 h-3.5 text-amber-600" />
                      <span>Placa: {m.vehiclePlate}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Cuota Mensual:</span>
                    <span className="font-bold text-slate-800">Bs. {m.monthlyFee.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Situación cuotas:</span>
                    {hasOverdue ? (
                      <span className="font-bold text-red-600">
                        {unpaidCount} pendiente(s)
                      </span>
                    ) : (
                      <span className="font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Al día
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de nuevo socio */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm sm:text-base">Registrar Nuevo Socio</h3>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="p-5 space-y-3.5 text-xs sm:text-sm overflow-y-auto">
              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Ej. Zenón Gutiérrez Apaza"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Cédula de Identidad (CI) *</label>
                  <input
                    type="text"
                    placeholder="Ej. 3419082 Cbba"
                    value={ci}
                    onChange={e => setCi(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Teléfono / Celular *</label>
                  <input
                    type="tel"
                    placeholder="Ej. 71420912"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as 'propietario_transporte' | 'conductor' | 'socio_general')}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="propietario_transporte">Propietario de Transporte</option>
                    <option value="conductor">Conductor / Chofer</option>
                    <option value="socio_general">Socio General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Placa de Vehículo</label>
                  <input
                    type="text"
                    placeholder="Ej. 1422-XBC"
                    value={vehiclePlate}
                    onChange={e => setVehiclePlate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Cuota Mensual (Bs.) *</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={monthlyFee}
                    onChange={e => setMonthlyFee(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Dirección / Zona</label>
                  <input
                    type="text"
                    placeholder="Ej. Zona Jaihuayco"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales del socio..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-xs"
                >
                  Guardar Socio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de estado de cuenta individual */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-sm sm:text-base">Estado de Cuenta del Socio</h3>
                <p className="text-xs text-slate-300 font-mono">
                  {selectedMember.memberNumber} · {selectedMember.fullName} (CI: {selectedMember.ci})
                </p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-[11px] text-slate-500 block">Total Aportado:</span>
                  <span className="text-base font-black text-emerald-800">Bs. {totalPaidByMember.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Deuda Pendiente de Cuotas:</span>
                  <span className={`text-base font-black ${totalDebtByMember > 0 ? 'text-red-700' : 'text-slate-800'}`}>
                    Bs. {totalDebtByMember.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-xs mb-2 uppercase tracking-wide">
                  Historial de Mensualidades y Obligaciones
                </h4>
                {memberDues.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                    No hay mensualidades registradas para este socio.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                    {memberDues.map(d => (
                      <div key={d.id} className="p-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">{d.periodLabel}</div>
                          <div className="text-[11px] text-slate-500">Vencimiento: {d.dueDate}</div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold">
                            Total: Bs. {d.amount.toFixed(2)} | Pagado: Bs. {d.paidAmount.toFixed(2)}
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : d.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}
                          >
                            {d.status === 'paid' ? 'AL DÍA' : d.status === 'partial' ? `Saldo: Bs ${d.balance}` : 'PENDIENTE'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-100 px-5 py-2.5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
