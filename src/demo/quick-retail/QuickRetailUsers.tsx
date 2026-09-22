import { Shield } from 'lucide-react'
import { RETAIL_STAFF } from '../mocks/retailMock'

export function QuickRetailUsers({
  currentRole,
  onSelectRole,
}: {
  currentRole: string
  onSelectRole?: (roleId: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Equipo & Roles del Comercio</h1>
        <p className="text-sm text-slate-500">
          Personal asignado a mostrador, caja, inventario y administración
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {RETAIL_STAFF.map((staff) => {
          const isSelected = currentRole === staff.role
          return (
            <div
              key={staff.id}
              className={`p-5 rounded-2xl border transition ${
                isSelected
                  ? 'bg-teal-50/50 border-teal-300 ring-2 ring-teal-400/30 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-sm">
                  {staff.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{staff.name}</h3>
                  <p className="text-xs text-slate-500">{staff.email}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg">
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  {staff.roleName}
                </span>

                {onSelectRole && (
                  <button
                    onClick={() => onSelectRole(staff.role)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition ${
                      isSelected ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected ? 'Rol Activo' : 'Simular rol'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
