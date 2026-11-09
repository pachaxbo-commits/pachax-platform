import { useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Layers3,
  Music2,
  Palette,
  ShieldCheck,
  Truck,
  Utensils,
} from 'lucide-react'
import { BRAND_PALETTES } from '../../core/brandPalettes'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import { getWhatsAppUrl } from '../config/publicContact'

const steps = [
  {
    number: 1 as const,
    title: 'Entidad legal',
    description: 'Registra los datos comerciales, fiscales y de contacto.',
    icon: Building2,
  },
  {
    number: 2 as const,
    title: 'Plantilla operativa',
    description: 'Selecciona el modelo de negocio ideal para tu operación.',
    icon: Layers3,
  },
  {
    number: 3 as const,
    title: 'Identidad y marca',
    description: 'Personaliza tu sistema con tu logotipo y colores.',
    icon: Palette,
  },
  {
    number: 4 as const,
    title: 'Aprovisionamiento automático',
    description: 'Preparamos el entorno, la sucursal y los módulos necesarios.',
    icon: ShieldCheck,
  },
] as const

const demoTemplates = [
  { id: 'restaurant_pos', name: 'Restaurante con salón', icon: Utensils },
  { id: 'route_distribution', name: 'Distribución', icon: Truck },
  { id: 'nightclub_lounge', name: 'Nightclub & Lounge', icon: Music2 },
] as const

type StepNumber = 1 | 2 | 3 | 4
type DemoTemplate = (typeof demoTemplates)[number]['id']

const demoTemplateName = (id: DemoTemplate) => demoTemplates.find((template) => template.id === id)?.name ?? demoTemplates[0].name

