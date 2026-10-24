import { useState } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  Play,
} from 'lucide-react'

type TemplateId = 'restaurant' | 'distribution' | 'nightclub' | 'retail'

interface TutorialStep {
  step: number
  target: string
  title: string
  desc: string
  pillLabel: string
  previewType: 'tables' | 'kds' | 'cash_close' | 'dispatch' | 'route_sales' | 'settlement' | 'bar_speed' | 'tabs' | 'bottle_ml' | 'scale' | 'qr_pay' | 'stock'
}

interface TemplateTutorialMeta {
  id: TemplateId
  name: string
  accentColor: string
  demoRoute: string
  steps: TutorialStep[]
}

const TUTORIAL_DATA: Record<TemplateId, TemplateTutorialMeta> = {
  restaurant: {
    id: 'restaurant',
    name: 'Restaurante POS',
    accentColor: '#0066FF',
    demoRoute: '/demo/restaurant?tour=pos',
    steps: [
      {
        step: 1,
        target: 'Mesa 04 · Salón Principal',
        title: 'Apertura de Mesa y Comanda Móvil',
        desc: 'Toca una mesa en el mapa visual interactivo para abrir cuenta, asignar mesero y registrar comensales.',
        pillLabel: 'Mapa de Salón',
        previewType: 'tables',
      },
      {
        step: 2,
        target: 'Monitor KDS de Cocina',
        title: 'Pase de Cocina y Tiempos en Vivo',
        desc: 'Las órdenes se ordenan por tiempo de espera con semáforos verde, amarillo y rojo para los cocineros.',
        pillLabel: 'Pantalla KDS',
        previewType: 'kds',
      },
      {
        step: 3,
        target: 'Cierre de Turno Ciego',
        title: 'Arqueo Ciego sin Descuadres',
        desc: 'El cajero declara el efectivo físico contado sin ver el balance del sistema, previniendo fraudes y cuadres forzados.',
        pillLabel: 'Arqueo Ciego',
        previewType: 'cash_close',
      },
    ],
  },
  distribution: {
    id: 'distribution',
    name: 'Producción & Distribución',
    accentColor: '#0284C7',
    demoRoute: '/demo/distribution?tour=start',
    steps: [
      {
        step: 1,
        target: 'Camión 02 · Despacho y Carga',
        title: 'Carga de Camión con Control de Kilos',
        desc: 'Valida el pesaje total de salida, precinto de seguridad y chofer asignado antes de autorizar la ruta.',
        pillLabel: 'Despacho Móvil',
        previewType: 'dispatch',
      },
      {
        step: 2,
        target: 'Ventas y Cobranzas en Ruta',
        title: 'Venta Móvil y Cartera de Créditos',
        desc: 'El chofer emite notas de entrega en carretera y registra cobranzas en efectivo o transferencias QR.',
        pillLabel: 'Ventas en Carretera',
        previewType: 'route_sales',
      },
      {
        step: 3,
        target: 'Liquidación contra Retorno Físico',
        title: 'Liquidación Ciega contra Retorno',
        desc: 'El almacén pesa el retorno físico y calcula diferencias exactas de mermas y faltantes de dinero.',
        pillLabel: 'Liquidación Ciega',
        previewType: 'settlement',
      },
    ],
  },
  nightclub: {
    id: 'nightclub',
    name: 'Nightclub & Lounge',
    accentColor: '#7C3AED',
    demoRoute: '/demo/nightclub',
    steps: [
      {
        step: 1,
        target: 'Barra 01 · Terminal Rápida',
        title: 'Comanda Ultra Rápida en 15 Segundos',
        desc: 'Diseñada para discotecas con alta concurrencia, cobro táctil con botones grandes y 1-click.',
        pillLabel: 'Cobro de Barra',
        previewType: 'bar_speed',
      },
      {
        step: 2,
        target: 'Cuentas Abiertas por Pulsera #Tag',
        title: 'Consumo Abierto en Mesas y Zonas VIP',
        desc: 'Asigna rondas a clientes recurrentes y consolida el cobro al final de la noche sin duplicar tickets.',
        pillLabel: 'Cuentas Abiertas',
        previewType: 'tabs',
      },
      {
        step: 3,
        target: 'Control de Botellas Abiertas (ml)',
        title: 'Auditoría Milimétrica de Licores',
        desc: 'Trazabilidad de descorches por mililitros y arqueo ciego contra inventario físico al cerrar turno.',
        pillLabel: 'Control de Licores',
        previewType: 'bottle_ml',
      },
    ],
  },
  retail: {
    id: 'retail',
    name: 'Comercio & Balanza',
    accentColor: '#059669',
    demoRoute: '/demo/retail',
    steps: [
      {
        step: 1,
        target: 'Balanza Digital RS232 / USB',
        title: 'Pesaje Automático en Mostrador',
        desc: 'El peso de la balanza se transmite en tiempo real al ticket, calculando el precio exacto al instante.',
        pillLabel: 'Balanza Conectada',
        previewType: 'scale',
      },
      {
        step: 2,
        target: 'Cobro Inmediato con QR Dinámico',
        title: 'Cobro en 1 Click y Ticket Térmico',
        desc: 'Genera QR inmediato en pantalla o envía recibo digital por WhatsApp sin demoras en fila.',
        pillLabel: 'Cobro QR Express',
        previewType: 'qr_pay',
      },
      {
        step: 3,
        target: 'Control de Stock y Alertas Mínimas',
        title: 'Reposición de Inventario de Mostrador',
        desc: 'Alertas automáticas cuando los insumos o productos en mostrador alcanzan el stock de seguridad.',
        pillLabel: 'Alertas de Stock',
        previewType: 'stock',
      },
    ],
  },
}

