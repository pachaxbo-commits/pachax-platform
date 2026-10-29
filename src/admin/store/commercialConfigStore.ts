import { useState, useEffect } from 'react'
import type {
  CommercialTemplateItem,
  TemplateTierPlan,
  CommercialExtraService,
  LandingContentConfig,
  MediaAssetItem,
} from '../types'
import { mergeOfficialTemplates } from './templateDefaults.ts'
import { resolvePublicTemplateCatalog, resolvePublicTemplatePresentation } from './publicTemplateCatalog.ts'
import { COMMERCIAL_PLAN_TEMPLATE_IDS, filterPublicCommercialPlans, filterPublishedCommercialRecords } from './commercialCatalogContract.ts'
import {
  PLANS_BY_TEMPLATE,
  COMMERCIAL_EXTRAS,
  OFFICIAL_WHATSAPP,
  type TemplateKey,
} from '../../public/config/pricingConfig'
import { getFirebaseContext } from '../../lib/firebase'
import { gateway } from '../../services/gateway'
import { getPublicCommercialCatalog } from '../../services/commercialOnboarding'
import { createSingleFlight } from '../../services/singleFlight'
import { setPublicDemoConfiguration } from '../../core/publicTemplates.ts'
import {
  doc,
  getDoc,
  getDocs,
  collection,
} from 'firebase/firestore'

const STORAGE_KEY = 'pachax_commercial_config_v2'
const EVENT_NAME = 'pachax:commercial-config-updated'
export const PLAN_ELIGIBLE_TEMPLATE_IDS = COMMERCIAL_PLAN_TEMPLATE_IDS
const ELIGIBLE_TEMPLATE_ID_SET: ReadonlySet<string> = new Set(PLAN_ELIGIBLE_TEMPLATE_IDS)

// 1. Assets multimedia oficiales disponibles
export const DEFAULT_MEDIA_ASSETS: MediaAssetItem[] = [
  {
    id: 'asset_restaurant',
    name: 'Restaurante Gourmet Concept',
    url: '/brand/showcase/restaurant-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'restaurant',
    focalPointDefault: '50% 38%',
    status: 'draft',
  },
  {
    id: 'asset_distribution',
    name: 'Distribuidora Logística Concept',
    url: '/brand/showcase/distribution-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'distribution',
    focalPointDefault: '50% 48%',
    status: 'draft',
  },
  {
    id: 'asset_nightclub',
    name: 'Nightclub & Lounge Concept',
    url: '/brand/showcase/nightclub-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'nightclub',
    focalPointDefault: '50% 42%',
    status: 'draft',
  },
  {
    id: 'asset_retail',
    name: 'Ventas Express & Balanza Concept',
    url: '/brand/showcase/retail-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'retail',
    focalPointDefault: '50% 38%',
    status: 'draft',
  },
  {
    id: 'asset_custom',
    name: 'Solución a Medida / Estudio Concept',
    url: '/brand/showcase/custom-concept.webp',
    category: 'showcase',
    recommendedTemplate: undefined,
    focalPointDefault: '50% 38%',
    status: 'draft',
  },
]