export function RealOnboardingSection() {
  const { landingContent } = useCommercialConfig()
  const implementationContactUrl = getWhatsAppUrl(
    'Hola PACHAX, quisiera consultar una implementación guiada para mi empresa. Entiendo que la creación autónoma está pausada y quiero conocer los siguientes pasos.',
    landingContent.officialWhatsAppNumber,
  )
  const [activeStep, setActiveStep] = useState<StepNumber>(1)
  const [demoTemplate, setDemoTemplate] = useState<DemoTemplate>('restaurant_pos')
  const [demoPaletteIndex, setDemoPaletteIndex] = useState(0)
  const activePalette = BRAND_PALETTES[demoPaletteIndex] ?? BRAND_PALETTES[0]

  const setStep = (step: StepNumber) => setActiveStep(step)
  const previousStep = () => setActiveStep((step) => (Math.max(1, step - 1) as StepNumber))
  const nextStep = () => setActiveStep((step) => (Math.min(4, step + 1) as StepNumber))

  return (
    <section id="onboarding" className="pachax-onboarding-section" aria-labelledby="onboarding-title">
      <div className="pachax-onboarding-layout">
        <header className="pachax-onboarding-intro">
          <p className="pachax-onboarding-eyebrow">IMPLEMENTACIÓN GUIADA</p>
          <h2 id="onboarding-title">
            Configura y prepara tu empresa <span>paso a paso</span>
          </h2>
          <p className="pachax-onboarding-lead">
            El asistente de PACHAX organiza la configuración de tu empresa. El equipo valida el alcance y los siguientes pasos antes de iniciar cualquier aprovisionamiento.
          </p>
        </header>

        <ol className="pachax-onboarding-steps" aria-label="Etapas de implementación guiada">
          {steps.map(({ number, title, description, icon: Icon }) => {
            const selected = activeStep === number
            return (
              <li key={number}>
                <button
                  type="button"
                  className={`pachax-onboarding-step${selected ? ' is-active' : ''}`}
                  aria-current={selected ? 'step' : undefined}
                  aria-controls="onboarding-preview-content"
                  aria-label={`Paso ${number}: ${title}. ${description}`}
                  data-onboarding-step-trigger={number}
                  onClick={() => setStep(number)}
                >
                  <span className="pachax-onboarding-step-number" aria-hidden="true">{number}</span>
                  <span className="pachax-onboarding-step-icon" aria-hidden="true"><Icon /></span>
                  <span className="pachax-onboarding-step-copy">
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="pachax-onboarding-device-wrap">
          <div className="pachax-onboarding-device" data-onboarding-step={activeStep}>
            <div className="pachax-onboarding-device-screen">
              <div className="pachax-onboarding-app">
                <header className="pachax-onboarding-app-header">
                  <img src="/brand/pachax-logo-white.png" alt="PACHAX" />
                  <span>Asistente de empresa</span>
                  <strong data-onboarding-progress-label>Paso {activeStep} de 4</strong>
                </header>
                <div className="pachax-onboarding-workspace">
                  <aside className="pachax-onboarding-app-sidebar" aria-hidden="true">
                    <span className="pachax-onboarding-app-sidebar-title">Configuración</span>
                    {steps.map(({ number, title, icon: Icon }) => (
                      <span key={number} className={activeStep === number ? 'is-active' : ''}>
                        <Icon /><span>{title}</span>
                      </span>
                    ))}
                  </aside>
                  <div className="pachax-onboarding-workspace-main">
                    <div className="pachax-onboarding-progress" aria-hidden="true">
                      <span style={{ width: `${activeStep * 25}%` }} />
                    </div>

                    <div className="pachax-onboarding-app-content" id="onboarding-preview-content" aria-live="polite" aria-atomic="true">
                  {activeStep === 1 && (
                    <div className="pachax-onboarding-panel" data-onboarding-step-content="1">
                      <div className="pachax-onboarding-panel-heading">
                        <span className="pachax-onboarding-panel-icon"><Building2 aria-hidden="true" /></span>
                        <span><strong>Identidad de tu empresa</strong><small>Ejemplo ficticio · no se envía</small></span>
                      </div>
                      <div className="pachax-onboarding-example-fields">
                        <div><span>Nombre comercial</span><strong>Empresa de demostración</strong><CheckCircle2 aria-hidden="true" /></div>
                        <div><span>NIT / Razón social</span><strong>0000000000 · ficticio</strong><CheckCircle2 aria-hidden="true" /></div>
                        <div><span>Teléfono oficial</span><strong>+591 000 00000 · ficticio</strong><CheckCircle2 aria-hidden="true" /></div>
                        <div><span>Ciudad principal</span><strong>Santa Cruz · ejemplo</strong><CheckCircle2 aria-hidden="true" /></div>
                      </div>
                    </div>
                  )}

                  {activeStep === 2 && (
                    <div className="pachax-onboarding-panel" data-onboarding-step-content="2">
                      <div className="pachax-onboarding-panel-heading">
                        <span className="pachax-onboarding-panel-icon"><Layers3 aria-hidden="true" /></span>
                        <span><strong>Elige una plantilla</strong><small>Selección de ejemplo · sin contratación</small></span>
                      </div>
                      <div className="pachax-onboarding-template-list" aria-label="Plantillas de ejemplo">
                        {demoTemplates.map(({ id, name, icon: Icon }) => {
                          const selected = demoTemplate === id
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`pachax-onboarding-template${selected ? ' is-selected' : ''}`}
                              aria-pressed={selected}
                              data-demo-template={id}
                              onClick={() => setDemoTemplate(id)}
                            >
                              <Icon aria-hidden="true" />
                              <span>{name}</span>
                              {selected && <Check aria-hidden="true" />}
                            </button>
                          )
                        })}
                      </div>
                      <p className="pachax-onboarding-selection-note">Vista previa para {demoTemplateName(demoTemplate)}.</p>
                    </div>
                  )}

                  {activeStep === 3 && (
                    <div className="pachax-onboarding-panel" data-onboarding-step-content="3">
                      <div className="pachax-onboarding-panel-heading">
                        <span className="pachax-onboarding-panel-icon"><Palette aria-hidden="true" /></span>
                        <span><strong>Identidad y marca</strong><small>Personalización ilustrativa · no se guarda</small></span>
                      </div>
                      <div className="pachax-onboarding-palette-list" aria-label="Paletas de ejemplo">
                        {BRAND_PALETTES.map((palette, index) => {
                          const selected = demoPaletteIndex === index
                          return (
                            <button
                              key={palette.id}
                              type="button"
                              className={`pachax-onboarding-palette${selected ? ' is-selected' : ''}`}
                              aria-pressed={selected}
                              aria-label={`Usar paleta ${palette.name}`}
                              data-demo-palette={palette.id}
                              onClick={() => setDemoPaletteIndex(index)}
                            >
                              <span style={{ backgroundColor: palette.primary }} />
                              <span style={{ backgroundColor: palette.accent }} />
                              <strong>{palette.name}</strong>
                              {selected && <Check aria-hidden="true" />}
                            </button>
                          )
                        })}
                      </div>
                      <div className="pachax-onboarding-brand-preview" style={{ '--demo-brand-primary': activePalette.primary, '--demo-brand-accent': activePalette.accent } as CSSProperties}>
                        <span className="pachax-onboarding-brand-mark"><img src="/brand/pachax-isotipo-color.png" alt="" aria-hidden="true" /></span>
                        <span><strong>{activePalette.name}</strong><small>Paleta seleccionada para la vista de ejemplo</small></span>
                      </div>
                    </div>
                  )}

                  {activeStep === 4 && (
                    <div className="pachax-onboarding-panel" data-onboarding-step-content="4">
                      <div className="pachax-onboarding-panel-heading">
                        <span className="pachax-onboarding-panel-icon"><ShieldCheck aria-hidden="true" /></span>
                        <span><strong>Preparación del entorno</strong><small>Resultado ilustrativo · no ejecutado</small></span>
                      </div>
                      <div className="pachax-onboarding-preview-notice" role="note">
                        <strong>Así se organiza la puesta en marcha</strong>
                        <span>La creación real requiere revisión y autorización del equipo PACHAX.</span>
                      </div>
                      <ul className="pachax-onboarding-checklist">
                        <li><CheckCircle2 aria-hidden="true" /><span>Entorno y permisos definidos</span></li>
                        <li><CheckCircle2 aria-hidden="true" /><span>Sucursal principal planificada</span></li>
                        <li><CheckCircle2 aria-hidden="true" /><span>Módulos iniciales según la operación</span></li>
                      </ul>
                    </div>
                  )}
                    </div>

                    <nav className="pachax-onboarding-app-controls" aria-label="Controles de la demostración">
                      <button type="button" onClick={previousStep} disabled={activeStep === 1} aria-label="Ver paso anterior">
                        <ArrowLeft aria-hidden="true" /><span>Anterior</span>
                      </button>
                      <div aria-label={`Paso ${activeStep} de 4`}>
                        {steps.map(({ number }) => (
                          <button
                            key={number}
                            type="button"
                            className={activeStep === number ? 'is-active' : ''}
                            aria-label={`Ver paso ${number}`}
                            aria-current={activeStep === number ? 'step' : undefined}
                            onClick={() => setStep(number)}
                          />
                        ))}
                      </div>
                      <button type="button" onClick={nextStep} disabled={activeStep === 4} aria-label="Ver paso siguiente">
                        <span>Siguiente</span><ArrowRight aria-hidden="true" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
            <div className="pachax-onboarding-device-base" aria-hidden="true"><span /></div>
            <div className="pachax-onboarding-device-glow" aria-hidden="true" />
          </div>
        </div>

        {implementationContactUrl ? (
          <a
            className="pachax-onboarding-cta"
            href={implementationContactUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Consultar una implementación guiada por WhatsApp, se abre en una pestaña nueva"
          >
            <span>Consultar implementación guiada</span><ArrowRight aria-hidden="true" />
          </a>
        ) : (
          <p className="pachax-onboarding-cta" role="status">El contacto para consultar la implementación aún no está configurado.</p>
        )}
      </div>
    </section>
  )
}
