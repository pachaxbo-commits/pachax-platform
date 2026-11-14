import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  FileCheck2,
  Layers3,
  LoaderCircle,
  MessageCircle,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react'
import { gateway } from '../../../services/gateway'
import { PUBLIC_COMMERCIAL_INTEREST_ENABLED, PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED } from '../../../core/publicTemplates'
import { filterPublicCommercialPlans } from '../../store/commercialCatalogContract'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import { useAdminAuth } from '../../auth/adminAuthStore'

type SetupStatus = 'loading' | 'sin configurar' | 'borrador' | 'por aprobar' | 'configurado' | 'publicado' | 'bloqueado' | 'no disponible'
type SetupTarget = 'landing' | 'commercial-billing' | 'templates' | 'plans' | 'commercial-intents'

interface ManualPaymentMethods {
  available?: boolean
  qrEnabled?: boolean
  transferEnabled?: boolean
  qrImageUrl?: string
  qrImagePath?: string
  qrImageDataUrl?: string
  bankName?: string
  accountHolder?: string
  accountIdentifier?: string
}

interface SetupCard {
  key: string
  title: string
  purpose: string
  customerView: string
  required: string
  status: SetupStatus
  detail: string
  target?: SetupTarget
  icon: typeof MessageCircle
}

const labelFor = (status: SetupStatus) => ({
  loading: 'Consultando',
  'sin configurar': 'Sin configurar',
  borrador: 'Borrador',
  'por aprobar': 'Por aprobar',
  configurado: 'Configurado',
  publicado: 'Publicado',
  bloqueado: 'Bloqueado',
  'no disponible': 'No disponible',
}[status])

function StatusPill({ status }: { status: SetupStatus }) {
  const styles: Record<SetupStatus, string> = {
    loading: 'border-slate-200 bg-slate-100 text-slate-600',
    'sin configurar': 'border-slate-200 bg-slate-100 text-slate-700',
    borrador: 'border-sky-200 bg-sky-50 text-sky-800',
    'por aprobar': 'border-amber-200 bg-amber-50 text-amber-900',
    configurado: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    publicado: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    bloqueado: 'border-rose-200 bg-rose-50 text-rose-800',
    'no disponible': 'border-rose-200 bg-rose-50 text-rose-800',
  }
  const Icon = status === 'loading' ? LoaderCircle : status === 'publicado' || status === 'configurado' ? CircleCheck : status === 'bloqueado' || status === 'no disponible' ? ShieldAlert : CircleAlert
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${styles[status]}`}><Icon aria-hidden="true" className={`h-3.5 w-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />{labelFor(status)}</span>
}

