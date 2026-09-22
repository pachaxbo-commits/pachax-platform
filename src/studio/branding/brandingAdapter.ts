import type { StudioBranding } from './brandingTypes'
import type { Tenant } from '../../core/platform'
import { buildThemeTokens, applyCanonicalThemeTokens, type CanonicalThemeTokens } from '../../lib/tenantTheme'

/**
 * Adaptador para transformar el branding de un Tenant a la estructura visual de Studio,
 * manteniendo compatibilidad sin acoplar Studio a Firebase ni al backend.
 */
export function tenantBrandingToStudio(tenant: Pick<Tenant, 'name' | 'branding'>): StudioBranding {
  return {
    companyName: tenant.name || 'Empresa',
    logoUrl: tenant.branding?.logoUrl,
    primaryColor: tenant.branding?.primary || '#1E3A8A',
    sidebarColor: '#F8FAFC',
    accentColor: tenant.branding?.accent || '#0D9488',
    backgroundColor: '#F8FAFC',
    surfaceColor: '#FFFFFF',
    styleTheme: 'clean',
  }
}

/**
 * Convierte el branding de Studio al formato canónico Tenant.branding
 */
export function studioToTenantBranding(branding: StudioBranding): Tenant['branding'] {
  return {
    primary: branding.primaryColor,
    accent: branding.accentColor,
    logoUrl: branding.logoUrl,
  }
}

/**
 * Transforma StudioBranding en el conjunto de tokens CSS canónicos de PACHAX.
 */
export function studioBrandingToTokens(branding: StudioBranding): CanonicalThemeTokens {
  return buildThemeTokens({
    primary: branding.primaryColor,
    accent: branding.accentColor,
    background: branding.backgroundColor,
    surface: branding.surfaceColor,
    sidebar: branding.sidebarColor,
  })
}

/**
 * Aplica los tokens canónicos reales como variables CSS (--primary, --primary-hover, etc.)
 * en el documento o elemento de previsualización.
 */
export function applyStudioThemeTokens(target: HTMLElement | Document, branding: StudioBranding): void {
  const doc = 'documentElement' in target ? target : target.ownerDocument || document
  const tokens = studioBrandingToTokens(branding)
  applyCanonicalThemeTokens(doc, tokens)
}
