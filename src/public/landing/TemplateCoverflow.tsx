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
}

export function TemplateCoverflow({
  activeIndex,
  onChangeActiveIndex,
  onExploreAll,
}: TemplateCoverflowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const startXRef = useRef(0)
  const isTransitioningRef = useRef(false)

  const total = COMMERCIAL_TEMPLATES.length

  const handlePrev = useCallback(() => {
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true
    onChangeActiveIndex((activeIndex - 1 + total) % total)
    setTimeout(() => {
      isTransitioningRef.current = false
    }, 380)
  }, [activeIndex, onChangeActiveIndex, total])

  const handleNext = useCallback(() => {
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true
    onChangeActiveIndex((activeIndex + 1) % total)
    setTimeout(() => {
      isTransitioningRef.current = false
    }, 380)
  }, [activeIndex, onChangeActiveIndex, total])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handlePrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleNext()
    }
  }

  // Pointer drag gestures (mouse + touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    startXRef.current = e.clientX
    setDragOffset(0)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const diff = e.clientX - startXRef.current
    setDragOffset(diff)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    const diff = e.clientX - startXRef.current
    if (diff > 35) {
      handlePrev()
    } else if (diff < -35) {
      handleNext()
    }
    setDragOffset(0)
  }

  const renderIcon = (type: CommercialTemplateItem['iconType'], className = 'w-5 h-5') => {
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
        /* CSS Variables responsivas para dimensiones derivadas del contenedor */
        // @ts-ignore
        '--stage-height': 'clamp(340px, 44vw, 440px)',
        '--card-width': 'clamp(185px, 22vw, 240px)',
        '--card-height': 'clamp(285px, 35vw, 375px)',
        '--offset-step': 'clamp(85px, 13vw, 130px)',
      }}
    >
      {/* Contenedor Stage 3D con perspectiva estricta y contención de overflow */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative w-full h-[var(--stage-height)] flex items-center justify-center overflow-hidden [perspective:1200px] [perspective-origin:50%_50%] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {COMMERCIAL_TEMPLATES.map((template, index) => {
          let offset = index - activeIndex
          if (offset > 2) offset -= total
          if (offset < -2) offset += total

          const isActive = offset === 0
          const isImmediate = Math.abs(offset) === 1
          const isSecondary = Math.abs(offset) === 2

          // Factor de arrastre para respuesta gestual táctil
          const dragInfluence = isDragging ? dragOffset * 0.35 : 0

          let transform = ''
          let zIndex = 1
          let opacity = 0
          let pointerEvents: 'auto' | 'none' = 'none'

          if (isActive) {
            transform = `translateX(${dragInfluence}px) translateZ(clamp(35px, 5vw, 65px)) scale(1.08) rotateY(${dragInfluence * -0.05}deg)`
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
              onClick={() => {
                if (!isActive) onChangeActiveIndex(index)
              }}
              style={{
                transform,
                zIndex,
                opacity,
                pointerEvents,
                transition: isDragging
                  ? 'none'
                  : 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              className="absolute w-[var(--card-width)] h-[var(--card-height)] top-1/2 left-1/2 -mt-[calc(var(--card-height)/2)] -ml-[calc(var(--card-width)/2)] rounded-2xl overflow-hidden shadow-2xl transition-all [transform-style:preserve-3d] [backface-visibility:hidden] will-change-transform group"
            >
              {/* Tarjeta Visual: Contenedor con borde y ambientación de producto */}
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
                {/* Ranura visual superior: Atmósfera de industria con luz ambiental */}
                <div className="relative w-full h-[54%] overflow-hidden flex flex-col justify-between p-4">
                  {/* Resplandor radial interno */}
                  <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at 50% 40%, ${template.visualSlot.accentColor}, transparent 75%)`,
                    }}
                  />

                  {/* Fila superior: Badge de icono circular */}
                  <div className="relative z-10 flex items-center justify-between w-full">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center border shadow-md backdrop-blur-md"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                        borderColor: 'rgba(255, 255, 255, 0.25)',
                        color: template.visualSlot.accentColor,
                      }}
                    >
                      {renderIcon(template.iconType, 'w-5 h-5')}
                    </div>

                    {template.badge && (
                      <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-white/15 text-white/95 border border-white/25 backdrop-blur-xs">
                        {template.badge}
                      </span>
                    )}
                  </div>

                  {/* Bullets o tags visuales interiores */}
                  <div className="relative z-10 flex flex-wrap gap-1 mt-auto">
                    {template.bullets.slice(0, 2).map((bullet, bIdx) => (
                      <span
                        key={bIdx}
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/40 text-white/80 border border-white/10"
                      >
                        {bullet}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Ranura visual inferior: Título, Subtítulo y Botón circular */}
                <div className="w-full p-4 pt-2 bg-[#08101a]/85 backdrop-blur-xs border-t border-white/10 flex items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
                      {template.commercialName}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-2 leading-snug mt-0.5">
                      {template.cardSubtitle}
                    </p>
                  </div>

                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-transform duration-200 ${
                      isActive
                        ? 'bg-white text-slate-900 border-white group-hover:scale-110 shadow-sm'
                        : 'bg-white/10 text-white border-white/20 group-hover:bg-white/20'
                    }`}
                    aria-hidden="true"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Flechas de Navegación Flotantes (Desktop) */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Plantilla anterior"
          className="hidden md:flex absolute left-1 lg:left-3 z-40 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 items-center justify-center shadow-lg border border-slate-200 transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleNext}
          aria-label="Siguiente plantilla"
          className="hidden md:flex absolute right-1 lg:right-3 z-40 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 items-center justify-center shadow-lg border border-slate-200 transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Controles Inferiores: Dots + Indicador Móvil + Botón Explorar todas */}
      <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
        {/* Indicador Móvil de Gesto Deslizar */}
        <div className="flex md:hidden items-center justify-center gap-2 text-xs font-semibold text-slate-500 w-full py-1">
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <span>Desliza para explorar plantillas</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>

        {/* Dots de Paginación */}
        <div className="flex items-center justify-center gap-1.5 mx-auto sm:mx-0">
          {COMMERCIAL_TEMPLATES.map((t, idx) => {
            const isDotActive = idx === activeIndex
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChangeActiveIndex(idx)}
                aria-label={`Ir a plantilla ${t.commercialName}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  isDotActive
                    ? 'w-6 bg-[#0066FF]'
                    : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            )
          })}
        </div>

        {/* Pill Botón: Explorar todas las plantillas (Desktop) */}
        <div className="hidden sm:flex items-center">
          <button
            type="button"
            onClick={onExploreAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-[#0066FF] px-3.5 py-1.5 rounded-full border border-slate-200 bg-white/90 hover:bg-white shadow-2xs transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0066FF]" />
            <span>Explorar todas las plantillas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
