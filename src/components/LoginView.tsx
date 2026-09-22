import { useState } from 'react'
import { ArrowRight, Coffee, PackageCheck, Store, Truck, LoaderCircle } from 'lucide-react'
import './login.css'

export function LoginView({ error, isLoading, onSubmit }: {
  error: string | null
  isLoading: boolean
  onSubmit: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return <main className="pachax-login">
    <section className="pachax-login-story" aria-label="PACHAX para tu negocio">
      <a className="pachax-wordmark" href="/" aria-label="PACHAX inicio">PACHAX<span aria-hidden="true">✳</span></a>
      <div className="pachax-story-copy">
        <p className="pachax-eyebrow">ESPACIO PARA CRECER</p>
        <h1>Tu negocio,<br />organizado en<br /><em>un solo lugar.</em></h1>
        <p>Más claridad para tu equipo.<br />Más tiempo para lo que haces mejor.</p>
      </div>
      <div className="pachax-business-network" aria-hidden="true">
        <div className="pachax-network-node"><Store /><span>Restaurante</span><i /></div>
        <div className="pachax-network-node"><Truck /><span>Distribución</span><i /></div>
        <div className="pachax-network-node"><Coffee /><span>Heladería y café</span><i /></div>
        <div className="pachax-network-center"><PackageCheck /><span>Cada parte, conectada.</span></div>
      </div>
      <p className="pachax-login-footer">Una plataforma. Diferentes formas de hacer negocio.</p>
    </section>
    <section className="pachax-login-access" aria-labelledby="login-title">
      <span className="pachax-mobile-wordmark">PACHAX ✳</span>
      <div className="pachax-login-form-wrap">
        <p className="pachax-eyebrow">BIENVENIDO A PACHAX</p>
        <h2 id="login-title">Todo listo para empezar.</h2>
        <p className="pachax-login-intro">Ingresa con el acceso de tu empresa.</p>
        <form onSubmit={async event => { event.preventDefault(); await onSubmit(email.trim(), password) }}>
          <label htmlFor="login-email">Correo electrónico</label>
          <input id="login-email" type="email" autoComplete="username" placeholder="nombre@empresa.com" required value={email} onChange={event => setEmail(event.target.value)} disabled={isLoading} />
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" type="password" autoComplete="current-password" placeholder="Tu contraseña" required value={password} onChange={event => setPassword(event.target.value)} disabled={isLoading} />
          {error && <p className="pachax-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={isLoading || !email.trim() || !password}>
            {isLoading ? <><LoaderCircle className="animate-spin" size={19} /> Ingresando…</> : <>Iniciar Sesión <ArrowRight size={19} /></>}
          </button>
        </form>
        <p className="pachax-login-help">Tu administrador puede ayudarte si necesitas recuperar tu acceso.</p>
      </div>
      <p className="pachax-login-signature">HECHO PARA EL DÍA A DÍA DE TU NEGOCIO</p>
    </section>
  </main>
}
