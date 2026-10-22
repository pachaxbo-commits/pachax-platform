export interface BrandPalette {
  id: string
  name: string
  primary: string
  accent: string
}

/** Paletas aptas para texto blanco en el color principal. */
export const BRAND_PALETTES = [
  { id: 'sapphire', name: 'Zafiro & Cian', primary: '#2563EB', accent: '#0EA5A8' },
  { id: 'emerald', name: 'Esmeralda & Ámbar', primary: '#0F766E', accent: '#F59E0B' },
  { id: 'slate', name: 'Carbón & Azul', primary: '#1E293B', accent: '#3B82F6' },
  { id: 'amber', name: 'Ámbar & Café', primary: '#B45309', accent: '#D97706' },
] as const satisfies readonly BrandPalette[]

export function findBrandPalette(primary: string, accent: string): BrandPalette | undefined {
  return BRAND_PALETTES.find(palette => palette.primary.toLowerCase() === primary.toLowerCase()
    && palette.accent.toLowerCase() === accent.toLowerCase())
}