// 2. Textos editoriales iniciales de la landing (afirmaciones descriptivas sin promesas cuantitativas)
export const DEFAULT_LANDING_CONTENT: LandingContentConfig = {
  status: 'published',
  heroTagline: 'PLATAFORMA INTEGRAL DE GESTIÓN OPERATIVA',
  heroTitle: 'El sistema operativo para negocios con flujos reales de venta',
  heroSubtitle: 'Arquitectura multitenant de alto rendimiento para gastronomía, logística mayorista, entretenimiento nocturno y comercio minorista. Cada rubro opera con su propio motor canónico.',
  heroCtaPrimary: 'Explorar vitrina de soluciones',
  heroCtaSecondary: 'Comenzar ahora',
  officialWhatsAppNumber: OFFICIAL_WHATSAPP.phoneNumber,
  officialWhatsAppDisplay: OFFICIAL_WHATSAPP.displayNumber,
  defaultCustomDevMessage: OFFICIAL_WHATSAPP.defaultCustomDevMessage,
  valueStripMetrics: [
    { label: 'DISPONIBILIDAD', value: 'Operación en la nube', detail: 'Arquitectura distribuida y continua' },
    { label: 'COBROS', value: 'Múltiples métodos', detail: 'Efectivo, QR instantáneo y tarjetas' },
    { label: 'CONTROL', value: 'Cierre y trazabilidad', detail: 'Arqueo por turno sin descuadres' },
    { label: 'SEGURIDAD', value: 'Aislamiento por empresa', detail: 'Datos blindados e independientes por tenant' },
  ],
  sectionTitles: {
    catalog: 'Plantillas especializadas por modelo de negocio',
    catalogSubtitle: 'Una única experiencia funcional canónica compartida entre producción, PACHAX Studio y demostración pública. Sin interfaces paralelas ni código duplicado.',
    pricing: 'Planes adaptados a la escala real de tu empresa',
    pricingSubtitle: 'Sin comisiones ocultas por venta ni letra chica. Elige la plantilla de tu rubro y selecciona el nivel operativo que necesitas para empezar.',
    onboarding: 'Configura tu empresa en minutos, sin complicaciones',
    onboardingSubtitle: 'Ingresas la información básica de tu negocio y el sistema adapta automáticamente su interfaz, reportes y tickets térmicos.',
    tutorials: 'Tutoriales guiados interactivos dentro del sistema',
    tutorialsSubtitle: 'Tu personal aprenderá a usar PACHAX en minutos mediante guías paso a paso que asisten a mozos, cajeros y choferes en cada operación.',
    extras: 'Potencia tu operación con módulos y servicios especializados',
    extrasSubtitle: 'Separa las herramientas técnicas de los servicios de crecimiento. Agrega soporte VIP 24/7, campañas de marketing, identidad visual o integraciones contables.',
  },
}

function flattenDefaultPlans(): TemplateTierPlan[] {
  const result: TemplateTierPlan[] = []
  const keys: TemplateKey[] = ['restaurant', 'hamburger', 'distribution', 'nightclub', 'retail']
  for (const k of keys) {
    const list = PLANS_BY_TEMPLATE[k]
    if (list) {
      for (const p of list) {
        result.push({
          ...p,
          planKind: p.planKind || 'paid',
          status: 'draft',
          priceApproval: 'pending',
          technicalEntitlements: [],
        })
      }
    }
  }
  return result
}

export interface StoredCommercialConfig {
  templates: CommercialTemplateItem[]
  plans: TemplateTierPlan[]
  extras: CommercialExtraService[]
  landingContent: LandingContentConfig
  mediaAssets: MediaAssetItem[]
  lastModified: string
}

function getDefaultConfig(): StoredCommercialConfig {
  const templates = mergeOfficialTemplates([]).map((template) => {
    const commercialMode = ['restaurant', 'distribution', 'nightclub'].includes(template.id)
      ? 'specialized' as const
      : 'self_service' as const
    return {
      ...template,
      commercialMode,
      // Defaults never enable a public offer without an explicit Admin decision.
      commercialAvailability: 'coming_soon',
      implementationBasePriceUSD: null,
    }
  })
  return {
    templates: JSON.parse(JSON.stringify(templates)),
    plans: JSON.parse(JSON.stringify(flattenDefaultPlans())),
    // Static extras are editorial seeds only. Publishing requires an explicit Admin save.
    extras: JSON.parse(JSON.stringify(COMMERCIAL_EXTRAS.map((extra) => ({ ...extra, status: 'draft' })))),
    landingContent: JSON.parse(JSON.stringify(DEFAULT_LANDING_CONTENT)),
    mediaAssets: JSON.parse(JSON.stringify(DEFAULT_MEDIA_ASSETS)),
    lastModified: new Date().toISOString(),
  }
}

// Memoria activa y caché local para la experiencia pública
let cachedConfig: StoredCommercialConfig | null = null
export type AdminTemplatesState = 'loading' | 'uninitialized' | 'ready' | 'error'
let adminTemplatesState: AdminTemplatesState = 'loading'

