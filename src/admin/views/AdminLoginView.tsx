import { useState } from 'react'
import { Shield, Lock, Mail, ArrowRight, AlertCircle, ArrowLeft } from 'lucide-react'
import { useAdminAuth } from '../auth/adminAuthStore'
import { usePublicRouter } from '../../public/routing/usePublicRouter'
import { PACHAX_NAME } from '../../config/pachax'

export function AdminLoginView() {
  const { login } = useAdminAuth()
  const { navigate } = usePublicRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email.trim() || !password) {
      setErrorMessage('Por favor ingresa tu correo corporativo y contraseña.')
      return
    }

    setIsLoading(true)
    try {
      const res = await login(email, password)
      if (res.success) {
        navigate('/admin')
      } else {
        setErrorMessage(res.error || 'Credenciales no autorizadas.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al conectar con el servicio administrativo.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#070f1a] text-slate-100 flex flex-col justify-between selection:bg-[#0066FF] selection:text-white">
      {/* Barra superior mínima */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0066FF] flex items-center justify-center font-black text-white text-xs tracking-wider">
            PX
          </div>
          <span className="font-bold text-sm tracking-tight text-white">{PACHAX_NAME}</span>
          <span className="text-[11px] font-semibold text-slate-400 bg-white/10 px-2 py-0.5 rounded ml-2">
            CONTROL PLATAFORMA
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al sitio público</span>
        </button>
      </header>

      {/* Contenedor central de acceso */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-[#0c1829] border border-white/15 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Acento geométrico tenue */}
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"
          />

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-[#0066FF] mb-5">
              <Shield className="w-6 h-6" />
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Portal Administrativo
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
              Acceso restringido para operadores y administradores de PACHAX Platform.
            </p>

            {/* Mensaje de error si falla la autenticación */}
            {errorMessage && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    data-admin-login-email
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operador@pachax.com"
                    autoComplete="username"
                    required
                    className="w-full bg-[#08111d] border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    data-admin-login-password
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full bg-[#08111d] border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  data-admin-login-submit
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white transition-all shadow-md inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  {isLoading ? (
                    <span>Verificando credenciales...</span>
                  ) : (
                    <>
                      <span>Ingresar al panel administrativo</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-5 border-t border-white/10 text-center">
              <p className="text-[11px] text-slate-400">
                El registro público de administradores se encuentra deshabilitado por seguridad del sistema.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Pie de página mínimo */}
      <footer className="w-full px-6 py-4 text-center text-xs text-slate-400 border-t border-white/10">
        PACHAX Platform &copy; {new Date().getFullYear()} · Infraestructura Cloud Segura
      </footer>
    </div>
  )
}
