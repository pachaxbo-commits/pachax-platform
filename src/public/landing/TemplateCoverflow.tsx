import React, { useState, useRef, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Utensils,
  Truck,
  GlassWater,
  ShoppingBag,
  Settings,
  Sparkles,
} from 'lucide-react'
import { COMMERCIAL_TEMPLATES, type CommercialTemplateItem } from '../config/commercialShowcase'

interface TemplateCoverflowProps {
  activeIndex: number
  onChangeActiveIndex: (index: number) => void
  onExploreAll?: () => void
  onSelectActiveCard?: (template: CommercialTemplateItem) => void
}

export function TemplateCoverflow({
  activeIndex,
  onChangeActiveIndex,
  onExploreAll,
  onSelectActiveCard,
}: TemplateCoverflowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const isPointerDownRef = useRef(false)
  const startXRef = useRef(0)
  const dragOccurredRef = useRef(false)
  const isTransitioningRef = useRef(false)

  const total = COMMERCIAL_TEMPLATES.length

  const handlePrev = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true
    onChangeActiveIndex((activeIndex - 1 + total) % total)
    setTimeout(() => {
      isTransitioningRef.current = false
    }, 320)
  }, [activeIndex, onChangeActiveIndex, total])

  const handleNext = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true
    onChangeActiveIndex((activeIndex + 1) % total)
    setTimeout(() => {
      isTransitioningRef.current = false
    }, 320)
  }, [activeIndex, onChangeActiveIndex, total])

  // Navegación por teclado (Flechas Izquierda / Derecha)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handlePrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleNext()
    }
  }

  // Gestores de Pointer / Drag (Touch & Mouse)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    isPointerDownRef.current = true
    dragOccurredRef.current = false
    startXRef.current = e.clientX
    setDragOffset(0)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current) return
    const diff = e.clientX - startXRef.current
    // Solo consideramos drag si el desplazamiento supera 14px reales
    if (Math.abs(diff) > 14) {
      dragOccurredRef.current = true
      setDragOffset(diff)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current) return
    isPointerDownRef.current = false

    const diff = e.clientX - startXRef.current
    if (Math.abs(diff) > 40) {
      if (diff > 40) {
        handlePrev()
      } else {
        handleNext()
      }
    }

    setDragOffset(0)
    // Dejamos un breve retardo para que el evento click no se confunda con drag
    setTimeout(() => {
      dragOccurredRef.current = false
    }, 120)
  }

  const handlePointerCancel = () => {
    isPointerDownRef.current = false
    dragOccurredRef.current = false
    setDragOffset(0)
  }

  const renderIcon = (type: CommercialTemplateItem['iconType'], className = 'w-4 h-4') => {
    switch (type) {
      case 'utensils':
        return <Utensils className={className} />
      case 'truck':
        return <Truck className={className} />
      case 'glass':
        return <GlassWater className={className} />
      case 'shopping-bag':
        return <ShoppingBag className={className} />
      case 'settings':
        return <Settings className={className} />
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Carrusel interactivo de plantillas comerciales"
      onKeyDown={handleKeyDown}
      className="relative w-full max-w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] rounded-2xl"
      style={{
        // @ts-ignore
        '--stage-height': 'clamp(330px, 42vw, 430px)',
        '--card-width': 'clamp(195px, 23vw, 250px)',
        '--card-height': 'clamp(290px, 35vw, 380px)',
        '--offset-step': 'clamp(90px, 13vw, 135px)',
      }}
    >
      {/* Flechas de Navegación Flotantes (Capa z-50 superior aislada) */}
      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between pointer-events-none z-50 px-1 sm:px-2">
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Plantilla anterior"
          className="hidden md:flex pointer-events-auto w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 items-center justify-center shadow-lg border border-slate-200 transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleNext}
          aria-label="Siguiente plantilla"
          className="hidden md:flex pointer-events-auto w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 items-center justify-center shadow-lg border border-slate-200 transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Contenedor Stage 3D con perspectiva */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="relative w-full h-[var(--stage-height)] flex items-center justify-center overflow-hidden [perspective:1200px] [perspective-origin:50%_50%] cursor-default"
      >
        {COMMERCIAL_TEMPLATES.map((template, index) => {
          let offset = index - activeIndex
          if (offset > 2) offset -= total
          if (offset < -2) offset += total

          const isActive = offset === 0
          const isImmediate = Math.abs(offset) === 1
          const isSecondary = Math.abs(offset) === 2

          const dragInfluence = dragOccurredRef.current ? dragOffset * 0.35 : 0

          let transform = ''
          let zIndex = 1
          let opacity = 0
          let pointerEvents: 'auto' | 'none' = 'none'

          if (isActive) {
            transform = `translateX(${dragInfluence}px) translateZ(clamp(32px, 4vw, 55px)) scale(1.06) rotateY(${dragInfluence * -0.05}deg)`
            zIndex = 30
            opacity = 1
            pointerEvents = 'auto'
          } else if (isImmediate) {
            const direction = offset > 0 ? 1 : -1
            transform = `translateX(calc(${direction} * var(--offset-step) + ${dragInfluence * 0.5}px)) translateZ(0px) scale(0.88) rotateY(${
              direction * -24
            }deg)`
            zIndex = 20
            opacity = 0.88
            pointerEvents = 'auto'
          } else if (isSecondary) {
            const direction = offset > 0 ? 1 : -1
            transform = `translateX(calc(${direction} * 1.82 * var(--offset-step) + ${dragInfluence * 0.3}px)) translateZ(-35px) scale(0.74) rotateY(${
              direction * -35
            }deg)`
            zIndex = 10
            opacity = 0.58
            pointerEvents = 'auto'
          } else {
            const direction = offset > 0 ? 1 : -1
            transform = `translateX(calc(${direction} * 2.5 * var(--offset-step))) scale(0.6)`
            zIndex = 1
            opacity = 0
            pointerEvents = 'none'
          }

          return (
            <div
              key={template.id}
              data-coverflow-card=""
              data-active={isActive ? 'true' : 'false'}
              data-index={index}
              data-template-id={template.id}
              onClick={(e) => {
                e.stopPropagation()
                if (dragOccurredRef.current) return
                if (!isActive) {
                  // Click en tarjeta lateral -> Se anima y convierte en tarjeta central
                  onChangeActiveIndex(index)
                } else if (onSelectActiveCard) {
                  // Click en tarjeta activa -> Abre detalle o demo
                  onSelectActiveCard(template)
                }
              }}
              style={{
                transform,
                zIndex,
                opacity,
                pointerEvents,
                transition: dragOccurredRef.current
                  ? 'none'
                  : 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              className="absolute w-[var(--card-width)] h-[var(--card-height)] top-1/2 left-1/2 -mt-[calc(var(--card-height)/2)] -ml-[calc(var(--card-width)/2)] rounded-2xl overflow-hidden shadow-2xl transition-all [transform-style:preserve-3d] [backface-visibility:hidden] will-change-transform cursor-pointer group"
            >
              {/* Tarjeta Visual: Contenedor con borde y ambientación */}
              <div
                className={`relative w-full h-full flex flex-col justify-between rounded-2xl border overflow-hidden ${
                  isActive
                    ? 'border-white/50 ring-1 ring-white/40'
                    : 'border-white/20 hover:border-white/35'
                } bg-gradient-to-b ${template.visualSlot.gradientClass} text-white shadow-2xl`}
                style={{
                  boxShadow: isActive
                    ? `0 24px 50px -10px ${template.visualSlot.glowColor}, 0 0 35px ${template.visualSlot.glowColor}`
                    : '0 12px 25px -5px rgba(0,0,0,0.4)',
                }}
              >
                {/* Ranura visual superior: Imagen Comercial Nítida del Concepto */}
                <div className="relative w-full h-[60%] overflow-hidden bg-[#06101c]">
                  <picture>
                    <source srcSet={template.thumbnailUrl} type="image/webp" />
                    <img
                      src={template.thumbnailUrl.replace('.webp', '.jpg')}
                      alt={template.thumbnailAlt}
                      style={{ objectPosition: template.thumbnailFocalPoint }}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="eager"
                    />
                  </picture>

                  {/* Sutil viñeta para legibilidad */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08101a] via-transparent to-black/30 pointer-events-none" />

                  {/* Insignia superior derecha de estado */}
                  {template.badge && (
                    <span className="absolute top-2.5 right-2.5 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-600/95 text-white border border-blue-400/40 backdrop-blur-xs shadow-xs">
                      {template.badge}
                    </span>
                  )}
                </div>

                {/* Ranura visual inferior: Título, Subtítulo y Botón de Acción */}
                <div className="w-full p-3.5 bg-[#08101a]/95 backdrop-blur-xs border-t border-white/10 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center border text-xs shrink-0"
                        style={{
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: template.visualSlot.accentColor,
                        }}
                      >
                        {renderIcon(template.iconType, 'w-3 h-3')}
                      </span>
                      <h3 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                        {template.commercialName}
                      </h3>
                    </div>
                    <p className="text-[10.5px] sm:text-xs text-slate-300 line-clamp-1 leading-snug">
                      {template.cardSubtitle}
                    </p>
                  </div>

                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 border transition-transform duration-200 ${
                      isActive
                        ? 'bg-white text-slate-900 border-white group-hover:scale-110 shadow-sm'
                        : 'bg-white/10 text-white border-white/20 group-hover:bg-white/20'
                    }`}
                    aria-hidden="true"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Controles Inferiores: Dots + Indicador Móvil + Botón Explorar todas */}
      <div className="mt-2 sm:mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-2 sm:px-4">
        {/* Indicador de Swipe (Solo Mobile) */}
        <div className="flex sm:hidden items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <span>Desliza para explorar plantillas</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>

        {/* Dots de Paginación Interactivos */}
        <div className="flex items-center justify-center gap-1.5 mx-auto sm:mx-0">
          {COMMERCIAL_TEMPLATES.map((t, idx) => {
            const isDotActive = idx === activeIndex
            return (
              <button
                key={t.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChangeActiveIndex(idx)
                }}
                aria-label={`Ir a plantilla ${t.commercialName}`}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  isDotActive
                    ? 'w-6 bg-[#0066FF]'
                    : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            )
          })}
        </div>

        {/* Botón de Explorar todas las plantillas (Desktop / Tablet) */}
        <div className="hidden sm:flex items-center">
          <button
            type="button"
            onClick={onExploreAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-[#0066FF] px-3.5 py-1.5 rounded-full border border-slate-200 bg-white/90 hover:bg-white shadow-2xs transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0066FF]" />
            <span>Explorar catálogo completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
