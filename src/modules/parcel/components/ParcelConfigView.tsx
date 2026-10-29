import { useState } from 'react'
import {
  Building2,
  MapPin,
  DollarSign,
  Plus,
  CheckCircle2,
  Phone,
  Save,
  X,
} from 'lucide-react'
import type {
  ParcelAppState,
  ParcelBranch,
  DocumentCompanyContext,
  ParcelTariffConfig,
} from '../types'

interface ParcelConfigViewProps {
  state: ParcelAppState
  onAddBranch: (branch: Omit<ParcelBranch, 'id'>) => ParcelBranch
  onToggleBranchActive: (branchId: string) => void
  onUpdateCompanyInfo: (info: Partial<DocumentCompanyContext>) => void
  onUpdateTariffConfig: (config: Partial<ParcelTariffConfig>) => void
}

export function ParcelConfigView({
  state,
  onAddBranch,
  onToggleBranchActive,
  onUpdateCompanyInfo,
  onUpdateTariffConfig,
}: ParcelConfigViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'branches' | 'tariffs' | 'company'>('branches')

  // Estado del formulario de nueva agencia
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchCity, setBranchCity] = useState('')
  const [branchDepartment, setBranchDepartment] = useState('Cochabamba')
  const [branchAddress, setBranchAddress] = useState('')
  const [branchPhone, setBranchPhone] = useState('')
  const [branchCode, setBranchCode] = useState('')

  // Estado del formulario de tarifas
  const initialTariff = state.tariffConfig || {
    baseFee: 15,
    freeWeightKg: 3,
    extraKgRate: 2,
    homeDeliveryFee: 10,
  }
  const [baseFee, setBaseFee] = useState<number>(initialTariff.baseFee)
  const [freeWeightKg, setFreeWeightKg] = useState<number>(initialTariff.freeWeightKg)
  const [extraKgRate, setExtraKgRate] = useState<number>(initialTariff.extraKgRate)
  const [homeDeliveryFee, setHomeDeliveryFee] = useState<number>(initialTariff.homeDeliveryFee)

  // Estado del formulario de empresa
  const initialCompany = state.companyInfo || {
    name: 'TRANS-BOLIVIA ENCOMIENDAS & LOGÍSTICA',
    legalName: 'Sindicato Mixto de Transporte & Encomiendas Interdepartamental',
    taxId: '1029384021',
    phone: '4-4251234 / 70712345',
    address: 'Av. Ayacucho #452 (Frente a Terminal de Buses)',
    city: 'Cochabamba - Bolivia',
  }
  const [companyName, setCompanyName] = useState(initialCompany.name)
  const [legalName, setLegalName] = useState(initialCompany.legalName || '')
  const [taxId, setTaxId] = useState(initialCompany.taxId || '')
  const [companyPhone, setCompanyPhone] = useState(initialCompany.phone || '')
  const [companyAddress, setCompanyAddress] = useState(initialCompany.address || '')
  const [companyCity, setCompanyCity] = useState(initialCompany.city || '')

  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!branchName.trim() || !branchCity.trim() || !branchCode.trim()) return

    onAddBranch({
      name: branchName.trim(),
      city: branchCity.trim(),
      department: branchDepartment,
      address: branchAddress.trim() || 'Terminal de Buses',
      phone: branchPhone.trim() || 'S/N',
      code: branchCode.trim().toUpperCase(),
      isActive: true,
    })

    setBranchName('')
    setBranchCity('')
    setBranchAddress('')
    setBranchPhone('')
    setBranchCode('')
    setIsAddBranchOpen(false)
    showNotification('Nueva agencia y ciudad destino registrada con éxito.')
  }

  const handleSaveTariffs = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdateTariffConfig({
      baseFee: Number(baseFee) || 15,
      freeWeightKg: Number(freeWeightKg) || 3,
      extraKgRate: Number(extraKgRate) || 2,
      homeDeliveryFee: Number(homeDeliveryFee) || 10,
    })
    showNotification('Parámetros de tarifas de encomienda guardados correctamente.')
  }

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdateCompanyInfo({
      name: companyName.trim(),
      legalName: legalName.trim(),
      taxId: taxId.trim(),
      phone: companyPhone.trim(),
      address: companyAddress.trim(),
      city: companyCity.trim(),
    })
    showNotification('Datos de la empresa y encabezados de comprobantes actualizados.')
  }

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Notificación toast */}
      {notification && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Selector de subpestañas */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('branches')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeSubTab === 'branches'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Agencias & Destinos ({state.branches.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tariffs')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeSubTab === 'tariffs'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Tarifas & Parámetros</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('company')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeSubTab === 'company'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Datos Empresariales / Sindicato</span>
          </button>
        </div>

        {activeSubTab === 'branches' && (
          <button
            type="button"
            onClick={() => setIsAddBranchOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Agencia</span>
          </button>
        )}
      </div>

      {/* Subpestaña 1: Agencias y Destinos */}
      {activeSubTab === 'branches' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-slate-900">Directorio de Agencias y Destinos</h4>
              <p className="text-xs text-slate-500">
                Administra las sucursales habilitadas para origen, traslado y entrega final de encomiendas.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {state.branches.map(b => (
              <div
                key={b.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {b.code}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{b.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        b.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {b.isActive ? 'Habilitada' : 'Inactiva'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {b.city} ({b.department}) · {b.address}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {b.phone}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleBranchActive(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    b.isActive
                      ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                      : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {b.isActive ? 'Desactivar' : 'Habilitar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subpestaña 2: Tarifas y Parámetros */}
      {activeSubTab === 'tariffs' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs max-w-2xl space-y-4">
          <div>
            <h4 className="text-sm font-black text-slate-900">Tarifario de Encomiendas y Paquetería</h4>
            <p className="text-xs text-slate-500">
              Modifica los importes base y recargos aplicados automáticamente al registrar encomiendas.
            </p>
          </div>

          <form onSubmit={handleSaveTariffs} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Tarifa Base Estándar (Bs.) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={baseFee}
                  onChange={e => setBaseFee(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                />
                <span className="text-[10px] text-slate-400">Cobro mínimo por paquete estándar.</span>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Kilos Libres en Tarifa Base (Kg) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={freeWeightKg}
                  onChange={e => setFreeWeightKg(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                />
                <span className="text-[10px] text-slate-400">Peso incluido sin recargo adicional.</span>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Tarifa por Kilo Adicional (Bs./Kg) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={extraKgRate}
                  onChange={e => setExtraKgRate(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                />
                <span className="text-[10px] text-slate-400">Cobro por cada kilo que supere los kilos libres.</span>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Recargo por Entrega a Domicilio (Bs.) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={homeDeliveryFee}
                  onChange={e => setHomeDeliveryFee(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                />
                <span className="text-[10px] text-slate-400">Adicional cuando el cliente elige entrega en puerta.</span>
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Tarifas</span>
            </button>
          </form>
        </div>
      )}

      {/* Subpestaña 3: Datos de Empresa / Sindicato */}
      {activeSubTab === 'company' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs max-w-2xl space-y-4">
          <div>
            <h4 className="text-sm font-black text-slate-900">Identidad Empresarial y Encabezados</h4>
            <p className="text-xs text-slate-500">
              Estos datos se imprimen en los tickets térmicos de 80mm, guías A4 y recibos oficiales.
            </p>
          </div>

          <form onSubmit={handleSaveCompany} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="block font-bold text-slate-700">Nombre Comercial de la Empresa / Sindicato *</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block font-bold text-slate-700">Razón Social o Personería Jurídica</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={e => setLegalName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  placeholder="Ej. Sindicato Mixto de Transporte & Encomiendas"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">NIT o Registro Tributario</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={e => setTaxId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  placeholder="Ej. 1029384021"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Teléfonos / Celulares de Contacto</label>
                <input
                  type="text"
                  value={companyPhone}
                  onChange={e => setCompanyPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  placeholder="Ej. 4-4251234 / 70712345"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block font-bold text-slate-700">Dirección Sede Central</label>
                <input
                  type="text"
                  value={companyAddress}
                  onChange={e => setCompanyAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  placeholder="Ej. Av. Ayacucho #452"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Ciudad Sede</label>
                <input
                  type="text"
                  value={companyCity}
                  onChange={e => setCompanyCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  placeholder="Ej. Cochabamba - Bolivia"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Datos de Empresa</span>
            </button>
          </form>
        </div>
      )}

      {/* Modal para Agregar Nueva Agencia */}
      {isAddBranchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4 text-slate-950" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Nueva Agencia / Destino</h3>
                  <p className="text-[11px] text-slate-400">Habilita una nueva ciudad para despachos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddBranchOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre de la Agencia *</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="Ej. Sucre - Terminal Interdepartamental"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ciudad *</label>
                  <input
                    type="text"
                    value={branchCity}
                    onChange={e => setBranchCity(e.target.value)}
                    placeholder="Ej. Sucre"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código de Agencia *</label>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={e => setBranchCode(e.target.value)}
                    placeholder="Ej. SUC-01"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold font-mono text-slate-900 uppercase"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Departamento</label>
                <select
                  value={branchDepartment}
                  onChange={e => setBranchDepartment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                >
                  <option value="Cochabamba">Cochabamba</option>
                  <option value="La Paz">La Paz</option>
                  <option value="Santa Cruz">Santa Cruz</option>
                  <option value="Oruro">Oruro</option>
                  <option value="Chuquisaca">Chuquisaca (Sucre)</option>
                  <option value="Potosí">Potosí</option>
                  <option value="Tarija">Tarija</option>
                  <option value="Beni">Beni</option>
                  <option value="Pando">Pando</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Dirección de la Agencia</label>
                <input
                  type="text"
                  value={branchAddress}
                  onChange={e => setBranchAddress(e.target.value)}
                  placeholder="Ej. Av. Ostria Gutiérrez (Terminal de Buses)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Teléfono / Celular</label>
                <input
                  type="text"
                  value={branchPhone}
                  onChange={e => setBranchPhone(e.target.value)}
                  placeholder="Ej. 4-6451234"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddBranchOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold"
                >
                  Guardar Agencia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
