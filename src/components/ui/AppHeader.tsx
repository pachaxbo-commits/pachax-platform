import { Sparkles, User, WalletCards } from 'lucide-react'
import { formatCurrency } from '../../lib/format'

interface AppHeaderProps {
  restaurantName: string
  branchName?: string
  viewTitle: string
  userRole: string
  userName: string
  dailyTotal: number
  activeTodayCount: number
  onOpenProfile?: () => void
}

export function AppHeader({
  restaurantName,
  branchName = 'Sucursal Principal',
  viewTitle,
  userRole,
  userName,
  dailyTotal,
  activeTodayCount,
  onOpenProfile,
}: AppHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-2.5 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Left Brand & Active View */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 font-extrabold shadow-sm">
            <Sparkles size={18} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm font-extrabold text-slate-900 truncate tracking-tight">{restaurantName}</h1>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {viewTitle}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              {branchName} · <span className="capitalize">{userRole}</span>
            </p>
          </div>
        </div>

        {/* Right Info & Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {userRole !== 'pedidos' && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
              <WalletCards size={14} className="text-blue-600" />
              <span>BOB {formatCurrency(dailyTotal).replace('BOB', '').trim()}</span>
              <span className="text-[10px] font-bold text-slate-400">({activeTodayCount})</span>
            </div>
          )}

          <button
            onClick={onOpenProfile}
            title={userName}
            className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition"
          >
            <User size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
