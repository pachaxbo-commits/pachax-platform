import type { StudioBranding } from './brandingTypes'
import type { Tenant } from '../../core/platform'

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
 * Aplica los tokens visuales como variables CSS en el contenedor de previsualización.
 */
export function applyStudioThemeTokens(element: HTMLElement, branding: StudioBranding): void {
  element.style.setProperty('--studio-primary', branding.primaryColor)
  element.style.setProperty('--studio-sidebar', branding.sidebarColor)
  element.style.setProperty('--studio-accent', branding.accentColor)
  element.style.setProperty('--studio-bg', branding.backgroundColor)
  element.style.setProperty('--studio-surface', branding.surfaceColor)
}
