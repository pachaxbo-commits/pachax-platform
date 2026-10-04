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
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore'

const STORAGE_KEY = 'pachax_commercial_config_v1'
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

// 2. Textos editoriales iniciales de la landing
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
    { label: 'DISPONIBILIDAD', value: '99.9%', detail: 'Arquitectura distribuida en la nube' },
    { label: 'COBROS', value: '< 2 seg', detail: 'Efectivo, QR instantáneo y tarjetas' },
    { label: 'ARQUEO', value: '100% Ciego', detail: 'Cierre de caja sin descuadres en turnos' },
    { label: 'SEGURIDAD', value: 'Aislamiento', detail: 'Datos blindados e independientes por tenant' },
  ],
  sectionTitles: {
    catalog: 'Plantillas especializadas por modelo de negocio',
    catalogSubtitle: 'Una única experiencia funcional canónica compartida entre producción, PACHAX Studio y demostración pública. Sin interfaces paralelas ni código duplicado.',
    pricing: 'Planes adaptados a la escala real de tu empresa',
    pricingSubtitle: 'Sin comisiones ocultas por venta ni letra chica. Elige la plantilla de tu rubro y selecciona el nivel operativo que necesitas para empezar.',
    onboarding: 'Configura tu empresa en 5 minutos, sin complicaciones',
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

// Memoria activa y caché local de lectura instantánea
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

// Sincronización transparente con Firestore
let isSyncingWithFirestore = false

export async function syncFromFirestore(): Promise<void> {
  if (isSyncingWithFirestore || typeof window === 'undefined') return
  isSyncingWithFirestore = true

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

    if (templatesSnap.status === 'fulfilled' && !templatesSnap.value.empty) {
      current.templates = templatesSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialTemplateItem,
      )
      changed = true
    }

    if (plansSnap.status === 'fulfilled' && !plansSnap.value.empty) {
      current.plans = plansSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as TemplateTierPlan,
      )
      changed = true
    }

    if (extrasSnap.status === 'fulfilled' && !extrasSnap.value.empty) {
      current.extras = extrasSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as CommercialExtraService,
      )
      changed = true
    }

    if (mediaSnap.status === 'fulfilled' && !mediaSnap.value.empty) {
      current.mediaAssets = mediaSnap.value.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as MediaAssetItem,
      )
      changed = true
    }

    if (changed) {
      saveCommercialConfig(current)
    }
  } catch (err) {
    console.warn('Sincronización Firestore pendiente o sin red:', err)
  } finally {
    isSyncingWithFirestore = false
  }
}

// Sembrar valores por defecto en Firestore si están vacíos
export async function seedDefaultsToFirestore(): Promise<{ success: boolean; message: string }> {
  try {
    const ctx = await getFirebaseContext()
    if (!ctx) return { success: false, message: 'Firebase no configurado.' }

    const defaults = getDefaultConfig()
    const now = new Date().toISOString()
    const userUid = ctx.auth.currentUser?.uid || 'system_bootstrap'

    // 1. Landing
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

    // 2. Templates
    for (const item of defaults.templates) {
      await setDoc(doc(ctx.db, 'platformTemplates', item.id), {
        ...item,
        status: 'published',
        publishedAt: now,
        publishedBy: userUid,
        updatedAt: now,
      }, { merge: true })
    }

    // 3. Plans
    for (const item of defaults.plans) {
      await setDoc(doc(ctx.db, 'platformPlans', item.id), {
        ...item,
        status: 'published',
        publishedAt: now,
        publishedBy: userUid,
        updatedAt: now,
      }, { merge: true })
    }

    // 4. Extras
    for (const item of defaults.extras) {
      await setDoc(doc(ctx.db, 'platformExtras', item.id), {
        ...item,
        status: 'published',
        publishedAt: now,
        publishedBy: userUid,
        updatedAt: now,
      }, { merge: true })
    }

    // 5. Media
    for (const item of defaults.mediaAssets) {
      await setDoc(doc(ctx.db, 'platformMedia', item.id), {
        ...item,
        status: 'published',
        publishedAt: now,
        publishedBy: userUid,
        updatedAt: now,
      }, { merge: true })
    }

    await logPlatformAudit('platform.config.seed', 'platformConfig/publicLanding', { count: defaults.templates.length })
    return { success: true, message: 'Configuraciones sembradas en Firestore correctamente.' }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Error sembrando datos.' }
  }
}

// Restablecer a valores de fábrica
export function resetCommercialConfigToDefaults(): StoredCommercialConfig {
  const defaults = getDefaultConfig()
  saveCommercialConfig(defaults)
  return defaults
}

// Actualizadores individuales para el panel de administración
export async function updateTemplateInStore(id: string, updates: Partial<CommercialTemplateItem>): Promise<void> {
  const current = loadCommercialConfig()
  const idx = current.templates.findIndex((t) => t.id === id)
  if (idx >= 0) {
    const updated = { ...current.templates[idx], ...updates }
    current.templates[idx] = updated
    saveCommercialConfig(current)

    // Persistencia asíncrona en Firestore
    try {
      const ctx = await getFirebaseContext()
      if (ctx) {
        const payload: Record<string, unknown> = {
          ...updated,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.auth.currentUser?.uid || null,
        }
        if (updates.status === 'published') {
          payload.publishedAt = new Date().toISOString()
          payload.publishedBy = ctx.auth.currentUser?.uid || null
        }
        await setDoc(doc(ctx.db, 'platformTemplates', id), payload, { merge: true })
        await logPlatformAudit('template.update', `platformTemplates/${id}`, { status: updates.status })
      }
    } catch (err) {
      console.warn('Error persistiendo template en Firestore:', err)
    }
  }
}

