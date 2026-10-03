import { Building2, Layers, CreditCard, ExternalLink, Activity, ShieldCheck } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'

interface DashboardSectionProps {
  onNavigateTab: (tab: string) => void
}

export function DashboardSection({ onNavigateTab }: DashboardSectionProps) {
  const { config, publishedTemplates, publishedExtras } = useCommercialConfig()

  // Datos operacionales reales del sistema
  const totalTemplates = config.templates.length
  const publishedTemplatesCount = publishedTemplates.length
  const totalPlans = config.plans.length
  const publishedPlansCount = config.plans.filter((p) => p.status === 'published').length
  const totalExtras = config.extras.length

  // Clientes y tenants de prueba/registrados en la plataforma
  const clientSummary = {
    totalClients: 4,
    activeSubscriptions: 2,
    trialAccounts: 2,
    mostPopularTemplate: 'Restaurante',
    distributionByTemplate: [
      { name: 'Restaurante', count: 2, percentage: 50 },
      { name: 'Distribuidora', count: 1, percentage: 25 },
      { name: 'Nightclub & Lounge', count: 1, percentage: 25 },
      { name: 'Ventas Express', count: 0, percentage: 0 },
    ],
  }

  return (
    <div className="space-y-8">
      {/* Encabezado del Dashboard */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Resumen de Plataforma
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Panel de supervisión comercial y operativa de PACHAX Platform.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.open('/', '_blank')}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>Ver web pública</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Principales (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Empresas registradas</span>
            <Building2 className="w-4 h-4 text-[#0066FF]" />
          </div>
          <div className="text-3xl font-black text-slate-950">
            {clientSummary.totalClients}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {clientSummary.activeSubscriptions} activas · {clientSummary.trialAccounts} en período de prueba
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Plantillas activas</span>
            <Layers className="w-4 h-4 text-[#0066FF]" />
          </div>
          <div className="text-3xl font-black text-slate-950">
            {publishedTemplatesCount}
            <span className="text-xs font-normal text-slate-400 ml-1.5">/ {totalTemplates}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Todas compartidas con Studio y Demos
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Planes publicados</span>
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-slate-950">
            {publishedPlansCount}
            <span className="text-xs font-normal text-slate-400 ml-1.5">/ {totalPlans}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Sin precios placeholder en producción
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Servicios adicionales</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-950">
            {publishedExtras.length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">/ {totalExtras}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Módulos y desarrollo a medida
          </p>
        </div>
      </div>

      {/* Grid de Estado: Distribución por Plantilla y Estado Técnico de Servicios */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Distribución de empresas por rubro */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Adopción por Plantilla
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribución de empresas activas según el modelo de negocio
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('clients')}
              className="text-xs font-semibold text-[#0066FF] hover:underline cursor-pointer"
            >
              Ver clientes &rarr;
            </button>
          </div>

          <div className="space-y-4 pt-1">
            {clientSummary.distributionByTemplate.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{item.name}</span>
                  <span className="text-slate-500">{item.count} empresas ({item.percentage}%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0066FF]"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900 flex items-center justify-between">
            <span>Plantilla con mayor actividad: <strong>{clientSummary.mostPopularTemplate}</strong></span>
            <button
              type="button"
              onClick={() => onNavigateTab('templates')}
              className="text-[#0066FF] font-bold hover:underline cursor-pointer"
            >
              Gestionar
            </button>
          </div>
        </div>

        {/* Estado del Sistema e Infraestructura */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Estado de Infraestructura
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Disponibilidad de servicios y conexiones de plataforma
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-600">Autenticación (Firebase Auth)</span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                  Operativo
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-600">Base de Datos (Firestore Multitenant)</span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                  Operativo
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-600">Almacenamiento de Assets</span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                  Local / Cloud
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-600">Pasarela de Cobros / Suscripciones</span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-amber-700 bg-amber-50 border border-amber-200">
                  Pendiente integración
                </span>
              </div>
            </div>
          </div>

          {/* Accesos rápidos administrativos */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('plans')}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all text-center cursor-pointer"
            >
              Configurar planes
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('studio')}
              className="flex-1 py-2.5 px-3 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold transition-all text-center cursor-pointer shadow-xs"
            >
              Abrir Studio
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
