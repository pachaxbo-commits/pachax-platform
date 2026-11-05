import { useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Music2,
  Play,
  RotateCcw,
  Store,
  ShieldCheck,
  Truck,
  Utensils,
} from 'lucide-react'
import { isPublicDemoEnabled, type PublicTemplateId } from '../../core/publicTemplates'
import { buildDemoUrl } from '../routing/demoNavigation'

type TutorialTopic = { title: string; description: string }
type TutorialIcon = ComponentType<SVGProps<SVGSVGElement>>
type TutorialTemplate = {
  id: PublicTemplateId
  title: string
  icon: TutorialIcon
  summary: string
  guideIntro: string
  topics: readonly TutorialTopic[]
  learningTrigger?: string
  builtInGuide: boolean
  demoKind: 'guided' | 'interactive'
}

const TUTORIAL_TEMPLATES: readonly TutorialTemplate[] = [
  {
    id: 'restaurant',
    title: 'Restaurante con salón',
    icon: Utensils,
    summary: 'Mesas, comandas y servicio coordinado con Cocina y Caja.',
    guideIntro: 'El Centro de aprendizaje de la demo contiene recorridos para conocer el salón, el POS, Cocina y Caja.',
    topics: [
      { title: 'Mesas y salón', description: 'Sectores, estados de mesa y consulta de cuentas abiertas.' },
      { title: 'Cocina', description: 'Comandas, productos y estados de preparación disponibles.' },
      { title: 'Caja', description: 'Turnos, cobros y arqueo según las operaciones habilitadas en la demo.' },
    ],
    learningTrigger: 'button[aria-label="Abrir Centro de aprendizaje"]',
    builtInGuide: true,
    demoKind: 'guided',
  },
  {
    id: 'distribution',
    title: 'Producción y Distribución',
    icon: Truck,
    summary: 'Inventario, despachos, rutas, ventas y liquidaciones.',
    guideIntro: 'La demo abre su Centro de tutoriales. Sus recorridos dependen del perfil operativo y del dataset seleccionado.',
    topics: [
      { title: 'Inventario y preparación', description: 'Consulta los registros y prepara un despacho de práctica.' },
      { title: 'Rutas y ventas', description: 'Revisa la ruta, la visita y las acciones disponibles para el rol demo.' },
      { title: 'Retornos y liquidación', description: 'Conoce los controles de retorno, diferencias y cierre de ruta.' },
    ],
    learningTrigger: 'button[data-tutorial-target="tutorial-trigger-btn"]',
    builtInGuide: true,
    demoKind: 'guided',
  },
  {
    id: 'nightclub',
    title: 'Nightclub & Lounge',
    icon: Music2,
    summary: 'Zonas, cuentas, rondas, barra e inventario nocturno.',
    guideIntro: 'Nightclub ofrece recorridos por módulo y rol. En modo demo, las prácticas disponibles usan datos aislados.',
    topics: [
      { title: 'Zonas y cuentas', description: 'Ubica mesas y revisa estados; abrir cuentas requiere una acción explícita.' },
      { title: 'Barra y rondas', description: 'Sigue borradores y estados de preparación disponibles en la demo.' },
      { title: 'Inventario y Caja', description: 'Revisa existencias y turnos. Los tutoriales no ejecutan cobros por ti.' },
    ],
    learningTrigger: 'button[data-tutorial-trigger]',
    builtInGuide: true,
    demoKind: 'guided',
  },
  {
    id: 'hamburger',
    title: 'Restaurante Rápido',
    icon: ChefHat,
    summary: 'Pedidos de mostrador, preparación, entrega e inventario.',
    guideIntro: 'El Centro de aprendizaje adapta el recorrido al perfil de servicio rápido; la guía explica el flujo sin registrar pedidos por ti.',
    topics: [
      { title: 'POS de mostrador', description: 'Catálogo, carrito, personalización y modalidad de entrega.' },
      { title: 'Preparación y pedidos', description: 'Comandas, pedidos pendientes y estados visibles para el equipo.' },
      { title: 'Caja e historial', description: 'Consulta los medios de pago y los registros disponibles en la demo.' },
    ],
    learningTrigger: 'button[aria-label="Abrir Centro de aprendizaje"]',
    builtInGuide: true,
    demoKind: 'guided',
  },
  {
    id: 'retail',
    title: 'Comercio / Venta rápida',
    icon: Store,
    summary: 'Catálogo, venta por unidad o peso, comprobante y Caja.',
    guideIntro: 'La demo tiene un POS interactivo, pero esta plantilla todavía no cuenta con un Centro de tutoriales integrado.',
    topics: [
      { title: 'Productos', description: 'Busca el catálogo de ejemplo y revisa los artículos por unidad o peso.' },
      { title: 'Carrito y comprobante', description: 'El POS de demo permite armar una venta ficticia y ver su resultado local.' },
      { title: 'Peso manual', description: 'La práctica usa gramos ingresados en pantalla; no conecta una balanza física.' },
    ],
    builtInGuide: false,
    demoKind: 'interactive',
  },
]

