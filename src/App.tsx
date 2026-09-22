import { useState } from 'react'
import { LoginView } from './components/LoginView'
import { UnauthorizedView } from './components/UnauthorizedView'
import { DistributionApp } from './modules/distribution/views/DistributionApp'
import { DistributionPrinterModal } from './modules/distribution/views/DistributionPrinterModal'
import { useAuthStore } from './store/authStore'
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
  if (auth.mode === 'local') {
    return <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] p-6 text-center"><div><h1 className="text-2xl font-bold text-[#B91C1C]">{PACHAX_NAME}</h1><p className="mt-3">Falta configurar la conexión del sistema. Contacta con administración.</p></div></div>
  }
  if (auth.status === 'signed_out' || auth.status === 'authenticating' || auth.status === 'loading') {
    return <LoginView error={auth.error} isLoading={auth.status !== 'signed_out'} onSubmit={auth.signIn} />
  }
  if (auth.status === 'needs_tenant') {
    return <UnauthorizedView email={auth.userEmail} message="Tu cuenta todavía no pertenece a una empresa. Completa el alta para continuar." onSignOut={auth.signOut} />
  }
  if (auth.status !== 'authorized') {
    return <UnauthorizedView email={auth.userEmail} message={auth.error ?? 'No se pudo validar el acceso.'} onSignOut={auth.signOut} />
  }
  if (!auth.tenantId || !auth.member?.active || !auth.account) {
    return <UnauthorizedView email={auth.userEmail} message={auth.error ?? 'Este usuario no tiene una membresía activa.'} onSignOut={auth.signOut} />
  }
  if (auth.account.businessType !== 'mobile_distribution') {
    return <UnauthorizedView email={auth.userEmail} message="La plantilla de esta empresa todavía no tiene una interfaz operativa habilitada." onSignOut={auth.signOut} />
  }
  return <DistributionShell tenantId={auth.tenantId} restaurantName={auth.account.name}
    key={`${auth.tenantId}:${auth.member.uid}`} warehouseId={auth.member.warehouseId}
    uid={auth.member.uid} userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
    role={auth.member.role} routeId={auth.member.routeId ?? null} onSignOut={auth.signOut} />
}

export default App
