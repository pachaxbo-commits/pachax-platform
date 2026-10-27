import { useMemo, useState } from 'react'
import {
  Boxes,
  ClipboardList,
  Grid3x3,
  Home,
  LogOut,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  HandCoins,
  UserCog,
  BarChart3,
  Printer,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { getVisibleModules, type ModuleId } from '../../../config/businessTypes'
import { BottomNav, type BottomNavItem } from '../../../components/ui/BottomNav'
import { Modal } from '../../../components/ui/Modal'
import { useBackButtonBridge } from '../../../hooks/useBackHandler'
import { SyncStatusPill } from './shared'
import { DashboardView } from './DashboardView'
import { DistributorHomeView } from './DistributorHomeView'
import { InventoryView } from './InventoryView'
import { DispatchesView } from './DispatchesView'
import { SellView } from './SellView'
import { CreditsView } from './CreditsView'
import { CollectionsView } from './CollectionsView'
import { CustomersView } from './CustomersView'
import { ExpensesView } from './ExpensesView'
import { ClosureView } from './ClosureView'
import { ProductsView } from './ProductsView'
import { ReportsView } from './ReportsView'
import { UsersView } from './UsersView'
import { SupportView } from './SupportView'
import { ClaimsView } from './ClaimsView'
import { QrView } from './QrView'
import { WarehousesView } from './WarehousesView'
import type { Permission, UserRole } from '../../../types'
import type { DistributionData } from '../state/useDistributionStore'
import type { DistributionIndustryProfile } from '../types'
import { DistributionTutorial } from '../tutorials/DistributionTutorial'
import { DistributionTutorialCenter } from '../tutorials/DistributionTutorialCenter'
import { TutorialWelcomeModal } from '../../../components/tutorials/TutorialWelcomeModal'
import { TutorialCompletionSummaryModal } from '../../../components/tutorials/TutorialCompletionSummaryModal'
import { TutorialSectionTransition } from '../../../components/tutorials/TutorialSectionTransition'
import { useTutorialOrchestrator } from '../../../components/tutorials/useTutorialOrchestrator'
import type { TutorialSectionItem, TutorialStorageScope } from '../../../components/tutorials/tutorialOrchestratorTypes'
import {
  createDistributionTutorialPlans,
  loadTutorialProgress,
  saveTutorialProgress,
  type DistributionTutorialPlan,
  type DistributionTutorialProgress,
} from '../tutorials/distributionTutorials'
import {
  type BusinessIdentity,
  type BusinessDocumentContext,
  buildBusinessDocumentContext,
} from '../../../core/businessIdentity'

export interface DistributionSession {
  tenantId: string
  restaurantName: string
  uid: string
  userName: string
  role: UserRole
  /** Ruta del distribuidor; null para admin/almacen (ven todas) */
  warehouseId?: string
  routeId: string | null
  can: (permission: Permission) => boolean
  /** Rango consultado actualmente */
  dayKeys: string[]
  setDayKeys: (dayKeys: string[]) => void
}

export interface DistributionViewProps {
  session: DistributionSession
  data: DistributionData
  documentContext?: BusinessDocumentContext
  businessIdentity?: BusinessIdentity
}

export interface DistributionSyncState {
  isOnline: boolean
  pending: number
  hasUnsyncedWrites: boolean
  lastSyncedAt: string | null
  lastError?: string | null
}

export interface DistributionExperienceProps {
  session: DistributionSession
  data: DistributionData
  syncState: DistributionSyncState
  onSignOut?: () => void | Promise<void>
  onOpenPrinterSettings: (context?: {
    businessIdentity?: BusinessIdentity
    documentContext?: BusinessDocumentContext
    companyName?: string
  }) => void
  onDismissSyncError?: () => void
  onAcknowledgeOperation?: (opId: string) => Promise<void> | void
  logoUrl?: string
  companyName?: string
  businessIdentity?: BusinessIdentity
  onSaveBusinessIdentity?: (identity: BusinessIdentity) => Promise<void> | void
  onUploadLogo?: (file: File) => Promise<string>
  activeModuleOverride?: ModuleId
  onModuleChange?: (module: ModuleId) => void
  activeProfile?: DistributionIndustryProfile
  onSelectProfile?: (profile: DistributionIndustryProfile) => void
  onResetPractice?: () => void
  initialOpenTour?: boolean
  isDemo?: boolean
}

const MODULE_ICONS: Partial<Record<ModuleId, BottomNavItem<ModuleId>['icon']>> = {
  'dist.claims': Receipt,
  'dist.qr': Receipt,
  'dist.warehouses': Boxes,
  'dist.dashboard': Home,
  'dist.sales': ShoppingCart,
  'dist.inventory': Boxes,
  'dist.dispatches': Truck,
  'dist.credits': Receipt,
  'dist.collections': HandCoins,
  'dist.customers': Users,
  'dist.expenses': Wallet,
  'dist.closure': ClipboardList,
  'dist.products': Grid3x3,
  'dist.reports': BarChart3,
  'dist.users': UserCog,
  'printer-settings': Printer,
  'dist.support': Settings2,
}

export function DistributionExperience({
  session,
  data,
  syncState,
  onSignOut,
  onOpenPrinterSettings,
  onDismissSyncError,
  onAcknowledgeOperation,
  logoUrl,
  companyName,
  businessIdentity,
  onSaveBusinessIdentity,
  onUploadLogo,
  activeModuleOverride,
  onModuleChange,
  activeProfile = 'food',
  onSelectProfile,
  onResetPractice,
  initialOpenTour = false,
  isDemo,
}: DistributionExperienceProps) {
  const effectiveIsDemo = isDemo ?? (
    Boolean(onResetPractice || onSelectProfile) ||
    session.tenantId.startsWith('preview-') ||
    session.tenantId.startsWith('demo-')
  )
  const modules = useMemo(
    () => getVisibleModules('mobile_distribution', session.can, session.role),
    [session.can, session.role]
  )

  const [internalModule, setInternalModule] = useState<ModuleId>('dist.dashboard')
  const currentProfile = activeProfile || 'food'
  const [isTutorialCenterOpen, setIsTutorialCenterOpen] = useState(initialOpenTour)
  const [activeTourPlan, setActiveTourPlan] = useState<DistributionTutorialPlan | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  const progressContext = useMemo(() => ({
    isDemo: effectiveIsDemo,
    tenantId: session.tenantId,
    uid: session.uid,
    role: session.role,
    profile: currentProfile,
  }), [effectiveIsDemo, session.tenantId, session.uid, session.role, currentProfile])

  const [prevContext, setPrevContext] = useState(progressContext)
  const [progressMap, setProgressMap] = useState<Record<string, DistributionTutorialProgress>>(() =>
    loadTutorialProgress(progressContext)
  )

  if (progressContext !== prevContext) {
    setPrevContext(progressContext)
    setProgressMap(loadTutorialProgress(progressContext))
  }

  const tutorialPlans = useMemo(
    () =>
      createDistributionTutorialPlans({
        role: session.role,
        profile: currentProfile,
        can: session.can,
        modules: modules.map((m) => m.id),
      }),
    [session.role, currentProfile, session.can, modules]
  )

  const distributionSections: TutorialSectionItem[] = useMemo(() => {
    return tutorialPlans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      module: plan.steps[0]?.module || 'dist.dashboard',
      estimatedMinutes: plan.estimatedMinutes,
    }))
  }, [tutorialPlans])

  const tutorialScope: TutorialStorageScope = useMemo(() => ({
    template: 'distribution',
    role: session.role,
    profile: currentProfile,
    tenantId: session.tenantId,
    uid: session.uid,
    isDemo: effectiveIsDemo,
  }), [session.role, currentProfile, session.tenantId, session.uid, effectiveIsDemo])

  const orchestrator = useTutorialOrchestrator({
    scope: tutorialScope,
    sections: distributionSections,
    onNavigateToModule: (mod) => selectModule(mod as ModuleId),
    onOpenSectionTour: (planId, initialStep = 0) => {
      const plan = tutorialPlans.find((p) => p.id === planId)
      if (plan) {
        setActiveTourPlan(plan)
        setActiveStepIndex(initialStep)
        const targetMod = plan.steps[initialStep]?.module || plan.steps[0]?.module
        if (targetMod) selectModule(targetMod)
      }
    },
    onCloseSectionTour: () => {
      setActiveTourPlan(null)
    },
  })
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const [copiedOperationId, setCopiedOperationId] = useState('')

  const effectiveCompanyName =
    businessIdentity?.tradeName?.trim() || companyName || session.restaurantName
  const effectiveLogoUrl = businessIdentity?.logoUrl || logoUrl

  const documentContext = useMemo(
    () =>
      buildBusinessDocumentContext(businessIdentity, {
        companyName: effectiveCompanyName,
        branchName: 'Casa Matriz',
      }),
    [businessIdentity, effectiveCompanyName]
  )

  const activeModuleCandidate = activeModuleOverride ?? internalModule
  const activeModule = modules.some((module) => module.id === activeModuleCandidate)
    ? activeModuleCandidate
    : modules[0]?.id ?? 'dist.dashboard'

  useBackButtonBridge(() => {
    if (activeModule !== modules[0]?.id) {
      const defaultId = modules[0]?.id ?? 'dist.dashboard'
      setInternalModule(defaultId)
      onModuleChange?.(defaultId)
      return true
    }
    return false
  })

  // Los cuatro accesos de la barra inferior dependen del trabajo real de cada rol
  const navPriority: ModuleId[] =
    session.role === 'support'
      ? ['dist.support']
      : session.role === 'distributor'
      ? ['dist.dashboard', 'dist.sales', 'dist.credits', 'dist.closure']
      : session.role === 'warehouse'
      ? ['dist.dashboard', 'dist.inventory', 'dist.dispatches', 'dist.closure']
      : ['dist.dashboard', 'dist.inventory', 'dist.dispatches', 'dist.reports']

  const navItems: BottomNavItem<ModuleId>[] = navPriority
    .map((id) => modules.find((module) => module.id === id))
    .filter((module): module is NonNullable<typeof module> => Boolean(module && MODULE_ICONS[module.id]))
    .map((module) => ({
      id: module.id,
      label: module.label,
      icon: MODULE_ICONS[module.id]!,
    }))

  const overflowModules = modules.filter((module) => !navItems.some((item) => item.id === module.id))

  const handleOpenPrinterSettings = () => {
    onOpenPrinterSettings({
      businessIdentity,
      documentContext,
      companyName: effectiveCompanyName,
    })
  }

  const selectModule = (id: ModuleId) => {
    setIsMoreOpen(false)
    if (id === 'printer-settings') {
      handleOpenPrinterSettings()
      return
    }
    setInternalModule(id)
    onModuleChange?.(id)
    window.scrollTo({ top: 0 })
  }

  const viewProps: DistributionViewProps = {
    session,
    data,
    documentContext,
    businessIdentity,
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'dist.claims':
        return <ClaimsView {...viewProps} />
      case 'dist.qr':
        return <QrView {...viewProps} />
      case 'dist.warehouses':
        return <WarehousesView {...viewProps} />
      case 'dist.dashboard':
        return session.role === 'distributor' ? (
          <DistributorHomeView {...viewProps} onNavigate={selectModule} />
        ) : (
          <DashboardView {...viewProps} />
        )
      case 'dist.inventory':
        return <InventoryView {...viewProps} />
      case 'dist.dispatches':
        return <DispatchesView {...viewProps} />
      case 'dist.sales':
        return <SellView {...viewProps} />
      case 'dist.credits':
        return <CreditsView {...viewProps} />
      case 'dist.collections':
        return <CollectionsView {...viewProps} />
      case 'dist.customers':
        return <CustomersView {...viewProps} />
      case 'dist.expenses':
        return <ExpensesView {...viewProps} />
      case 'dist.closure':
        return <ClosureView {...viewProps} />
      case 'dist.products':
        return <ProductsView {...viewProps} />
      case 'dist.reports':
        return <ReportsView {...viewProps} />
      case 'dist.users':
        return <UsersView {...viewProps} />
      case 'dist.support':
        return (
          <SupportView
            session={session}
            businessIdentity={businessIdentity}
            onSaveBusinessIdentity={onSaveBusinessIdentity}
            onUploadLogo={onUploadLogo}
            onOpenPrinterSettings={handleOpenPrinterSettings}
          />
        )
      default:
        return null
    }
  }

  const roleLabel =
    session.role === 'support'
      ? 'Soporte'
      : session.role === 'distributor'
      ? 'Distribuidor'
      : session.role === 'warehouse'
      ? 'Almacén'
      : session.role === 'accountant'
      ? 'Contabilidad'
      : session.role === 'owner'
      ? 'Propietario'
      : 'Administrador'

  return (
    <div
      className="distribution-shell flex min-h-[100dvh] w-full min-w-0 flex-col"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <header
        className="distribution-header sticky top-0 z-30 w-full border-b border-slate-200 bg-white px-3 pb-2.5"
        style={{ borderBottomColor: 'var(--primary-soft)' }}
      >
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2.5" data-tutorial-target="header-identity">
            {effectiveLogoUrl ? (
              <img
                src={effectiveLogoUrl}
                alt={effectiveCompanyName}
                className="h-10 w-12 shrink-0 object-contain rounded-md"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-sm text-white shadow-sm"
                style={{ backgroundColor: businessIdentity?.primaryColor || 'var(--primary, #0284c7)' }}
                aria-label={effectiveCompanyName}
              >
                {effectiveCompanyName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold leading-tight tracking-tight text-slate-900 sm:text-base">
                {effectiveCompanyName}
              </h1>
              <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-slate-500 sm:text-[11px]">
                {roleLabel} · {session.userName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTutorialCenterOpen(true)}
              data-tutorial-target="tutorial-trigger-btn"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 transition hover:bg-sky-100 cursor-pointer shadow-xs"
            >
              <Sparkles size={14} className="text-sky-600" />
              <span className="hidden sm:inline">Tutorial interactivo</span>
              <span className="sm:hidden">Tutorial</span>
            </button>
            <span className="sm:hidden">
              <SyncStatusPill state={syncState} compact />
            </span>
            <span className="hidden sm:inline-flex">
              <SyncStatusPill state={syncState} />
            </span>
            <button
            type="button"
            onClick={() => setIsTutorialCenterOpen(true)}
            data-tutorial-target="sidebar-tutorial-btn"
            className="mt-2 flex min-h-[44px] items-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/70 px-3 text-left text-xs font-bold text-sky-800 hover:bg-sky-100 transition cursor-pointer"
          >
            <Sparkles size={16} className="text-sky-600 shrink-0" />
            <span className="min-w-0 break-words leading-tight">Tutorial por rubro</span>
          </button>
          {onSignOut && (
              <button
                type="button"
                onClick={() => setIsSignOutOpen(true)}
                aria-label="Cerrar sesion"
                className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 sm:flex"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 gap-4 px-3 py-4">
        {/* Navegación lateral en pantallas amplias (>= 768px activa md) */}
        <nav
          className="hidden w-52 shrink-0 flex-col gap-1 md:flex"
          style={{ backgroundColor: 'var(--sidebar, transparent)' }}
        >
          {modules.map((module) => {
            const Icon = MODULE_ICONS[module.id]
            const isActive = module.id === activeModule
            return (
              <button
                key={module.id}
                type="button"
                data-tutorial-target={`nav-item-${module.id}`}
                onClick={() => selectModule(module.id)}
                className={`flex min-h-[44px] items-center gap-2.5 rounded-2xl px-3 text-left text-sm font-bold transition ${
                  isActive ? 'text-white' : 'text-slate-600 hover:bg-white'
                }`}
                style={isActive ? { backgroundColor: 'var(--primary)' } : undefined}
              >
                {Icon && <Icon size={17} />}
                <span className="min-w-0 break-words text-xs leading-tight">{module.label}</span>
              </button>
            )
          })}
          {onSignOut && (
            <button
              type="button"
              onClick={() => setIsSignOutOpen(true)}
              className="mt-2 flex min-h-[44px] items-center gap-2.5 rounded-2xl px-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={17} /> Cerrar sesión
            </button>
          )}
          <div className="mt-auto pt-6 px-3 text-[10px] font-semibold text-slate-400">
            Powered by PACHAX
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-bottom-nav">
          {data.error && (
            <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              {data.error}
            </p>
          )}
          {syncState.lastError && (
            <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              {syncState.lastError}{' '}
              {onDismissSyncError && (
                <button className="ml-2 underline" onClick={onDismissSyncError}>
                  Entendido
                </button>
              )}
            </p>
          )}
          {data.operations.filter((o) => o.status === 'queued').length > 0 && (
            <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm">
              Operaciones pendientes de validación:{' '}
              {data.operations.filter((o) => o.status === 'queued').length}. Esperando confirmación del
              servidor. No vuelvas a registrarlas.
            </p>
          )}
          {data.operations
            .filter((o) => o.status === 'rejected' && !o.acknowledged)
            .map((o) => (
              <div key={o.id} role="alert" className="mb-2 rounded-xl bg-rose-50 p-3 text-sm">
                <p className="font-bold">No se aplicó {({sale:'la venta', collection:'el cobro', expense:'el gasto', closure:'el cierre', intake:'el ingreso', transfer:'la transferencia', dispatch:'el despacho', addition:'el aumento de despacho', adjustment:'el ajuste', claim:'el cambio o devolución'} as Record<string,string>)[o.type] || 'la operación'}.</p>
                <p>{o.error || 'El servidor rechazó la solicitud. Revisa los datos o consulta a soporte.'}</p>
                <p className="mt-1 text-xs text-rose-800">ID {o.id} · {o.type} · {new Date(o.createdAt).toLocaleString('es-BO')} · Rechazada</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify({ id: o.id, type: o.type, status: o.status, createdAt: o.createdAt, error: o.error || '' }, null, 2))
                      setCopiedOperationId(o.id)
                    } catch { setCopiedOperationId('') }
                  }}>{copiedOperationId === o.id ? 'Detalles copiados' : 'Copiar detalles para soporte'}</button>
                  {onAcknowledgeOperation && <button className="px-2.5 py-1.5 text-xs font-bold underline" onClick={() => { void onAcknowledgeOperation(o.id) }}>Entendido</button>}
                </div>
              </div>
            ))}
          {renderModule()}
        </main>
      </div>

      <BottomNav
        items={[
          ...navItems,
          ...(overflowModules.length > 0
            ? [{ id: '__more' as ModuleId, label: 'Más', icon: Grid3x3 }]
            : []),
        ]}
        currentId={
          overflowModules.some((module) => module.id === activeModule)
            ? ('__more' as ModuleId)
            : activeModule
        }
        onSelect={(id) => {
          if (id === ('__more' as ModuleId)) setIsMoreOpen(true)
          else selectModule(id)
        }}
      />

      {/* Modal de Cerrar sesión */}
      {onSignOut && (
        <Modal
          isOpen={isSignOutOpen}
          onClose={() => setIsSignOutOpen(false)}
          title="Cerrar sesión"
          footer={
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsSignOutOpen(false)}
                className="min-h-[44px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
              >
                Seguir trabajando
              </button>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="min-h-[44px] rounded-2xl px-4 text-sm font-extrabold text-white"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Cerrar sesión
              </button>
            </div>
          }
        >
          <p className="text-sm font-semibold text-slate-700">
            Para volver a entrar necesitarás conexión a internet.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">
            Mientras no cierres sesión puedes seguir vendiendo sin señal: la aplicación guarda tu
            trabajo en el teléfono y lo sincroniza sola cuando vuelve la conexión.
          </p>
        </Modal>
      )}

      {/* Modal Más opciones */}
      <Modal isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} title="Más opciones">
        <div className="grid grid-cols-2 gap-2">
          {overflowModules.map((module) => {
            const Icon = MODULE_ICONS[module.id]
            const isActive = module.id === activeModule
            return (
              <button
                key={module.id}
                type="button"
                data-tutorial-target={`nav-item-${module.id}`}
                onClick={() => selectModule(module.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[56px] items-center gap-2.5 rounded-2xl border px-3 text-left text-xs font-extrabold ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }}
                >
                  {Icon && <Icon size={16} />}
                </span>
                <span className="min-w-0 break-words leading-tight">{module.label}</span>
              </button>
            )
          })}
          {onSignOut && (
            <button
              type="button"
              onClick={() => {
                setIsMoreOpen(false)
                setIsSignOutOpen(true)
              }}
              className="flex min-h-[56px] items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-left text-xs font-extrabold text-rose-700"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600">
                <LogOut size={16} />
              </span>
              Cerrar sesión
            </button>
          )}
        </div>
      </Modal>
      {/* Modal Centro de Tutoriales */}
      <DistributionTutorialCenter
        isOpen={isTutorialCenterOpen}
        onClose={() => setIsTutorialCenterOpen(false)}
        currentProfile={currentProfile}
        onSelectProfile={(newProfile) => {
          setProgressMap(loadTutorialProgress(session.role, newProfile))
          onSelectProfile?.(newProfile)
        }}
        plans={tutorialPlans}
        progressMap={progressMap}
        hasResumableSequence={orchestrator.hasResumableSequence}
        resumableTargetInfo={orchestrator.resumableTargetInfo}
        onResumeSequence={() => {
          setIsTutorialCenterOpen(false)
          orchestrator.resumeSequence()
        }}
        onRestartAllTutorials={() => {
          setIsTutorialCenterOpen(false)
          orchestrator.restartAll()
        }}
        onStartPlan={(plan) => {
          setActiveTourPlan(plan)
          const savedProgress = progressMap[plan.id]
          const resumeIndex = savedProgress?.status === 'in_progress' ? savedProgress.stepIndex : 0
          setActiveStepIndex(resumeIndex)
          setIsTutorialCenterOpen(false)
          if (plan.steps[resumeIndex]?.module) {
            selectModule(plan.steps[resumeIndex].module)
          }
        }}
        onResetData={() => {
          onResetPractice?.()
          setIsTutorialCenterOpen(false)
        }}
        role={session.role}
        companyName={effectiveCompanyName}
        isDemo={effectiveIsDemo}
      />

      {/* Visor interactivo flotante con spotlight y overlay */}
      {activeTourPlan && (
        <DistributionTutorial
          plan={activeTourPlan}
          activeModule={activeModule}
          data={data}
          onNavigate={selectModule}
          initialStepIndex={activeStepIndex}
          isContinuous={orchestrator.state.isContinuousActive}
          onStepChange={(newStepIndex) => {
            setActiveStepIndex(newStepIndex)
            saveTutorialProgress(progressContext, activeTourPlan.id, {
              status: 'in_progress',
              stepIndex: newStepIndex,
              lastUpdated: new Date().toISOString(),
            })
            setProgressMap(loadTutorialProgress(progressContext))
          }}
          onPause={(stepIdx) => {
            if (activeTourPlan) {
              saveTutorialProgress(progressContext, activeTourPlan.id, {
                status: 'in_progress',
                stepIndex: stepIdx,
                lastUpdated: new Date().toISOString(),
              })
              setProgressMap(loadTutorialProgress(progressContext))
            }
            orchestrator.pauseSequence(stepIdx)
          }}
          onDismiss={() => {
            if (activeTourPlan) {
              const currentStatus = progressMap[activeTourPlan.id]?.status
              if (currentStatus !== 'completed') {
                saveTutorialProgress(progressContext, activeTourPlan.id, {
                  status: activeStepIndex > 0 ? 'in_progress' : 'omitted',
                  stepIndex: activeStepIndex,
                  lastUpdated: new Date().toISOString(),
                })
                setProgressMap(loadTutorialProgress(progressContext))
              }
              if (orchestrator.state.isContinuousActive) {
                orchestrator.pauseSequence(activeStepIndex)
              } else {
                setActiveTourPlan(null)
              }
            }
          }}
          onComplete={() => {
            if (activeTourPlan) {
              const planId = activeTourPlan.id
              saveTutorialProgress(progressContext, planId, {
                status: 'completed',
                stepIndex: activeTourPlan.steps.length - 1,
                lastUpdated: new Date().toISOString(),
              })
              setProgressMap(loadTutorialProgress(progressContext))
              setActiveTourPlan(null)
              if (orchestrator.state.isContinuousActive) {
                orchestrator.handleSectionCompleted(planId)
              }
            }
          }}
        />
      )}

      <TutorialWelcomeModal
        isOpen={orchestrator.isWelcomeOpen}
        roleLabel={session.role}
        templateLabel="Distribución"
        sections={distributionSections}
        onStart={orchestrator.startContinuousSequence}
        onSkip={orchestrator.skipWelcome}
      />

      <TutorialSectionTransition
        transition={orchestrator.transitionState}
        onContinueNow={orchestrator.handleContinueNow}
        onPause={() => orchestrator.pauseSequence(0)}
      />

      <TutorialCompletionSummaryModal
        isOpen={orchestrator.isSummaryOpen}
        roleLabel={session.role}
        templateLabel="Distribución"
        sections={distributionSections}
        completedSectionIds={orchestrator.state.completedSectionIds}
        onClose={orchestrator.dismissSummary}
        onReplaySection={(id) => orchestrator.replaySection(id)}
        onRestartAll={orchestrator.restartAll}
      />
    </div>
  )
}