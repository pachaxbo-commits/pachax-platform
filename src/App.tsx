import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DistributionApp } from './modules/distribution/views/DistributionApp'
import { DistributionPrinterModal } from './modules/distribution/views/DistributionPrinterModal'
import { RestaurantApp } from './modules/restaurant/views/RestaurantApp'
import { NightclubApp } from './modules/nightclub/views/NightclubApp'
import { RetailApp } from './modules/retail/views/RetailApp'
import { PublicLanding } from './public/landing/PublicLanding'
import { PublicLoginView } from './public/auth/PublicLoginView'
import { PublicRegisterView } from './public/register/PublicRegisterView'
import { AdminLoginView } from './admin/views/AdminLoginView'
import { AdminShell } from './admin/views/AdminShell'
import { usePublicRouter } from './public/routing/usePublicRouter'
import { useAuthStore } from './store/authStore'
import { getActiveTenant } from './store/activeTenant'
import { PACHAX_NAME } from './config/pachax'
import { BrandMark } from './public/components/BrandMark'
import { TenantSelectorView } from './platform/TenantSelectorView'
import { OnboardingWizard } from './platform/OnboardingWizard'
import { PlatformHeaderBar } from './platform/PlatformHeaderBar'
import { TenantErrorView } from './platform/TenantErrorView'
import type { UserRole } from './types'

function DistributionShell(props: {
  tenantId: string
  restaurantName: string
  companyName?: string
  logoUrl?: string
  primaryColor?: string
  accentColor?: string
  uid: string
  userName: string
  role: UserRole
  routeId: string | null
  warehouseId?: string
  onSignOut: () => Promise<void>
  businessIdentity?: import('./core/businessIdentity').BusinessIdentity
}) {
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false)
  const [printerContext, setPrinterContext] = useState<{
    businessIdentity?: import('./core/businessIdentity').BusinessIdentity
    documentContext?: import('./core/businessIdentity').BusinessDocumentContext
    companyName?: string
  } | null>(null)

  const handleOpenPrinterSettings = (context?: {
    businessIdentity?: import('./core/businessIdentity').BusinessIdentity
    documentContext?: import('./core/businessIdentity').BusinessDocumentContext
    companyName?: string
  }) => {
    if (context) {
      setPrinterContext(context)
    }
    setIsPrinterSettingsOpen(true)
  }

  const effectiveBusinessIdentity = printerContext?.businessIdentity || props.businessIdentity
  const effectiveCompanyName =
    printerContext?.companyName ||
    printerContext?.documentContext?.companyName ||
    effectiveBusinessIdentity?.tradeName ||
    props.companyName ||
    props.restaurantName

  return (
    <>
      <DistributionApp {...props} onOpenPrinterSettings={handleOpenPrinterSettings} />
      {isPrinterSettingsOpen && (
        <DistributionPrinterModal
          tenantId={props.tenantId}
          branchId="main"
          companyName={effectiveCompanyName}
          businessIdentity={effectiveBusinessIdentity}
          documentContext={printerContext?.documentContext}
          onClose={() => setIsPrinterSettingsOpen(false)}
        />
      )}
    </>
  )
}

