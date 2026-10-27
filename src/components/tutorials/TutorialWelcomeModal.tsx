import { useState, useEffect, useCallback } from 'react'
import { Sparkles, ArrowRight, X, CheckCircle2, BookOpen } from 'lucide-react'
import type { TutorialSectionItem } from './tutorialOrchestratorTypes.ts'

interface TutorialWelcomeModalProps {
  isOpen: boolean
  roleLabel: string
  templateLabel?: string
  sections: TutorialSectionItem[]
  onStart: () => void
  onSkip: () => void
}

export function TutorialWelcomeModal({
  isOpen,
  roleLabel,
  templateLabel,
  sections,
  onStart,
  onSkip,
}: TutorialWelcomeModalProps) {
  const [isConfirmingSkip, setIsConfirmingSkip] = useState(false)

  const handleStart = () => {
    setIsConfirmingSkip(false)
    onStart()
  }

  const handleSkipConfirmed = useCallback(() => {
    setIsConfirmingSkip(false)
    onSkip()
  }, [onSkip])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isConfirmingSkip) {
          handleSkipConfirmed()
        } else {
          setIsConfirmingSkip(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isConfirmingSkip, handleSkipConfirmed])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial interactivo"
      aria-labelledby="welcome-modal-title"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {!isConfirmingSkip ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 border border-sky-100">
                <Sparkles size={14} className="text-sky-600" />
                <span>Capacitación guiada · {roleLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmingSkip(true)}
                className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Cerrar bienvenida"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <h2
                id="welcome-modal-title"
                className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight"
              >
                Bienvenido a tu demostración de PACHAX
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Te mostraremos cómo utilizar las funciones principales de {templateLabel || 'esta plantilla'} según tu rol de <span className="font-semibold text-slate-900">{roleLabel}</span>. Podrás explorar cada sección, avanzar a tu ritmo y continuar más adelante.
              </p>
            </div>

            {sections.length > 0 && (
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <BookOpen size={14} className="text-sky-600" />
                    <span>Recorrido continuo</span>
                  </span>
                  <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200 text-slate-800 font-extrabold text-[11px]">
                    {sections.length} {sections.length === 1 ? 'sección' : 'secciones'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
                  {sections.map((section, idx) => (
                    <span
                      key={section.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200/80 shadow-2xs"
                    >
                      <span className="text-[10px] text-slate-400 font-black">{idx + 1}.</span>
                      <span>{section.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmingSkip(true)}
                className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer text-center"
              >
                Saltar por ahora
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-extrabold text-white hover:bg-slate-800 transition shadow-xs cursor-pointer"
              >
                <span>Iniciar tutorial</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Tutorial disponible cuando lo necesites
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Puedes iniciar los tutoriales cuando quieras desde «Cómo funciona».
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={handleSkipConfirmed}
                className="min-h-11 rounded-xl bg-slate-900 px-5 text-xs font-extrabold text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
