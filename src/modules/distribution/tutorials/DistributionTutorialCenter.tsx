import { useState } from 'react'
import {
  X,
  Play,
  Clock,
  RotateCcw,
  ArrowRight,
  Boxes,
  Truck,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Building2,
} from 'lucide-react'
import type { DistributionIndustryProfile } from '../types.ts'
import {
  PROFILE_METADATA,
} from '../../../demo/datasets/distribution/profileDatasets.ts'
import {
  type DistributionTutorialPlan,
  type DistributionTutorialProgress,
  getTutorialStatusLabel,
} from './distributionTutorials.ts'

interface DistributionTutorialCenterProps {
  isOpen: boolean
  onClose: () => void
  currentProfile: DistributionIndustryProfile
  onSelectProfile: (profile: DistributionIndustryProfile) => void
  plans: DistributionTutorialPlan[]
  progressMap: Record<string, DistributionTutorialProgress>
  onStartPlan: (plan: DistributionTutorialPlan) => void
  onResetData: () => void
  role: string
  companyName: string
}

const TRACK_ICONS = {
  onboarding: Building2,
  inventory: Boxes,
  routes: Truck,
  sales: ShoppingCart,
  closures: ClipboardList,
  admin: BarChart3,
}

export function DistributionTutorialCenter({
  isOpen,
  onClose,
  currentProfile,
  onSelectProfile,
  plans,
  progressMap,
  onStartPlan,
  onResetData,
  role,
  companyName,
}: DistributionTutorialCenterProps) {
  const [view, setView] = useState<'sectors' | 'tracks'>('sectors')
  const meta = PROFILE_METADATA[currentProfile] || PROFILE_METADATA.mixed

  if (!isOpen) return null

  const profilesList = Object.values(PROFILE_METADATA)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Centro de aprendizaje y tutoriales"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Cabecera del Centro de Tutoriales */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-sky-600">
              <span>CENTRO DE APRENDIZAJE INTERACTIVO</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-950 tracking-tight">
              {view === 'sectors'
                ? '¿Qué tipo de distribuidora quieres conocer?'
                : `Tutoriales de Distribución · ${meta.label}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido con scroll independiente */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {view === 'sectors' ? (
            /* ========================================================================= */
            /* VISTA DE SELECCIÓN DE LOS 9 SECTORES COMERCIALES                          */
            /* ========================================================================= */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm text-slate-600">
                  Selecciona uno de los 9 perfiles para cargar datos de demostración con productos, clientes, unidades y precios coherentes con ese sector.
                </p>
                <button
                  type="button"
                  onClick={() => setView('tracks')}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 underline shrink-0 ml-3"
                >
                  Volver a recorridos
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                {profilesList.map((item) => {
                  const isSelected = item.id === currentProfile
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-sector-id={item.id}
                      onClick={() => {
                        onSelectProfile(item.id)
                        setView('tracks')
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50/40 shadow-sm ring-2 ring-sky-400/30'
                          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                            style={{ backgroundColor: item.accentColor }}
                          >
                            {item.label}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                              Activo
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-slate-950">
                          {item.companyName}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>

                        <div className="mt-3 pt-2.5 border-t border-slate-100/80 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Productos de muestra:
                          </div>
                          <p className="text-[11px] text-slate-700 truncate">
                            {item.sampleProducts.join(' · ')}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-2 flex items-center justify-between text-xs font-bold text-sky-600">
                        <span>{isSelected ? 'Sector seleccionado' : 'Cargar este sector'}</span>
                        <ArrowRight size={14} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VISTA DE RECORRIDOS TEMÁTICOS PARA EL ROL ACTUAL                          */
            /* ========================================================================= */
            <div className="space-y-6">
              {/* Tarjeta del Sector Activo con botón de cambio */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-50/80 via-white to-slate-50 border border-sky-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: meta.accentColor }}
                    />
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      Sector actual: <strong className="text-slate-900">{meta.label}</strong>
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-950 mt-0.5">
                    {companyName || meta.companyName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rol efectivo: <span className="font-semibold text-slate-700 uppercase text-[11px]">{role}</span> · {meta.primaryUnitHint}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setView('sectors')}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
                  >
                    Cambiar sector comercial
                  </button>
                  <button
                    type="button"
                    onClick={onResetData}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-2xs transition cursor-pointer"
                    title="Reiniciar datos de práctica al estado original de este sector"
                    aria-label="Reiniciar datos de práctica"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>

              {/* Lista de Recorridos Disponibles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Recorridos disponibles para tu rol ({plans.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Interactúa con los controles reales del sistema
                  </span>
                </div>

                <div className="space-y-2.5">
                  {plans.map((plan, index) => {
                    const progress = progressMap[plan.id]
                    const status = progress?.status || 'not_started'
                    const isCompleted = status === 'completed'
                    const isInProgress = status === 'in_progress'
                    const Icon = TRACK_ICONS[plan.trackId] || Building2

                    return (
                      <div
                        key={plan.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          isCompleted
                            ? 'border-emerald-200/80 bg-emerald-50/20'
                            : isInProgress
                            ? 'border-sky-300 bg-sky-50/30 shadow-xs'
                            : 'border-slate-200/90 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-700'
                                : isInProgress
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Icon size={20} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-bold text-slate-950 truncate">
                                {plan.title}
                              </h5>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isInProgress
                                    ? 'bg-sky-100 text-sky-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {getTutorialStatusLabel(status)}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 mt-1 leading-snug">
                              {plan.description}
                            </p>

                            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <Clock size={12} />
                                {plan.estimatedMinutes} min aprox.
                              </span>
                              <span>·</span>
                              <span>{plan.steps.length} pasos</span>
                              {isInProgress && (
                                <>
                                  <span>·</span>
                                  <span className="text-sky-600 font-semibold">
                                    En paso {progress.stepIndex + 1}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => {
                              onStartPlan(plan)
                              onClose()
                            }}
                            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                              isCompleted
                                ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                : isInProgress
                                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                                : index === 0
                                ? 'bg-slate-900 hover:bg-slate-800 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            }`}
                          >
                            <Play size={13} className={isCompleted ? 'fill-slate-500 text-slate-500' : 'fill-white text-white'} />
                            <span>
                              {isCompleted ? 'Repetir recorrido' : isInProgress ? 'Continuar' : 'Iniciar'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Datos temporales de práctica aislados en navegador. No se realizan mutaciones en base de datos.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
          >
            Explorar libremente
          </button>
        </div>
      </div>
    </div>
  )
}
