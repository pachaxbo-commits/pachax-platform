import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="h-9 w-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-700 transition shrink-0"
              title="Volver atrás"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-slate-900 truncate tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 font-medium truncate">{subtitle}</p>}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
