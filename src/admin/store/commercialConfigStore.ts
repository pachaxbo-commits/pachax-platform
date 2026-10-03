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

// Convertir los planes por plantilla a un arreglo plano
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

// Cargar configuración guardada o defaults
export function loadCommercialConfig(): StoredCommercialConfig {
  if (typeof window === 'undefined') return getDefaultConfig()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultConfig()
    const parsed = JSON.parse(raw) as Partial<StoredCommercialConfig>
    return {
      templates: parsed.templates || getDefaultConfig().templates,
      plans: parsed.plans || getDefaultConfig().plans,
      extras: parsed.extras || getDefaultConfig().extras,
      landingContent: parsed.landingContent || getDefaultConfig().landingContent,
      mediaAssets: parsed.mediaAssets || getDefaultConfig().mediaAssets,
      lastModified: parsed.lastModified || new Date().toISOString(),
    }
  } catch (err) {
    console.error('Error cargando configuración comercial:', err)
    return getDefaultConfig()
  }
}

// Guardar configuración y emitir evento
export function saveCommercialConfig(config: StoredCommercialConfig): void {
  if (typeof window === 'undefined') return
  try {
    config.lastModified = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    window.dispatchEvent(new Event(EVENT_NAME))
  } catch (err) {
    console.error('Error guardando configuración comercial:', err)
  }
}

// Restablecer a valores de fábrica
export function resetCommercialConfigToDefaults(): StoredCommercialConfig {
  const defaults = getDefaultConfig()
  saveCommercialConfig(defaults)
  return defaults
}

// Actualizadores individuales para el panel de administración
export function updateTemplateInStore(id: string, updates: Partial<CommercialTemplateItem>): void {
  const current = loadCommercialConfig()
  const idx = current.templates.findIndex((t) => t.id === id)
  if (idx >= 0) {
    current.templates[idx] = { ...current.templates[idx], ...updates }
    saveCommercialConfig(current)
  }
}

export function updatePlanInStore(id: string, updates: Partial<TemplateTierPlan>): void {
  const current = loadCommercialConfig()
  const idx = current.plans.findIndex((p) => p.id === id)
  if (idx >= 0) {
    current.plans[idx] = { ...current.plans[idx], ...updates }
    saveCommercialConfig(current)
  }
}

export function createPlanInStore(plan: TemplateTierPlan): void {
  const current = loadCommercialConfig()
  current.plans.push(plan)
  saveCommercialConfig(current)
}

export function deletePlanInStore(id: string): void {
  const current = loadCommercialConfig()
  current.plans = current.plans.filter((p) => p.id !== id)
  saveCommercialConfig(current)
}

export function updateExtraInStore(id: string, updates: Partial<CommercialExtraService>): void {
  const current = loadCommercialConfig()
  const idx = current.extras.findIndex((e) => e.id === id)
  if (idx >= 0) {
    current.extras[idx] = { ...current.extras[idx], ...updates }
    saveCommercialConfig(current)
  }
}

export function updateLandingContentInStore(updates: Partial<LandingContentConfig>): void {
  const current = loadCommercialConfig()
  current.landingContent = { ...current.landingContent, ...updates }
  saveCommercialConfig(current)
}

// Hook reactivo consumido por la Landing Pública y por Admin
export function useCommercialConfig() {
  const [config, setConfig] = useState<StoredCommercialConfig>(() => loadCommercialConfig())

  useEffect(() => {
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
    resetToDefaults: resetCommercialConfigToDefaults,
  }
}
