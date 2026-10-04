import { useState, useEffect } from 'react'
import {
  Building2,
  Layers,
  CreditCard,
  ExternalLink,
  Activity,
  ShieldCheck,
  RefreshCw,
  Database,
  CheckCircle2,
} from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import { gateway } from '../../../services/gateway'
import { getFirebaseContext } from '../../../lib/firebase'
import { collection, getDocs } from 'firebase/firestore'

interface DashboardSectionProps {
  onNavigateTab: (tab: string) => void
}

interface RealStats {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  tenantsByType: Record<string, number>
}

export function DashboardSection({ onNavigateTab }: DashboardSectionProps) {
  const {
    config,
    publishedTemplates,
    publishedExtras,
    seedDefaultsToFirestore,
  } = useCommercialConfig()

  const [realStats, setRealStats] = useState<RealStats>({
    totalTenants: 0,
    activeTenants: 0,
    trialTenants: 0,
    tenantsByType: {
      restaurant_pos: 0,
      route_distribution: 0,
      nightclub_lounge: 0,
      gelateria_weight_cafe: 0,
    },
  })
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)

  const fetchStats = async () => {
    setIsLoadingStats(true)
    try {
      // 1. Intentar getPlatformStats
      const stats = await gateway<RealStats>('platformGateway', { action: 'getPlatformStats' })
      if (stats && typeof stats.totalTenants === 'number') {
        setRealStats(stats)
        setIsLoadingStats(false)
        return
      }
    } catch {
      // Continuar con fallback directo
    }

    try {
      // 2. Fallback directo a Firestore
      const ctx = await getFirebaseContext()
      if (ctx) {
        const snap = await getDocs(collection(ctx.db, 'tenants'))
        const byType: Record<string, number> = {
          restaurant_pos: 0,
          route_distribution: 0,
          nightclub_lounge: 0,
          gelateria_weight_cafe: 0,
        }
        let active = 0
        let trial = 0

        snap.docs.forEach((d) => {
          const data = d.data()
          const bt = data.businessType
          if (bt && byType[bt] !== undefined) {
            byType[bt]++
          }
          if (data.status === 'active') active++
          if (data.status === 'trial') trial++
        })

        setRealStats({
          totalTenants: snap.size,
          activeTenants: active,
          trialTenants: trial,
          tenantsByType: byType,
        })
      }
    } catch (err) {
      console.warn('Error calculando métricas reales:', err)
    } finally {
      setIsLoadingStats(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleSeedDefaults = async () => {
    setSeedMessage('Sincronizando configuraciones oficiales con Firestore...')
    const res = await seedDefaultsToFirestore()
    setSeedMessage(res.message)
    setTimeout(() => setSeedMessage(null), 5000)
  }

  const totalTemplates = config.templates.length
  const publishedTemplatesCount = publishedTemplates.length
  const totalPlans = config.plans.length
  const publishedPlansCount = config.plans.filter((p) => p.status === 'published').length
  const totalExtras = config.extras.length
  const publishedExtrasCount = publishedExtras.length

  const templateDistributionList = [
    {
      name: 'Restaurante',
      key: 'restaurant_pos',
      count: realStats.tenantsByType.restaurant_pos || 0,
    },
    {
      name: 'Distribuidora',
      key: 'route_distribution',
      count: realStats.tenantsByType.route_distribution || 0,
    },
    {
      name: 'Nightclub & Lounge',
      key: 'nightclub_lounge',
      count: realStats.tenantsByType.nightclub_lounge || 0,
    },
    {
      name: 'Ventas Express / Balanza',
      key: 'gelateria_weight_cafe',
      count: realStats.tenantsByType.gelateria_weight_cafe || 0,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Encabezado del Dashboard */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Resumen de Plataforma
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Panel de supervisión y gestión centralizada con persistencia real en Firestore.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchStats}
            disabled={isLoadingStats}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
            <span>Recargar datos</span>
          </button>
          <button
            type="button"
            onClick={handleSeedDefaults}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-200 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
            title="Publica los datos oficiales por defecto a Firestore si aún no existen"
          >
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>Sembrar Firestore</span>
          </button>
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

      {seedMessage && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{seedMessage}</span>
        </div>
      )}

      {/* Tarjetas de Métricas Principales (KPIs Reales) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Empresas registradas</span>
            <Building2 className="w-4 h-4 text-[#0066FF]" />
          </div>
          <div className="text-3xl font-black text-slate-950">
            {isLoadingStats ? '...' : realStats.totalTenants}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {realStats.totalTenants > 0
              ? `${realStats.activeTenants} activas · ${realStats.trialTenants} en prueba`
              : 'Base multitenant conectada'}
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
            Canónicas en Vitrina, Studio y Demo
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
            Configuración comercial persistida
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Servicios adicionales</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-950">
            {publishedExtrasCount}
            <span className="text-xs font-normal text-slate-400 ml-1.5">/ {totalExtras}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Extras y desarrollo a medida
          </p>
        </div>
      </div>

      {/* Grid de Estado: Distribución por Plantilla y Estado Técnico */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Distribución real de empresas por rubro */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Distribución por Plantilla
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Datos reales según los registros de empresas en la plataforma
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
            {templateDistributionList.map((item, idx) => {
              const percentage =
                realStats.totalTenants > 0
                  ? Math.round((item.count / realStats.totalTenants) * 100)
                  : 0
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.name}</span>
                    <span className="text-slate-500">
                      {item.count} {item.count === 1 ? 'empresa' : 'empresas'} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0066FF] transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-center justify-between">
            <span>
              Total de registros en base de datos: <strong>{realStats.totalTenants} empresas</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('templates')}
              className="text-[#0066FF] font-bold hover:underline cursor-pointer"
            >
              Gestionar plantillas
            </button>
          </div>
        </div>

        {/* Estado del Sistema e Integraciones */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Infraestructura y Servicios
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Estado de conectividad y pasarelas de la plataforma
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
                <span className="text-slate-600">Configuración Comercial</span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                  Firestore / Sincronizado
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                <span className="text-slate-600">Pasarela de Cobros / MRR</span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-amber-700 bg-amber-50 border border-amber-200">
                  Sin integración de facturación
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