function App() {
  const auth = useAuthStore()
  const { path, navigate } = usePublicRouter()
  const isNative =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    )

  // 1. Entorno Administrativo Seguro (/admin y /admin/login)
  if (!isNative && path === '/admin/login') {
    return <AdminLoginView />
  }

  if (!isNative && path.startsWith('/admin')) {
    return <AdminShell />
  }

  // 2. En la web pública: /register no depende de Firebase
  if (!isNative && path === '/register') {
    return <PublicRegisterView />
  }

  // 3. En la web pública: la landing / no depende de Firebase
  if (!isNative && path === '/') {
    return <PublicLanding />
  }

  // 4. Si se accede a la aplicación pero está en modo local sin Firebase
  if (auth.mode === 'local') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-[#B91C1C]">{PACHAX_NAME}</h1>
          <p className="mt-3">Falta configurar la conexión del sistema. Contacta con administración.</p>
        </div>
      </div>
    )
  }

  // 5. Usuario no autenticado o autenticando en /login, /platform o app instalada
  if (auth.status === 'signed_out' || auth.status === 'authenticating') {
    return (
      <PublicLoginView
        error={auth.error}
        isLoading={auth.status === 'authenticating'}
        onSubmit={async (email, password) => {
          await auth.signIn(email, password)
          navigate('/platform')
        }}
      />
    )
  }

  // 6. Estado de carga de sesión o memberships
  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F6] p-4 text-center">
        <BrandMark size="lg" />
        <div className="mt-6 flex items-center justify-center gap-2.5 text-slate-600 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" />
          <span>Cargando tu sesión y empresas...</span>
        </div>
      </div>
    )
  }

  // 7. Onboarding explícito (/onboarding) o usuario sin empresas (needs_tenant)
  if (auth.status === 'needs_tenant' || path === '/onboarding') {
    return (
      <OnboardingWizard
        userEmail={auth.userEmail}
        userDisplayName={auth.userDisplayName}
        existingTenantsCount={auth.availableTenants.length}
        onSuccess={async (newTenantId) => {
          await auth.refreshMemberships()
          await auth.switchTenant(newTenantId)
          navigate('/platform')
        }}
        onCancel={
          auth.availableTenants.length > 0
            ? () => {
                auth.setSelectingTenant(true)
                navigate('/platform/select')
              }
            : undefined
        }
        onSignOut={auth.signOut}
      />
    )
  }

  // 8. Error de acceso / membership revocada / tenant no disponible (unauthorized)
  if (auth.status === 'unauthorized') {
    return (
      <TenantErrorView
        userEmail={auth.userEmail}
        message={auth.error ?? 'No tienes acceso a esta empresa o tu membresía fue desactivada.'}
        hasOtherTenants={auth.availableTenants.length > 1}
        onSelectOtherTenant={() => {
          auth.setSelectingTenant(true)
          navigate('/platform/select')
        }}
        onRetry={() => auth.refreshMemberships()}
        onSignOut={auth.signOut}
      />
    )
  }

  // 9. Selector de empresas: cuando hay múltiples y el usuario lo solicita o no hay selección activa
  if (auth.isSelectingTenant || path === '/platform/select') {
    return (
      <TenantSelectorView
        userEmail={auth.userEmail}
        userDisplayName={auth.userDisplayName}
        tenants={auth.availableTenants}
        activeTenantId={auth.tenantId}
        onSelectTenant={async (tenantId) => {
          await auth.switchTenant(tenantId)
          navigate('/platform')
        }}
        onCreateNewTenant={() => navigate('/onboarding')}
        onSignOut={auth.signOut}
      />
    )
  }

  // 10. Validación de membresía activa
  if (!auth.tenantId || !auth.member?.active || !auth.account) {
    return (
      <TenantErrorView
        userEmail={auth.userEmail}
        message={auth.error ?? 'Este usuario no tiene una membresía activa en la empresa seleccionada.'}
        hasOtherTenants={auth.availableTenants.length > 1}
        onSelectOtherTenant={() => {
          auth.setSelectingTenant(true)
          navigate('/platform/select')
        }}
        onRetry={() => auth.refreshMemberships()}
        onSignOut={auth.signOut}
      />
    )
  }

  // 11. Enrutamiento canónico a la aplicación correspondiente del tenant
  const activeTenant = getActiveTenant()
  const canonicalBusinessType =
    activeTenant?.businessType ??
    (auth.account.businessType === 'mobile_distribution' ? 'route_distribution' : null)

  const headerBar = (
    <PlatformHeaderBar
      tenantName={activeTenant?.tenant.name || auth.account.name}
      businessType={canonicalBusinessType || 'route_distribution'}
      role={activeTenant?.role || auth.member.role}
      userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
      userEmail={auth.userEmail}
      hasMultipleTenants={auth.availableTenants.length > 1}
      onSwitchTenant={() => {
        auth.setSelectingTenant(true)
        navigate('/platform/select')
      }}
      onCreateNewTenant={() => navigate('/onboarding')}
      onSignOut={auth.signOut}
    />
  )

  if (canonicalBusinessType === 'route_distribution') {
    return (
      <div className="min-h-screen flex flex-col w-full bg-[#FAF9F6]">
        {headerBar}
        <div className="flex-1 w-full">
          <DistributionShell
            tenantId={auth.tenantId}
            restaurantName={auth.account.name}
            companyName={activeTenant?.tenant.name || auth.account.name}
            logoUrl={activeTenant?.branding?.logoUrl || auth.account.branding?.logoUrl}
            primaryColor={activeTenant?.branding?.primary || auth.account.branding?.primaryColor}
            accentColor={activeTenant?.branding?.accent || auth.account.branding?.accentColor}
            key={`${auth.tenantId}:${auth.member.uid}`}
            warehouseId={auth.member.warehouseId}
            uid={auth.member.uid}
            userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
            role={auth.member.role}
            routeId={auth.member.routeId ?? null}
            onSignOut={auth.signOut}
            businessIdentity={activeTenant?.tenant?.businessIdentity}
          />
        </div>
      </div>
    )
  }

  if (canonicalBusinessType === 'restaurant_pos' || canonicalBusinessType === 'hamburger_shop') {
    return (
      <div className="min-h-screen flex flex-col w-full bg-[#FAF9F6]">
        {headerBar}
        <div className="flex-1 w-full">
          <RestaurantApp
            key={`${auth.tenantId}:${auth.member.uid}`}
            tenantId={auth.tenantId}
            restaurantName={auth.account.name}
            companyName={activeTenant?.tenant.name || auth.account.name}
            logoUrl={activeTenant?.branding?.logoUrl || auth.account.branding?.logoUrl}
            primaryColor={activeTenant?.branding?.primary || auth.account.branding?.primaryColor}
            accentColor={activeTenant?.branding?.accent || auth.account.branding?.accentColor}
            uid={auth.member.uid}
            userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
            role={activeTenant?.role || auth.member.role}
            onSignOut={auth.signOut}
            profile={canonicalBusinessType === 'hamburger_shop' ? 'counter_service' : 'restaurant'}
            businessIdentity={activeTenant?.tenant?.businessIdentity}
          />
        </div>
      </div>
    )
  }

  if (canonicalBusinessType === 'nightclub_lounge') {
    return (
      <div className="min-h-screen flex flex-col w-full bg-[#FAF9F6]">
        {headerBar}
        <div className="flex-1 w-full">
          <NightclubApp
            key={`${auth.tenantId}:${auth.member.uid}`}
            tenantId={auth.tenantId}
            companyName={activeTenant?.tenant.name || auth.account.name}
            logoUrl={activeTenant?.branding?.logoUrl || auth.account.branding?.logoUrl}
            uid={auth.member.uid}
            userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
            role={activeTenant?.role || auth.member.role}
            onSignOut={auth.signOut}
            businessIdentity={activeTenant?.tenant?.businessIdentity}
          />
        </div>
      </div>
    )
  }

  if (canonicalBusinessType === 'gelateria_weight_cafe') {
    return <div className="min-h-screen flex flex-col w-full bg-[#FAF9F6]">{headerBar}<div className="flex-1 w-full"><RetailApp key={`${auth.tenantId}:${auth.member.uid}:${activeTenant?.branchId || 'main'}`} tenantId={auth.tenantId} uid={auth.member.uid} userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'} role={activeTenant?.role || auth.member.role} onSignOut={auth.signOut}/></div></div>
  }

  // Template no soportada / pendiente de consolidación productiva
  return (
    <div className="min-h-screen flex flex-col w-full bg-[#FAF9F6]">
      {headerBar}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <h2 className="text-xl font-bold text-slate-900">Plantilla en proceso de consolidación</h2>
          <p className="mt-2 text-sm text-slate-600">
            La interfaz operativa de esta plantilla está en proceso de consolidación productiva.
          </p>
          {auth.availableTenants.length > 1 && (
            <button
              type="button"
              onClick={() => {
                auth.setSelectingTenant(true)
                navigate('/platform/select')
              }}
              className="mt-6 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0066FF] hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              Cambiar a otra empresa
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
