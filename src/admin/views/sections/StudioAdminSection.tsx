import { ExternalLink } from 'lucide-react'
import { StudioApp } from '../../../studio/StudioApp'

/** Admin has already validated the operator. Mount Studio directly here. */
export function StudioAdminSection() {
  return <section className="flex min-h-[calc(100vh-5rem)] flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-black text-slate-900">PACHAX Studio</h2>
        <p className="text-sm text-slate-500">Simulación local de las experiencias canónicas.</p>
      </div>
      <a href="/studio" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
        Abrir Studio en otra pestaña <ExternalLink size={16} />
      </a>
    </div>
    <div className="min-h-[calc(100vh-9rem)] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <StudioApp syncUrl={false} />
    </div>
  </section>
}
