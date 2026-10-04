import { useState, useEffect } from 'react'
import type {
  CommercialTemplateItem,
  TemplateTierPlan,
  CommercialExtraService,
  LandingContentConfig,
  MediaAssetItem,
} from '../types'
import { COMMERCIAL_TEMPLATES as DEFAULT_TEMPLATES } from '../../public/config/commercialShowcase'
import {
  PLANS_BY_TEMPLATE,
  COMMERCIAL_EXTRAS,
  OFFICIAL_WHATSAPP,
  type TemplateKey,
} from '../../public/config/pricingConfig'
import { getFirebaseContext } from '../../lib/firebase'
import { gateway } from '../../services/gateway'
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore'

const STORAGE_KEY = 'pachax_commercial_config_v2'
const EVENT_NAME = 'pachax:commercial-config-updated'

// 1. Assets multimedia oficiales disponibles
export const DEFAULT_MEDIA_ASSETS: MediaAssetItem[] = [
  {
    id: 'asset_restaurant',
    name: 'Restaurante Gourmet Concept',
    url: '/brand/showcase/restaurant-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'restaurant',
    focalPointDefault: '50% 38%',
  },
  {
    id: 'asset_distribution',
    name: 'Distribuidora Logística Concept',
    url: '/brand/showcase/distribution-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'distribution',
    focalPointDefault: '50% 48%',
  },
  {
    id: 'asset_nightclub',
    name: 'Nightclub & Lounge Concept',
    url: '/brand/showcase/nightclub-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'nightclub',
    focalPointDefault: '50% 42%',
  },
  {
    id: 'asset_retail',
    name: 'Ventas Express & Balanza Concept',
    url: '/brand/showcase/retail-concept.webp',
    category: 'showcase',
    recommendedTemplate: 'retail',
    focalPointDefault: '50% 38%',
  },
  {
    id: 'asset_custom',
    name: 'Solución a Medida / Estudio Concept',
    url: '/brand/showcase/custom-concept.webp',
    category: 'showcase',
    recommendedTemplate: undefined,
    focalPointDefault: '50% 38%',
  },
]

// 2. Textos editoriales iniciales de la landing (afirmaciones descriptivas sin promesas cuantitativas)
export const DEFAULT_LANDING_CONTENT: LandingContentConfig = {
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
  const keys: TemplateKey[] = ['restaurant', 'distribution', 'nightclub', 'retail']
  for (const k of keys) {
    const list = PLANS_BY_TEMPLATE[k]
    if (list) {
      result.push(...list)
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
  return {
    templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
    plans: JSON.parse(JSON.stringify(flattenDefaultPlans())),
    extras: JSON.parse(JSON.stringify(COMMERCIAL_EXTRAS)),
    landingContent: JSON.parse(JSON.stringify(DEFAULT_LANDING_CONTENT)),
    mediaAssets: JSON.parse(JSON.stringify(DEFAULT_MEDIA_ASSETS)),
    lastModified: new Date().toISOString(),
  }
}

// Memoria activa y caché local para la experiencia pública
let cachedConfig: StoredCommercialConfig | null = null

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
      templates: parsed.templates || getDefaultConfig().templates,
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
  cachedConfig = config
  if (typeof window === 'undefined') return
  try {
    config.lastModified = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    notifyUpdate()
  } catch (err) {
    console.error('Error guardando configuración comercial en almacenamiento local:', err)
  }
}

// Registrar auditoría administrativa en Firestore
async function logPlatformAudit(action: string, resource: string, metadata?: Record<string, unknown>) {
  try {
    const ctx = await getFirebaseContext()
    const user = ctx?.auth.currentUser
    if (ctx && user) {
      await addDoc(collection(ctx.db, 'platformAuditLogs'), {
        operatorUid: user.uid,
        action,
        resource,
        metadata: metadata || null,
        createdAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('Auditoría platform no registrada en este entorno:', err)
  }
}

// ==============================================================
// 3. CONSULTAS SEPARADAS: PÚBLICO (published) vs ADMIN (draft+published)
// ==============================================================

let isSyncing = false

/**
 * Consulta pública a Firestore.
 * Ejecuta ÚNICAMENTE queries con filter status == 'published'
 * para respetar estrictamente las Firestore Security Rules públicas.
 */
export async function syncPublicPublishedFromFirestore(): Promise<void> {
  if (isSyncing || typeof window === 'undefined') return
  isSyncing = true

  try {
    const ctx = await getFirebaseContext()
    if (!ctx) return

    const [landingSnap, templatesSnap, plansSnap, extrasSnap, mediaSnap] = await Promise.allSettled([
      getDoc(doc(ctx.db, 'platformConfig', 'publicLanding')),
      getDocs(query(collection(ctx.db, 'platformTemplates'), where('status', '==', 'published'))),
      getDocs(query(collection(ctx.db, 'platformPlans'), where('status', '==', 'published'))),
      getDocs(query(collection(ctx.db, 'platformExtras'), where('status', '==', 'published'))),
      getDocs(query(collection(ctx.db, 'platformMedia'), where('status', '==', 'published'))),
    ])

    const current = loadCommercialConfig()
    let changed = false

    if (landingSnap.status === 'fulfilled' && landingSnap.value.exists()) {
      const data = landingSnap.value.data() as Partial<LandingContentConfig>
      current.landingContent = { ...current.landingContent, ...data }
      changed = true
    }

    if (templatesSnap.status === 'fulfilled') {
      current.templates = templatesSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialTemplateItem,
      )
      changed = true
    }

    if (plansSnap.status === 'fulfilled') {
      // Empty snapshot es un resultado válido (0 planes publicados).
      // Se reemplaza por el arreglo de docs (vacío si no hay publicados).
      current.plans = plansSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TemplateTierPlan,
      )
      changed = true
    }

    if (extrasSnap.status === 'fulfilled') {
      // Empty snapshot es un resultado válido (0 extras publicados).
      current.extras = extrasSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialExtraService,
      )
      changed = true
    }

    if (mediaSnap.status === 'fulfilled') {
      current.mediaAssets = mediaSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as MediaAssetItem,
      )
      changed = true
    }

    if (changed) {
      saveCommercialConfig(current)
    }
  } catch (err) {
    console.warn('Consulta pública de Firestore en modo offline / fallback:', err)
  } finally {
    isSyncing = false
  }
}