export function loadCommercialConfig(): StoredCommercialConfig {
  if (cachedConfig) return cachedConfig
  if (typeof window === 'undefined') return getDefaultConfig()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      cachedConfig = getDefaultConfig()
      return cachedConfig
    }
    const parsed = JSON.parse(raw) as Partial<StoredCommercialConfig>
    cachedConfig = {
      templates: Array.isArray(parsed.templates) && parsed.templates.length > 0
        ? parsed.templates : getDefaultConfig().templates,
      plans: parsed.plans || getDefaultConfig().plans,
      extras: parsed.extras || getDefaultConfig().extras,
      landingContent: parsed.landingContent || getDefaultConfig().landingContent,
      mediaAssets: parsed.mediaAssets || getDefaultConfig().mediaAssets,
      lastModified: parsed.lastModified || new Date().toISOString(),
    }
    return cachedConfig
  } catch (err) {
    console.error('Error cargando configuración comercial:', err)
    cachedConfig = getDefaultConfig()
    return cachedConfig
  }
}

function notifyUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT_NAME))
  }
}

export function saveCommercialConfig(config: StoredCommercialConfig): void {
  // React subscribers must receive a new snapshot even when an admin editor
  // mutated the previously cached object before calling this function.
  cachedConfig = {
    ...config,
    templates: [...config.templates],
    plans: [...config.plans],
    extras: [...config.extras],
    landingContent: { ...config.landingContent },
    mediaAssets: [...config.mediaAssets],
    lastModified: new Date().toISOString(),
  }
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedConfig))
    notifyUpdate()
  } catch (err) {
    console.error('Error guardando configuración comercial en almacenamiento local:', err)
  }
}

// ==============================================================
// 3. CONSULTAS SEPARADAS: PÚBLICO (published) vs ADMIN (draft+published)
// ==============================================================

let publicConfig: StoredCommercialConfig | null = null
let publicCatalogStatus: 'loading' | 'ready' | 'error' = 'loading'
let hasReceivedPublicCatalog = false
let publicSyncInFlight: Promise<void> | null = null
let publicStorageSyncTimer: ReturnType<typeof setTimeout> | null = null
let isAdminSyncing = false

function setPublicEditorialFallback(): void {
  const defaults = getDefaultConfig()
  publicConfig = {
    ...defaults,
    templates: resolvePublicTemplateCatalog({ kind: 'unavailable' }),
    plans: [],
    extras: [],
  }
}

/**
 * Consulta pública por callable con proyección permitida. Firestore Rules no
 * pueden ocultar campos individuales, así que el cliente no lee estos docs.
 */
const performPublicCatalogSync = createSingleFlight(async (): Promise<void> => {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin')) return

  try {
    const ctx = await getFirebaseContext()
    if (!ctx) {
      if (!hasReceivedPublicCatalog) setPublicEditorialFallback()
      publicCatalogStatus = 'error'
      notifyUpdate()
      return
    }

    const catalog = await getPublicCommercialCatalog()

    if (window.location.pathname.startsWith('/admin')) return

    const templates = resolvePublicTemplateCatalog({
      kind: 'available',
      templates: catalog.templates as unknown as CommercialTemplateItem[],
    })
    hasReceivedPublicCatalog = true
    setPublicDemoConfiguration(Array.isArray(catalog.demoConfiguration)
      ? catalog.demoConfiguration as { id: string; demoEnabled?: boolean; demoEnabledConfigured?: boolean }[]
      : templates)
    const plans = filterPublicCommercialPlans(catalog.plans as unknown as TemplateTierPlan[])
    const extras = filterPublishedCommercialRecords(catalog.extras as unknown as CommercialExtraService[])
    const landingContent = { ...DEFAULT_LANDING_CONTENT, ...(catalog.landingContent as Partial<LandingContentConfig>) }
    publicConfig = {
      ...getDefaultConfig(),
      templates,
      plans,
      extras,
      landingContent,
      mediaAssets: catalog.mediaAssets.length === 0
        ? getDefaultConfig().mediaAssets
        : catalog.mediaAssets as unknown as MediaAssetItem[],
      lastModified: catalog.fetchedAt,
    }
    publicCatalogStatus = 'ready'
    notifyUpdate()
  } catch (err) {
    // Preserve a prior valid Admin snapshot. If this is the first request,
    // show only the approved public editorial fallback (never cached drafts).
    if (!hasReceivedPublicCatalog) setPublicEditorialFallback()
    publicCatalogStatus = 'error'
    console.warn('No se pudo consultar la configuración comercial publicada:', err)
    notifyUpdate()
  }
})

