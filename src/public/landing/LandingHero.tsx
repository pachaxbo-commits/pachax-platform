import { ArrowRight } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { ProductStage } from './ProductStage'

export function LandingHero() {
  const { navigate } = usePublicRouter()
  return (
    <section id="producto" className="public-hero">
      <div className="public-hero-inner">
        <div className="public-hero-copy">
          <p className="public-kicker">PACHAX / NEGOCIOS REALES</p>
          <h1>Una plataforma.<br />Todas tus <em>posibilidades.</em></h1>
          <p className="public-hero-lead">Herramientas para el trabajo de cada día: salón y cocina, distribución en ruta y venta en mostrador.</p>
          <div className="public-hero-actions">
            <button type="button" onClick={() => navigate('#soluciones')}>Explorar soluciones <ArrowRight size={18} /></button>
            <button type="button" onClick={() => navigate('/register')}>Crear mi empresa</button>
          </div>
          <p className="public-hero-foot">Tres maneras de operar. Una experiencia que se adapta a tu negocio.</p>
        </div>
        <ProductStage />
      </div>
    </section>
  )
}
