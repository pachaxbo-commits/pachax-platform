import { CheckCircle2, Pause, ArrowRight } from 'lucide-react'
import type { ContinuousTransitionState } from './tutorialOrchestratorTypes.ts'

interface TutorialSectionTransitionProps {
  transition: ContinuousTransitionState | null
  onContinueNow: () => void
  onPause: () => void
}

export function TutorialSectionTransition({
  transition,
  onContinueNow,
  onPause,
}: TutorialSectionTransitionProps) {
  if (!transition || !transition.active) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[1150] w-[min(480px,calc(100vw-32px))] animate-slideDown"
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950 text-white p-3.5 shadow-2xl border border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 size={16} />
          </span>
          <div className="min-w-0 text-xs">
            <p className="font-medium text-slate-300 truncate">
              «{transition.completedTitle}» completada
            </p>
            <p className="font-extrabold text-white truncate">
              Continuamos con «{transition.nextTitle}»...
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onPause}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition cursor-pointer"
            aria-label="Pausar recorrido continuo"
          >
            <Pause size={13} />
            <span className="hidden sm:inline">Pausar</span>
          </button>
          <button
            type="button"
            onClick={onContinueNow}
            className="inline-flex items-center gap-1 rounded-xl bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-950 transition cursor-pointer"
          >
            <span>Ir ahora</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
