import { useState } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  Play,
  Utensils,
  Truck,
  Music2,
  Store,
  Compass,
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
  icon: typeof Utensils
  accentColor: string
  demoRoute: string
  steps: TutorialStep[]
}

const TUTORIAL_DATA: Record<TemplateId, TemplateTutorialMeta> = {
  restaurant: {
    id: 'restaurant',
    name: 'Restaurante Salón',
    icon: Utensils,
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
    icon: Truck,
    accentColor: '#0284C7',
    demoRoute: '/demo/distribution',
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
    icon: Music2,
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
    icon: Store,
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
    <section id="tutoriales" className="w-full py-20 bg-[#FAF9F6] border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabecera Editorial */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[11px] font-bold uppercase tracking-wider text-[#0066FF] mb-3">
            <Compass className="w-3.5 h-3.5" />
            <span>CAPACITACIÓN Y ASISTENCIA INTERACTIVA EN PANTALLA</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Tutoriales guiados interactivos dentro del sistema
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Tu personal aprenderá a operar en minutos. Guías interactivas con focos de atención y pasos claros asisten a meseros, cajeros, barman y choferes en cada tarea operativa.
          </p>

          {/* Selector de Plantilla (Tabs de Rubros) */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-2 uppercase tracking-wider">
              Ver tutorial de:
            </span>
            {(['restaurant', 'distribution', 'nightclub', 'retail'] as TemplateId[]).map((tplKey) => {
              const meta = TUTORIAL_DATA[tplKey]
              const Icon = meta.icon
              const isSelected = selectedTemplate === tplKey
              return (
                <button
                  key={tplKey}
                  type="button"
                  onClick={() => handleTemplateChange(tplKey)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer inline-flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#0066FF] text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:text-slate-950 border border-slate-200/80 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{meta.name}</span>
                </button>
              )
            })}
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
              <span className="ml-2 text-xs font-semibold text-slate-300">
                PACHAX OS · Asistente Interactivo {activeMeta.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-300 bg-blue-950/80 border border-blue-700/60 px-3 py-1 rounded-full">
                Modo Asistente Activo
              </span>
            </div>
          </div>

          {/* Área de la Pantalla del Sistema con Spotlight */}
          <div className="relative w-full min-h-[380px] bg-[#0c1a2d] rounded-2xl border border-white/10 p-5 sm:p-6 overflow-hidden flex flex-col justify-between">
            {/* Maqueta de Fondo del Módulo según Plantilla */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-3 border-b border-white/5">
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Módulo Operativo Activo
                </span>
                <span className="text-[11px] text-sky-400 font-mono">
                  {currentTutorial.pillLabel}
                </span>
              </div>

              {/* Contenido Visual Simulado */}
              {selectedTemplate === 'restaurant' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Mesa 01</span>
                    <span className="text-white font-bold">Libre</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Mesa 02</span>
                    <span className="text-amber-400 font-bold">Ocupada</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Mesa 03</span>
                    <span className="text-slate-300 font-bold">Cuenta Abierta</span>
                  </div>
                  {/* Elemento con Spotlight */}
                  <div className="p-3 bg-blue-600/30 rounded-xl border-2 border-amber-300 ring-4 ring-amber-300/30 shadow-lg text-xs relative">
                    <div className="absolute -top-2.5 right-2 px-1.5 py-0.2 rounded bg-amber-300 text-slate-950 font-extrabold text-[9px] uppercase">
                      Spotlight
                    </div>
                    <span className="text-amber-200 block text-[10px] font-bold">Mesa 04 (Activa)</span>
                    <span className="text-white font-extrabold">Comanda en curso</span>
                  </div>
                </div>
              )}

              {selectedTemplate === 'distribution' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Camión 01</span>
                    <span className="text-white font-bold">En ruta · 920 kg</span>
                  </div>
                  <div className="p-3 bg-blue-600/30 rounded-xl border-2 border-amber-300 ring-4 ring-amber-300/30 shadow-lg text-xs relative">
                    <div className="absolute -top-2.5 right-2 px-1.5 py-0.2 rounded bg-amber-300 text-slate-950 font-extrabold text-[9px] uppercase">
                      Spotlight
                    </div>
                    <span className="text-amber-200 block text-[10px] font-bold">Camión 02 (Despacho)</span>
                    <span className="text-white font-extrabold">1,450 kg pesados · Precinto #4829</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Camión 03</span>
                    <span className="text-emerald-400 font-bold">Liquidado con éxito</span>
                  </div>
                </div>
              )}

              {selectedTemplate === 'nightclub' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-blue-600/30 rounded-xl border-2 border-amber-300 ring-4 ring-amber-300/30 shadow-lg text-xs relative">
                    <div className="absolute -top-2.5 right-2 px-1.5 py-0.2 rounded bg-amber-300 text-slate-950 font-extrabold text-[9px] uppercase">
                      Spotlight
                    </div>
                    <span className="text-amber-200 block text-[10px] font-bold">Barra 01 (Speed POS)</span>
                    <span className="text-white font-extrabold">Cobro express &lt; 15s</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Zona VIP 01</span>
                    <span className="text-white font-bold">Pulsera #842 activa</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Stock Licores</span>
                    <span className="text-purple-300 font-bold">Trazabilidad por ml</span>
                  </div>
                </div>
              )}

              {selectedTemplate === 'retail' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-blue-600/30 rounded-xl border-2 border-amber-300 ring-4 ring-amber-300/30 shadow-lg text-xs relative">
                    <div className="absolute -top-2.5 right-2 px-1.5 py-0.2 rounded bg-amber-300 text-slate-950 font-extrabold text-[9px] uppercase">
                      Spotlight
                    </div>
                    <span className="text-amber-200 block text-[10px] font-bold">Balanza RS232</span>
                    <span className="text-white font-extrabold">0.845 kg = $12.68 USD</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Punto de Venta</span>
                    <span className="text-white font-bold">Ticket #1049</span>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5 text-xs">
                    <span className="text-slate-400 block text-[10px]">Stock Mostrador</span>
                    <span className="text-emerald-400 font-bold">Nivel óptimo</span>
                  </div>
                </div>
              )}
            </div>

            {/* Recuadro Flotante del Asistente (Tooltip Spotlight) */}
            <div className="my-6 max-w-lg mx-auto w-full bg-white text-slate-900 rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-200 relative z-20">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0066FF] bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 rounded-md">
                  Paso {guideStep} de 3
                </span>
                <span className="text-xs font-semibold text-slate-500 truncate">
                  {currentTutorial.target}
                </span>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight">
                {currentTutorial.title}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                {currentTutorial.desc}
              </p>

              {/* Botones de Navegación del Paso */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setGuideStep((prev) => Math.max(1, prev - 1))}
                  disabled={guideStep === 1}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
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
                        stepNum === guideStep ? 'w-5 bg-[#0066FF]' : 'w-2 bg-slate-300'
                      }`}
                      aria-label={`Paso ${stepNum}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setGuideStep((prev) => Math.min(3, prev + 1))}
                  disabled={guideStep === 3}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-lg disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pie de la Simulación con CTA hacia la Demo */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-3 border-t border-white/5">
              <span>
                Asistencia interactiva integrada con silenciado o activación en 1 click.
              </span>
              <button
                type="button"
                onClick={handleLaunchDemo}
                className="text-white hover:text-sky-300 font-bold inline-flex items-center gap-1.5 cursor-pointer bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
                <span>Probar demo interactiva con tutorial</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