function getDemoUrl(templateId: PublicTemplateId): string {
  const url = new URL(buildDemoUrl(templateId, 'full'), window.location.href)
  // This parameter is already supported by DistributionDemo and opens its real tutorial center.
  if (templateId === 'distribution') url.searchParams.set('tour', 'start')
  return `${url.pathname}${url.search}`
}

function getCurrentDemoDocument(frame: HTMLIFrameElement | null): Document | null {
  if (!frame?.contentWindow || !frame.contentDocument) return null
  try {
    if (new URL(frame.src, window.location.href).origin !== window.location.origin) return null
    return frame.contentDocument
  } catch {
    return null
  }
}

function dismissPublicDemoWelcome(frame: HTMLIFrameElement | null, attempt = 0) {
  const previewDocument = getCurrentDemoDocument(frame)
  const welcome = previewDocument?.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]')
  if (!welcome) {
    if (frame?.contentWindow && attempt < 30) {
      frame.contentWindow.setTimeout(() => dismissPublicDemoWelcome(frame, attempt + 1), 100)
    }
    return
  }

  const skip = [...welcome.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.trim() === 'Saltar por ahora')
  if (!skip || !frame?.contentWindow) return
  skip.click()
  frame.contentWindow.setTimeout(() => {
    const confirmation = getCurrentDemoDocument(frame)
    const understood = [...(confirmation?.querySelectorAll<HTMLButtonElement>('[role="dialog"] button') || [])]
      .find((button) => button.textContent?.trim() === 'Entendido')
    understood?.click()
  }, 120)
}

