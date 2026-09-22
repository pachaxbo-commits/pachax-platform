import { useState } from 'react'
import { ArrowRight, LoaderCircle, Shield, CheckCircle2, ArrowLeft } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { usePublicRouter } from '../routing/usePublicRouter'

export interface PublicLoginViewProps {
  error: string | null
  isLoading: boolean
  onSubmit: (email: string, password: string) => Promise<void>
}

export function PublicLoginView({ error, isLoading, onSubmit }: PublicLoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { navigate } = usePublicRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    await onSubmit(email.trim(), password)
  }

  return (
    <main className="min-h-screen w-full bg-slate-50 flex flex-col justify-between selection:bg-slate-900 selection:text-white font-sans">
      {/* Barra superior minimalista para volver a la landing */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition cursor-pointer p-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a la página principal</span>
        </button>

        <BrandMark
          size="sm"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        />
      </div>

      {/* Contenedor central: split en desktop, enfocado y rápido en móvil */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 ring-1 ring-slate-900/5">
          {/* Columna Izquierda: Panel Editorial (oculto en pantallas pequeñas para máxima velocidad) */}
          <div className="hidden lg:flex lg:col-span-5 bg-slate-900 text-white p-8 sm:p-10 flex-col justify-between relative overflow-hidden">
            <div className="space-y-6 relative z-10">
              <div className="bg-white/10 p-2.5 rounded-xl inline-block">
                <span className="font-black uppercase tracking-[0.18em] text-white text-base font-sans">
                  PACHAX
                </span>
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-bold tracking-tight leading-snug">
                  Tu negocio organizado en un solo sistema.
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Ingresa con tus credenciales asignadas para acceder al panel operativo de tu sucursal o ruta.
                </p>
              </div>

              <div className="space-y-2.5 pt-4 text-xs text-slate-300 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Aislamiento estricto de datos por empresa</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Permisos definidos por rol operativo</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>Sincronización en tiempo real y offline</span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800 text-[11px] text-slate-400 relative z-10 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span>Conexión segura verificada</span>
            </div>
          </div>

          {/* Columna Derecha: Formulario de Autenticación */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            <div className="max-w-md w-full mx-auto space-y-6">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  Acceso al Sistema
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight mt-2">
                  Iniciar Sesión
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Ingresa el correo y contraseña de tu cuenta empresarial.
                </p>
              </div>

              {error && (
                <div
                  className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700 animate-in fade-in duration-150"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
                  >
                    Correo electrónico
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    placeholder="nombre@empresa.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                    >
                      Contraseña
                    </label>
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:bg-white transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email.trim() || !password}
                  className="w-full py-3 sm:py-3.5 px-4 text-sm font-bold text-white bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  {isLoading ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin text-white" />
                      <span>Verificando acceso…</span>
                    </>
                  ) : (
                    <>
                      <span>Ingresar al Sistema</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                <span>¿Tu empresa no tiene cuenta?</span>
                <button
                  onClick={() => navigate('/register')}
                  className="font-bold text-slate-900 hover:text-teal-700 transition cursor-pointer"
                >
                  Crear mi empresa →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer discreto */}
      <div className="w-full max-w-7xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
        PACHAX Software Empresarial Adaptable • Acceso restringido a personal autorizado
      </div>
    </main>
  )
}