export function syncPublicPublishedFromFirestore(forceRefresh = false): Promise<void> {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin')) return Promise.resolve()
  if (forceRefresh && publicSyncInFlight) {
    // A cross-tab Admin update may arrive while an older read is in flight.
    // Run a fresh revision check after that read settles instead of letting
    // the initial snapshot mask the just-published/unpublished change.
    return publicSyncInFlight.then(() => syncPublicPublishedFromFirestore(true))
  }
  if (!forceRefresh && publicCatalogStatus === 'ready') return Promise.resolve()
  if (publicSyncInFlight) return publicSyncInFlight

  const current = performPublicCatalogSync()
  publicSyncInFlight = current
  void current.finally(() => {
    if (publicSyncInFlight === current) publicSyncInFlight = null
  }).catch(() => undefined)
  return current
}

/**
 * Consulta administrativa completa a Firestore.
 * Solo se invoca para operadores autorizados en /admin.
 * Carga tanto borradores (draft) como publicados (published).
 */
export async function syncAdminAllFromFirestore(): Promise<void> {
  if (isAdminSyncing || typeof window === 'undefined') return
  isAdminSyncing = true

  try {
    const ctx = await getFirebaseContext()
    if (!ctx) {
      adminTemplatesState = 'error'
      notifyUpdate()
      return
    }

    const [landingSnap, templatesSnap, plansSnap, extrasSnap, mediaSnap] = await Promise.allSettled([
      getDoc(doc(ctx.db, 'platformConfig', 'publicLanding')),
      getDocs(collection(ctx.db, 'platformTemplates')),
      getDocs(collection(ctx.db, 'platformPlans')),
      getDocs(collection(ctx.db, 'platformExtras')),
      getDocs(collection(ctx.db, 'platformMedia')),
    ])

    if (!window.location.pathname.startsWith('/admin')) return

    const current = loadCommercialConfig()
    let changed = false

    if (landingSnap.status === 'fulfilled' && landingSnap.value.exists()) {
      const data = landingSnap.value.data() as Partial<LandingContentConfig>
      current.landingContent = { ...current.landingContent, ...data }
      changed = true
    }

    if (templatesSnap.status === 'fulfilled') {
      const remote = templatesSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialTemplateItem,
      )
      current.templates = mergeOfficialTemplates(remote)
      adminTemplatesState = templatesSnap.value.empty ? 'uninitialized' : 'ready'
      changed = true
    } else {
      adminTemplatesState = 'error'
      console.error('No se pudieron leer las plantillas administrativas:', templatesSnap.reason)
      notifyUpdate()
    }

    if (plansSnap.status === 'fulfilled') {
      const remote = plansSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TemplateTierPlan,
      )
      current.plans = plansSnap.value.empty ? getDefaultConfig().plans : remote
      changed = true
    }

    if (extrasSnap.status === 'fulfilled') {
      const remote = extrasSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialExtraService,
      )
      current.extras = extrasSnap.value.empty ? getDefaultConfig().extras : remote
      changed = true
    }

    if (mediaSnap.status === 'fulfilled') {
      const remote = mediaSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as MediaAssetItem,
      )
      current.mediaAssets = mediaSnap.value.empty ? getDefaultConfig().mediaAssets : remote
      changed = true
    }

    if (changed) {
      saveCommercialConfig(current)
    }
  } catch (err) {
    adminTemplatesState = 'error'
    console.error('Sincronización administrativa de Firestore:', err)
    notifyUpdate()
  } finally {
    isAdminSyncing = false
  }
}

