import { ShieldAlert, RefreshCw, Layers, LogOut } from 'lucide-react'
import { BrandMark } from '../public/components/BrandMark'

interface TenantErrorViewProps {
  userEmail: string | null
  message: string
  hasOtherTenants: boolean
  onSelectOtherTenant?: () => void
  onRetry?: () => void
  onSignOut: () => Promise<void>
}

export function TenantErrorView({
  userEmail,
  message,
  hasOtherTenants,
  onSelectOtherTenant,
  onRetry,
  onSignOut,
}: TenantErrorViewProps) {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col font-sans selection:bg-[#0066FF] selection:text-white">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandMark size="md" href="/platform" />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500">
              {userEmail || ''}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <h1 className="text-xl font-bold text-slate-900">
            Acceso no disponible
          </h1>

          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {message}
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            {hasOtherTenants && onSelectOtherTenant && (
              <button
                type="button"
                onClick={onSelectOtherTenant}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0066FF] hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
              >
                <Layers className="w-4 h-4" />
                <span>Seleccionar otra empresa</span>
              </button>
            )}

            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar conexión</span>
              </button>
            )}

            <button
              type="button"
              onClick={onSignOut}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