/**
 * Consulta administrativa completa a Firestore.
 * Solo se invoca para operadores autorizados en /admin.
 * Carga tanto borradores (draft) como publicados (published).
 */
export async function syncAdminAllFromFirestore(): Promise<void> {
  if (isSyncing || typeof window === 'undefined') return
  isSyncing = true

  try {
    const ctx = await getFirebaseContext()
    if (!ctx) return

    const [landingSnap, templatesSnap, plansSnap, extrasSnap, mediaSnap] = await Promise.allSettled([
      getDoc(doc(ctx.db, 'platformConfig', 'publicLanding')),
      getDocs(collection(ctx.db, 'platformTemplates')),
      getDocs(collection(ctx.db, 'platformPlans')),
      getDocs(collection(ctx.db, 'platformExtras')),
      getDocs(collection(ctx.db, 'platformMedia')),
    ])

    const current = loadCommercialConfig()
    let changed = false

    if (landingSnap.status === 'fulfilled' && landingSnap.value.exists()) {
      const data = landingSnap.value.data() as Partial<LandingContentConfig>
      current.landingContent = { ...current.landingContent, ...data }
      changed = true
    }

    if (templatesSnap.status === 'fulfilled') {
      current.templates = templatesSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialTemplateItem,
      )
      changed = true
    }

    if (plansSnap.status === 'fulfilled') {
      current.plans = plansSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TemplateTierPlan,
      )
      changed = true
    }

    if (extrasSnap.status === 'fulfilled') {
      current.extras = extrasSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialExtraService,
      )
      changed = true
    }

    if (mediaSnap.status === 'fulfilled') {
      current.mediaAssets = mediaSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as MediaAssetItem,
      )
      changed = true
    }

    if (changed) {
      saveCommercialConfig(current)
    }
  } catch (err) {
    console.warn('Sincronización administrativa de Firestore:', err)
  } finally {
    isSyncing = false
  }
}

// ==============================================================
// 7. SEED: NO PUBLICAR PRECIOS PLACEHOLDER (PLANES Y EXTRAS = DRAFT)
// ==============================================================