// ==============================================================
// 7. SEED: NO PUBLICAR PRECIOS PLACEHOLDER (PLANES Y EXTRAS = DRAFT)
// ==============================================================

export async function seedDefaultsToFirestore(): Promise<{ success: boolean; message: string }> {
  try {
    const defaults = getDefaultConfig()
    const serverRes = await gateway<{ success: boolean; message: string }>('platformGateway', {
      action: 'seedPlatformConfig',
      defaults,
    })
    if (serverRes?.success) {
      return serverRes
    }
    return { success: false, message: serverRes?.message || 'Error al inicializar configuración en el servidor.' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error comunicando con el servidor de plataforma.'
    return { success: false, message }
  }
}

// Restablecer a valores de fábrica
export function resetCommercialConfigToDefaults(): StoredCommercialConfig {
  const defaults = getDefaultConfig()
  saveCommercialConfig(defaults)
  return defaults
}

// ==============================================================
// 5. OPERACIONES DE ESCRITURA FAIL-SAFE (PERSISTIR ANTES DE CONFIRMAR)
// ==============================================================

export async function updateTemplateInStore(
  id: string,
  updates: Partial<CommercialTemplateItem>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const idx = current.templates.findIndex((t) => t.id === id)
    const existing: Partial<CommercialTemplateItem> = idx >= 0 ? current.templates[idx] : {}
    const expected = Number.isSafeInteger(existing.revision) ? existing.revision! : 0
    const updated = { ...existing, ...updates, id, revision: expected }

    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'saveTemplate', template: updated, expectedRevision: expected })

    if (idx >= 0) {
      current.templates[idx] = { ...updated, revision: saved.revision ?? expected + 1 } as CommercialTemplateItem
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar plantilla en el servidor.'
    console.error('Error persistiendo template en el servidor:', err)
    return { success: false, error }
  }
}

export async function updatePlanInStore(
  id: string,
  updates: Partial<TemplateTierPlan>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const idx = current.plans.findIndex((p) => p.id === id)
    const existing: Partial<TemplateTierPlan> = idx >= 0 ? current.plans[idx] : {}
    const expected = Number.isSafeInteger(existing.revision) ? existing.revision! : 0
    const updated = { ...existing, ...updates, id, revision: expected }

    if (updated.templateId && !ELIGIBLE_TEMPLATE_ID_SET.has(updated.templateId)) {
      return {
        success: false,
        error: `La plantilla ${updated.templateId} no es elegible para planes de suscripción.`,
      }
    }

    if (updated.status === 'published' && updated.priceApproval !== 'approved') {
      return { success: false, error: 'Confirma la aprobación comercial explícita antes de publicar este plan.' }
    }
    if (updated.status === 'published' && (updated.technicalEntitlements || []).length > 0) {
      return { success: false, error: 'Billing Core no valida entitlements todavía. Quita las asignaciones técnicas antes de publicar.' }
    }
    if (updated.status === 'published' && updated.planKind === 'free') {
      return { success: false, error: 'Plan Free sigue sin publicación hasta completar el flujo seguro, anuncios y controles antiabuso.' }
    }
    if (updated.status === 'published' && (!updated.capabilitiesV1 || updated.capabilitiesV1.version !== 1)) {
      return { success: false, error: 'Completa el contrato de capacidades V1 antes de publicar el plan.' }
    }
    if (updated.status === 'published' && updated.planKind !== 'free' && (!(Number(updated.monthlyPriceUSD) > 0) || !(Number(updated.annualPriceUSD) > 0))) {
      return { success: false, error: 'Completa precios mensual y anual mayores que cero antes de publicar el plan de pago.' }
    }

    // Validación límite de planes activos por template (máx 1 gratuito, máx 3 de pago)
    if (updated.status === 'published' && updated.templateId) {
      if (updated.planKind === 'free') {
        const freeCount = current.plans.filter(
          (p) => p.templateId === updated.templateId && p.id !== id && p.status === 'published' && p.planKind === 'free',
        ).length
        if (freeCount >= 1) {
          return {
            success: false,
            error: 'Cada plantilla permite un máximo de 1 plan gratuito activo publicado simultáneamente en el catálogo.',
          }
        }
        if ((updated.monthlyPriceUSD || 0) > 0 || (updated.annualPriceUSD || 0) > 0) {
          return {
            success: false,
            error: 'El plan gratuito debe tener precio 0.',
          }
        }
      } else {
        const paidCount = current.plans.filter(
          (p) => p.templateId === updated.templateId && p.id !== id && p.status === 'published' && p.planKind !== 'free',
        ).length
        if (paidCount >= 3) {
          return {
            success: false,
            error: 'Cada plantilla permite un máximo de 3 planes de pago activos publicados simultáneamente en el catálogo. Despublica uno antes de activar este.',
          }
        }
      }
    }

    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'savePlan', plan: updated, expectedRevision: expected })

    // Solo tras éxito en backend se actualiza la memoria
    if (idx >= 0) {
      current.plans[idx] = { ...updated, revision: saved.revision ?? expected + 1 } as TemplateTierPlan
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar plan en el servidor.'
    console.error('Error persistiendo plan en el servidor:', err)
    return { success: false, error }
  }
}

