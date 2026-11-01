import { useState, useRef, useEffect } from 'react'
import {
  Package,
  Truck,
  FileCheck,
  Wallet,
  Users,
  CreditCard,
  Briefcase,
  Receipt,
  Search,
  Plus,
  Printer,
  MapPin,
  ShieldCheck,
  Settings,
  Clock,
  BarChart3,
} from 'lucide-react'
import type {
  ParcelAppState,
  ParcelShipment,
} from '../types'
import { DemoParcelController } from '../../../demo/parcel/demoParcelController'
import { EXPRESO_PUNATA_LOGO_PATH } from '../assets/expresoPunataLogo'
import { EXPRESO_PUNATA_COMPANY } from '../domain/expresoPunataConfig'
import { calculateDuesCollectionForPeriod } from '../domain/parcelEngine'
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

interface ExpresoPunataExperienceProps {
  controller: DemoParcelController
  state: ParcelAppState
}

export function ExpresoPunataExperience({
  controller,
  state,
}: ExpresoPunataExperienceProps) {
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

  const company = state.companyInfo || EXPRESO_PUNATA_COMPANY

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

  const now = new Date()
  const boliviaPeriod = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
  }).format(now)

  const boliviaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  // Métricas rápidas de cabecera calculadas dinámicamente en zona horaria Bolivia
  const activeMembersCount = state.members.filter(m => m.status === 'active').length

  // Recaudación estricta de cuotas del período mensual actual basada en pagos reales
  const currentMonthPaidDuesAmount = calculateDuesCollectionForPeriod(state.dues, boliviaPeriod)

  // Desplazamiento táctil fluido para la barra horizontal de módulos
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeTab])

  // Cuotas vencidas o con mora respecto al período/fecha actual en Bolivia
  const overdueDuesCount = state.dues.filter(d => 
    d.status === 'overdue' || (d.status === 'pending' && (d.period < boliviaPeriod || (d.dueDate && d.dueDate < boliviaDate)))
  ).length

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
      {/* Top Bar Institucional Expreso Punata (Verde Oscuro y Amarillo Intenso) */}
      <header className="bg-[#064e3b] text-white px-3 sm:px-6 py-2.5 sm:py-3 border-b-2 border-yellow-400 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Logo Oficial y Datos de Empresa */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white p-1 border-2 border-yellow-400 shadow-sm flex items-center justify-center shrink-0">
              <img
                src={EXPRESO_PUNATA_LOGO_PATH}
                alt="S.M.T. Expreso Punata"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="font-black text-sm sm:text-base lg:text-lg tracking-tight text-white truncate max-w-[200px] sm:max-w-none">
                  {company.name}
                </span>
                <span className="text-[10px] sm:text-[11px] font-black bg-yellow-400 text-slate-950 px-1.5 sm:px-2 py-0.5 rounded-md shadow-xs shrink-0">
                  S.M.T.
                </span>
                <span className="text-[10px] font-bold bg-emerald-900/90 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-yellow-400" />
                  Atención 24 Horas
                </span>
                <span className="text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full shrink-0">
                  DEMO INTERNA DEL CLIENTE
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-emerald-100 mt-1">
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <span className="font-semibold shrink-0">Agencia activa: </span>
                  <select
                    value={state.currentBranchId}
                    onChange={e => controller.switchBranch(e.target.value)}
                    className="bg-emerald-900/90 border border-emerald-700 text-yellow-300 font-bold rounded-lg px-2 py-0.5 text-xs cursor-pointer focus:ring-1 focus:ring-yellow-400 truncate max-w-[140px] sm:max-w-none"
                  >
                    {state.branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <span className="hidden md:inline text-emerald-300 text-[11px] truncate">
                  {company.slogan || 'Servicio Ejecutivo — "Somos los Pioneros"'}
                </span>
              </div>
            </div>
          </div>

          {/* Control de Caja y Arqueo de Turno */}
          <div className="flex items-center justify-end sm:justify-start gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsCashModalOpen(true)}
              className="w-full sm:w-auto px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700 text-xs font-bold text-white flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
              title="Abrir o cerrar turno de caja y conciliar movimientos"
            >
              <Wallet className="w-4 h-4 text-yellow-400 shrink-0" />
              <span>
                Caja Ventanilla: {state.activeShift ? `Bs. ${state.activeShift.expectedCash.toFixed(2)}` : 'Cerrada'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner Institucional Expreso Punata */}
      <div className="bg-emerald-950 text-emerald-200 px-4 py-1.5 text-center text-xs font-semibold border-b border-emerald-900 flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-yellow-400 shrink-0" />
        <span>
          <strong>Sindicato Mixto de Transporte Expreso Punata</strong> — Sistema Integrado de Encomiendas, Pasajes, Socios y Finanzas Sindicales.
        </span>
      </div>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-5">
        {/* Barra de Acciones Operativas Rápidas (Botones Claros de Mostrador) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          <button
            type="button"
            onClick={() => setIsNewParcelOpen(true)}
            className="p-3.5 sm:p-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-2xl shadow-sm hover:shadow-md transition text-left flex items-center gap-3.5 group cursor-pointer border border-emerald-600 min-h-[64px]"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-yellow-400 text-slate-950 flex items-center justify-center shrink-0 font-bold shadow-xs">
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base tracking-tight leading-tight">Nueva Encomienda</div>
              <div className="text-[11px] text-emerald-100">Guía con QR y comprobante</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            className="p-3.5 sm:p-4 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs transition text-left flex items-center gap-3.5 group cursor-pointer min-h-[64px]"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0 group-hover:bg-[#064e3b] group-hover:text-yellow-400 transition">
              <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight">Despachar Manifiesto</div>
              <div className="text-[11px] text-slate-500">{pendingDispatchCount} por despachar</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleOpenDelivery()}
            className="p-3.5 sm:p-4 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs transition text-left flex items-center gap-3.5 group cursor-pointer min-h-[64px]"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-yellow-100 text-yellow-900 flex items-center justify-center shrink-0 group-hover:bg-yellow-400 group-hover:text-slate-950 transition">
              <FileCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight">Entregar Encomienda</div>
              <div className="text-[11px] text-slate-500">{readyForPickupCount} listas en agencia</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dues')}
            className="p-3.5 sm:p-4 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-2xl shadow-xs transition text-left flex items-center gap-3.5 group cursor-pointer min-h-[64px]"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition">
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight">Aportes Sindicales</div>
              <div className="text-[11px] text-slate-500">{activeMembersCount} socios activos</div>
            </div>
          </button>
        </div>

        {/* Tarjetas de Resumen Operativo & Sindical */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-slate-500 block font-semibold text-[10px] sm:text-[11px] truncate">Encomiendas Registradas</span>
            <span className="text-lg sm:text-xl font-black text-slate-900">{state.shipments.length}</span>
            <span className="text-[9px] sm:text-[10px] text-emerald-700 block mt-0.5 truncate">En agencias y rutas</span>
          </div>

          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-slate-500 block font-semibold text-[10px] sm:text-[11px] truncate">Listas para Entrega</span>
            <span className="text-lg sm:text-xl font-black text-amber-600">{readyForPickupCount}</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500 block mt-0.5 truncate">Pendientes de retiro</span>
          </div>

          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-slate-500 block font-semibold text-[10px] sm:text-[11px] truncate">Recaudación Cuotas</span>
            <span className="text-lg sm:text-xl font-black text-emerald-700">Bs. {currentMonthPaidDuesAmount.toFixed(2)}</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500 block mt-0.5 truncate">Periodo {boliviaPeriod}</span>
          </div>

          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-slate-500 block font-semibold text-[10px] sm:text-[11px] truncate">Cuotas con Mora</span>
            <span className="text-lg sm:text-xl font-black text-rose-600">{overdueDuesCount}</span>
            <span className="text-[9px] sm:text-[10px] text-rose-600 block mt-0.5 truncate">Con recargo del 10%</span>
          </div>
        </div>

        {/* Pestañas de Navegación del Sistema (Desplazamiento táctil horizontal fluido con auto-scroll activo) */}
        <div className="relative w-full">
          <div
            ref={tabsContainerRef}
            className="flex items-center gap-1.5 overflow-x-auto scroll-smooth pb-1.5 border-b border-slate-200 font-bold text-xs no-scrollbar overscroll-x-contain"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <button
              ref={activeTab === 'shipments' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('shipments')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'shipments'
                  ? 'bg-[#064e3b] text-yellow-300 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Tablero de Encomiendas</span>
            </button>

            <button
              ref={activeTab === 'manifests' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('manifests')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'manifests'
                  ? 'bg-[#064e3b] text-yellow-300 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Despachos y Manifiestos</span>
            </button>

            <button
              ref={activeTab === 'members' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('members')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'members'
                  ? 'bg-yellow-400 text-slate-950 shadow-xs'
                  : 'text-emerald-900 hover:bg-emerald-100/70'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Padrón de Socios</span>
            </button>

            <button
              ref={activeTab === 'dues' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('dues')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'dues'
                  ? 'bg-yellow-400 text-slate-950 shadow-xs'
                  : 'text-emerald-900 hover:bg-emerald-100/70'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Mensualidades & Cuotas</span>
            </button>

            <button
              ref={activeTab === 'workers' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('workers')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'workers'
                  ? 'bg-yellow-400 text-slate-950 shadow-xs'
                  : 'text-emerald-900 hover:bg-emerald-100/70'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Choferes & Trabajadores</span>
            </button>

            <button
              ref={activeTab === 'expenses' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-yellow-400 text-slate-950 shadow-xs'
                  : 'text-emerald-900 hover:bg-emerald-100/70'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Gastos del Sindicato</span>
            </button>

            <button
              ref={activeTab === 'reports' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-[#064e3b] text-yellow-300 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reportes & Finanzas</span>
            </button>

            <button
              ref={activeTab === 'config' ? activeTabRef : null}
              type="button"
              onClick={() => setActiveTab('config')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shrink-0 whitespace-nowrap min-w-max flex items-center gap-2 cursor-pointer ${
                activeTab === 'config'
                  ? 'bg-[#064e3b] text-yellow-300 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Configuración Expreso Punata</span>
            </button>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-1.5 w-6 sm:w-8 bg-gradient-to-l from-slate-100 to-transparent sm:hidden" />
        </div>

        {/* VISTAS DE LAS PESTAÑAS */}

        {/* 1. TABLERO DE ENCOMIENDAS */}
        {activeTab === 'shipments' && (
          <div className="space-y-4">
            {/* Filtros y Buscador */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar por guía, destinatario, remitente, teléfono..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Selector de Estado */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold py-1 no-scrollbar overscroll-x-contain">
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'received', label: 'En Mostrador' },
                  { id: 'dispatched', label: 'Despachadas' },
                  { id: 'in_transit', label: 'En Ruta' },
                  { id: 'ready_for_pickup', label: 'En Agencia Destino' },
                  { id: 'delivered', label: 'Entregadas' },
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-3 py-1.5 rounded-xl transition shrink-0 whitespace-nowrap cursor-pointer ${
                      statusFilter === st.id
                        ? 'bg-emerald-800 text-yellow-300 font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vista Móvil: Tarjetas de encomiendas optimizadas para celulares */}
            <div className="md:hidden space-y-2.5">
              {filteredShipments.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
                  No se encontraron encomiendas registradas con los filtros seleccionados.
                </div>
              ) : (
                filteredShipments.map(s => {
                  const isCOD = s.paymentTiming === 'destination_cod'
                  const isReady = s.status === 'ready_for_pickup'

                  return (
                    <div key={s.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-xs text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">
                          {s.trackingCode}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              s.status === 'delivered'
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.status === 'ready_for_pickup'
                                  ? 'bg-amber-100 text-amber-800'
                                  : s.status === 'in_transit'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {s.status === 'ready_for_pickup'
                              ? 'EN AGENCIA'
                              : s.status === 'in_transit'
                                ? 'EN RUTA'
                                : s.status === 'dispatched'
                                  ? 'DESPACHADA'
                                  : s.status === 'received'
                                    ? 'EN MOSTRADOR'
                                    : s.status === 'delivered'
                                      ? 'ENTREGADA'
                                      : s.status}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(s.createdAt).toLocaleDateString('es-BO')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Ruta:</span>
                          <span className="font-bold text-slate-900">{s.originCity} → {s.destinationCity}</span>
                          {s.deliveryType === 'home' && (
                            <span className="text-[10px] text-amber-700 font-semibold block">A Domicilio</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-semibold">Cobro:</span>
                          <span className="font-black text-slate-900">Bs. {s.finalAmount.toFixed(2)}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block ${
                              isCOD
                                ? s.paymentStatus === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isCOD ? (s.paymentStatus === 'paid' ? 'COD PAGADO' : 'COD PENDIENTE') : 'ORIGEN'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Remitente:</span>
                          <div className="font-bold text-slate-900 truncate">{s.sender.name}</div>
                          <div className="text-[10px] text-slate-500">{s.sender.phone}</div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Destinatario:</span>
                          <div className="font-bold text-slate-900 truncate">{s.recipient.name}</div>
                          <div className="text-[10px] text-slate-500">{s.recipient.phone}</div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-1.5 flex items-center justify-between">
                        <span className="truncate max-w-[200px]" title={s.declaredSummary}>
                          {s.declaredSummary}
                        </span>
                        <span className="font-semibold text-slate-700 shrink-0">
                          {s.packageCount} bulto(s) · {s.totalWeightKg} kg
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        {isReady && (
                          <button
                            type="button"
                            onClick={() => handleOpenDelivery(s)}
                            className="flex-1 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center cursor-pointer"
                          >
                            Entregar al Cliente
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenPrintTicket(s)}
                          className="py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Imprimir Guía</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Vista Desktop: Tabla con scroll horizontal */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Código Guía</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Ruta</th>
                      <th className="p-3">Remitente</th>
                      <th className="p-3">Destinatario</th>
                      <th className="p-3">Contenido</th>
                      <th className="p-3">Cobro</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                    {filteredShipments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">
                          No se encontraron encomiendas registradas con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredShipments.map(s => {
                        const isCOD = s.paymentTiming === 'destination_cod'
                        const isReady = s.status === 'ready_for_pickup'

                        return (
                          <tr key={s.id} className="hover:bg-emerald-50/40 transition">
                            <td className="p-3 font-mono font-black text-emerald-950">
                              {s.trackingCode}
                            </td>
                            <td className="p-3 text-slate-500 whitespace-nowrap">
                              {new Date(s.createdAt).toLocaleDateString('es-BO')}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-slate-900">{s.originCity}</span>
                              <span className="text-slate-400 mx-1">→</span>
                              <span className="font-bold text-slate-900">{s.destinationCity}</span>
                              {s.deliveryType === 'home' && (
                                <span className="block text-[10px] text-amber-700 font-semibold">
                                  A Domicilio
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{s.sender.name}</div>
                              <div className="text-[11px] text-slate-500">{s.sender.phone}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{s.recipient.name}</div>
                              <div className="text-[11px] text-slate-500">{s.recipient.phone}</div>
                            </td>
                            <td className="p-3 max-w-[200px]">
                              <div className="truncate text-slate-800" title={s.declaredSummary}>
                                {s.declaredSummary}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {s.packageCount} bulto(s) · {s.totalWeightKg} kg
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="font-black text-slate-900">
                                Bs. {s.finalAmount.toFixed(2)}
                              </div>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isCOD
                                    ? s.paymentStatus === 'paid'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isCOD
                                  ? s.paymentStatus === 'paid'
                                    ? 'COD PAGADO'
                                    : 'COD PENDIENTE'
                                  : 'ORIGEN'}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  s.status === 'delivered'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : s.status === 'ready_for_pickup'
                                      ? 'bg-amber-100 text-amber-800'
                                      : s.status === 'in_transit'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {s.status === 'ready_for_pickup'
                                  ? 'EN AGENCIA'
                                  : s.status === 'in_transit'
                                    ? 'EN RUTA'
                                    : s.status === 'dispatched'
                                      ? 'DESPACHADA'
                                      : s.status === 'received'
                                        ? 'EN MOSTRADOR'
                                        : s.status === 'delivered'
                                          ? 'ENTREGADA'
                                          : s.status}
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap space-x-1">
                              {isReady && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDelivery(s)}
                                  className="px-2.5 py-1 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-[11px] rounded-lg transition shadow-xs cursor-pointer"
                                  title="Entregar al cliente"
                                >
                                  Entregar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenPrintTicket(s)}
                                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                                title="Reimprimir comprobante de guía"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. DESPACHOS Y MANIFIESTOS */}
        {activeTab === 'manifests' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="font-black text-sm text-slate-900">Manifiestos de Despacho Interdepartamental</h3>
                <p className="text-xs text-slate-500">
                  Control de fletes asignados a choferes y buses de S.M.T. Expreso Punata.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Despacho</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {state.manifests.map(m => (
                <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono font-black text-emerald-950 text-sm">{m.manifestNumber}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(m.createdAt).toLocaleString('es-BO')}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                      {m.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Destino</span>
                      <strong className="text-slate-900">{m.destinationCity}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Vehículo / Placa</span>
                      <strong className="text-slate-900">{m.vehiclePlate || 'S/P'}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-500 block">Conductor / Chofer</span>
                      <strong className="text-slate-900">{m.driverOrResponsible}</strong>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100">
                    <span className="text-slate-600">
                      <strong>{m.parcelIds.length}</strong> guías · <strong>{m.totalPackages}</strong> bultos ({m.totalWeightKg} kg)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        import('../domain/parcelDocuments').then(({ generateManifestPdf }) => {
                          generateManifestPdf(m, state.shipments, company).then(({ url, filename }) => {
                            const a = document.createElement('a')
                            a.href = url
                            a.download = filename
                            a.click()
                          })
                        })
                      }}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 font-bold text-slate-700 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir A4</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. PADRÓN DE SOCIOS */}
        {activeTab === 'members' && (
          <SyndicateMembersView
            members={state.members}
            dues={state.dues}
            onAddMember={m => controller.createMember(m)}
          />
        )}

        {/* 4. MENSUALIDADES & CUOTAS SINDICALES */}
        {activeTab === 'dues' && (
          <SyndicateDuesView
            dues={state.dues}
            members={state.members}
            companyInfo={company}
            onGeneratePeriod={(p, l, d) => controller.generateDuesPeriod(p, l, d)}
            onPayDue={params => controller.payDue(params)}
            onRevertPayment={params => controller.revertDuePayment(params)}
          />
        )}

        {/* 5. CHOFERES & TRABAJADORES */}
        {activeTab === 'workers' && (
          <SyndicateWorkersView
            workers={state.workers}
            payments={state.workerPayments}
            onRegisterPayment={params => controller.registerWorkerPayment(params)}
            onAddWorker={w => controller.addWorker(w)}
          />
        )}

        {/* 6. GASTOS DEL SINDICATO */}
        {activeTab === 'expenses' && (
          <SyndicateExpensesView
            expenses={state.unionExpenses}
            onAddExpense={params => controller.registerUnionExpense(params)}
          />
        )}

        {/* 7. REPORTES & FINANZAS CONSOLIDADAS */}
        {activeTab === 'reports' && (
          <ParcelReportsView state={state} />
        )}

        {/* 8. CONFIGURACIÓN EMPRESARIAL */}
        {activeTab === 'config' && (
          <ParcelConfigView
            state={state}
            onAddBranch={b => controller.addBranch(b)}
            onToggleBranchActive={id => controller.toggleBranchActive(id)}
            onUpdateCompanyInfo={info => controller.updateCompanyInfo(info)}
            onUpdateTariffConfig={t => controller.updateTariffConfig(t)}
          />
        )}
      </main>

      {/* Footer Discreto Powered by PACHAX */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 px-6 py-4 mt-8 text-center text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">S.M.T. EXPRESO PUNATA</span>
            <span>·</span>
            <span>Servicio Ejecutivo — Cochabamba, Bolivia</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Powered by <strong className="text-teal-400">PACHAX Platform</strong> · Demostración Interna para Revisión
          </div>
        </div>
      </footer>

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
        companyInfo={company}
      />

      <ParcelDispatchManifestModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        branches={state.branches}
        currentBranchId={state.currentBranchId}
        availableShipments={state.shipments}
        companyInfo={company}
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
        companyInfo={company}
        onDeliver={params => controller.deliverShipment(params)}
      />

      <CashShiftModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        activeShift={state.activeShift}
        movements={state.cashMovements}
        onOpenShift={(cash, op) => controller.openCashShift(cash, op)}
        onCloseShift={(actual, notes) => controller.closeCashShift(actual, notes)}
        onReconcileMovements={(ids, sup, notes) =>
          controller.reconcilePendingMovements({ movementIds: ids, supervisorName: sup, notes })
        }
      />
    </div>
  )
}