export async function updatePlanInStore(id: string, updates: Partial<TemplateTierPlan>): Promise<void> {
  const current = loadCommercialConfig()
  const idx = current.plans.findIndex((p) => p.id === id)
  if (idx >= 0) {
    const updated = { ...current.plans[idx], ...updates }
    current.plans[idx] = updated
    saveCommercialConfig(current)

    try {
      const ctx = await getFirebaseContext()
      if (ctx) {
        const payload: Record<string, unknown> = {
          ...updated,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.auth.currentUser?.uid || null,
        }
        if (updates.status === 'published') {
          payload.publishedAt = new Date().toISOString()
          payload.publishedBy = ctx.auth.currentUser?.uid || null
        }
        await setDoc(doc(ctx.db, 'platformPlans', id), payload, { merge: true })
        await logPlatformAudit('plan.update', `platformPlans/${id}`, { status: updates.status })
      }
    } catch (err) {
      console.warn('Error persistiendo plan en Firestore:', err)
    }
  }
}

export async function createPlanInStore(plan: TemplateTierPlan): Promise<void> {
  const current = loadCommercialConfig()
  current.plans.push(plan)
  saveCommercialConfig(current)

  try {
    const ctx = await getFirebaseContext()
    if (ctx) {
      const payload: Record<string, unknown> = {
        ...plan,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.auth.currentUser?.uid || null,
      }
      if (plan.status === 'published') {
        payload.publishedAt = new Date().toISOString()
        payload.publishedBy = ctx.auth.currentUser?.uid || null
      }
      await setDoc(doc(ctx.db, 'platformPlans', plan.id), payload, { merge: true })
      await logPlatformAudit('plan.create', `platformPlans/${plan.id}`)
    }
  } catch (err) {
    console.warn('Error creando plan en Firestore:', err)
  }
}

export async function deletePlanInStore(id: string): Promise<void> {
  const current = loadCommercialConfig()
  current.plans = current.plans.filter((p) => p.id !== id)
  saveCommercialConfig(current)

  try {
    const ctx = await getFirebaseContext()
    if (ctx) {
      await deleteDoc(doc(ctx.db, 'platformPlans', id))
      await logPlatformAudit('plan.delete', `platformPlans/${id}`)
    }
  } catch (err) {
    console.warn('Error eliminando plan en Firestore:', err)
  }
}

export async function updateExtraInStore(id: string, updates: Partial<CommercialExtraService>): Promise<void> {
  const current = loadCommercialConfig()
  const idx = current.extras.findIndex((e) => e.id === id)
  if (idx >= 0) {
    const updated = { ...current.extras[idx], ...updates }
    current.extras[idx] = updated
    saveCommercialConfig(current)

    try {
      const ctx = await getFirebaseContext()
      if (ctx) {
        const payload: Record<string, unknown> = {
          ...updated,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.auth.currentUser?.uid || null,
        }
        if (updates.status === 'published') {
          payload.publishedAt = new Date().toISOString()
          payload.publishedBy = ctx.auth.currentUser?.uid || null
        }
        await setDoc(doc(ctx.db, 'platformExtras', id), payload, { merge: true })
        await logPlatformAudit('extra.update', `platformExtras/${id}`, { status: updates.status })
      }
    } catch (err) {
      console.warn('Error persistiendo servicio extra en Firestore:', err)
    }
  }
}

export async function updateLandingContentInStore(updates: Partial<LandingContentConfig>): Promise<void> {
  const current = loadCommercialConfig()
  current.landingContent = { ...current.landingContent, ...updates }
  saveCommercialConfig(current)

  try {
    const ctx = await getFirebaseContext()
    if (ctx) {
      await setDoc(
        doc(ctx.db, 'platformConfig', 'publicLanding'),
        {
          ...current.landingContent,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.auth.currentUser?.uid || null,
        },
        { merge: true },
      )
      await logPlatformAudit('landing.update', 'platformConfig/publicLanding')
    }
  } catch (err) {
    console.warn('Error persistiendo contenido web en Firestore:', err)
  }
}

export async function updateMediaAssetInStore(id: string, updates: Partial<MediaAssetItem>): Promise<void> {
  const current = loadCommercialConfig()
  const idx = current.mediaAssets.findIndex((m) => m.id === id)
  if (idx >= 0) {
    const updated = { ...current.mediaAssets[idx], ...updates }
    current.mediaAssets[idx] = updated
    saveCommercialConfig(current)

    try {
      const ctx = await getFirebaseContext()
      if (ctx) {
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
      }
    } catch (err) {
      console.warn('Error persistiendo media asset en Firestore:', err)
    }
  }
}

// Hook reactivo consumido por la Landing Pública y por Admin
export function useCommercialConfig() {
  const [config, setConfig] = useState<StoredCommercialConfig>(() => loadCommercialConfig())

  useEffect(() => {
    // Sincronizar en segundo plano si Firestore está disponible
    syncFromFirestore().catch(() => undefined)

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
    createPlan: createPlanInStore,
    deletePlan: deletePlanInStore,
    updateExtra: updateExtraInStore,
    updateLandingContent: updateLandingContentInStore,
    updateMediaAsset: updateMediaAssetInStore,
    resetToDefaults: resetCommercialConfigToDefaults,
    seedDefaultsToFirestore,
  }
}