/**
 * Publicar o despublicar explícitamente un plan comercial.
 */
export async function togglePublishPlanInStore(
  planId: string,
  targetStatus: 'published' | 'draft',
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const targetPlan = current.plans.find((p) => p.id === planId)

    // Validación de seguridad: máximo 1 plan gratuito y máximo 3 planes de pago publicados por template
    if (targetStatus === 'published' && targetPlan) {
      if (targetPlan.priceApproval !== 'approved') {
        return { success: false, error: 'Confirma la aprobación comercial explícita antes de publicar este plan.' }
      }
      if ((targetPlan.technicalEntitlements || []).length > 0) {
        return { success: false, error: 'Billing Core no valida entitlements todavía. Quita las asignaciones técnicas antes de publicar.' }
      }
      if (targetPlan.planKind === 'free') return { success: false, error: 'Plan Free sigue sin publicación hasta completar el flujo seguro, anuncios y controles antiabuso.' }
      if (!targetPlan.capabilitiesV1 || targetPlan.capabilitiesV1.version !== 1) return { success: false, error: 'Completa el contrato de capacidades V1 antes de publicar el plan.' }
      if (!(targetPlan.monthlyPriceUSD > 0) || !(targetPlan.annualPriceUSD > 0)) {
        return { success: false, error: 'Completa precios mensual y anual mayores que cero antes de publicar el plan de pago.' }
      }
      const publishedPaidCount = current.plans.filter(
        (p) => p.templateId === targetPlan.templateId && p.id !== planId && p.status === 'published' && p.planKind !== 'free',
      ).length
      if (publishedPaidCount >= 3) {
        return {
          success: false,
          error: 'Cada plantilla permite un máximo de 3 planes de pago activos publicados simultáneamente en el catálogo. Despublica uno antes de activar este.',
        }
      }
    }

    // 1. Invocar acción en server-side con auditoría atómica
    const expected = Number.isSafeInteger(targetPlan?.revision) ? targetPlan!.revision! : 0
    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'publishPlan', planId, status: targetStatus, expectedRevision: expected })

    // 2. Actualizar store solo tras confirmación
    const idx = current.plans.findIndex((p) => p.id === planId)
    if (idx >= 0) {
      current.plans[idx] = {
        ...current.plans[idx],
        status: targetStatus,
        revision: saved.revision ?? expected + 1,
        ...(targetStatus === 'published'
          ? { publishedAt: new Date().toISOString() }
          : {}),
      }
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al cambiar publicación del plan.'
    return { success: false, error }
  }
}

export async function createPlanInStore(plan: TemplateTierPlan): Promise<{ success: boolean; error?: string }> {
  try {
    if (!plan.templateId || !ELIGIBLE_TEMPLATE_ID_SET.has(plan.templateId)) {
      return {
        success: false,
        error: `La plantilla ${plan.templateId} no es elegible para planes de suscripción.`,
      }
    }
    const draftPlan = { ...plan, revision: 0, priceApproval: 'pending' as const, status: 'draft' as const }
    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'savePlan', plan: draftPlan, expectedRevision: 0 })

    const current = loadCommercialConfig()
    current.plans.push({ ...draftPlan, revision: saved.revision ?? 1 })
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al crear plan en el servidor.'
    return { success: false, error }
  }
}

