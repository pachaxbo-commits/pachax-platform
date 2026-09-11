import { useState } from 'react'
import { LoginView } from './components/LoginView'
import { UnauthorizedView } from './components/UnauthorizedView'
import { DistributionApp } from './modules/distribution/views/DistributionApp'
import { DistributionPrinterModal } from './modules/distribution/views/DistributionPrinterModal'
import { useAuthStore } from './store/authStore'
import { PACHAX_ID, PACHAX_NAME } from './config/pachax'
import type { UserRole } from './types'

function DistributionShell(props: {
  restaurantId: string
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
      {isPrinterSettingsOpen && <DistributionPrinterModal restaurantId={props.restaurantId} onClose={() => setIsPrinterSettingsOpen(false)} />}
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
  if (auth.status !== 'authorized' || auth.restaurantId !== PACHAX_ID || !auth.member?.active) {
    return <UnauthorizedView email={auth.userEmail} message={auth.error ?? 'Este usuario no tiene acceso a PACHAX.'} onSignOut={auth.signOut} />
  }
  return <DistributionShell restaurantId={PACHAX_ID} restaurantName={PACHAX_NAME}
    key={`${PACHAX_ID}:${auth.member.uid}`} warehouseId={auth.member.warehouseId}
    uid={auth.member.uid} userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
    role={auth.member.role} routeId={auth.member.routeId ?? null} onSignOut={auth.signOut} />
}

export default App
