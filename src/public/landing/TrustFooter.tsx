import { ArrowUpRight, MessageCircle } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { BrandMark } from '../components/BrandMark'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import { getWhatsAppUrl } from '../config/publicContact'

const FOOTER_LINKS = [
  { href: '#plantillas', label: 'Plantillas' },
  { href: '#planes', label: 'Planes' },
  { href: '#tutoriales', label: 'Tutoriales' },
  { href: '#extras', label: 'Servicios' },
]

export function TrustFooter() {
  const { navigate } = usePublicRouter()
  const { landingContent } = useCommercialConfig()
  const facebookUrl = 'https://www.facebook.com/pachaxbo'
  const whatsappUrl = getWhatsAppUrl('Hola PACHAX, me contacto desde la web oficial.', landingContent.officialWhatsAppNumber)

  return (
    <footer className="pachax-trust-footer">
      <div className="pachax-footer-main">
        <div className="pachax-footer-brand">
          <BrandMark size="sm" variant="light" href="/" />
          <p>Plataforma para gestionar operaciones reales.</p>
        </div>

        <nav className="pachax-footer-navigation" aria-label="Navegación del pie de página">
          {FOOTER_LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          <button type="button" onClick={() => navigate('/login')}>Iniciar sesión</button>
        </nav>

        <div className="pachax-footer-contact">
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" /> WhatsApp <span>{landingContent.officialWhatsAppDisplay || landingContent.officialWhatsAppNumber}</span>
            </a>
          ) : (
            <span aria-label="Contacto comercial de WhatsApp no configurado">
              <MessageCircle aria-hidden="true" /> Contacto comercial no configurado
            </span>
          )}
          <a href={facebookUrl} target="_blank" rel="noopener noreferrer">
            Facebook <span>Pachax - Software & Digital Marketing</span>
            <ArrowUpRight className="pachax-footer-external" aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="pachax-footer-legal">
        <span>© 2026 PACHAX. Todos los derechos reservados.</span>
        <span>Bolivia</span>
      </div>
    </footer>
  )
}