export async function deletePlanInStore(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const existing = current.plans.find((plan) => plan.id === id)
    await gateway('platformGateway', { action: 'deletePlan', planId: id, expectedRevision: Number.isSafeInteger(existing?.revision) ? existing!.revision : 0 })

    current.plans = current.plans.filter((p) => p.id !== id)
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al eliminar plan en el servidor.'
    return { success: false, error }
  }
}

export async function updateExtraInStore(
  id: string,
  updates: Partial<CommercialExtraService>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const idx = current.extras.findIndex((e) => e.id === id)
    const existing: Partial<CommercialExtraService> = idx >= 0 ? current.extras[idx] : {}
    const expected = Number.isSafeInteger(existing.revision) ? existing.revision! : 0
    const updated = { ...existing, ...updates, id, revision: expected }

    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'saveExtra', extra: updated, expectedRevision: expected })

    if (idx >= 0) {
      current.extras[idx] = { ...updated, revision: saved.revision ?? expected + 1 } as CommercialExtraService
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar extra en el servidor.'
    return { success: false, error }
  }
}

export async function createExtraInStore(
  extra: CommercialExtraService,
): Promise<{ success: boolean; error?: string }> {
  try {
    const draftExtra: CommercialExtraService = { ...extra, revision: 0, status: 'draft' }
    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'saveExtra', extra: draftExtra, expectedRevision: 0 })

    const current = loadCommercialConfig()
    current.extras.push({ ...draftExtra, revision: saved.revision ?? 1 })
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al crear servicio extra en el servidor.'
    return { success: false, error }
  }
}

export async function deleteExtraInStore(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const existing = current.extras.find((extra) => extra.id === id)
    await gateway('platformGateway', { action: 'deleteExtra', extraId: id, expectedRevision: Number.isSafeInteger(existing?.revision) ? existing!.revision : 0 })
    current.extras = current.extras.filter((e) => e.id !== id)
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al eliminar servicio extra en el servidor.'
    return { success: false, error }
  }
}

export async function updateLandingContentInStore(
  updates: Partial<LandingContentConfig>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const expected = Number.isSafeInteger(current.landingContent.revision) ? current.landingContent.revision! : 0
    const updatedContent = { ...current.landingContent, ...updates, revision: expected }

    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'saveLandingContent', content: updatedContent, expectedRevision: expected })

    current.landingContent = { ...updatedContent, revision: saved.revision ?? expected + 1 }
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar contenido en el servidor.'
    return { success: false, error }
  }
}

export async function updateMediaAssetInStore(
  id: string,
  updates: Partial<MediaAssetItem>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const idx = current.mediaAssets.findIndex((m) => m.id === id)
    const existing: Partial<MediaAssetItem> = idx >= 0 ? current.mediaAssets[idx] : {}
    const expected = Number.isSafeInteger(existing.revision) ? existing.revision! : 0
    const updated = { ...existing, ...updates, id, revision: expected }

    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'saveMediaAsset', asset: updated, expectedRevision: expected })

    if (idx >= 0) {
      current.mediaAssets[idx] = { ...updated, revision: saved.revision ?? expected + 1 } as MediaAssetItem
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar asset en el servidor.'
    return { success: false, error }
  }
}

export async function createMediaAssetInStore(
  asset: MediaAssetItem,
): Promise<{ success: boolean; error?: string }> {
  try {
    const newAsset = { ...asset, revision: 0, status: asset.status || 'draft' }
    const saved = await gateway<{ revision?: number }>('platformGateway', { action: 'saveMediaAsset', asset: newAsset, expectedRevision: 0 })

    const current = loadCommercialConfig()
    current.mediaAssets.push({ ...newAsset, revision: saved.revision ?? 1 })
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al registrar asset multimedia en el servidor.'
    return { success: false, error }
  }
}

