import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { StudioApp } from './StudioApp'

function StudioEntry() {
  const isDev = import.meta.env.DEV
  const isEnabled = import.meta.env.VITE_ENABLE_TEAM_STUDIO === 'true'

  if (!isDev && !isEnabled) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h1 className="text-xl font-bold">PACHAX Studio No Disponible</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Esta herramienta interna está habilitada únicamente en desarrollo local y entornos de previsualización autorizados (Vercel Preview).
          </p>
          <a
            href="/demo"
            className="inline-block mt-4 px-4 py-2 text-xs font-semibold bg-teal-500 text-slate-950 rounded-xl hover:bg-teal-400 transition"
          >
            Ir a Demostraciones Públicas (/demo) →
          </a>
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