export function GuidedTutorialsSection() {
  const [selectedTemplate, setSelectedTemplate] = useState<PublicTemplateId>('restaurant')
  const [demoRevision, setDemoRevision] = useState(0)
  const [loadedDemoKey, setLoadedDemoKey] = useState('')
  const [guideOpenedKey, setGuideOpenedKey] = useState('')
  const [feedbackState, setFeedbackState] = useState<{ key: string; message: string }>({ key: '', message: '' })
  const frameRef = useRef<HTMLIFrameElement>(null)
  const activeTemplate = TUTORIAL_TEMPLATES.find((template) => template.id === selectedTemplate) || TUTORIAL_TEMPLATES[0]
  const demoEnabled = isPublicDemoEnabled(activeTemplate.id)
  const demoKey = `${activeTemplate.id}:${demoRevision}`
  const demoReady = loadedDemoKey === demoKey
  const guideOpened = guideOpenedKey === demoKey
  const feedback = feedbackState.key === demoKey ? feedbackState.message : ''
  const Icon = activeTemplate.icon
  const launchUrl = getDemoUrl(activeTemplate.id)

  useEffect(() => {
    const activeTab = document.querySelector<HTMLButtonElement>(`[data-tutorial-template="${selectedTemplate}"]`)
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [selectedTemplate])

  const selectTemplate = (templateId: PublicTemplateId) => {
    if (!isPublicDemoEnabled(templateId)) return
    if (templateId === selectedTemplate) return
    setSelectedTemplate(templateId)
    setDemoRevision((revision) => revision + 1)
  }

  const handleSelectorKeyDown = (event: KeyboardEvent<HTMLButtonElement>, templateIndex: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (templateIndex + 1) % TUTORIAL_TEMPLATES.length
    if (event.key === 'ArrowLeft') nextIndex = (templateIndex - 1 + TUTORIAL_TEMPLATES.length) % TUTORIAL_TEMPLATES.length
    if (nextIndex === null) return
    event.preventDefault()
    const nextTemplate = TUTORIAL_TEMPLATES[nextIndex]
    selectTemplate(nextTemplate.id)
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-tutorial-template="${nextTemplate.id}"]`)?.focus())
  }

  const openSystemGuide = () => {
    const previewDocument = getCurrentDemoDocument(frameRef.current)
    if (!previewDocument || !activeTemplate.learningTrigger) {
      setFeedbackState({ key: demoKey, message: 'La guía no está disponible dentro de esta vista. Abre la demo completa para continuar.' })
      return
    }
    const trigger = previewDocument.querySelector<HTMLButtonElement>(activeTemplate.learningTrigger)
    if (!trigger || trigger.disabled) {
      setFeedbackState({ key: demoKey, message: 'No encontramos el acceso al Centro de aprendizaje en este estado de la demo. Puedes abrir la experiencia completa.' })
      return
    }
    trigger.click()
    setGuideOpenedKey(demoKey)
    setFeedbackState({ key: demoKey, message: 'El tutorial nativo está abierto dentro de la demo. Sigue sus acciones para avanzar el recorrido.' })
  }

  const resetDemo = () => {
    const previewDocument = getCurrentDemoDocument(frameRef.current)
    const resetButton = previewDocument?.querySelector<HTMLButtonElement>('button[title="Restaura el dataset original a su estado limpio"]')
    if (resetButton && !resetButton.disabled) {
      resetButton.click()
      setGuideOpenedKey('')
      setFeedbackState({ key: demoKey, message: 'La demo restauró su dataset de ejemplo desde el control propio del sistema.' })
      return
    }
    setDemoRevision((revision) => revision + 1)
    setFeedbackState({ key: demoKey, message: 'Se volvió a cargar la vista de demostración. El estado local depende de las reglas de almacenamiento de esta plantilla.' })
  }

  return (
    <section id="tutoriales" className="pachax-tutorials-section">
      <div className="pachax-tutorials-container">
        <header className="pachax-tutorials-heading">
          <div className="pachax-editorial-eyebrow"><span aria-hidden="true" />Tutoriales</div>
          <h2>Tutoriales interactivos para <span>aprender operando</span></h2>
          <p>Tu equipo puede capacitarse con recorridos guiados dentro del sistema, siguiendo pasos claros y practicando las operaciones del día a día en un entorno seguro.</p>
        </header>

        <div className="pachax-tutorials-selector" role="tablist" aria-label="Elige una plantilla para explorar sus tutoriales">
          {TUTORIAL_TEMPLATES.map((template, index) => {
            const TemplateIcon = template.icon
            const isSelected = template.id === selectedTemplate
            const isEnabled = isPublicDemoEnabled(template.id)
            return (
              <button
                key={template.id}
                id={`tutorial-tab-${template.id}`}
                data-tutorial-template={template.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls="tutorial-workspace"
                aria-disabled={!isEnabled}
                disabled={!isEnabled}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={(event) => handleSelectorKeyDown(event, index)}
                onClick={() => selectTemplate(template.id)}
                className="pachax-tutorials-tab"
              >
                <TemplateIcon aria-hidden="true" />
                <span>{template.title}</span>
                {!isEnabled && <span className="pachax-tutorials-tab-status">Demo no disponible</span>}
              </button>
            )
          })}
        </div>

        <div id="tutorial-workspace" className="pachax-tutorials-workspace" role="tabpanel" aria-labelledby={`tutorial-tab-${activeTemplate.id}`}>
          <div className="pachax-tutorials-demo-pane">
            <div className="pachax-tutorials-demo-heading">
              <div className="pachax-tutorials-demo-brand">
                <span className="pachax-tutorials-demo-mark" aria-hidden="true"><Icon /></span>
                <div><strong>{activeTemplate.title}</strong><span>{demoEnabled ? 'Experiencia operativa de demostración' : 'Vista no disponible'}</span></div>
              </div>
              <div className="pachax-tutorials-live-state" role="status" aria-live="polite">
                <span className={demoReady && demoEnabled ? 'is-live' : ''} aria-hidden="true" />
                {demoEnabled ? (demoReady ? 'Demo lista' : 'Cargando demo') : 'Demo deshabilitada'}
              </div>
            </div>
            {demoEnabled ? (
              <iframe
                key={`${activeTemplate.id}:${demoRevision}`}
                ref={frameRef}
                className="pachax-tutorials-frame"
                title={`Demo interactiva de ${activeTemplate.title}`}
                src={launchUrl}
                loading="lazy"
                referrerPolicy="same-origin"
                onLoad={() => {
                  setLoadedDemoKey(demoKey)
                  if (activeTemplate.id === 'distribution') setGuideOpenedKey(demoKey)
                  if (activeTemplate.id === 'restaurant' || activeTemplate.id === 'hamburger') {
                    // Public demos start with a first-run welcome that covers the operating UI.
                    // Close only that demo-local introduction so the landing can show the real workspace.
                    dismissPublicDemoWelcome(frameRef.current)
                  }
                }}
              />
            ) : (
              <div className="pachax-tutorials-disabled" role="status">
                <BookOpen aria-hidden="true" />
                <h3>El acceso a esta demo está deshabilitado</h3>
                <p>La disponibilidad administrativa se respeta también dentro de esta sección.</p>
              </div>
            )}
            <div className="pachax-tutorials-demo-footer">
              <span><ShieldCheck aria-hidden="true" />La práctica usa datos ficticios del modo demo; no opera una empresa.</span>
              {demoEnabled && (
                <button type="button" className="pachax-tutorials-reset" onClick={resetDemo} disabled={!demoReady}>
                  <RotateCcw aria-hidden="true" />Recargar demo
                </button>
              )}
            </div>
          </div>

          <aside className="pachax-tutorials-guide" aria-labelledby="tutorial-guide-title">
            <div className="pachax-tutorials-guide-kicker">{activeTemplate.builtInGuide ? 'RECORRIDO EN EL SISTEMA' : 'PRÁCTICA INTERACTIVA'}</div>
            <div className="pachax-tutorials-guide-progress" aria-hidden="true"><span className={guideOpened ? 'is-open' : ''} /></div>
            <h3 id="tutorial-guide-title">{activeTemplate.builtInGuide ? 'Aprende dentro de la demo' : 'Explora el POS de demostración'}</h3>
            <p className="pachax-tutorials-guide-copy">{activeTemplate.guideIntro}</p>

            <ol className="pachax-tutorials-topic-list">
              {activeTemplate.topics.map((topic, index) => (
                <li key={topic.title}>
                  <span className="pachax-tutorials-topic-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{topic.title}</strong><p>{topic.description}</p></div>
                  <ArrowRight aria-hidden="true" />
                </li>
              ))}
            </ol>

            {activeTemplate.builtInGuide ? (
              <button type="button" data-tutorial-open-guide className="pachax-tutorials-guide-action" onClick={openSystemGuide} disabled={!demoEnabled || !demoReady || guideOpened}>
                <BookOpen aria-hidden="true" />
                <span>{guideOpened ? 'Tutorial abierto en el demo' : 'Abrir tutorial del sistema'}</span>
                <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <div className="pachax-tutorials-guide-note" role="note">
                <span>Esta plantilla aún no tiene un recorrido contextual integrado.</span>
                <strong>La demo es interactiva; el Centro de tutoriales no está disponible.</strong>
              </div>
            )}

            {feedback && <p className="pachax-tutorials-feedback" role="status" aria-live="polite">{feedback}</p>}
            {demoEnabled && (
              <a className="pachax-tutorials-launch" href={launchUrl} target="_blank" rel="noopener noreferrer">
                <Play aria-hidden="true" />
                <span>{activeTemplate.demoKind === 'guided' ? 'Probar demo guiada' : 'Explorar demo interactiva'}</span>
                <ExternalLink aria-hidden="true" />
              </a>
            )}
          </aside>
        </div>

        <div className="pachax-tutorials-capabilities" aria-label={`Temas de ${activeTemplate.title}`}>
          {activeTemplate.topics.map((topic, index) => {
            const icons = [ClipboardList, Boxes, CircleDollarSign]
            const TopicIcon = icons[index]
            return (
              <div className="pachax-tutorials-capability" key={`capability-${topic.title}`}>
                <span aria-hidden="true"><TopicIcon /></span>
                <div><strong>{topic.title}</strong><p>{topic.description}</p></div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
