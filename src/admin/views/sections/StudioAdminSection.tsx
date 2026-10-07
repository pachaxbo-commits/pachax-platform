import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { TemplateKey } from '../../../public/config/pricingConfig'
import { PUBLIC_TEMPLATES } from '../../../core/publicTemplates'
import { getTemplate } from '../../../core/templates'

export function StudioAdminSection() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('restaurant')
  const [datasetMode, setDatasetMode] = useState<'full' | 'empty'>('full')
  const [selectedRole, setSelectedRole] = useState<string>('owner')

  const templates: { id: TemplateKey; label: string; roles: readonly { id: string; name: string }[] }[] = PUBLIC_TEMPLATES.map(template => ({
    id: template.id,
    label: template.title,
    roles: getTemplate(template.businessType).roles,
  }))

  const activeTemplate = templates.find((t) => t.id === selectedTemplate) || templates[0]

  const studioUrl = `/studio?template=${selectedTemplate}&data=${datasetMode}&role=${selectedRole}`
  const standaloneStudioUrl = studioUrl

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            PACHAX Studio · Auditoría de Experiencia Canónica
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Simula roles operativos, personalizaciones de marca y datasets de prueba sobre las plantillas reales.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.open(standaloneStudioUrl, '_blank')}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Abrir Studio en ventana completa</span>
        </button>
      </div>

      {/* Controles de Simulación de Studio */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        {/* Selector de Plantilla */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
            Plantilla:
          </span>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                setSelectedTemplate(tpl.id)
                setSelectedRole(tpl.roles[0].id)
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedTemplate === tpl.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-950'
              }`}
            >
              {tpl.label}
            </button>
          ))}
        </div>

        {/* Selector de Dataset */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Dataset:
          </span>
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setDatasetMode('full')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                datasetMode === 'full' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              Negocio Completo (Full)
            </button>
            <button
              type="button"
              onClick={() => setDatasetMode('empty')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                datasetMode === 'empty' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
              }`}
            >
              Desde Cero (Empty)
            </button>
          </div>
        </div>

        {/* Selector de Rol */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Rol:
          </span>
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl gap-1">
            {activeTemplate.roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRole(r.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize cursor-pointer transition-all ${
                  selectedRole === r.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Visor Embebido Iframe de Studio */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col">
        <div className="p-3 bg-slate-900/90 border-b border-white/10 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <span className="font-mono text-[11px] text-slate-300 ml-2">
              PACHAX Studio Preview · {studioUrl}
            </span>
          </div>

          <a
            href={standaloneStudioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0066FF] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Ver con inspector de CSS</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="w-full h-[650px] bg-slate-900 flex items-center justify-center relative">
          <iframe
            src={studioUrl}
            title="PACHAX Studio Embedded"
            className="w-full h-full border-none"
          />
        </div>
      </div>
    </div>
  )
}
