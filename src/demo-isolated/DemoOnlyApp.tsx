import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RotateCcw, ShieldCheck } from 'lucide-react'
import { clearRestaurantDemoStorage } from '../demo/restaurant/restaurantStorage'
import { clearDemoProductImages, buildDemoImageScopeKey } from '../demo/restaurant/demoProductImageStorage'
import type { DemoDatasetMode } from '../demo/datasets/types'

const RestaurantDemo = lazy(() => import('../demo/restaurant/RestaurantDemo').then((module) => ({ default: module.RestaurantDemo })))
const QuickRetailDemo = lazy(() => import('../demo/quick-retail/QuickRetailDemo').then((module) => ({ default: module.QuickRetailDemo })))

type IsolatedTemplate = 'hamburger' | 'retail'
type DemoRoute = { template: IsolatedTemplate | null; dataset: DemoDatasetMode }

const ROLE_OPTIONS: Record<IsolatedTemplate, Array<{ id: string; name: string }>> = {
  hamburger: [
    { id: 'owner', name: 'Propietario' },
    { id: 'admin', name: 'Administrador' },
    { id: 'cashier', name: 'Caja' },
    { id: 'kitchen', name: 'Cocina' },
    { id: 'inventory', name: 'Inventario' },
  ],
  retail: [
    { id: 'owner', name: 'Propietario' },
    { id: 'admin', name: 'Administrador' },
    { id: 'cashier', name: 'Caja' },
    { id: 'sales', name: 'Ventas' },
    { id: 'inventory', name: 'Inventario' },
  ],
}

function readRoute(): DemoRoute {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const template = path === '/demo/hamburger'
    ? 'hamburger'
    : path === '/demo/retail'
      ? 'retail'
      : null
  return {
    template,
    dataset: new URLSearchParams(window.location.search).get('data') === 'empty' ? 'empty' : 'full',
  }
}

function routeUrl(template: IsolatedTemplate, dataset: DemoDatasetMode): string {
  return `/demo/${template}?data=${dataset}`
}

export function DemoOnlyApp() {
  const [route, setRoute] = useState<DemoRoute>(readRoute)
  const [role, setRole] = useState('admin')
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    const onPopState = () => {
      setRoute(readRoute())
      setRole('admin')
      setResetKey((value) => value + 1)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const roles = useMemo(() => route.template ? ROLE_OPTIONS[route.template] : [], [route.template])

  const navigate = (url: string) => {
    window.history.pushState({}, '', url)
    setRoute(readRoute())
    setRole('admin')
    setResetKey((value) => value + 1)
  }

  const changeDataset = (dataset: DemoDatasetMode) => {
    if (!route.template) return
    navigate(routeUrl(route.template, dataset))
  }

  const resetDemo = async () => {
    if (route.template === 'hamburger') {
      clearRestaurantDemoStorage('hamburger')
      const scopeKey = buildDemoImageScopeKey({
        template: 'hamburger',
        datasetMode: route.dataset || 'full',
      })
      await clearDemoProductImages(scopeKey)
    }
    if (route.template === 'retail') {
      window.localStorage.removeItem('pachax:quick-retail-demo:operations:v1')
      const scopeKey = buildDemoImageScopeKey({
        template: 'retail',
        datasetMode: route.dataset || 'full',
      })
      await clearDemoProductImages(scopeKey)
    }
    setRole('admin')
    setResetKey((value) => value + 1)
  }

  if (!route.template) {
    return (
      <main data-demo-only-ready="true" className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8">
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
            >
              <ArrowLeft size={15} /> Volver a PACHAX
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">PACHAX · entorno aislado</p>
                <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Demostraciones interactivas</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">Explora flujos simulados con datos ficticios. Los cambios se mantienen en esta sesión y no se conectan a empresas reales.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck size={16} /> Sin conexión a servicios de negocio</span>
            </div>
          </header>

          <section aria-label="Plantillas demo" className="grid gap-4 md:grid-cols-2">
            <DemoCard title="Restaurante Rápido" description="Pedidos de mostrador, cocina, caja e inventario." template="hamburger" onOpen={navigate} />
            <DemoCard title="Comercio / Venta Rápida" description="Ventas por unidad o peso, caja e inventario." template="retail" onOpen={navigate} />
          </section>
        </div>
      </main>
    )
  }

  const template = route.template
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => window.location.assign('/')} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"><ArrowLeft size={14} /> Volver a PACHAX</button>
          <button type="button" onClick={() => navigate('/')} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Galería</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500">{template === 'hamburger' ? 'Restaurante Rápido' : 'Comercio / Venta Rápida'}</p>
            <p className="text-[11px] font-medium text-emerald-700">Entorno de demostración · datos ficticios</p>
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
            <span>Datos</span>
            <select aria-label="Conjunto de datos" value={route.dataset} onChange={(event) => changeDataset(event.target.value as DemoDatasetMode)} className="max-w-24 bg-transparent text-sm outline-none">
              <option value="full">Completo</option>
              <option value="empty">Vacío</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
            <span>Rol</span>
            <select aria-label="Rol simulado" value={role} onChange={(event) => setRole(event.target.value)} className="max-w-36 bg-transparent text-sm outline-none">
              {roles.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={resetDemo} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700"><RotateCcw size={15} /> Reiniciar</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px]">
        <Suspense fallback={<div data-demo-only-loading="true" role="status" aria-live="polite" className="mx-auto min-h-48 max-w-5xl px-4 py-10 text-center text-sm text-slate-600">Cargando demostración…</div>}>
          {template === 'hamburger' ? (
            <div data-demo-only-ready="true"><RestaurantDemo key={`${template}:${route.dataset}:${resetKey}`} mode="simulated_role" simulatedRole={role} datasetMode={route.dataset} resetKey={resetKey} profile="counter_service" companyName="Servicio Rápido Demo" /></div>
          ) : (
            <div data-demo-only-ready="true"><QuickRetailDemo key={`${template}:${route.dataset}:${resetKey}`} mode="simulated_role" simulatedRole={role} datasetMode={route.dataset} /></div>
          )}
        </Suspense>
      </main>
    </div>
  )
}

function DemoCard({ title, description, template, onOpen }: {
  title: string
  description: string
  template: IsolatedTemplate
  onOpen: (url: string) => void
}) {
  return (
    <article className="flex min-h-56 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div><p className="text-xs font-bold uppercase tracking-wider text-teal-700">Datos ficticios</p><h2 className="mt-2 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p></div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpen(routeUrl(template, 'full'))} className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Abrir datos completos</button>
        <button type="button" onClick={() => onOpen(routeUrl(template, 'empty'))} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">Abrir desde cero</button>
      </div>
    </article>
  )
}
