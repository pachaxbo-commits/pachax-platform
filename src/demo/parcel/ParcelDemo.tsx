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
  isPublicDemo?: boolean
  companyName?: string
  logoUrl?: string
}

export function ParcelDemo({
  initialEdition,
  datasetMode = 'full',
  resetKey = 0,
  isStudioEmbed = false,
  isPublicDemo = false,
  companyName,
  logoUrl,
}: ParcelDemoProps) {
  const { isAuthenticated } = useAdminAuth()

  // Detectar si estamos en demo pública o en Studio/Admin
  const isPublic = isPublicDemo || (!isStudioEmbed && typeof window !== 'undefined' && !window.location.search.includes('embed=studio') && !window.location.pathname.startsWith('/studio'))

  // En demo pública, la edición se fuerza OBLIGATORIAMENTE a 'standard', ignorando cualquier intento de override (?profile=sindicato o ?edition=sindicato)
  const resolvedEdition: ParcelEdition = useMemo(() => {
    if (isPublic) return 'standard'
    if (initialEdition) return initialEdition
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const p = params.get('profile') || params.get('edition')
      if (p === 'standard') return 'standard'
    }
    return 'sindicato'
  }, [isPublic, initialEdition])

  const [selectedEdition, setSelectedEdition] = useState<ParcelEdition>(resolvedEdition)
  const currentEdition: ParcelEdition = isPublic ? 'standard' : selectedEdition

  // Instancia única y reactiva del controlador con scope de almacenamiento aislado
  const storageScope = isPublic ? 'demo' : 'studio'
  const controller = useMemo(() => {
    return new DemoParcelController(currentEdition, datasetMode, storageScope)
  }, [currentEdition, datasetMode, storageScope])

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
  // La Edición Sindicato es de acceso exclusivo de Platform Operators en producción.
  // La Edición Estándar pública es accesible abiertamente para cualquier visitante.
  if (currentEdition === 'sindicato' && !import.meta.env.DEV && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 text-amber-400 border border-amber-400/40 flex items-center justify-center mx-auto text-2xl font-black">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Acceso Exclusivo PACHAX Admin / Studio</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            La <strong>Edición Sindicato</strong> de PACHAX Encomiendas es un módulo de gestión interna y requiere autorización de Platform Operator.
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200">
            Requiere sesión activa de Platform Operator para su validación.
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
      allowEditionSwitch={!isPublic}
      onEditionChange={ed => {
        if (!isPublic) setSelectedEdition(ed)
      }}
      companyName={companyName}
      logoUrl={logoUrl}
    />
  )
}
