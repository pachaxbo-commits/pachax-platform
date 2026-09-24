import type { BusinessTypeTheme } from '../config/businessTypes'

/**
 * Convierte un color hex a RGB components.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '').trim()
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16)
    const g = parseInt(cleaned[1] + cleaned[1], 16)
    const b = parseInt(cleaned[2] + cleaned[2], 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    return { r, g, b }
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16)
    const g = parseInt(cleaned.slice(2, 4), 16)
    const b = parseInt(cleaned.slice(4, 6), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    return { r, g, b }
  }
  return null
}

/** Escoge el texto con mejor contraste WCAG entre blanco y azul oscuro. */
export function readableForeground(hex: string): '#ffffff' | '#0f172a' {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#0f172a'
  const channel = (value: number) => { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4 }
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  const dark = 0.2126 * channel(15) + 0.7152 * channel(23) + 0.0722 * channel(42)
  return (luminance + 0.05) / (dark + 0.05) > 1.05 / (luminance + 0.05) ? '#0f172a' : '#ffffff'
}

/**
 * Genera un tono hover (ligeramente más oscuro) para un color hex.
 */
export function computeHoverColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.max(0, Math.floor(rgb.r * 0.82))
  const g = Math.max(0, Math.floor(rgb.g * 0.82))
  const b = Math.max(0, Math.floor(rgb.b * 0.82))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Genera un tono soft/pastel (muy claro) mezclando con blanco.
 */
export function computeSoftColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.min(255, Math.floor(255 * 0.92 + rgb.r * 0.08))
  const g = Math.min(255, Math.floor(255 * 0.92 + rgb.g * 0.08))
  const b = Math.min(255, Math.floor(255 * 0.92 + rgb.b * 0.08))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export interface CanonicalThemeTokens {
  primary: string
  primaryHover: string
  primarySoft: string
  accent: string
  accentSoft: string
  background: string
  surface: string
  sidebar?: string
}

export function buildThemeTokens(custom: {
  primary: string
  accent: string
  background: string
  surface: string
  sidebar?: string
}): CanonicalThemeTokens {
  return {
    primary: custom.primary,
    primaryHover: computeHoverColor(custom.primary),
    primarySoft: computeSoftColor(custom.primary),
    accent: custom.accent,
    accentSoft: computeSoftColor(custom.accent),
    background: custom.background,
    surface: custom.surface,
    sidebar: custom.sidebar,
  }
}

export function applyCanonicalThemeTokens(targetDoc: Document, tokens: CanonicalThemeTokens) {
  const root = targetDoc.documentElement
  root.style.setProperty('--primary', tokens.primary)
  root.style.setProperty('--primary-foreground', readableForeground(tokens.primary))
  root.style.setProperty('--primary-hover', tokens.primaryHover)
  root.style.setProperty('--primary-soft', tokens.primarySoft)
  root.style.setProperty('--accent', tokens.accent)
  root.style.setProperty('--accent-foreground', readableForeground(tokens.accent))
  root.style.setProperty('--accent-soft', tokens.accentSoft)
  root.style.setProperty('--background', tokens.background)
  root.style.setProperty('--surface', tokens.surface)
  if (tokens.sidebar) {
    root.style.setProperty('--sidebar', tokens.sidebar)
  }
  if (targetDoc.body) {
    targetDoc.body.style.backgroundColor = tokens.background
  }
}

/**
 * Aplica el tema del tenant sobre las variables CSS de la aplicacion.
 * El tema siempre es claro: solo cambian marca, acento y fondo base.
 */
export function applyTenantTheme(theme: BusinessTypeTheme, overrides?: { primary?: string; accent?: string }) {
  const root = document.documentElement
  const primary = overrides?.primary || theme.primary
  const accent = overrides?.accent || theme.accent

  root.style.setProperty('--primary', primary)
  root.style.setProperty('--primary-foreground', readableForeground(primary))
  root.style.setProperty('--primary-hover', theme.primaryHover)
  root.style.setProperty('--primary-soft', theme.primarySoft)
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-foreground', readableForeground(accent))
  root.style.setProperty('--accent-soft', theme.accentSoft)
  root.style.setProperty('--background', theme.background)
  root.style.setProperty('--surface', theme.surface)
  document.body.style.backgroundColor = theme.background
}
