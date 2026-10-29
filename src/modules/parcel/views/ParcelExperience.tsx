import { useState } from 'react'
import {
  Package,
  Truck,
  FileCheck,
  Wallet,
  Users,
  CreditCard,
  Briefcase,
  Receipt,
  FileText,
  Search,
  Plus,
  Printer,
  MapPin,
  ShieldCheck,
  Settings,
} from 'lucide-react'
import type {
  ParcelAppState,
  ParcelEdition,
  ParcelShipment,
} from '../types'
import { DemoParcelController } from '../../../demo/parcel/demoParcelController'
import { NewParcelModal } from '../components/NewParcelModal'
import { ParcelReceptionTicketModal } from '../components/ParcelReceptionTicketModal'
import { ParcelDispatchManifestModal } from '../components/ParcelDispatchManifestModal'
import { ParcelDeliveryModal } from '../components/ParcelDeliveryModal'
import { CashShiftModal } from '../components/CashShiftModal'
import { SyndicateMembersView } from '../components/SyndicateMembersView'
import { SyndicateDuesView } from '../components/SyndicateDuesView'
import { SyndicateWorkersView } from '../components/SyndicateWorkersView'
import { SyndicateExpensesView } from '../components/SyndicateExpensesView'
import { ParcelReportsView } from '../components/ParcelReportsView'
import { ParcelConfigView } from '../components/ParcelConfigView'

interface ParcelExperienceProps {
  controller: DemoParcelController
  state: ParcelAppState
  companyName?: string
  logoUrl?: string
  edition?: ParcelEdition
  onEditionChange?: (edition: ParcelEdition) => void
}

