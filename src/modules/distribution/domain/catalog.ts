import type { DistProduct, DistributionIndustryProfile, PresentationContentUnit, UnitType } from '../types.ts'

export const DISTRIBUTION_PROFILES: Array<{ id: DistributionIndustryProfile; label: string; categories: string[] }> = [
  { id: 'food', label: 'Alimentos', categories: ['Granos', 'Enlatados', 'Congelados', 'Otros'] },
  { id: 'beverages', label: 'Bebidas', categories: ['Agua', 'Gaseosas', 'Jugos', 'Otros'] },
  { id: 'cleaning', label: 'Limpieza', categories: ['Detergentes', 'Desinfectantes', 'Accesorios', 'Otros'] },
  { id: 'hardware', label: 'Ferretería', categories: ['Herramientas', 'Fijaciones', 'Materiales', 'Otros'] },
  { id: 'pharmacy', label: 'Farmacia', categories: ['Cuidado personal', 'Botiquín', 'Otros'] },
  { id: 'pets', label: 'Mascotas', categories: ['Alimento', 'Higiene', 'Accesorios', 'Otros'] },
  { id: 'stationery', label: 'Papelería', categories: ['Escritura', 'Papel', 'Oficina', 'Otros'] },
  { id: 'spare_parts', label: 'Repuestos', categories: ['Motor', 'Eléctrico', 'Accesorios', 'Otros'] },
  { id: 'mixed', label: 'Mixta / otros', categories: ['General', 'Otros'] },
]

export const SALE_UNIT_OPTIONS: Array<{ value: UnitType; label: string }> = [
  { value: 'unit', label: 'Unidad / pieza' },
  { value: 'package', label: 'Paquete / envase / caja' },
  { value: 'kg', label: 'Kilogramo a granel' },
]

