import { useState, useEffect, useMemo } from 'react'
import type { ParcelAppState, ParcelEdition } from '../../modules/parcel/types'
import { DemoParcelController, type DemoDatasetMode } from './demoParcelController'
import { ParcelExperience } from '../../modules/parcel/views/ParcelExperience'
import { useAdminAuth } from '../../admin/auth/adminAuthStore'
import { Lock } from 'lucide-react'

interface ParcelDemoProps {
  initialEdition?: ParcelEdition
  datasetMode?: DemoDatasetMode
  resetKey?: number
  isStudioEmbed?: boolean
  companyName?: string
  logoUrl?: string
}

export function ParcelDemo({
  initialEdition,
  datasetMode = 'full',
  resetKey = 0,
  companyName,
  logoUrl,
}: ParcelDemoProps) {
  const { isAuthenticated } = useAdminAuth()

  // Respetar parámetro URL si existe (?profile=sindicato o ?edition=standard)
  const resolvedEdition: ParcelEdition = useMemo(() => {
    if (initialEdition) return initialEdition
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const p = params.get('profile') || params.get('edition')
      if (p === 'standard') return 'standard'
    }
    return 'sindicato'
  }, [initialEdition])

  const [currentEdition, setCurrentEdition] = useState<ParcelEdition>(resolvedEdition)

  // Instancia única y reactiva del controlador
  const controller = useMemo(() => {
    return new DemoParcelController(currentEdition, datasetMode)
  }, [currentEdition, datasetMode])

  const [state, setState] = useState<ParcelAppState>(() => controller.getState())

  useEffect(() => {
    return controller.subscribe(nextState => {
      setState(nextState)
    })
  }, [controller])

  useEffect(() => {
    if (resetKey > 0) {
      controller.resetDataset(datasetMode)
    }
  }, [resetKey, controller, datasetMode])

  // REGLA OBLIGATORIA DE SEGURIDAD Y AISLAMIENTO:
  // En producción, solo Platform Operators autenticados pueden ver la demo de Encomiendas / Sindicato.
  if (!import.meta.env.DEV && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 text-amber-400 border border-amber-400/40 flex items-center justify-center mx-auto text-2xl font-black">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Acceso Exclusivo PACHAX Admin / Studio</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            La plantilla <strong>PACHAX Encomiendas</strong> se encuentra en fase de validación interna y no está disponible en el catálogo público ni en demos abiertas.
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200">
            Requiere autorización y sesión activa de Platform Operator.
          </div>
          <a
            href="/admin/login"
            className="inline-block mt-4 px-5 py-2.5 text-xs font-bold bg-teal-500 text-slate-950 rounded-xl hover:bg-teal-400 transition shadow-sm"
          >
            Iniciar Sesión Administrativa →
          </a>
        </div>
      </div>
    )
  }

  return (
    <ParcelExperience
      controller={controller}
      state={state}
      edition={currentEdition}
      onEditionChange={ed => setCurrentEdition(ed)}
      companyName={companyName}
      logoUrl={logoUrl}
    />
  )
}
