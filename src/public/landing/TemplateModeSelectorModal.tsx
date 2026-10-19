import { useState, useEffect, useRef } from 'react'
import { X, Sparkles, PlusCircle, ArrowRight, ArrowLeft, Utensils, Zap } from 'lucide-react'
import type { PublicTemplateId } from '../../core/publicTemplates.ts'
import { navigateToDemo } from '../routing/demoNavigation'

export interface SelectableTemplateTarget {
  id?: string
  templateId?: string
  title?: string
  commercialName?: string
  icon?: React.ComponentType<{ className?: string }>
}

interface TemplateModeSelectorModalProps {
  item: SelectableTemplateTarget | null
  onClose: () => void
}

export function TemplateModeSelectorModal({ item, onClose }: TemplateModeSelectorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const rawId = item?.templateId || item?.id || ''
  const isRestaurantFamily = rawId === 'restaurant' || rawId === 'restaurant_pos'
  const [selectedVariant, setSelectedVariant] = useState<'restaurant' | 'hamburger' | null>(null)

  useEffect(() => {
    setSelectedVariant(null)
  }, [item])

  useEffect(() => {
    if (!item) return
    previousFocusRef.current = document.activeElement as HTMLElement
    const firstButton = modalRef.current?.querySelector<HTMLElement>('button')
    firstButton?.focus()
    return () => previousFocusRef.current?.focus()
  }, [item, selectedVariant])

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && modalRef.current) {
        const controls = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button'))
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!item) return null

  const targetTemplateId: PublicTemplateId = isRestaurantFamily
    ? (selectedVariant || 'restaurant')
    : (rawId as PublicTemplateId)

  const handleSelectMode = (mode: 'empty' | 'full') => {
    onClose()
    navigateToDemo(targetTemplateId, mode)
  }

  const FallbackIcon = isRestaurantFamily ? Utensils : Sparkles
  const Icon = item.icon || FallbackIcon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200/90 overflow-hidden ring-1 ring-slate-900/10 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* PASO 1 (Solo Familia Restaurante): Elegir entre Salón o Servicio Rápido */}
        {isRestaurantFamily && !selectedVariant ? (
          <>
            {/* Encabezado Paso 1 */}
            <div className="bg-slate-50/80 px-6 py-5 border-b border-slate-200/80 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-tight bg-amber-50 text-amber-800 border border-amber-200/80">
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Familia Restaurante</span>
                </div>
                <h2 id="modal-title" className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  ¿Qué tipo de restaurante quieres probar?
                </h2>
                <p className="text-xs sm:text-sm text-slate-600">
                  Selecciona el modelo operativo que mejor se adapte al flujo de tu negocio.
                </p>
              </div>

              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200/60 transition cursor-pointer shrink-0"
                aria-label="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Opciones de Variante Gastronómica */}
            <div className="p-6 space-y-4">
              {/* Variante 1: Restaurante con salón */}
              <div
                onClick={() => setSelectedVariant('restaurant')}
                className="p-5 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 transition-all duration-200 cursor-pointer group space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950 group-hover:text-amber-800 transition-colors">
                          Restaurante con salón
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          Servicio completo
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Mesas, meseros, cuentas abiertas y servicio completo.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pl-13">
                  Ideal para restaurantes con atención en sala, comandas a cocina en tiempo real, división de cuentas y plano de distribución de mesas.
                </p>

                <div className="pl-13 pt-1">
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-800 group-hover:text-amber-700 inline-flex items-center gap-1.5 transition"
                  >
                    <span>Elegir con salón</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>

              {/* Variante 2: Restaurante de servicio rápido */}
              <div
                onClick={() => setSelectedVariant('hamburger')}
                className="p-5 rounded-2xl border border-slate-200 hover:border-orange-400 hover:bg-orange-50/30 transition-all duration-200 cursor-pointer group space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-700 border border-orange-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950 group-hover:text-orange-800 transition-colors">
                          Restaurante de servicio rápido
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200">
                          Mostrador & Delivery
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Mostrador, punto de entrega, para llevar, delivery y cocina ágil.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pl-13">
                  Diseñado para hamburgueserías, pizzerías express, cafeterías rápidas y locales de comida al paso con cobro anticipado y monitor de despacho.
                </p>

                <div className="pl-13 pt-1">
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-800 group-hover:text-orange-700 inline-flex items-center gap-1.5 transition"
                  >
                    <span>Elegir servicio rápido</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Paso 1 */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200/60 text-center text-[11px] text-slate-400">
              Podrás evaluar ambas variantes o cambiar entre ellas en cualquier momento.
            </div>
          </>
        ) : (
          /* PASO 2: Elegir modo (Empezar desde cero vs Ver negocio completo) */
          <>
            {/* Encabezado Paso 2 */}
            <div className="bg-slate-50/80 px-6 py-5 border-b border-slate-200/80 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-tight bg-slate-100 text-slate-700 border border-slate-200/80">
                    <Icon className="w-3.5 h-3.5" />
                    <span>
                      {isRestaurantFamily
                        ? selectedVariant === 'hamburger'
                          ? 'Servicio Rápido'
                          : 'Restaurante con Salón'
                        : item.commercialName || item.title || 'Plantilla'}
                    </span>
                  </div>
                  {isRestaurantFamily && (
                    <button
                      type="button"
                      onClick={() => setSelectedVariant(null)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 underline underline-offset-2 cursor-pointer"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>Cambiar variante</span>
                    </button>
                  )}
                </div>
                <h2 id="modal-title" className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  ¿Cómo quieres explorar esta solución?
                </h2>
                <p className="text-xs sm:text-sm text-slate-600">
                  Elige el entorno que mejor se adapte a lo que deseas evaluar hoy.
                </p>
              </div>

              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200/60 transition cursor-pointer shrink-0"
                aria-label="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dos Modos: Empezar desde cero vs Ver negocio completo */}
            <div className="p-6 space-y-4">
              {/* Opción 1: Empezar desde cero */}
              <div
                onClick={() => handleSelectMode('empty')}
                className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 transition-all duration-200 cursor-pointer group space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <PlusCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950 group-hover:text-amber-700 transition-colors">
                          Empezar desde cero
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Entorno limpio
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Ideal para entender la configuración inicial y flujo paso a paso.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pl-13">
                  Inicia con el estado técnico mínimo necesario: catálogo listo para crear tus productos, clientes y registrar tus primeras ventas sin datos precargados.
                </p>

                <div className="pl-13 pt-1">
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-800 group-hover:text-amber-700 inline-flex items-center gap-1.5 transition"
                  >
                    <span>Explorar desde cero</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>

              {/* Opción 2: Ver negocio completo */}
              <div
                onClick={() => handleSelectMode('full')}
                className="p-5 rounded-2xl border-2 border-slate-900 bg-slate-900/3 hover:bg-slate-900/6 transition-all duration-200 cursor-pointer group space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Sparkles className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950 group-hover:text-slate-900 transition-colors">
                          Ver negocio completo
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                          Recomendado
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Recorre una empresa ficticia con operaciones y métricas reales.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pl-13">
                  Experimenta la plataforma en plena actividad: productos con fotografías, inventario, ventas en curso, comandas, clientes y reportes matemáticamente consistentes.
                </p>

                <div className="pl-13 pt-1">
                  <button
                    type="button"
                    className="text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-xl inline-flex items-center gap-2 transition shadow-xs"
                  >
                    <span>Ver demo completa</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Paso 2 */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200/60 text-center text-[11px] text-slate-400">
              Podrás alternar el modo en cualquier momento desde la barra superior de la demo.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
