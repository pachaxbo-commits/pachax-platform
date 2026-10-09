import { ChevronDown, ImagePlus, Palette, Save, SlidersHorizontal, Store, TableProperties, Users } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { NightclubBranding, NightclubDataset } from '../domain/nightclubAccounts'
import type { TableDraft, ZoneDraft } from '../domain/nightclubFloor'
import { NightclubFloor } from './NightclubFloor'
import { readNightclubImage } from './nightclubImageFile'

type Props = {
  data: NightclubDataset
  fallbackName: string
  fallbackLogo?: string
  onSaveBranding: (branding: NightclubBranding) => boolean
  onSaveZone: (draft: ZoneDraft) => boolean
  onSaveTable: (draft: TableDraft) => boolean
  onDeleteZone: (id: string) => boolean
  onDeleteTable: (id: string) => boolean
  usersPanel?: ReactNode
  canViewFloor?: boolean
  readOnly?: boolean
}

const defaultBranding = (name: string, logo?: string): NightclubBranding => ({ businessName: name, subtitle: 'Club nocturno / Lounge', logoDataUrl: logo, primaryColor: '#d8a84e', accentColor: '#35d0a0', surfaceColor: '#0d1720' })

export function NightclubSettings({ data, fallbackName, fallbackLogo, onSaveBranding, onSaveZone, onSaveTable, onDeleteZone, onDeleteTable, usersPanel, canViewFloor = true, readOnly = false }: Props) {
  const [branding, setBranding] = useState<NightclubBranding>(() => structuredClone(data.branding || defaultBranding(fallbackName, fallbackLogo)))
  const [message, setMessage] = useState('')
  const pickImage = async (kind: 'logoDataUrl' | 'heroDataUrl', file?: File) => {
    if (!file) return
    try { const image = await readNightclubImage(file); setBranding(current => ({ ...current, [kind]: image })); setMessage('Imagen lista. Guarda los cambios para aplicarla.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar la imagen.') }
  }
  const saveBranding = () => { if (onSaveBranding(branding)) setMessage('Identidad y apariencia guardadas en esta demo.') }
  return <div className="space-y-5">
    <header><p className="text-[11px] font-bold uppercase tracking-[.2em] text-amber-300">Administración del espacio</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Configuración</h1><p className="mt-1 text-sm text-slate-400">Ajusta la identidad y organiza el salón desde un solo lugar.</p></header>
    {message && <button type="button" onClick={() => setMessage('')} role="status" className="w-full rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-left text-sm text-amber-100">{message}</button>}
    <fieldset disabled={readOnly} className="space-y-5"><Accordion icon={Store} title="Identidad del negocio" description="Nombre, subtítulo y marca visibles" open>
      <div className="grid gap-4 md:grid-cols-2"><Field label="Nombre del negocio"><input value={branding.businessName} onChange={event => setBranding({ ...branding, businessName: event.target.value })} /></Field><Field label="Tipo de negocio"><input value={branding.subtitle} onChange={event => setBranding({ ...branding, subtitle: event.target.value })} /></Field></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><ImagePicker label="Logo" value={branding.logoDataUrl} onPick={file => void pickImage('logoDataUrl', file)} onClear={() => setBranding({ ...branding, logoDataUrl: undefined })} /><ImagePicker label="Portada de Inicio" value={branding.heroDataUrl} wide onPick={file => void pickImage('heroDataUrl', file)} onClear={() => setBranding({ ...branding, heroDataUrl: undefined })} /></div>
      <p className="mt-3 text-xs leading-5 text-slate-500">En la demo, las imágenes se guardan únicamente en este navegador. La conexión remota de branding continúa deshabilitada hasta disponer del repositorio tenant y Storage.</p>
    </Accordion>
    <Accordion icon={Palette} title="Apariencia" description="Acentos y superficies de la experiencia">
      <div className="grid gap-4 sm:grid-cols-3"><ColorField label="Dorado principal" value={branding.primaryColor} onChange={value => setBranding({ ...branding, primaryColor: value })} /><ColorField label="Estado positivo" value={branding.accentColor} onChange={value => setBranding({ ...branding, accentColor: value })} /><ColorField label="Superficie" value={branding.surfaceColor} onChange={value => setBranding({ ...branding, surfaceColor: value })} /></div>
    </Accordion>
    </fieldset>
    {canViewFloor && <Accordion icon={TableProperties} title="Zonas y mesas" description={`${data.zones.length} zonas · ${data.tables.length} mesas`}>
      <NightclubFloor data={data} onSelectTable={() => undefined} onSaveZone={onSaveZone} onSaveTable={onSaveTable} onDeleteZone={onDeleteZone} onDeleteTable={onDeleteTable} embedded />
    </Accordion>}
    {usersPanel && <Accordion icon={Users} title="Usuarios y permisos" description="Personal, roles y matriz de acceso">{usersPanel}</Accordion>}
    <Accordion icon={SlidersHorizontal} title="Operación" description="Estado del turno y reglas activas">
      <div className="grid gap-3 sm:grid-cols-3"><Status label="Turno" value={data.shift?.status === 'open' ? 'Abierto' : 'Cerrado'} /><Status label="Reservas" value="Habilitadas" /><Status label="Cobro por ronda" value="Activo" /></div><p className="mt-3 text-xs text-slate-500">Los cambios de turno se realizan en Caja. Los estados de mesa se administran desde Zonas para conservar la trazabilidad.</p>
    </Accordion>
    {!readOnly && <button type="button" onClick={saveBranding} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 font-bold text-[#07111a] sm:w-auto"><Save size={17} />Guardar identidad y apariencia</button>}
  </div>
}

function Accordion({ icon: Icon, title, description, open = false, children }: { icon: typeof Store; title: string; description: string; open?: boolean; children: React.ReactNode }) { return <details open={open} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0d1720]/90"><summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-300"><Icon size={19} /></span><span className="min-w-0 flex-1"><strong className="block text-sm text-white">{title}</strong><span className="block truncate text-xs text-slate-400">{description}</span></span><ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" /></summary><div className="border-t border-white/10 p-4 sm:p-5">{children}</div></details> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-slate-300">{label}<div className="mt-1 [&>input]:h-11 [&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-white/10 [&>input]:!bg-[#07111a] [&>input]:px-3 [&>input]:!text-white">{children}</div></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold text-slate-300"><span>{label}</span><span className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-[#07111a] p-2"><input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border-0! bg-transparent! p-0" /><code className="text-slate-300">{value.toUpperCase()}</code></span></label> }
function ImagePicker({ label, value, wide, onPick, onClear }: { label: string; value?: string; wide?: boolean; onPick: (file?: File) => void; onClear: () => void }) { return <div className="rounded-xl border border-dashed border-white/15 bg-[#07111a] p-3"><div className={`overflow-hidden rounded-lg bg-[#101d27] ${wide ? 'aspect-[16/6]' : 'h-24 w-24'}`}>{value ? <img src={value} alt={`Vista previa de ${label}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-600"><ImagePlus size={25} /></div>}</div><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-white/15 px-3 text-xs font-bold text-slate-200">Elegir {label.toLowerCase()}<input type="file" accept="image/*" className="sr-only" onChange={event => onPick(event.target.files?.[0])} /></label>{value && <button type="button" onClick={onClear} className="min-h-10 px-2 text-xs text-rose-300">Quitar</button>}</div></div> }
function Status({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-[#07111a] p-3"><span className="block text-xs text-slate-500">{label}</span><strong className="mt-1 block text-sm text-slate-100">{value}</strong></div> }
