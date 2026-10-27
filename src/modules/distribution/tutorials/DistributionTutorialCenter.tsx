import { useState } from 'react'
import {
  X,
  Play,
  Clock,
  RotateCcw,
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
  onSelectProfile?: (profile: DistributionIndustryProfile) => void
  plans: DistributionTutorialPlan[]
  progressMap: Record<string, DistributionTutorialProgress>
  onStartPlan: (plan: DistributionTutorialPlan) => void
  onResetData?: () => void
  hasResumableSequence?: boolean
  resumableTargetInfo?: { sectionTitle: string; stepNumber: number } | null
  onResumeSequence?: () => void
  onRestartAllTutorials?: () => void
  role: string
  companyName: string
  isDemo?: boolean
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
  hasResumableSequence,
  resumableTargetInfo,
  onResumeSequence,
  onRestartAllTutorials,
  role,
  companyName,
  isDemo = true,
}: DistributionTutorialCenterProps) {
  // En empresas reales nunca se abre en selección de sectores, sino directamente en sus recorridos
  const [userSelectedView, setUserSelectedView] = useState<'sectors' | 'tracks' | null>(null)
  const defaultView: 'sectors' | 'tracks' = hasResumableSequence ? 'tracks' : isDemo ? 'sectors' : 'tracks'
  const view = userSelectedView ?? defaultView
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
              <span>{isDemo ? 'CENTRO DE APRENDIZAJE INTERACTIVO' : 'GUÍA DE CAPACITACIÓN OPERATIVA'}</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-950 tracking-tight">
              {view === 'sectors' && isDemo
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
          {/* Banner de continuación si hay recorrido pausado (visible en ambas vistas) */}
          {hasResumableSequence && onResumeSequence && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Play size={20} />
                </span>
                <div>
                  <h4 className="font-extrabold text-amber-950 text-sm">Continuar donde lo dejaste</h4>
                  <p className="mt-0.5 text-xs text-amber-800">
                    {resumableTargetInfo
                      ? `Recorrido pendiente: ${resumableTargetInfo.sectionTitle} · Paso ${resumableTargetInfo.stepNumber}`
                      : 'Tienes un recorrido en pausa listo para continuar.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onResumeSequence()
                }}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-900 px-4 text-xs font-bold text-white hover:bg-amber-800 transition cursor-pointer shrink-0"
              >
                <span>Continuar recorrido</span>
                <Play size={14} />
              </button>
            </div>
          )}

          {view === 'sectors' && isDemo ? (
            /* ========================================================================= */
            /* VISTA DE SELECCIÓN DE LOS 9 SECTORES COMERCIALES (Solo en modo Demo)       */
            /* ========================================================================= */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm text-slate-600">
                  Selecciona uno de los 9 perfiles para cargar datos de demostración con productos, clientes, unidades y precios coherentes con ese sector.
                </p>
                <button
                  type="button"
                  onClick={() => setUserSelectedView('tracks')}
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
                        onSelectProfile?.(item.id)
                        setUserSelectedView('tracks')
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px] ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50/50 ring-2 ring-sky-400/30 shadow-md'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/80 shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span
                            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${item.accentColor}18`, color: item.accentColor }}
                          >
                            {item.label}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-md">
                              Activo
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-900 tracking-tight leading-tight">
                          {item.commercialName}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100/80 mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate">{item.sampleProducts[0]} · {item.primaryUnitHint}</span>
                        <span className="font-bold text-sky-600 shrink-0">Elegir →</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VISTA DE RECORRIDOS OPERATIVOS DEL SECTOR ACTIVO                          */
            /* ========================================================================= */
            <div className="space-y-6">
              {/* Tarjeta Informativa del Sector */}
              <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-300 tracking-wide">
                    <span>{meta.commercialName}</span>
                    <span>·</span>
                    <span className="capitalize">{companyName}</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                    {meta.description}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <p className="text-xs text-slate-300">
                      Sector: <strong>{meta.label}</strong> · Rol activo: <span className="capitalize font-semibold text-sky-700">{role}</span>
                    </p>
                  </div>
                </div>

                {isDemo && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setUserSelectedView('sectors')}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
                    >
                      Cambiar sector comercial
                    </button>
                    {onResetData && (
                      <button
                        type="button"
                        onClick={onResetData}
                        className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-2xs transition cursor-pointer"
                        title="Reiniciar datos de práctica al estado original de este sector"
                        aria-label="Reiniciar datos de práctica"
                      >
                        <RotateCcw size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>



              {/* Lista de Recorridos Disponibles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Recorridos disponibles para tu rol ({plans.length})
                  </h4>
                  {onRestartAllTutorials && (
                    <button
                      type="button"
                      onClick={onRestartAllTutorials}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      <span>Reiniciar tutorial completo</span>
                    </button>
                  )}
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
            {isDemo
              ? 'Datos temporales de práctica aislados en navegador. No se realizan mutaciones en base de datos.'
              : 'Capacitación guiada para el personal de la empresa con permisos asignados.'}
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
