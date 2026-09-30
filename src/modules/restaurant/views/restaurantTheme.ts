import type { CSSProperties } from 'react'
import { hexToRgb, readableForeground } from '../../../lib/tenantTheme'

export interface RestaurantThemeColors { primary: string; accent: string }

export const RESTAURANT_THEME_PRESETS: Array<RestaurantThemeColors & { id: string; name: string }> = [
  { id: 'pachax-light', name: 'PACHAX Light', primary: '#1769d2', accent: '#1687e8' },
  { id: 'navy', name: 'Azul marino', primary: '#173b70', accent: '#2f83c9' },
  { id: 'sage', name: 'Salvia', primary: '#17675d', accent: '#328d7f' },
  { id: 'terracotta', name: 'Terracota', primary: '#8d4335', accent: '#ba6b42' },
]

export const DEFAULT_RESTAURANT_THEME: RestaurantThemeColors = RESTAURANT_THEME_PRESETS[0]

export function validRestaurantColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value) && hexToRgb(value) !== null
}

function mix(hex: string, white: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const channel = (value: number) => Math.round(value * (1 - white) + 255 * white).toString(16).padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

function darken(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const channel = (value: number) => Math.round(value * factor).toString(16).padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

export function restaurantThemeStyle(colors: RestaurantThemeColors): CSSProperties {
  const primary = validRestaurantColor(colors.primary) ? colors.primary : DEFAULT_RESTAURANT_THEME.primary
  const accent = validRestaurantColor(colors.accent) ? colors.accent : DEFAULT_RESTAURANT_THEME.accent
  return {
    '--primary': primary,
    '--primary-foreground': readableForeground(primary),
    '--primary-hover': darken(primary, 0.88),
    '--primary-pressed': darken(primary, 0.76),
    '--primary-soft': mix(primary, 0.91),
    '--accent': accent,
    '--accent-foreground': readableForeground(accent),
    '--accent-soft': mix(accent, 0.92),
    '--background': mix(primary, 0.965),
    '--surface': '#ffffff',
    '--surface-secondary': mix(primary, 0.95),
    '--border': mix(primary, 0.82),
    '--rk-text': '#14243d',
    '--rk-muted': '#52627a',
  } as CSSProperties
}
