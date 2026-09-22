import { useState } from 'react'
import { UnauthorizedView } from './components/UnauthorizedView'
import { DistributionApp } from './modules/distribution/views/DistributionApp'
import { DistributionPrinterModal } from './modules/distribution/views/DistributionPrinterModal'
import { RestaurantApp } from './modules/restaurant/views/RestaurantApp'
import { PublicLanding } from './public/landing/PublicLanding'
import { PublicLoginView } from './public/auth/PublicLoginView'
import { PublicRegisterView } from './public/register/PublicRegisterView'
import { usePublicRouter } from './public/routing/usePublicRouter'
import { useAuthStore } from './store/authStore'
import { getActiveTenant } from './store/activeTenant'
import { PACHAX_NAME } from './config/pachax'
import type { UserRole } from './types'

function DistributionShell(props: {
  tenantId: string
  restaurantName: string
  uid: string
  userName: string
  role: UserRole
  routeId: string | null
  warehouseId?: string
  onSignOut: () => Promise<void>
}) {
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false)

  return (
    <>
      <DistributionApp {...props} onOpenPrinterSettings={() => setIsPrinterSettingsOpen(true)} />
      {isPrinterSettingsOpen && <DistributionPrinterModal tenantId={props.tenantId} onClose={() => setIsPrinterSettingsOpen(false)} />}
    </>
  )
}

function App() {
  const auth = useAuthStore()
  const { path } = usePublicRouter()

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

  const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.())

  // Ruta de registro / onboarding visual
  if (path === '/register') {
    return <PublicRegisterView />
  }

  // Si el usuario no está autenticado
  if (auth.status === 'signed_out' || auth.status === 'authenticating' || auth.status === 'loading') {
    if (path === '/login' || isNative) {
      return (
        <PublicLoginView
          error={auth.error}
          isLoading={auth.status !== 'signed_out'}
          onSubmit={auth.signIn}
        />
      )
    }
    return <PublicLanding />
  }

  if (auth.status === 'needs_tenant') {
    return (
      <UnauthorizedView
        email={auth.userEmail}
        message="Tu cuenta todavía no pertenece a una empresa. Completa el alta para continuar."
        onSignOut={auth.signOut}
      />
    )
  }

  if (auth.status !== 'authorized') {
    return (
      <UnauthorizedView
        email={auth.userEmail}
        message={auth.error ?? 'No se pudo validar el acceso.'}
        onSignOut={auth.signOut}
      />
    )
  }

  // Usuario autenticado que navega en la landing pública web
  if (!isNative && path === '/') {
    return <PublicLanding />
  }

  if (!auth.tenantId || !auth.member?.active || !auth.account) {
    return (
      <UnauthorizedView
        email={auth.userEmail}
        message={auth.error ?? 'Este usuario no tiene una membresía activa.'}
        onSignOut={auth.signOut}
      />
    )
  }

  const activeTenant = getActiveTenant()
  const canonicalBusinessType = activeTenant?.businessType ?? (auth.account.businessType === 'mobile_distribution' ? 'route_distribution' : null)

  if (canonicalBusinessType === 'route_distribution') {
    return (
      <DistributionShell
        tenantId={auth.tenantId}
        restaurantName={auth.account.name}
        key={`${auth.tenantId}:${auth.member.uid}`}
        warehouseId={auth.member.warehouseId}
        uid={auth.member.uid}
        userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
        role={auth.member.role}
        routeId={auth.member.routeId ?? null}
        onSignOut={auth.signOut}
      />
    )
  }

  if (canonicalBusinessType === 'restaurant_pos') {
    return (
      <RestaurantApp
        key={`${auth.tenantId}:${auth.member.uid}`}
        tenantId={auth.tenantId}
        restaurantName={auth.account.name}
        companyName={activeTenant?.tenant.name || auth.account.name}
        logoUrl={activeTenant?.branding?.logoUrl || auth.account.branding?.logoUrl}
        uid={auth.member.uid}
        userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
        role={activeTenant?.role || auth.member.role}
        onSignOut={auth.signOut}
      />
    )
  }

  return (
    <UnauthorizedView
      email={auth.userEmail}
      message="La plantilla de esta empresa todavía no tiene una interfaz operativa habilitada."
      onSignOut={auth.signOut}
    />
  )
}

export default App