export function ParcelExperience({
  controller,
  state,
  companyName = 'TRANS-BOLIVIA ENCOMIENDAS & LOGÍSTICA',
  edition = state.edition,
  onEditionChange,
}: ParcelExperienceProps) {
  const currentEdition = edition || state.edition
  const isSyndicate = currentEdition === 'sindicato'

  const [activeTab, setActiveTab] = useState<string>('shipments')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modales
  const [isNewParcelOpen, setIsNewParcelOpen] = useState(false)
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
  const [ticketShipment, setTicketShipment] = useState<ParcelShipment | null>(null)
  const [isReprint, setIsReprint] = useState(false)

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false)
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false)
  const [preselectedDeliveryShipment, setPreselectedDeliveryShipment] = useState<ParcelShipment | null>(null)
  const [isCashModalOpen, setIsCashModalOpen] = useState(false)


  const handleSwitchEdition = (newEd: ParcelEdition) => {
    controller.setEdition(newEd)
    if (onEditionChange) onEditionChange(newEd)
    if (newEd === 'standard' && ['members', 'dues', 'workers', 'expenses'].includes(activeTab)) {
      setActiveTab('shipments')
    }
  }

  // Filtrado de encomiendas
  const filteredShipments = state.shipments.filter(s => {
    const matchesSearch =
      s.trackingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.recipient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.sender.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.recipient.phone.includes(searchTerm) ||
      s.destinationCity.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const readyForPickupCount = state.shipments.filter(s => s.status === 'ready_for_pickup').length
  const pendingDispatchCount = state.shipments.filter(s => s.status === 'received' || s.status === 'pending_dispatch').length

  const handleCreateShipment = (data: Parameters<typeof controller.registerShipment>[0]) => {
    const created = controller.registerShipment(data)
    setIsNewParcelOpen(false)
    setTicketShipment(created)
    setIsReprint(false)
    setIsTicketModalOpen(true)
  }

  const handleOpenPrintTicket = (shipment: ParcelShipment) => {
    setTicketShipment(shipment)
    setIsReprint(true)
    setIsTicketModalOpen(true)
  }

  const handleOpenDelivery = (shipment?: ParcelShipment) => {
    setPreselectedDeliveryShipment(shipment || null)
    setIsDeliveryModalOpen(true)
  }

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-800 font-sans flex flex-col">
      {/* Top Bar Institucional & Selector de Perfil */}
      <header className="bg-slate-900 text-white px-3 sm:px-6 py-3 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo y Agencia Activa */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center font-black text-xl shadow-xs">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base tracking-tight text-white">{companyName}</span>
                <span className="hidden md:inline-block text-[10px] font-bold bg-teal-950/80 text-teal-300 border border-teal-800 px-2 py-0.5 rounded-full">
                  Bolivia
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-teal-400" />
                <span>Agencia: </span>
                <select
                  value={state.currentBranchId}
                  onChange={e => controller.switchBranch(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-teal-300 font-bold rounded-lg px-2 py-0.5 text-xs cursor-pointer focus:ring-1 focus:ring-teal-400"
                >
                  {state.branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Selector de Perfil Canónico (Estándar vs Sindicato) */}
          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <span className="text-[11px] font-bold text-slate-400 pl-2 hidden lg:inline">Perfil de Operación:</span>
            <button
              type="button"
              onClick={() => handleSwitchEdition('standard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                !isSyndicate
                  ? 'bg-teal-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Encomiendas Estándar</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchEdition('sindicato')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                isSyndicate
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Edición Sindicato</span>
            </button>
          </div>

          {/* Estado de Caja */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCashModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-2 transition"
              title="Abrir o cerrar turno de caja"
            >
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span>
                Caja: {state.activeShift ? `Bs. ${state.activeShift.expectedCash.toFixed(2)}` : 'Cerrada'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner de Ayuda Contextual Operativa */}
      <div className="bg-slate-900/90 text-slate-300 px-4 py-1.5 text-center text-[11px] font-semibold border-b border-slate-800 flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
        <span>
          {isSyndicate
            ? 'Perfil Sindicato Activo: Módulos de encomiendas, padrón de socios, aportes, choferes y balance unificado.'
            : 'Perfil Estándar Activo: Gestión simplificada de encomiendas de mostrador, manifiestos y entregas.'}
        </span>
      </div>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-5">
        {/* Barra de Acciones Operativas Rápidas (Botones Grandes y Clarísimos) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setIsNewParcelOpen(true)}
            className="p-4 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl shadow-sm hover:shadow-md transition text-left flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base tracking-tight leading-tight">Nueva Encomienda</div>
              <div className="text-[11px] text-teal-100">Registrar e imprimir guía</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-2xl shadow-xs transition text-left flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight">Despachar Manifiesto</div>
              <div className="text-[11px] text-slate-500">{pendingDispatchCount} por despachar</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleOpenDelivery()}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-2xl shadow-xs transition text-left flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight">Entregar Encomienda</div>
              <div className="text-[11px] text-slate-500">{readyForPickupCount} listas para entrega</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setIsCashModalOpen(true)}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-2xl shadow-xs transition text-left flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight">Caja de Agencia</div>
              <div className="text-[11px] text-slate-500">Arqueo y cierre de turno</div>
            </div>
          </button>
        </div>

        {/* Pestañas de Navegación del Sistema */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 font-bold text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('shipments')}
            className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
              activeTab === 'shipments'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Tablero de Encomiendas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manifests')}
            className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
              activeTab === 'manifests'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Despachos y Manifiestos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
              activeTab === 'reports'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Reportes & PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
              activeTab === 'config'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Configuración</span>
          </button>


          {/* Pestañas exclusivas de la Edición Sindicato */}
          {isSyndicate && (
            <>
              <div className="h-6 w-px bg-slate-300 mx-1 shrink-0" />

              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
                  activeTab === 'members'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-900 hover:bg-amber-100/70'
                }`}
              >
                <Users className="w-4 h-4 text-amber-950" />
                <span>Socios y Afiliados</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('dues')}
                className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
                  activeTab === 'dues'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-900 hover:bg-amber-100/70'
                }`}
              >
                <CreditCard className="w-4 h-4 text-amber-950" />
                <span>Mensualidades & Cuotas</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('workers')}
                className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
                  activeTab === 'workers'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-900 hover:bg-amber-100/70'
                }`}
              >
                <Briefcase className="w-4 h-4 text-amber-950" />
                <span>Trabajadores & Pagos</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('expenses')}
                className={`px-4 py-2.5 rounded-xl transition shrink-0 flex items-center gap-2 ${
                  activeTab === 'expenses'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-900 hover:bg-amber-100/70'
                }`}
              >
                <Receipt className="w-4 h-4 text-amber-950" />
                <span>Gastos del Sindicato</span>
              </button>
            </>
          )}
        </div>

        {/* 1. Vista de Tablero de Encomiendas */}
        {activeTab === 'shipments' && (
          <div className="space-y-4">
            {/* Buscador y Filtros */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por guía (ej. ENC-2026-00101), remitente, destinatario o teléfono..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-300 text-xs font-bold overflow-x-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  Todas ({state.shipments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('received')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'received' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  Recibidas
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('in_transit')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'in_transit' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  En Ruta
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ready_for_pickup')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'ready_for_pickup' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  Por Entregar
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('delivered')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'delivered' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  Entregadas
                </button>
              </div>
            </div>

            {/* Listado de Encomiendas */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              {filteredShipments.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No hay encomiendas registradas con los filtros seleccionados. Haz clic en "Nueva Encomienda" para registrar una.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredShipments.map(s => {
                    const isPaid = s.paymentStatus === 'paid'

                    return (
                      <div
                        key={s.id}
                        className="p-4 hover:bg-slate-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                      >
                        {/* Datos principales de la guía */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900">{s.trackingCode}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                s.status === 'delivered'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : s.status === 'ready_for_pickup'
                                  ? 'bg-blue-100 text-blue-800'
                                  : s.status === 'in_transit' || s.status === 'dispatched'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {s.status === 'ready_for_pickup'
                                ? 'Lista para retiro'
                                : s.status === 'in_transit'
                                ? 'En viaje'
                                : s.status === 'dispatched'
                                ? 'Despachada'
                                : s.status === 'delivered'
                                ? 'Entregada'
                                : 'Recibida en origen'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(s.createdAt).toLocaleDateString('es-BO')} {new Date(s.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="text-slate-700">
                            <strong>{s.originCity}</strong> → <strong>{s.destinationCity}</strong>{' '}
                            <span className="text-slate-500">({s.deliveryType === 'home' ? 'A Domicilio' : 'Retiro en Agencia'})</span>
                          </div>

                          <div className="text-slate-600 text-[11px]">
                            Remite: <strong className="text-slate-800">{s.sender.name}</strong> · Destinatario: <strong className="text-slate-800">{s.recipient.name}</strong> (Tel: {s.recipient.phone})
                          </div>

                          <div className="text-slate-500 text-[11px]">
                            Contenido: {s.declaredSummary} ({s.packageCount} bultos · {s.totalWeightKg} kg)
                          </div>
                        </div>

                        {/* Cobro y Acciones */}
                        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-0 border-slate-100">
                          <div className="text-left md:text-right">
                            <div className="font-black text-sm text-slate-900">Bs. {s.finalAmount.toFixed(2)}</div>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-300'
                              }`}
                            >
                              {isPaid ? 'CANCELADO' : 'COBRO EN DESTINO (COD)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPrintTicket(s)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1"
                              title="Ver o reimprimir guía"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Guía</span>
                            </button>

                            {s.status === 'ready_for_pickup' && (
                              <button
                                type="button"
                                onClick={() => handleOpenDelivery(s)}
                                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs"
                              >
                                <FileCheck className="w-3.5 h-3.5" />
                                <span>Entregar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. Vista de Despachos y Manifiestos */}
        {activeTab === 'manifests' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900">Manifiestos de Carga y Despacho</h3>
                <p className="text-xs text-slate-500">Historial de viajes y recepción de traslados interdepartamentales</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Truck className="w-4 h-4" />
                <span>Crear Nuevo Manifiesto</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs">
              {state.manifests.length === 0 ? (
                <div className="p-10 text-center text-slate-400">No hay manifiestos generados aún.</div>
              ) : (
                state.manifests.map(m => (
                  <div key={m.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900">{m.manifestNumber}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                          {m.status}
                        </span>
                      </div>
                      <div className="text-slate-600 text-xs mt-1">
                        Destino: <strong>{m.destinationCity}</strong> · Chofer: <strong>{m.driverOrResponsible}</strong> (Placa: {m.vehiclePlate || 'S/P'})
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        {m.parcelIds.length} encomiendas asignadas · {m.totalPackages} bultos · {m.totalWeightKg} kg
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {m.status === 'dispatched' && (
                        <button
                          type="button"
                          onClick={() => controller.receiveManifestAtDestination(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xs"
                          title="Simular llegada y recepción de encomiendas en agencia destino"
                        >
                          Simular Recepción en Destino
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. Vista de Reportes & Exportación */}
        {activeTab === 'reports' && <ParcelReportsView state={state} />}

        {/* 4. Módulos de Sindicato (si edition === 'sindicato') */}
        {isSyndicate && activeTab === 'members' && (
          <SyndicateMembersView
            members={state.members}
            dues={state.dues}
            onAddMember={m => controller.createMember(m)}
          />
        )}

        {isSyndicate && activeTab === 'dues' && (
          <SyndicateDuesView
            dues={state.dues}
            members={state.members}
            onGeneratePeriod={(p, l, d) => controller.generateDuesPeriod(p, l, d)}
            onPayDue={params => controller.payDue(params)}
          />
        )}

        {isSyndicate && activeTab === 'workers' && (
          <SyndicateWorkersView
            workers={state.workers}
            payments={state.workerPayments}
            onRegisterPayment={params => controller.registerWorkerPayment(params)}
            onAddWorker={worker => controller.addWorker(worker)}
          />
        )}

        {isSyndicate && activeTab === 'expenses' && (
          <SyndicateExpensesView
            expenses={state.unionExpenses}
            onAddExpense={params => controller.registerUnionExpense(params)}
          />
        )}

        {activeTab === 'config' && (
          <ParcelConfigView
            state={state}
            onAddBranch={branch => controller.addBranch(branch)}
            onToggleBranchActive={id => controller.toggleBranchActive(id)}
            onUpdateCompanyInfo={info => controller.updateCompanyInfo(info)}
            onUpdateTariffConfig={cfg => controller.updateTariffConfig(cfg)}
          />
        )}

      </main>

      {/* Modales Compartidos */}
      <NewParcelModal
        isOpen={isNewParcelOpen}
        onClose={() => setIsNewParcelOpen(false)}
        branches={state.branches}
        currentBranchId={state.currentBranchId}
        existingCustomers={state.customers}
        tariffConfig={state.tariffConfig}
        onSubmit={handleCreateShipment}
      />

      <ParcelReceptionTicketModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        shipment={ticketShipment}
        isReprint={isReprint}
      />

      <ParcelDispatchManifestModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        branches={state.branches}
        currentBranchId={state.currentBranchId}
        availableShipments={state.shipments}
        onSubmit={data => controller.createDispatchManifest(data)}
      />

      <ParcelDeliveryModal
        isOpen={isDeliveryModalOpen}
        onClose={() => {
          setIsDeliveryModalOpen(false)
          setPreselectedDeliveryShipment(null)
        }}
        readyShipments={state.shipments.filter(s => s.status === 'ready_for_pickup')}
        preselectedShipment={preselectedDeliveryShipment}
        onDeliver={params => controller.deliverShipment(params)}
      />

      <CashShiftModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        activeShift={state.activeShift}
        movements={state.cashMovements}
        onOpenShift={(cash, op) => controller.openCashShift(cash, op)}
        onCloseShift={(actual, notes) => controller.closeCashShift(actual, notes)}
      />
    </div>
  )
}