export async function seedDefaultsToFirestore(): Promise<{ success: boolean; message: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) return { success: false, message: 'Firebase no configurado.' }

    const defaults = getDefaultConfig()
    const now = new Date().toISOString()
    const userUid = ctx.auth.currentUser?.uid || 'system_bootstrap'

    // 1. Landing (Published)
    await setDoc(
      doc(ctx.db, 'platformConfig', 'publicLanding'),
      {
        ...defaults.landingContent,
        status: 'published',
        publishedAt: now,
        publishedBy: userUid,
        updatedAt: now,
      },
      { merge: true },
    )

    // 2. Templates (Published si corresponden a las vitrinas actuales)
    for (const item of defaults.templates) {
      await setDoc(
        doc(ctx.db, 'platformTemplates', item.id),
        {
          ...item,
          status: 'published',
          publishedAt: now,
          publishedBy: userUid,
          updatedAt: now,
        },
        { merge: true },
      )
    }

    // 3. Media (Published)
    for (const item of defaults.mediaAssets) {
      await setDoc(
        doc(ctx.db, 'platformMedia', item.id),
        {
          ...item,
          status: 'published',
          publishedAt: now,
          publishedBy: userUid,
          updatedAt: now,
        },
        { merge: true },
      )
    }

    // 4. PLANES COMERCIALES: ESTRICTAMENTE DRAFT (PRECIOS NO DEFINITIVOS)
    for (const item of defaults.plans) {
      await setDoc(
        doc(ctx.db, 'platformPlans', item.id),
        {
          ...item,
          status: 'draft', // DRAFT OBLIGATORIO: Precios no oficiales
          updatedAt: now,
          updatedBy: userUid,
        },
        { merge: true },
      )
    }

    // 5. EXTRAS CON PRECIOS: ESTRICTAMENTE DRAFT
    for (const item of defaults.extras) {
      await setDoc(
        doc(ctx.db, 'platformExtras', item.id),
        {
          ...item,
          status: 'draft', // DRAFT OBLIGATORIO
          updatedAt: now,
          updatedBy: userUid,
        },
        { merge: true },
      )
    }

    await logPlatformAudit('platform.config.seed', 'platformConfig/publicLanding', {
      templatesCount: defaults.templates.length,
      plansSeededAsDraft: defaults.plans.length,
    })

    return {
      success: true,
      message: 'Configuraciones sembradas en Firestore (Planes y Extras en estado BORRADOR / DRAFT por seguridad).',
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error sembrando datos en Firestore.'
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
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    const current = loadCommercialConfig()
    const idx = current.templates.findIndex((t) => t.id === id)
    const existing = idx >= 0 ? current.templates[idx] : {}
    const updated = { ...existing, ...updates }

    const payload: Record<string, unknown> = {
      ...updated,
      updatedAt: new Date().toISOString(),
      updatedBy: ctx.auth.currentUser?.uid || null,
    }
    if (updates.status === 'published') {
      payload.publishedAt = new Date().toISOString()
      payload.publishedBy = ctx.auth.currentUser?.uid || null
    }

    // 1. Escribir primero en Firestore
    await setDoc(doc(ctx.db, 'platformTemplates', id), payload, { merge: true })
    await logPlatformAudit('template.update', `platformTemplates/${id}`, { status: updates.status })

    // 2. Solo tras éxito de Firestore se actualiza el store local
    if (idx >= 0) {
      current.templates[idx] = updated as CommercialTemplateItem
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar en Firestore.'
    console.error('Error persistiendo template en Firestore:', err)
    return { success: false, error }
  }
}

