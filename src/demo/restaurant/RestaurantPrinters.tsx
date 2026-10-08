import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Printer, RefreshCw, Save, Send } from 'lucide-react'
import type { KitchenTicketJob } from '../../modules/restaurant/domain/kitchenPrint'
import { DEFAULT_KITCHEN_PRINTER_CONFIG, type KitchenPrinterConfig } from './kitchenPrinterConfig'

const connectionLabels: Record<KitchenPrinterConfig['connection'], string> = {
  browser: 'Navegador (manual)', local_agent: 'Agente local PACHAX', network: 'Red / WiFi', bluetooth: 'Bluetooth', usb: 'USB',
}

export function RestaurantPrinters({ config = DEFAULT_KITCHEN_PRINTER_CONFIG, jobs = [], onSave, onPrintTest, onRetry, onReprintLatest }: {
  config?: KitchenPrinterConfig
  jobs?: KitchenTicketJob[]
  onSave?: (config: KitchenPrinterConfig) => void
  onPrintTest?: () => void
  onRetry?: (jobId: string) => void
  onReprintLatest?: () => void
}) {
  const [draft, setDraft] = useState(config)
  const lastJob = useMemo(() => jobs[0], [jobs])
  const configured = Boolean(config.name.trim())
  const status = !configured ? 'Sin configurar' : config.connection === 'local_agent' && config.mode === 'automatic' ? 'Pendiente de agente local' : 'Listo para imprimir'
  return <div className="restaurant-printers max-w-3xl space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Impresora de cocina</h1><p className="mt-1 text-sm text-slate-500">Las comandas se guardan primero. La impresión nunca crea otra venta.</p></div>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><Printer className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" /><div><strong>{status}</strong><p className="mt-0.5 text-xs text-slate-500">En navegador se abre el diálogo de impresión. La impresión automática requiere un agente local instalado y conectado.</p></div></div>
      <label className="block text-sm font-bold text-slate-800">Nombre de la impresora<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej.: Cocina principal" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-800">Área<select value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value as KitchenPrinterConfig['area'] })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="kitchen">Cocina</option><option value="bar">Barra</option><option value="cash">Caja</option></select></label>
        <label className="text-sm font-bold text-slate-800">Conexión<select value={draft.connection} onChange={(event) => setDraft({ ...draft, connection: event.target.value as KitchenPrinterConfig['connection'] })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{Object.entries(connectionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-800">Papel<select value={draft.paperWidth} onChange={(event) => setDraft({ ...draft, paperWidth: event.target.value as KitchenPrinterConfig['paperWidth'] })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="58mm">58 mm</option><option value="80mm">80 mm</option><option value="A4">A4</option></select></label>
        <label className="text-sm font-bold text-slate-800">Modo<select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as KitchenPrinterConfig['mode'] })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="manual">Manual</option><option value="automatic">Automático</option></select></label>
      </div>
      <button type="button" onClick={() => onSave?.(draft)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-[var(--primary-foreground)]"><Save size={16} />Guardar impresora</button>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><h2 className="text-base font-bold text-slate-900">Pruebas y últimos trabajos</h2><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onPrintTest} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700"><Send size={15} />Imprimir prueba</button><button type="button" disabled={!lastJob} onClick={onReprintLatest} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40"><FileText size={15} />Reimprimir última</button></div>{!lastJob ? <p className="mt-4 text-sm text-slate-500">Todavía no hay comandas enviadas.</p> : <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-bold text-slate-900">Pedido #{lastJob.idempotencyKey.split(':')[1] || 'nuevo'}</span><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">{lastJob.status === 'error' ? <AlertCircle size={14} className="text-rose-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}{lastJob.status === 'agent_confirmed' ? 'Confirmado' : lastJob.status === 'sent' ? 'Enviado' : lastJob.status === 'error' ? 'Error' : 'Pendiente'}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(lastJob.createdAt).toLocaleString('es-BO')} · Intentos: {lastJob.retries + 1}</p>{lastJob.error && <button type="button" onClick={() => onRetry?.(lastJob.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)]"><RefreshCw size={13} />Reintentar</button>}</div>}</section>
  </div>
}