export const CONTENT_UNIT_OPTIONS: Array<{ value: PresentationContentUnit; label: string }> = [
  { value: 'unit', label: 'unidades' }, { value: 'g', label: 'g' }, { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' }, { value: 'l', label: 'l' },
]

/** Product stock is always counted in its declared SKU unit. Content is a label, never a stock conversion. */
export function validateCatalogProduct(input: { name: string; category: string; unitType: UnitType; saleUnitLabel?: string; presentationContent?: { amount: number; unit: PresentationContentUnit } }): string | null {
  if (!input.name.trim() || input.name.trim().length > 100) return 'El nombre debe tener entre 1 y 100 caracteres.'
  if (!input.category.trim() || input.category.trim().length > 60) return 'La categoría debe tener entre 1 y 60 caracteres.'
  if (input.saleUnitLabel && (input.saleUnitLabel.trim().length > 24 || /[<>]/.test(input.saleUnitLabel) || /[^\p{L}\p{N} ._-]/u.test(input.saleUnitLabel) || (input.unitType === 'kg' && input.saleUnitLabel.trim().toLowerCase() !== 'kg'))) return 'La unidad de venta no es válida para este tipo de producto.'
  if (input.presentationContent && (!Number.isFinite(input.presentationContent.amount) || input.presentationContent.amount <= 0 || input.presentationContent.amount > 1_000_000)) return 'El contenido por presentación debe ser mayor que cero.'
  return null
}

export function profileSuggestions(profile: DistributionIndustryProfile) {
  return DISTRIBUTION_PROFILES.find(option => option.id === profile)?.categories ?? ['General', 'Otros']
}

export function mergeProfileCategories(current: Array<{ id: string; name: string; active: boolean }>, profile: DistributionIndustryProfile) {
  const next = [...current]
  for (const name of profileSuggestions(profile)) {
    if (!next.some(category => category.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      const id = `cat-${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}`
      next.push({ id, name, active: true })
    }
  }
  return next
}

/** Fictional samples are inserted only after the demo user explicitly asks to load them. */
export function demoProductsForProfile(profile: DistributionIndustryProfile): Array<Pick<DistProduct, 'id' | 'name' | 'category' | 'presentation' | 'unitType' | 'sku' | 'saleUnitLabel' | 'presentationContent' | 'referencePrice'>> {
  const row = (id: string, name: string, category: string, presentation: string, saleUnitLabel: string, amount: number, unit: PresentationContentUnit, referencePrice: number) => ({ id, name, category, presentation, unitType: 'package' as const, saleUnitLabel, presentationContent: { amount, unit }, sku: `DEMO-${id.toUpperCase()}`, referencePrice })
  const common = {
    food: [row('rice-bag', 'Arroz seleccionado', 'Granos', 'Bolsa de 5 kg', 'bolsa', 5, 'kg', 48), row('beans-can', 'Frijol en conserva', 'Enlatados', 'Lata individual', 'lata', 1, 'unit', 12), row('oil-bottle', 'Aceite vegetal', 'Aceites', 'Botella de 1 litro', 'botella', 1, 'l', 18)],
    beverages: [row('water-box', 'Agua sin gas', 'Agua', 'Caja de 12 botellas', 'caja', 12, 'unit', 48), row('juice-bottle', 'Jugo de durazno', 'Jugos', 'Botella de 1 litro', 'botella', 1, 'l', 14), row('soda-can', 'Gaseosa personal', 'Gaseosas', 'Lata individual', 'lata', 1, 'unit', 8)],
    cleaning: [row('detergent', 'Detergente líquido', 'Detergentes', 'Botella de 1 litro', 'botella', 1, 'l', 22), row('bleach', 'Lavandina', 'Desinfectantes', 'Envase de 2 litros', 'envase', 2, 'l', 16), row('sponge', 'Esponja multiuso', 'Accesorios', 'Pieza', 'pieza', 1, 'unit', 5)],
    hardware: [row('screw-box', 'Tornillo galvanizado', 'Fijaciones', 'Caja de 100 piezas', 'caja', 100, 'unit', 35), row('pliers', 'Alicate universal', 'Herramientas', 'Pieza', 'pieza', 1, 'unit', 42), row('paint-can', 'Pintura interior', 'Materiales', 'Lata de 1 litro', 'lata', 1, 'l', 38)],
    pharmacy: [row('bandages', 'Venda elástica', 'Botiquín', 'Paquete individual', 'paquete', 1, 'unit', 12), row('sanitizer', 'Alcohol antiséptico', 'Cuidado personal', 'Frasco de 500 ml', 'frasco', 500, 'ml', 16), row('gloves', 'Guantes descartables', 'Botiquín', 'Caja de 100 piezas', 'caja', 100, 'unit', 45)],
    pets: [row('pet-food', 'Alimento para perro', 'Alimento', 'Bolsa de 5 kg', 'bolsa', 5, 'kg', 95), row('cat-litter', 'Arena para gato', 'Higiene', 'Bolsa de 4 kg', 'bolsa', 4, 'kg', 50), row('pet-bowl', 'Plato para mascota', 'Accesorios', 'Pieza', 'pieza', 1, 'unit', 24)],
    stationery: [row('notebook', 'Cuaderno rayado', 'Papel', '100 hojas', 'cuaderno', 100, 'unit', 18), row('pen-box', 'Bolígrafo azul', 'Escritura', 'Caja de 12 piezas', 'caja', 12, 'unit', 30), row('folder', 'Archivador', 'Oficina', 'Pieza', 'pieza', 1, 'unit', 22)],
    spare_parts: [row('oil-filter', 'Filtro de aceite universal', 'Motor', 'Pieza', 'pieza', 1, 'unit', 55), row('fuse-box', 'Fusible automotriz', 'Eléctrico', 'Caja de 10 piezas', 'caja', 10, 'unit', 25), row('mirror', 'Espejo lateral', 'Accesorios', 'Pieza', 'pieza', 1, 'unit', 90)],
    mixed: [row('general-box', 'Producto empacado de muestra', 'General', 'Caja de 6 unidades', 'caja', 6, 'unit', 30), row('general-piece', 'Artículo individual', 'General', 'Pieza', 'pieza', 1, 'unit', 10), row('general-bulk', 'Producto a granel', 'Otros', 'Venta por kilogramo', 'kg', 1, 'kg', 15)],
  }
  return common[profile]
}

