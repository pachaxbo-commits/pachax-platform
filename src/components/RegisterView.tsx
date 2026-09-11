import { useState } from 'react'
import { Store, Mail, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react'
import { createNewRestaurantAccount } from '../lib/firebase'

interface RegisterViewProps {
  onSuccess: () => void
  onSwitchToLogin: () => void
}

export function RegisterView({ onSuccess, onSwitchToLogin }: RegisterViewProps) {
  const [restaurantName, setRestaurantName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await createNewRestaurantAccount({
        restaurantName,
        ownerName,
        email,
        password,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el restaurante.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-900 font-sans selection:bg-blue-500/20 selection:text-blue-700 overflow-hidden">
      {/* Background Soft Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative w-full max-w-md rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xl backdrop-blur-md z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 select-none py-1">
            Pachax Flow
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Registrar Nuevo Restaurante
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-600 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Nombre del Restaurante
            </label>
            <div className="relative">
              <Store className="absolute left-3.5 top-3 text-slate-400" size={17} />
              <input
                type="text"
                required
                placeholder="Ej. PACHAX Central"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-slate-900 text-sm placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tu Nombre Completo
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 text-slate-400" size={17} />
              <input
                type="text"
                required
                placeholder="Ej. Fabri Admin"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-slate-900 text-sm placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 text-slate-400" size={17} />
              <input
                type="email"
                required
                placeholder="pachax.bo@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-slate-900 text-sm placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Contraseña de Acceso
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 text-slate-400" size={17} />
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 bg-slate-50 text-slate-900 text-sm placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-sky-600 transition disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              'Creando Restaurante...'
            ) : (
              <>
                Crear Mi Cuenta <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            ¿Ya tienes una cuenta registrada?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-blue-600 font-bold hover:underline ml-1"
            >
              Iniciar Sesión
            </button>
          </p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck size={14} className="text-blue-600" /> PACHAX Flow Multi-Tenant System
        </div>
      </div>
    </div>
  )
}