export async function deleteMediaAssetInStore(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const current = loadCommercialConfig()
    const existing = current.mediaAssets.find((asset) => asset.id === id)
    await gateway('platformGateway', { action: 'deleteMediaAsset', assetId: id, expectedRevision: Number.isSafeInteger(existing?.revision) ? existing!.revision : 0 })
    current.mediaAssets = current.mediaAssets.filter((m) => m.id !== id)
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al eliminar asset multimedia en el servidor.'
    return { success: false, error }
  }
}

// Hook reactivo consumido por la Landing Pública y por Admin
export function useCommercialConfig() {
  const isPublicPage = typeof window === 'undefined' || !window.location.pathname.startsWith('/admin')
  const [config, setConfig] = useState<StoredCommercialConfig>(() => isPublicPage
    ? (publicConfig || { ...getDefaultConfig(), templates: [], plans: [], extras: [] })
    : loadCommercialConfig())
  const [templatesState, setTemplatesState] = useState<AdminTemplatesState>(adminTemplatesState)
  const [publicState, setPublicState] = useState(publicCatalogStatus)

  useEffect(() => {
    // Si estamos en la ruta /admin, sincronizar la colección completa (draft + published)
    // Si estamos en la landing pública, consultar explícitamente solo status == 'published'
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      syncAdminAllFromFirestore().catch(() => undefined)
    } else {
      syncPublicPublishedFromFirestore().catch(() => undefined)
    }

    const handleUpdate = () => {
      setConfig(isPublicPage
        ? (publicConfig || { ...getDefaultConfig(), templates: [], plans: [], extras: [] })
        : loadCommercialConfig())
      setPublicState(publicCatalogStatus)
      setTemplatesState(adminTemplatesState)
    }
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      handleUpdate()
      if (!isPublicPage) return
      if (publicStorageSyncTimer) clearTimeout(publicStorageSyncTimer)
      publicStorageSyncTimer = setTimeout(() => {
        publicStorageSyncTimer = null
        syncPublicPublishedFromFirestore(true).catch(() => undefined)
      }, 100)
    }
    window.addEventListener(EVENT_NAME, handleUpdate)
    window.addEventListener('storage', handleStorageUpdate)
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [isPublicPage])

  // Filtros de publicación para la web pública (solo mostrar 'published')
  const publishedTemplates = isPublicPage
    ? resolvePublicTemplatePresentation(publicState, hasReceivedPublicCatalog, publicConfig?.templates || []).templates
    : config.templates.filter((t) => t.status === 'published')
  const isPublicEditorialFallback = isPublicPage && !hasReceivedPublicCatalog && publicState !== 'ready'
  const publishedPlansByTemplate = (templateKey: TemplateKey) =>
    (isPublicPage && publicState !== 'ready' ? [] : filterPublicCommercialPlans(isPublicPage ? (publicConfig?.plans ?? []) : config.plans)).filter((p) => p.templateId === templateKey)
  const publishedExtras = (isPublicPage ? (publicConfig?.extras || []) : config.extras).filter((e) => e.status === 'published')

  return {
    config,
    templatesState,
    publicCatalogStatus: publicState,
    isPublicEditorialFallback,
    publishedTemplates,
    publishedPlansByTemplate,
    publishedExtras,
    landingContent: config.landingContent,
    mediaAssets: config.mediaAssets,
    updateTemplate: updateTemplateInStore,
    updatePlan: updatePlanInStore,
    togglePublishPlan: togglePublishPlanInStore,
    createPlan: createPlanInStore,
    deletePlan: deletePlanInStore,
    updateExtra: updateExtraInStore,
    createExtra: createExtraInStore,
    deleteExtra: deleteExtraInStore,
    updateLandingContent: updateLandingContentInStore,
    updateMediaAsset: updateMediaAssetInStore,
    createMediaAsset: createMediaAssetInStore,
    deleteMediaAsset: deleteMediaAssetInStore,
    resetToDefaults: resetCommercialConfigToDefaults,
    seedDefaultsToFirestore,
  }
}
