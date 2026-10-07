import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { StudioApp } from './StudioApp'
import { useAdminAuth } from '../admin/auth/adminAuthStore'

export function StudioEntry() {
  const { status, isAuthenticated } = useAdminAuth()

  // Production uses the same fail-closed operator check as /admin.
  if (!import.meta.env.DEV && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h1 className="text-xl font-bold">PACHAX Studio</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {status === 'checking' ? 'Verificando acceso de Platform Operator…' : 'Inicia sesión en el panel administrativo para usar Studio.'}
          </p>
          {status !== 'checking' && (
          <a
            href="/admin/login"
            className="inline-block mt-4 px-4 py-2 text-xs font-semibold bg-teal-500 text-slate-950 rounded-xl hover:bg-teal-400 transition"
          >
            Ir a acceso administrativo →
          </a>
          )}
        </div>
      </div>
    )
  }

  return <StudioApp />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudioEntry />
  </React.StrictMode>
)