export function GuidedTutorialsSection() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('restaurant')
  const [guideStep, setGuideStep] = useState<number>(1)

  const activeMeta = TUTORIAL_DATA[selectedTemplate]
  const currentTutorial = activeMeta.steps[guideStep - 1] || activeMeta.steps[0]

  const handleTemplateChange = (tpl: TemplateId) => {
    setSelectedTemplate(tpl)
    setGuideStep(1)
  }

  const handleLaunchDemo = () => {
    window.location.assign(activeMeta.demoRoute)
  }

  return (
    <section id="tutoriales" className="w-full py-16 sm:py-20 bg-[#FAF9F6] border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial */}
        <div className="max-w-3xl mb-10">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[11px] font-bold uppercase tracking-wider text-[#0066FF] mb-3">
            <span>CAPACITACIÓN Y ASISTENCIA INTERACTIVA EN PANTALLA</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Tutoriales guiados interactivos dentro del sistema
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Tu personal aprenderá a operar en minutos. Guías interactivas con focos de atención y pasos claros asisten a meseros, cajeros, barman y choferes en cada tarea operativa.
          </p>

          {/* Selector de Plantilla (Segmented Control Symmetrical) */}
          <div className="mt-7 w-full max-w-2xl">
            <div className="p-1 rounded-2xl bg-slate-200/70 border border-slate-300/60 grid grid-cols-2 sm:grid-cols-4 gap-1">
              {(['restaurant', 'distribution', 'nightclub', 'retail'] as TemplateId[]).map((tplKey) => {
                const meta = TUTORIAL_DATA[tplKey]
                const isSelected = selectedTemplate === tplKey
                return (
                  <button
                    key={tplKey}
                    type="button"
                    onClick={() => handleTemplateChange(tplKey)}
                    className={`py-2 px-2.5 rounded-xl text-xs sm:text-sm transition-all cursor-pointer text-center truncate ${
                      isSelected
                        ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200/90'
                        : 'text-slate-600 hover:text-slate-950 font-medium hover:bg-white/40'
                    }`}
                  >
                    {meta.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Simulador Interactivo de Tour en Pantalla */}
        <div className="bg-[#071322] rounded-3xl p-6 sm:p-8 border border-blue-500/25 shadow-2xl relative overflow-hidden">
          {/* Luz ambiental sutil */}
          <div
            aria-hidden="true"
            className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"
          />

          {/* Barra de Ventana */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-700" />
              <div className="w-3 h-3 rounded-full bg-slate-700" />
              <div className="w-3 h-3 rounded-full bg-slate-700" />
              <span className="text-xs text-slate-400 font-mono ml-2">
                demo.pachax.app/{activeMeta.id} (Paso {guideStep} de 3)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Tour Guiado Activo
              </span>
            </div>
          </div>

          {/* Viewport Interactivo Simulado con Spotlight */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Columna Izquierda: Escena Operativa Visualizada */}
            <div className="lg:col-span-8 bg-[#0B1726] rounded-2xl p-5 border border-white/10 min-h-[300px] sm:min-h-[340px] flex flex-col justify-between relative overflow-hidden">
              {/* Target Destacado (Spotlight) */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {currentTutorial.target}
                  </span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-sky-300">
                  {currentTutorial.pillLabel}
                </span>
              </div>

              {/* Contenido Visual Simulado por Plantilla */}
              <div className="my-auto py-6">
                {currentTutorial.previewType === 'tables' && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-md mx-auto">
                    {[
                      { id: 'M-01', status: 'Ocupada · Bs 240', active: false },
                      { id: 'M-02', status: 'Libre', active: false },
                      { id: 'M-03', status: 'Libre', active: false },
                      { id: 'M-04', status: 'TOCAR AQUÍ', active: true },
                    ].map((m) => (
                      <div
                        key={m.id}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          m.active
                            ? 'bg-blue-600/30 border-blue-400 text-white ring-2 ring-blue-400 scale-105 shadow-lg'
                            : 'bg-white/5 border-white/10 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-sm">{m.id}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">{m.status}</div>
                      </div>
                    ))}
                  </div>
                )}

                {currentTutorial.previewType === 'kds' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                      <div className="flex items-center justify-between text-xs font-bold mb-1">
                        <span>Orden #108 · Mesa 04</span>
                        <span className="font-mono">08:12 min</span>
                      </div>
                      <div className="text-[11px] text-slate-300 space-y-0.5">
                        <div>2x Hamburguesa Clásica</div>
                        <div>1x Papas Rústicas</div>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                      <div className="flex items-center justify-between text-xs font-bold mb-1">
                        <span>Orden #109 · Para llevar</span>
                        <span className="font-mono">02:45 min</span>
                      </div>
                      <div className="text-[11px] text-slate-300 space-y-0.5">
                        <div>1x Pizza Margarita</div>
                        <div>1x Gaseosa 2L</div>
                      </div>
                    </div>
                  </div>
                )}

                {currentTutorial.previewType === 'cash_close' && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Total Billetes Declarados</span>
                      <span className="text-white font-mono font-bold">Bs 1.450,00</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Total Monedas Declaradas</span>
                      <span className="text-white font-mono font-bold">Bs 38,50</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                      <span className="text-blue-300 font-semibold">Saldo Sistema (Oculto)</span>
                      <span className="text-slate-400 font-mono">••••••••</span>
                    </div>
                  </div>
                )}

                {currentTutorial.previewType === 'dispatch' && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-sky-200">
                      <span>Ruta Norte · Chofer: Carlos M.</span>
                      <span>Camión 02</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div>Carga total: <strong>480.5 kg</strong></div>
                      <div>Precinto: <strong>#88219</strong></div>
                    </div>
                  </div>
                )}

                {currentTutorial.previewType === 'route_sales' && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="text-xs font-bold text-white">Venta en Ruta · Supermercado El Prado</div>
                    <div className="text-xs text-slate-300">Cobro: Bs 850,00 (Bs 500 Efectivo + Bs 350 QR)</div>
                    <div className="text-[10px] text-emerald-400 font-mono">Recibo #RN-042 emitido por WhatsApp</div>
                  </div>
                )}

                {currentTutorial.previewType === 'settlement' && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span>Retorno Físico Camión 02</span>
                      <span className="text-emerald-400">Diferencia: Bs 0.00</span>
                    </div>
                    <div className="text-xs text-slate-300">Retorno pesado: 45.2 kg · Cobrado: Bs 3.200,00</div>
                  </div>
                )}

                {currentTutorial.previewType === 'bar_speed' && (
                  <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                    {['Fernet Branca', 'Cerveza Corona', 'Gin Tonic', 'Tequila Shot', 'Vodka RedBull', 'Mojito'].map((drink, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-center text-xs text-white">
                        {drink}
                      </div>
                    ))}
                  </div>
                )}

                {currentTutorial.previewType === 'tabs' && (
                  <div className="max-w-md mx-auto p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-200">
                      <span>Cuenta Abierta · Pulsera #042</span>
                      <span>Mesa VIP 3</span>
                    </div>
                    <div className="text-xs text-slate-300">5 rondas acumuladas · Saldo: Bs 680,00</div>
                  </div>
                )}

                {currentTutorial.previewType === 'bottle_ml' && (
                  <div className="max-w-md mx-auto p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                      <span>Whisky Johnnie Walker Black 750ml</span>
                      <span className="font-mono text-purple-400">Restante: 320 ml</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full w-[42%]" />
                    </div>
                  </div>
                )}

                {currentTutorial.previewType === 'scale' && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-2 text-center">
                    <div className="text-xs text-teal-300 uppercase tracking-wider font-bold">Báscula Toledo RS232</div>
                    <div className="text-2xl font-mono font-extrabold text-white">0.325 kg</div>
                    <div className="text-xs text-slate-300">Helado Artesanal · Precio: Bs 19,50</div>
                  </div>
                )}

                {currentTutorial.previewType === 'qr_pay' && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                    <div className="text-left space-y-1">
                      <div className="text-xs font-bold text-white">Cobro QR Dinámico</div>
                      <div className="text-sm font-mono text-emerald-400 font-bold">Bs 45,00</div>
                      <div className="text-[10px] text-slate-400">Escanea desde cualquier app bancaria</div>
                    </div>
                    <div className="w-16 h-16 bg-white p-1 rounded-lg shrink-0 flex items-center justify-center">
                      <div className="w-full h-full bg-slate-900 rounded-sm" />
                    </div>
                  </div>
                )}

                {currentTutorial.previewType === 'stock' && (
                  <div className="max-w-md mx-auto p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-200">
                      <span>Alerta de Stock Mínimo</span>
                      <span>Quedan 3 u.</span>
                    </div>
                    <div className="text-xs text-slate-300">Café de Especialidad 250g · Sugerido reponer hoy</div>
                  </div>
                )}
              </div>

              {/* Globo de Diálogo Asistido del Tutorial (Tooltip Guía) */}
              <div className="bg-[#12233b] border border-blue-400/40 rounded-xl p-3.5 shadow-xl relative mt-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#0066FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {guideStep}
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      {currentTutorial.title}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-relaxed">
                      {currentTutorial.desc}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Controles del Tour Guiado y Explicación */}
            <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 font-mono">
                    Paso {guideStep} de 3
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {currentTutorial.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {currentTutorial.desc}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/10">
                  {activeMeta.steps.map((st) => (
                    <button
                      key={st.step}
                      type="button"
                      onClick={() => setGuideStep(st.step)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        st.step === guideStep
                          ? 'bg-blue-600/20 border-blue-400 text-white shadow-xs'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                            st.step === guideStep
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {st.step}
                        </span>
                        <span className="text-xs font-semibold truncate">{st.title}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Botonera de Navegación del Simulador */}
              <div className="flex items-center justify-between gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setGuideStep((prev) => Math.max(1, prev - 1))}
                  disabled={guideStep === 1}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map((stepNum) => (
                    <button
                      key={stepNum}
                      type="button"
                      onClick={() => setGuideStep(stepNum)}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        stepNum === guideStep ? 'w-5 bg-[#0066FF]' : 'w-2 bg-slate-600'
                      }`}
                      aria-label={`Paso ${stepNum}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setGuideStep((prev) => Math.min(3, prev + 1))}
                  disabled={guideStep === 3}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-lg disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pie de la Simulación con CTA hacia la Demo */}
            <div className="lg:col-span-12 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-4 border-t border-white/10">
              <span>
                {selectedTemplate === 'restaurant' || selectedTemplate === 'distribution'
                  ? `Guía interactiva paso a paso disponible en la demo oficial de ${activeMeta.name}.`
                  : 'Demo técnica disponible · Guía interactiva en desarrollo.'}
              </span>
              <button
                type="button"
                onClick={handleLaunchDemo}
                className="text-white hover:text-sky-300 font-bold inline-flex items-center gap-1.5 cursor-pointer bg-white/10 hover:bg-white/15 px-3.5 py-2 rounded-lg border border-white/10 transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
                <span>
                  {selectedTemplate === 'restaurant' || selectedTemplate === 'distribution'
                    ? `Probar demo con tutorial interactivo (${activeMeta.name})`
                    : `Ver demo de ${activeMeta.name}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
