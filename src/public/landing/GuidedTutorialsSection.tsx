import { useState } from 'react'
import { ChevronRight, ChevronLeft, Play } from 'lucide-react'

export function GuidedTutorialsSection() {
  const [guideStep, setGuideStep] = useState<number>(1)

  const tutorialSteps = [
    {
      step: 1,
      target: 'Mesa 04 · Salón Principal',
      title: 'Apertura y Asignación de Mesa',
      desc: 'Toca cualquier mesa libre u ocupada para visualizar la comanda en curso, comensales y tiempo transcurrido.',
      highlightCoords: 'top-1/4 left-1/4',
    },
    {
      step: 2,
      target: 'Botón: Enviar a Cocina (KDS)',
      title: 'Envío Inmediato de Comanda',
      desc: 'Al pulsar Enviar, la orden se refleja al instante en la pantalla de cocina con temporizador y prioridades.',
      highlightCoords: 'top-1/2 left-1/3',
    },
    {
      step: 3,
      target: 'Cierre de Caja Ciego',
      title: 'Auditoría y Arqueo Ciego',
      desc: 'El cajero cuenta el efectivo físico sin conocer el total del sistema para una auditoría 100% transparente.',
      highlightCoords: 'bottom-1/4 right-1/4',
    },
  ]

  const currentTutorial = tutorialSteps[guideStep - 1]

  return (
    <section id="tutoriales" className="w-full py-16 bg-[#FAF9F6] border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-[#0066FF] mb-2">
            CAPACITACIÓN Y ADOPCIÓN
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Tutoriales guiados interactivos dentro del sistema
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            Tu personal aprenderá a usar PACHAX en minutos. Guias interactivas paso a paso con flechas y resaltados visuales asisten a mozos, cajeros y choferes en cada operación.
          </p>
        </div>

        {/* Maqueta Interactiva de Simulación de Tutorial en Pantalla */}
        <div className="bg-[#091728] rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
          {/* Barra superior de ventana */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-700" />
              <div className="w-3 h-3 rounded-full bg-slate-700" />
              <div className="w-3 h-3 rounded-full bg-slate-700" />
              <span className="ml-2 text-xs font-semibold text-slate-400">
                PACHAX OS · Módulo de Ayuda Guiada en Pantalla
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-400 bg-blue-950/80 border border-blue-800/80 px-2.5 py-0.5 rounded-full">
                Modo Asistente Activo
              </span>
            </div>
          </div>

          {/* Área de la interfaz simulada con el spotlight interactivo */}
          <div className="relative w-full h-[380px] bg-[#0c1a2d] rounded-xl border border-white/10 p-5 overflow-hidden flex flex-col justify-between">
            {/* Grid simulada del sistema de fondo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 opacity-40 pointer-events-none">
              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400 font-bold">Mesa 01</div>
                <div className="text-xs font-bold text-white mt-1">Libre</div>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400 font-bold">Mesa 02</div>
                <div className="text-xs font-bold text-white mt-1">Ocupada</div>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400 font-bold">Mesa 03</div>
                <div className="text-xs font-bold text-white mt-1">Reserva</div>
              </div>
              <div className="p-3 bg-blue-600/30 rounded-lg border-2 border-blue-400 shadow-md">
                <div className="text-[10px] text-blue-300 font-bold">Mesa 04 (Activa)</div>
                <div className="text-xs font-bold text-white mt-1">Por cerrarse</div>
              </div>
            </div>

            {/* Recuadro de Ayuda Guiada Flotante (Tooltip Asistente) */}
            <div className="relative z-20 max-w-md mx-auto my-auto bg-white text-slate-900 rounded-xl p-5 shadow-2xl border border-slate-200">
              {/* Indicador superior */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                  Paso {guideStep} de 3
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {currentTutorial.target}
                </span>
              </div>

              <h4 className="text-base font-bold text-slate-950 tracking-tight mb-1.5">
                {currentTutorial.title}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                {currentTutorial.desc}
              </p>

              {/* Botones de navegación del tutorial */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setGuideStep((prev) => Math.max(1, prev - 1))}
                  disabled={guideStep === 1}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1">
                  {tutorialSteps.map((s) => (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => setGuideStep(s.step)}
                      className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                        s.step === guideStep ? 'w-4 bg-[#0066FF]' : 'bg-slate-300'
                      }`}
                      aria-label={`Paso ${s.step}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setGuideStep((prev) => Math.min(3, prev + 1))}
                  disabled={guideStep === 3}
                  className="px-3 py-1 text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-lg disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pie de la simulación */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
              <span>La asistencia puede activarse o silenciarse en cualquier momento con un solo click.</span>
              <button
                type="button"
                onClick={() => {
                  window.location.assign('/demo/restaurant')
                }}
                className="text-white hover:text-blue-300 font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />
                <span>Ver demo en acción</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
