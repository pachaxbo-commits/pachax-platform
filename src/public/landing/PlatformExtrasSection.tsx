import {
  ArrowRight,
  Check,
  Code2,
  Headphones,
  Megaphone,
  Palette,
  Zap,
  Cpu,
  MessageCircle,
  CalendarDays,
} from 'lucide-react'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import type { CommercialExtraService } from '../../admin/types'

const EXTRA_ICONS = {
  megaphone: Megaphone,
  palette: Palette,
  headset: Headphones,
  zap: Zap,
  code: Code2,
} as const

const TEMPLATE_LABELS: Record<string, string> = {
  restaurant: 'Restaurante con salón',
  distribution: 'Producción y Distribución',
  nightclub: 'Nightclub & Lounge',
  hamburger: 'Restaurante Rápido',
  retail: 'Comercio / Venta rápida',
}

function getExtraIcon(iconKey: CommercialExtraService['iconKey']) {
  return EXTRA_ICONS[iconKey] || Cpu
}

function getTemplateScope(extra: CommercialExtraService) {
  return extra.applicableTemplates === 'all'
    ? 'Todas las plantillas operativas'
    : extra.applicableTemplates.map((id) => TEMPLATE_LABELS[id] || id).join(', ')
}

function openWhatsApp(number: string, message: string) {
  const normalizedNumber = number.replace(/\D/g, '')
  if (!normalizedNumber) return
  const url = `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function PlatformExtrasSection() {
  const { landingContent, publishedExtras } = useCommercialConfig()

  const contactNumber = landingContent.officialWhatsAppNumber
  const customDevelopment = publishedExtras.find((extra) => extra.id === 'extra_custom_dev')
  const services = customDevelopment
    ? [customDevelopment, ...publishedExtras.filter((extra) => extra.id !== customDevelopment.id)]
    : publishedExtras

  const handleServiceInquiry = (extra: CommercialExtraService) => {
    openWhatsApp(
      contactNumber,
      `Hola PACHAX, quiero consultar sobre ${extra.title} (${extra.referencePriceLabel}) para mi empresa.`,
    )
  }

  const handleWhatsAppContact = () => {
    openWhatsApp(contactNumber, landingContent.defaultCustomDevMessage)
  }

  const handleProposalRequest = () => {
    openWhatsApp(
      contactNumber,
      'Hola PACHAX, quiero solicitar una propuesta para ordenar la gestión operativa de mi empresa. ¿Qué información necesitan para evaluar mi caso?',
    )
  }

  return (
    <section id="extras" className="pachax-extras-section" aria-labelledby="pachax-extras-title">
      <div className="pachax-extras-container">
        <header className="pachax-extras-heading">
          <p className="pachax-extras-eyebrow">Servicios estratégicos y extensiones</p>
          <h2 id="pachax-extras-title">
            Potencia tu operación con módulos y <span>servicios especializados</span>
          </h2>
          <p className="pachax-extras-intro">
            Separa las herramientas técnicas de los servicios de crecimiento. Consulta las opciones disponibles para tu operación.
          </p>
        </header>

        {services.length > 0 ? (
          <div className={`pachax-extras-grid${services.length === 1 ? ' is-solo' : ''}`} aria-label="Servicios publicados">
            {services.map((extra) => {
              const Icon = getExtraIcon(extra.iconKey)
              return (
                <article className="pachax-extra-card" key={extra.id}>
                  <span className="pachax-extra-icon" aria-hidden="true"><Icon /></span>
                  <h3>{extra.title}</h3>
                  <p className="pachax-extra-description">{extra.shortDescription}</p>
                  <p className="pachax-extra-scope">Aplica a: {getTemplateScope(extra)}</p>
                  <div className="pachax-extra-meta">
                    <span>{extra.referencePriceLabel}</span>
                    <button type="button" onClick={() => handleServiceInquiry(extra)}>
                      Consultar <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                  <i className="pachax-extra-corner" aria-hidden="true" />
                </article>
              )
            })}
          </div>
        ) : (
          <div className="pachax-extras-empty" role="status">
            <span className="pachax-extras-empty-mark" aria-hidden="true"><Check /></span>
            <div>
              <h3>Servicios en preparación</h3>
              <p>Estamos actualizando las opciones comerciales. Puedes consultar con el equipo sobre tu operación.</p>
            </div>
          </div>
        )}

        <aside className="pachax-extras-contact" aria-labelledby="pachax-extras-contact-title">
          <img
            className="pachax-extras-contact-photo"
            src="/brand/showcase/support-specialist.webp"
            alt="Ilustración editorial de una especialista de soporte en un entorno de trabajo"
            loading="lazy"
            decoding="async"
          />
          <div className="pachax-extras-contact-shade" aria-hidden="true" />
          <div className="pachax-extras-contact-copy">
            <p className="pachax-extras-eyebrow">Asesoría y despliegue directo</p>
            <h3 id="pachax-extras-contact-title">¿Listo para ordenar la gestión operativa de <span>tu empresa?</span></h3>
            <p>Habla con nuestro equipo de ingeniería y producto para revisar procesos de cobro, básculas, almacenes o reglas de negocio.</p>
          </div>
          <div className="pachax-extras-contact-actions">
            <button className="pachax-contact-action" type="button" onClick={handleWhatsAppContact}>
              <MessageCircle aria-hidden="true" />
              <span>Contactar por WhatsApp <small>{landingContent.officialWhatsAppDisplay}</small></span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button className="pachax-proposal-action" type="button" onClick={handleProposalRequest}>
              <CalendarDays aria-hidden="true" />
              <span>Solicitar propuesta</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <i className="pachax-extras-contact-corner" aria-hidden="true" />
        </aside>
      </div>
    </section>
  )
}
