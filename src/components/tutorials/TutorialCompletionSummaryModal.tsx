import { useEffect } from 'react'
import { Trophy, CheckCircle2, RotateCcw, ArrowRight, X } from 'lucide-react'
import type { TutorialSectionItem } from './tutorialOrchestratorTypes.ts'

interface TutorialCompletionSummaryModalProps {
  isOpen: boolean
  roleLabel: string
  templateLabel?: string
  sections: TutorialSectionItem[]
  completedSectionIds: string[]
  onClose: () => void
  onReplaySection: (sectionId: string) => void
  onRestartAll: () => void
}

export function TutorialCompletionSummaryModal({
  isOpen,
  roleLabel,
  templateLabel,
  sections,
  completedSectionIds,
  onClose,
  onReplaySection,
  onRestartAll,
}: TutorialCompletionSummaryModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const validCompletedCount = sections.filter((s) => completedSectionIds.includes(s.id)).length
  const total = sections.length
  const percent = total > 0 ? Math.round((validCompletedCount / total) * 100) : 100

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resumen de tutorial"
      aria-labelledby="completion-modal-title"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 overflow-hidden my-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-2xs">
              <Trophy size={24} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                <span>Capacitación finalizada</span>
              </div>
              <h2
                id="completion-modal-title"
                className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight"
              >
                ¡Tutorial completado!
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar resumen"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          Has recorrido las principales funciones disponibles para tu rol de <span className="font-semibold text-slate-900">{roleLabel}</span> en {templateLabel || 'la plataforma'}.
        </p>

        {/* Resumen métrico */}
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Secciones completadas: {validCompletedCount} de {total}</span>
            <span className="font-extrabold text-emerald-700">{percent}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={validCompletedCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Progreso total del tutorial"
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Lista de secciones con opción para repetir */}
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Detalle por módulo
          </p>
          {sections.map((section, idx) => {
            const isCompleted = completedSectionIds.includes(section.id)
            return (
              <div
                key={section.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 sm:px-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </span>
                  <span className="font-bold text-slate-800 truncate">
                    {idx + 1}. {section.title}
                  </span>
                </div>
                {isCompleted && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onReplaySection(section.id)
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Repetir</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onRestartAll}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reiniciar tutorial completo</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-extrabold text-white hover:bg-slate-800 transition shadow-xs cursor-pointer"
          >
            <span>Continuar explorando</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
