import { useState, useEffect, useMemo } from 'react'
import type { ParcelAppState } from '../../modules/parcel/types'
import { DemoParcelController, type DemoDatasetMode } from './demoParcelController'
import { ExpresoPunataExperience } from '../../modules/parcel/views/ExpresoPunataExperience'
import { useAdminAuth } from '../../admin/auth/adminAuthStore'
import { Lock } from 'lucide-react'

interface ExpresoPunataDemoProps {
  datasetMode?: DemoDatasetMode
  resetKey?: number
}

export function ExpresoPunataDemo({
  datasetMode = 'full',
  resetKey = 0,
}: ExpresoPunataDemoProps) {
  const { isAuthenticated } = useAdminAuth()

  // Controlador reactivo local y aislado con perfil 'expreso-punata'
  const controller = useMemo(() => {
    return new DemoParcelController('sindicato', datasetMode, 'studio', 'expreso-punata')
  }, [datasetMode])

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
  // Esta edición personalizada es una demo interna del cliente dentro de Studio/Admin.
  // Requiere autorización activa de Platform Operator en producción.
  if (!import.meta.env.DEV && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-950 text-yellow-400 border border-yellow-400/40 flex items-center justify-center mx-auto text-2xl font-black">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Acceso Exclusivo PACHAX Admin / Studio</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            La <strong>Edición S.M.T. Expreso Punata</strong> es una demostración interna del cliente y requiere autorización de Platform Operator.
          </p>
          <div className="p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl text-xs text-yellow-200">
            Requiere sesión activa de Platform Operator para su validación.
          </div>
          <a
            href="/admin/login"
            className="inline-block mt-4 px-5 py-2.5 text-xs font-bold bg-yellow-400 text-slate-950 rounded-xl hover:bg-yellow-300 transition shadow-sm"
          >
            Iniciar Sesión Administrativa →
          </a>
        </div>
      </div>
    )
  }

  return (
    <ExpresoPunataExperience
      controller={controller}
      state={state}
    />
  )
}
