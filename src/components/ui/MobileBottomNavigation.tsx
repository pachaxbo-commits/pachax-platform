import { useState, useEffect } from 'react'
import {
  UtensilsCrossed,
  ChefHat,
  History,
  Settings,
  MoreHorizontal,
  Printer,
  Wallet,
  Wrench,
  Sliders,
  LogOut,
  X,
} from 'lucide-react'
import type { ViewType } from '../Sidebar'

interface MobileBottomNavigationProps {
  currentView: ViewType
  onChangeView: (view: ViewType) => void
  pendingOrdersCount: number
  onSignOut: () => Promise<void>
  onOpenPrinterSettings?: () => void
}

export function MobileBottomNavigation({
  currentView,
  onChangeView,
  pendingOrdersCount,
  onSignOut,
  onOpenPrinterSettings,
}: MobileBottomNavigationProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  // Auto close "Más" modal when switching view
  const handleSelectView = (view: ViewType) => {
    onChangeView(view)
    setIsMoreOpen(false)
  }

  // Handle hardware back button closing modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMoreOpen) {
        setIsMoreOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMoreOpen])

  return (
    <>
      {/* Fixed Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-2 py-1 shadow-lg flex items-center justify-around">
        <button
          onClick={() => handleSelectView('caja')}
          className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition min-w-[64px] ${
            currentView === 'caja' ? 'text-blue-600 font-extrabold' : 'text-slate-500 font-medium hover:text-slate-800'
          }`}
        >
          <div className="relative">
            <UtensilsCrossed size={20} />
            {pendingOrdersCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[9px] font-black h-4 w-4 rounded-full flex items-center justify-center">
                {pendingOrdersCount}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[64px]">Caja</span>
        </button>

        <button
          onClick={() => handleSelectView('cocina')}
          className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition min-w-[64px] ${
            currentView === 'cocina' ? 'text-blue-600 font-extrabold' : 'text-slate-500 font-medium hover:text-slate-800'
          }`}
        >
          <ChefHat size={20} />
          <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[64px]">Cocina</span>
        </button>

        <button
          onClick={() => handleSelectView('historial')}
          className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition min-w-[64px] ${
            currentView === 'historial' ? 'text-blue-600 font-extrabold' : 'text-slate-500 font-medium hover:text-slate-800'
          }`}
        >
          <History size={20} />
          <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[64px]">Historial</span>
        </button>

        <button
          onClick={() => handleSelectView('admin')}
          className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition min-w-[64px] ${
            currentView === 'admin' ? 'text-blue-600 font-extrabold' : 'text-slate-500 font-medium hover:text-slate-800'
          }`}
        >
          <Settings size={20} />
          <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[64px]">Admin</span>
        </button>

        <button
          onClick={() => setIsMoreOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition min-w-[64px] ${
            isMoreOpen || ['printer-settings', 'cash-session', 'printer-diagnostic'].includes(currentView)
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 font-medium hover:text-slate-800'
          }`}
        >
          <MoreHorizontal size={20} />
          <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[64px]">Más</span>
        </button>
      </nav>

      {/* "Más" Bottom Sheet Modal */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-xs">
          <div
            className="fixed inset-0"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="relative z-10 bg-white rounded-t-3xl border-t border-slate-200 p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <MoreHorizontal size={18} className="text-blue-600" /> Opciones de PACHAX Flow
              </h3>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs font-bold">
              <button
                onClick={() => handleSelectView('printer-settings')}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3 text-slate-800 hover:bg-blue-50 hover:border-blue-200 transition"
              >
                <div className="h-8 w-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Printer size={16} />
                </div>
                <span>Impresoras</span>
              </button>

              <button
                onClick={() => handleSelectView('cash-session')}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3 text-slate-800 hover:bg-blue-50 hover:border-blue-200 transition"
              >
                <div className="h-8 w-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Wallet size={16} />
                </div>
                <span>Caja & Turnos</span>
              </button>

              <button
                onClick={() => handleSelectView('printer-diagnostic')}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3 text-slate-800 hover:bg-blue-50 hover:border-blue-200 transition"
              >
                <div className="h-8 w-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Wrench size={16} />
                </div>
                <span>Diagnóstico</span>
              </button>

              <button
                onClick={() => {
                  if (onOpenPrinterSettings) onOpenPrinterSettings()
                  setIsMoreOpen(false)
                }}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3 text-slate-800 hover:bg-blue-50 hover:border-blue-200 transition"
              >
                <div className="h-8 w-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center">
                  <Sliders size={16} />
                </div>
                <span>Ajustes Rápidos</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsMoreOpen(false)
                  onSignOut()
                }}
                className="w-full p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-100 transition"
              >
                <LogOut size={16} /> Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