export async function updatePlanInStore(
  id: string,
  updates: Partial<TemplateTierPlan>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    const current = loadCommercialConfig()
    const idx = current.plans.findIndex((p) => p.id === id)
    const existing = idx >= 0 ? current.plans[idx] : {}
    const updated = { ...existing, ...updates }

    // Preferir guardado seguro server-side con auditoría atómica
    try {
      await gateway('platformGateway', {
        action: 'savePlan',
        plan: updated,
      })
    } catch {
      // Fallback directo a Firestore si gateway está en desarrollo local
      await setDoc(
        doc(ctx.db, 'platformPlans', id),
        {
          ...updated,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.auth.currentUser?.uid || null,
        },
        { merge: true },
      )
    }

    // Solo tras éxito en backend se actualiza la memoria
    if (idx >= 0) {
      current.plans[idx] = updated as TemplateTierPlan
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar plan en Firestore.'
    console.error('Error persistiendo plan en Firestore:', err)
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
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    // 1. Invocar acción en server-side con auditoría atómica
    try {
      await gateway('platformGateway', {
        action: 'publishPlan',
        planId,
        status: targetStatus,
      })
    } catch {
      const now = new Date().toISOString()
      const updatePayload: Record<string, unknown> = {
        status: targetStatus,
        updatedAt: now,
        updatedBy: ctx.auth.currentUser?.uid || null,
      }
      if (targetStatus === 'published') {
        updatePayload.publishedAt = now
        updatePayload.publishedBy = ctx.auth.currentUser?.uid || null
      }
      await setDoc(doc(ctx.db, 'platformPlans', planId), updatePayload, { merge: true })
      await logPlatformAudit(
        targetStatus === 'published' ? 'plan.publish' : 'plan.unpublish',
        `platformPlans/${planId}`,
        { status: targetStatus },
      )
    }

    // 2. Actualizar store solo tras confirmación
    const current = loadCommercialConfig()
    const idx = current.plans.findIndex((p) => p.id === planId)
    if (idx >= 0) {
      current.plans[idx] = {
        ...current.plans[idx],
        status: targetStatus,
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
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    try {
      await gateway('platformGateway', {
        action: 'savePlan',
        plan,
      })
    } catch {
      await setDoc(
        doc(ctx.db, 'platformPlans', plan.id),
        {
          ...plan,
          status: 'draft', // Nuevos planes siempre en draft
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.auth.currentUser?.uid || null,
        },
        { merge: true },
      )
    }

    const current = loadCommercialConfig()
    current.plans.push(plan)
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al crear plan en Firestore.'
    return { success: false, error }
  }
}

export async function deletePlanInStore(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    try {
      await gateway('platformGateway', {
        action: 'deletePlan',
        planId: id,
      })
    } catch {
      await deleteDoc(doc(ctx.db, 'platformPlans', id))
      await logPlatformAudit('plan.delete', `platformPlans/${id}`)
    }

    const current = loadCommercialConfig()
    current.plans = current.plans.filter((p) => p.id !== id)
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al eliminar plan en Firestore.'
    return { success: false, error }
  }
}

export async function updateExtraInStore(
  id: string,
  updates: Partial<CommercialExtraService>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    const current = loadCommercialConfig()
    const idx = current.extras.findIndex((e) => e.id === id)
    const existing = idx >= 0 ? current.extras[idx] : {}
    const updated = { ...existing, ...updates }

    await setDoc(
      doc(ctx.db, 'platformExtras', id),
      {
        ...updated,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.auth.currentUser?.uid || null,
      },
      { merge: true },
    )
    await logPlatformAudit('extra.update', `platformExtras/${id}`, { status: updates.status })

    if (idx >= 0) {
      current.extras[idx] = updated as CommercialExtraService
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar extra en Firestore.'
    return { success: false, error }
  }
}

export async function updateLandingContentInStore(
  updates: Partial<LandingContentConfig>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    const current = loadCommercialConfig()
    const updatedContent = { ...current.landingContent, ...updates }

    await setDoc(
      doc(ctx.db, 'platformConfig', 'publicLanding'),
      {
        ...updatedContent,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.auth.currentUser?.uid || null,
      },
      { merge: true },
    )
    await logPlatformAudit('landing.update', 'platformConfig/publicLanding')

    current.landingContent = updatedContent
    saveCommercialConfig(current)
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar contenido en Firestore.'
    return { success: false, error }
  }
}

export async function updateMediaAssetInStore(
  id: string,
  updates: Partial<MediaAssetItem>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) throw new Error('Firebase no conectado.')

    const current = loadCommercialConfig()
    const idx = current.mediaAssets.findIndex((m) => m.id === id)
    const existing = idx >= 0 ? current.mediaAssets[idx] : {}
    const updated = { ...existing, ...updates }

    await setDoc(
      doc(ctx.db, 'platformMedia', id),
      {
        ...updated,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.auth.currentUser?.uid || null,
      },
      { merge: true },
    )
    await logPlatformAudit('media.update', `platformMedia/${id}`)

    if (idx >= 0) {
      current.mediaAssets[idx] = updated as MediaAssetItem
      saveCommercialConfig(current)
    }
    return { success: true }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Error al guardar asset en Firestore.'
    return { success: false, error }
  }
}

// Hook reactivo consumido por la Landing Pública y por Admin
export function useCommercialConfig() {
  const [config, setConfig] = useState<StoredCommercialConfig>(() => loadCommercialConfig())

  useEffect(() => {
    // Si estamos en la ruta /admin, sincronizar la colección completa (draft + published)
    // Si estamos en la landing pública, consultar explícitamente solo status == 'published'
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      syncAdminAllFromFirestore().catch(() => undefined)
    } else {
      syncPublicPublishedFromFirestore().catch(() => undefined)
    }

    const handleUpdate = () => {
      setConfig(loadCommercialConfig())
    }
    window.addEventListener(EVENT_NAME, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  // Filtros de publicación para la web pública (solo mostrar 'published')
  const publishedTemplates = config.templates.filter((t) => t.status === 'published')
  const publishedPlansByTemplate = (templateKey: TemplateKey) =>
    config.plans.filter((p) => p.templateId === templateKey && p.status === 'published')
  const publishedExtras = config.extras.filter((e) => e.status === 'published')

  return {
    config,
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
    updateLandingContent: updateLandingContentInStore,
    updateMediaAsset: updateMediaAssetInStore,
    resetToDefaults: resetCommercialConfigToDefaults,
    seedDefaultsToFirestore,
  }
}
