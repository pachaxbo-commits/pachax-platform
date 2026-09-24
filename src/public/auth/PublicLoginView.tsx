import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { ProductStage } from '../landing/ProductStage'
import { usePublicRouter } from '../routing/usePublicRouter'
import '../publicExperience.css'

export interface PublicLoginViewProps {
  error: string | null
  isLoading: boolean
  onSubmit: (email: string, password: string) => Promise<void>
}

export function PublicLoginView({ error, isLoading, onSubmit }: PublicLoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { navigate } = usePublicRouter()
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (email.trim() && password) await onSubmit(email.trim(), password)
  }
  return <main className="login-layout">
    <div className="login-story">
      <BrandMark variant="light" size="lg" href="/" onClick={e => { e.preventDefault(); navigate('/') }} />
      <div><span className="public-kicker">NEGOCIOS REALES / UN MAYOR MAÑANA</span><h2>Una plataforma.<br />Todas tus <em>posibilidades.</em></h2><p>Accede a las herramientas que acompañan la operación de tu negocio.</p></div>
      <ProductStage compact />
      <span className="public-kicker">PACHAX · HECHO PARA EL TRABAJO REAL</span>
    </div>
    <div className="login-form-side"><div className="login-form">
      <BrandMark size="lg" href="/" onClick={e => { e.preventDefault(); navigate('/') }} />
      <span className="public-kicker" style={{color:'#8f672e',marginTop:36}}>BIENVENIDO DE NUEVO</span>
      <h1>Inicia sesión para continuar</h1>
      <p>Vuelve a tu espacio de trabajo.</p>
      {error && <div className="login-error" role="alert">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label htmlFor="login-email">Correo electrónico</label>
        <input id="login-email" type="email" autoComplete="username" placeholder="tu@empresa.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={isLoading} />
        <label htmlFor="login-password">Contraseña</label>
        <div className="login-password-wrap"><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" required value={password} onChange={e => setPassword(e.target.value)} disabled={isLoading} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
        <button className="login-submit" type="submit" disabled={isLoading || !email.trim() || !password}>{isLoading ? <><LoaderCircle size={18} className="animate-spin"/> Verificando acceso…</> : <>Ingresar <ArrowRight size={18}/></>}</button>
      </form>
      <div className="login-divider">o</div>
      <button className="login-register" type="button" onClick={() => navigate('/register')}>Crear mi empresa</button>
      <p className="login-mobile-story">PACHAX reúne las herramientas de cada día en una experiencia clara para tu negocio.</p>
    </div></div>
  </main>
}
