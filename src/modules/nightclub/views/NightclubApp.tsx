import { CloudOff, LogOut } from 'lucide-react'

interface NightclubAppProps {
  tenantId: string
  companyName: string
  logoUrl?: string
  uid: string
  userName: string
  role: string
  onSignOut: () => Promise<void>
}

/** Production fails closed until the tenant repository is connected. */
export function NightclubApp(props: NightclubAppProps) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><section className="w-full max-w-lg rounded-2xl border border-amber-400/25 bg-slate-900 p-6 shadow-2xl"><header className="flex items-center gap-3">{props.logoUrl ? <img src={props.logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400 text-slate-950"><CloudOff size={22} /></span>}<div><h1 className="font-black">{props.companyName}</h1><p className="text-xs text-slate-400">Club nocturno / Lounge</p></div></header><div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-5"><h2 className="text-lg font-bold">Servicio operacional todavía no conectado</h2><p className="mt-2 text-sm leading-6 text-slate-300">La interfaz del negocio está habilitada, pero este tenant aún no tiene configurado el proveedor operacional seguro. No se cargarán datos ficticios ni operaciones locales en producción.</p></div><div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-400"><span>{props.userName} · {props.role}</span><button onClick={() => void props.onSignOut()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 font-bold text-slate-100"><LogOut size={15} />Cerrar sesión</button></div></section></main>
}
