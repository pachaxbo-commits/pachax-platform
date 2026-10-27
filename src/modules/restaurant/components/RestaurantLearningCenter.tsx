import { BookOpen, CheckCircle2, Circle, Clock3, Play, RotateCcw } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import {
  restaurantLearningProgress,
  restaurantTutorialActionLabel,
  restaurantTutorialStatusLabel,
  type RestaurantLearningTutorial,
  type RestaurantTutorialId,
} from '../domain/restaurantLearningCenter'

export function RestaurantLearningCenter({
  isOpen,
  tutorials,
  canOpenSetupGuide,
  hasResumableSequence,
  resumableTargetInfo,
  onResumeSequence,
  onRestartAllTutorials,
  onClose,
  onStartTutorial,
  onOpenSetupGuide,
}: {
  isOpen: boolean
  tutorials: RestaurantLearningTutorial[]
  canOpenSetupGuide: boolean
  hasResumableSequence?: boolean
  resumableTargetInfo?: { sectionTitle: string; stepNumber: number } | null
  onResumeSequence?: () => void
  onRestartAllTutorials?: () => void
  onClose: () => void
  onStartTutorial: (id: RestaurantTutorialId) => void
  onOpenSetupGuide: () => void
}) {
  if (!isOpen) return null
  const progress = restaurantLearningProgress(tutorials)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Aprender a usar PACHAX"
      subtitle="Ayuda breve para tus tareas diarias."
      size="lg"
    >
      <div className="space-y-5">
        {hasResumableSequence && onResumeSequence && (
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Play size={20} />
              </span>
              <div>
                <h3 className="font-extrabold text-amber-950">Continuar donde lo dejaste</h3>
                <p className="mt-0.5 text-xs text-amber-800">
                  {resumableTargetInfo
                    ? `Sección pendiente: ${resumableTargetInfo.sectionTitle} · Paso ${resumableTargetInfo.stepNumber}`
                    : 'Tienes un recorrido en pausa listo para continuar.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onResumeSequence}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-900 px-4 text-xs font-bold text-white hover:bg-amber-800 transition cursor-pointer shrink-0"
            >
              <span>Continuar recorrido</span>
              <Play size={14} />
            </button>
          </section>
        )}

        <section className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--primary)]">
              <BookOpen size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-900">Aprende paso a paso</h3>
              <p className="mt-1 text-sm text-slate-600">
                Los recorridos resaltan controles reales y explican qué hacen. No registran ventas ni modifican datos.
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                <span>
                  Progreso: {progress.completed} de {progress.total} completados
                </span>
                <span>{progress.percent}%</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="Progreso de tutoriales"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.completed}
              >
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-[width]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {tutorials.length ? (
          <ul className="space-y-2" aria-label="Tutoriales disponibles">
            {tutorials.map((tutorial) => (
              <li
                key={tutorial.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"
              >
                <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true">
                  {tutorial.status === 'completed' ? (
                    <CheckCircle2 className="text-emerald-600" size={20} />
                  ) : tutorial.status === 'in-progress' ? (
                    <Clock3 className="text-amber-600" size={20} />
                  ) : (
                    <Circle size={20} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900">{tutorial.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {restaurantTutorialStatusLabel(tutorial.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{tutorial.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onStartTutorial(tutorial.id)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-[var(--primary-foreground)] cursor-pointer"
                >
                  {tutorial.status === 'completed' ? <RotateCcw size={16} /> : <Play size={16} />}
                  {restaurantTutorialActionLabel(tutorial.status)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
            No tienes módulos de aprendizaje disponibles con los permisos de esta sesión.
          </p>
        )}

        {onRestartAllTutorials && progress.completed > 0 && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onRestartAllTutorials}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reiniciar tutorial completo</span>
            </button>
          </div>
        )}

        {canOpenSetupGuide && (
          <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Guía inicial de configuración</h3>
              <p className="mt-1 text-sm text-slate-600">
                Es una ayuda administrativa independiente y no forma parte del progreso de tutoriales.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenSetupGuide}
              className="min-h-11 shrink-0 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 cursor-pointer"
            >
              Abrir guía inicial
            </button>
          </section>
        )}
      </div>
    </Modal>
  )
}
