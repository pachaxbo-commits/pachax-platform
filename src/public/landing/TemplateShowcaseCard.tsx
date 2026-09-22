import React from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { TemplateShowcaseItem } from './templateShowcaseData'

interface TemplateShowcaseCardProps {
  item: TemplateShowcaseItem
  onSelect: (item: TemplateShowcaseItem) => void
}

export function TemplateShowcaseCard({ item, onSelect }: TemplateShowcaseCardProps) {
  const Icon = item.icon
  const PreviewComponent = item.preview

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(item)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={handleKeyDown}
      aria-label={`Explorar solución ${item.title}`}
      className={`group relative flex flex-col rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer overflow-hidden ring-1 ring-slate-900/5 ${item.accentHoverRing} focus:outline-none focus:ring-2 focus:ring-slate-900`}
    >
      {/* Cabecera de la Card */}
      <div className="p-5 sm:p-6 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {/* Badge con Icono */}
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs group-hover:scale-105 transition-transform ${item.accentBadgeClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${item.accentBadgeClass}`}>
              {item.industryBadge}
            </span>
          </div>

          <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-700 transition-colors flex items-center gap-1">
            <span>2 modos</span>
          </span>
        </div>

        <div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
            {item.title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
            {item.tagline}
          </p>
        </div>

        {/* Módulos clave en píldoras */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {item.keyModules.map((m, idx) => (
            <span
              key={idx}
              className="text-[10px] font-semibold text-slate-600 bg-slate-100/90 border border-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1"
            >
              <Check className="w-2.5 h-2.5 text-slate-400" />
              <span>{m}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Contenedor de Previsualización Fiel */}
      <div className="px-4 sm:px-6 py-2 flex-1 flex flex-col">
        <div className="w-full h-56 sm:h-60 rounded-2xl overflow-hidden shadow-inner group-hover:scale-[1.01] transition-transform duration-200">
          <PreviewComponent />
        </div>
      </div>

      {/* Pie de la Card con CTA claro */}
      <div className="p-4 sm:p-6 pt-3 mt-auto border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">
          Desde cero o empresa operando
        </span>

        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 group-hover:text-slate-950 transition-colors bg-slate-100 group-hover:bg-slate-900 group-hover:text-white px-3 py-2 rounded-xl">
          <span>Explorar demo</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  )
}