export function CommercialSetupSection({ onNavigateTab }: { onNavigateTab: (tab: string) => void }) {
  const { user } = useAdminAuth()
  const { config, templatesState, adminLandingContentState, adminPlansState } = useCommercialConfig()
  const canReadPaymentMethods = ['platform_owner', 'platform_finance'].includes(user?.role || '')
  const [methods, setMethods] = useState<ManualPaymentMethods | null>(null)
  const [methodsState, setMethodsState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    if (!canReadPaymentMethods) return () => { active = false }
    void gateway<{ methods?: ManualPaymentMethods }>('platformGateway', { action: 'getManualPaymentMethods' }).then(result => {
      if (!active) return
      setMethods(result.methods || {})
      setMethodsState('ready')
    }).catch(() => {
      if (!active) return
      setMethods(null)
      setMethodsState('error')
    })
    return () => { active = false }
  }, [canReadPaymentMethods])

  const contactConfigured = adminLandingContentState === 'ready'
    && config.landingContent.officialWhatsAppNumber.replace(/\D/g, '').length >= 8
  const validPublishedPlans = useMemo(() => adminPlansState === 'ready' ? filterPublicCommercialPlans(config.plans).filter(plan => plan.planKind === 'paid') : [], [adminPlansState, config.plans])
  const publishedTemplates = templatesState === 'ready' ? config.templates.filter(template => template.status === 'published' && template.commercialAvailability === 'available') : []
  const hasQr = Boolean(methods?.qrEnabled && (methods.qrImagePath?.trim() || methods.qrImageUrl?.trim() || methods.qrImageDataUrl?.trim()))
  const hasTransfer = Boolean(methods?.transferEnabled && methods.bankName?.trim() && methods.accountHolder?.trim() && methods.accountIdentifier?.trim())
  const methodReady = hasQr || hasTransfer
  const paymentStatus: SetupStatus = !canReadPaymentMethods
    ? 'no disponible'
    : methodsState === 'loading'
    ? 'loading'
    : methodsState === 'error'
      ? 'no disponible'
      : methods?.available && methodReady
        ? 'publicado'
        : methodReady
          ? 'por aprobar'
          : 'sin configurar'

  const templateStatus: SetupStatus = templatesState === 'loading'
    ? 'loading'
    : templatesState === 'error'
      ? 'no disponible'
      : templatesState === 'uninitialized'
        ? 'sin configurar'
        : publishedTemplates.length > 0
          ? 'publicado'
          : 'borrador'

  const planStatus: SetupStatus = adminPlansState === 'loading'
    ? 'loading'
    : adminPlansState === 'error'
      ? 'no disponible'
      : adminPlansState === 'uninitialized'
        ? 'sin configurar'
        : validPublishedPlans.length > 0
        ? 'publicado'
        : config.plans.some(plan => plan.status === 'draft')
          ? 'borrador'
          : 'sin configurar'

  const cards: SetupCard[] = [
    {
      key: 'contact', title: 'WhatsApp y contacto oficial', purpose: 'Define el canal de consultas que usan los botones públicos.',
      customerView: 'Aparece en las acciones de contacto de la landing y en la solicitud asistida.', required: 'Número confirmado por el propietario y contenido publicado.',
      status: adminLandingContentState === 'loading' ? 'loading' : adminLandingContentState === 'error' ? 'no disponible' : contactConfigured && config.landingContent.status !== 'draft' ? 'publicado' : 'sin configurar',
      detail: adminLandingContentState === 'loading' ? 'Consultando el documento guardado en el servidor.' : adminLandingContentState === 'error' ? 'No se pudo leer el contenido público guardado.' : adminLandingContentState === 'uninitialized' ? 'Todavía no existe contenido de landing guardado. Los valores editoriales locales no cuentan como contacto oficial.' : contactConfigured ? 'El documento del servidor tiene un número publicado. Confirma con el propietario que ese contacto corresponde al canal oficial.' : 'No hay un destino comercial publicado. Los botones de contacto permanecen cerrados.',
      target: 'landing', icon: MessageCircle,
    },
    {
      key: 'payments', title: 'QR y métodos de pago', purpose: 'Configura los medios manuales que se muestran para un cargo elegible.',
      customerView: 'El cliente debe ver solo métodos habilitados por el servidor para un cargo existente.', required: 'QR o transferencia oficial, datos verificados y decisión de publicación.',
      status: paymentStatus,
      detail: methodsState === 'error' ? 'No se pudo consultar el estado con el rol o servicio disponible.' : methods?.available && methodReady ? 'El servidor marca los métodos como disponibles. Confirma por fuera de PACHAX que el banco, titular e imagen sean correctos.' : methodReady ? 'Hay datos guardados, pero no están publicados por la configuración del servidor.' : 'No hay un método completo habilitado. No se muestran datos bancarios desde este centro.',
      target: 'commercial-billing', icon: CreditCard,
    },
    {
      key: 'templates', title: 'Plantillas comercializables', purpose: 'Elige qué sistemas pueden presentarse como oferta pública.',
      customerView: 'Se muestra el rubro, la disponibilidad y la modalidad comercial publicada.', required: 'Publicación explícita y disponibilidad compatible con la operación real.',
      status: templateStatus,
      detail: templatesState === 'ready' ? `${publishedTemplates.length} de ${config.templates.length} plantillas figuran como publicadas y disponibles.` : templatesState === 'uninitialized' ? 'La configuración oficial aún no se inicializó en el servidor; los valores editoriales no cuentan como ofertas.' : 'El estado depende de la sincronización administrativa con el servidor.',
      target: 'templates', icon: Layers3,
    },
    {
      key: 'plans', title: 'Planes, precios y capacidades', purpose: 'Prepara las condiciones comerciales vinculadas a cada plantilla.',
      customerView: 'Solo se presenta un plan con aprobación explícita, características válidas y unidad anual confirmada.', required: 'Precio, moneda, límites y capacidades revisados; precio aprobado antes de publicar.',
      status: planStatus,
      detail: adminPlansState === 'loading' ? 'Consultando planes guardados en el servidor.' : adminPlansState === 'error' ? 'No se pudo leer la colección de planes guardada.' : adminPlansState === 'uninitialized' ? 'No hay configuración de planes en el servidor. Los precios editoriales locales no son ofertas.' : `${validPublishedPlans.length} planes de pago cumplen actualmente el filtro del catálogo público. Los demás importes de referencia o borradores no cuentan como oferta publicada.`,
      target: 'plans', icon: BadgeCheck,
    },
    {
      key: 'conditions', title: 'Condiciones de contratación', purpose: 'Define alcance, pagos, cancelación, soporte y privacidad antes de aceptar clientes.',
      customerView: 'Los términos aprobados acompañarán la cotización y el contrato.', required: 'Aprobación del propietario y revisión legal/contable.',
      status: 'por aprobar', detail: 'El aviso de privacidad comercial y las condiciones comerciales siguen identificados como borradores; no los presentes como documentos definitivos.',
      icon: FileCheck2,
    },
    {
      key: 'renewal', title: 'Avisos y renovaciones', purpose: 'Informa vencimientos y muestra pagos dentro del ciclo de renovación existente.',
      customerView: 'El portal muestra cargos reales cuando existen; no se envían mensajes externos automáticos desde esta configuración.', required: 'El aviso actual es fijo; cambiar los días requiere un cambio posterior probado.',
      status: 'bloqueado', detail: 'El sistema usa avisos internos a 7, 3 y 0 días, ventana de emisión hasta 30 días antes y hasta 7 días de gracia. El plazo de aviso no se configura desde Admin.',
      target: 'commercial-billing', icon: Clock3,
    },
    {
      key: 'intake', title: 'Solicitudes de clientes', purpose: 'Recibe y asigna solicitudes comerciales cuando la captura pública está autorizada.',
      customerView: 'La landing no permite enviar datos mientras el control de captación siga cerrado.', required: 'Documentos, protección antiabuso y apertura explícita.',
      status: PUBLIC_COMMERCIAL_INTEREST_ENABLED ? 'configurado' : 'bloqueado', detail: PUBLIC_COMMERCIAL_INTEREST_ENABLED ? 'La recepción pública está habilitada; consulta las solicitudes en la bandeja.' : 'La captación pública de solicitudes permanece cerrada intencionalmente. El acceso a demos y contacto publicado es independiente.',
      target: 'commercial-intents', icon: UserRoundCheck,
    },
    {
      key: 'simulation', title: 'Prueba de contratación', purpose: 'Valida la secuencia de cotización, contrato, cargo, conciliación y activación.',
      customerView: 'La simulación debe ejecutarse con datos ficticios en emuladores; no crea clientes ni pagos reales.', required: 'QA aislado por plantilla antes de autorizar ventas.',
      status: 'bloqueado', detail: 'No existe una acción de simulación comercial segura dentro de este centro. No se crean cargos ni empresas con el botón de preparación.',
      icon: ShieldAlert,
    },
  ]

  const readinessBlockers = [
    !contactConfigured && 'Publicar el contacto oficial confirmado.',
    paymentStatus !== 'publicado' && 'Configurar y verificar un método de pago oficial.',
    publishedTemplates.length === 0 && 'Publicar únicamente las plantillas aprobadas.',
    validPublishedPlans.length === 0 && 'Aprobar y publicar al menos una oferta válida.',
    'Aprobar las condiciones comerciales y el aviso de privacidad.',
    !PUBLIC_COMMERCIAL_INTEREST_ENABLED && 'La captación pública sigue cerrada.',
  ].filter((value): value is string => Boolean(value))

  const navigate = (target?: SetupTarget) => { if (target) onNavigateTab(target) }

  return (
    <div className="space-y-6" data-commercial-setup>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Preparación comercial</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Configura ventas paso a paso</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Este panel reúne el estado de las pantallas existentes. Cada enlace abre su configuración original; no crea una segunda copia de los datos ni publica ofertas por completar el recorrido.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><ShieldAlert size={15} />No publica ni cobra</span>
        </div>
      </header>

      <section aria-labelledby="commercial-setup-path" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5">
          <h2 id="commercial-setup-path" className="text-lg font-black text-slate-950">Ruta para preparar una venta asistida</h2>
          <p className="mt-1 text-sm text-slate-600">Completa la configuración y revisa los bloqueos antes de compartir una oferta.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, index) => {
            const Icon = card.icon
            return <article key={card.key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4" data-commercial-setup-step={card.key}>
              <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-900 text-white"><Icon size={17} aria-hidden="true" /></span><span className="text-xs font-black text-slate-400">{String(index + 1).padStart(2, '0')}</span></div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">{card.title}</h3>
              <p className="mt-1 min-h-10 text-xs leading-5 text-slate-600">{card.purpose}</p>
              <div className="mt-3"><StatusPill status={card.status} /></div>
              <p className="mt-3 text-xs leading-5 text-slate-700">{card.detail}</p>
              <dl className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs leading-5">
                <div><dt className="font-bold text-slate-800">Qué verá el cliente</dt><dd className="text-slate-600">{card.customerView}</dd></div>
                <div><dt className="font-bold text-slate-800">Qué hace falta</dt><dd className="text-slate-600">{card.required}</dd></div>
              </dl>
              {card.target && <button type="button" onClick={() => navigate(card.target)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs font-bold text-slate-800 transition hover:border-blue-400 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Abrir configuración <ArrowRight size={14} aria-hidden="true" />
              </button>}
            </article>
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-black text-slate-950">Siguiente paso recomendado</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Primero configura contacto y catálogo. Después el propietario debe aprobar documentos y datos de cobro. Los importes de referencia y planes borrador no se ofrecen a clientes.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('landing')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Revisar contacto <ArrowRight size={15} /></button>
            <button type="button" onClick={() => navigate('plans')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Revisar planes <ArrowRight size={15} /></button>
          </div>
        </div>
        <aside aria-labelledby="commercial-readiness" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 sm:p-7">
          <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /><div><h2 id="commercial-readiness" className="text-lg font-black text-rose-950">Aún no está listo para abrir captación</h2><p className="mt-1 text-sm leading-5 text-rose-900">El sistema mantiene el registro autónomo {PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED ? 'habilitado' : 'cerrado'} y no debe cambiarse desde este panel.</p></div></div>
          <ul className="mt-4 space-y-2 text-sm text-rose-950">{readinessBlockers.map(item => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul>
          <p className="mt-4 border-t border-rose-200 pt-3 text-xs leading-5 text-rose-900">Completar esta lista no activa por sí solo contratación, pagos ni creación de empresas. La aprobación comercial y legal sigue siendo una decisión del propietario.</p>
        </aside>
      </section>
    </div>
  )
}
