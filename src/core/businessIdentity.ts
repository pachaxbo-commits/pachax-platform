/**
 * Canonical Business Identity & Document Context for PACHAX Platform.
 * Reusable across all business templates: restaurant_pos, hamburger_shop,
 * nightclub_lounge, route_distribution, gelateria_weight_cafe.
 */

export interface BusinessIdentity {
  /** Nombre comercial visible para clientes y comprobantes (ej. "La Trattoria") */
  tradeName: string
  /** Razón social o denominación legal opcional (ej. "Gastronomía del Sur S.R.L.") */
  legalName?: string
  /** URL pública o Storage del logotipo de la empresa */
  logoUrl?: string
  /** Color primario de marca (#RRGGBB) */
  primaryColor: string
  /** Color secundario o de acento (#RRGGBB) */
  accentColor: string
  /** Teléfono de contacto / atención */
  phone?: string
  /** Teléfono o enlace para WhatsApp */
  whatsapp?: string
  /** Correo comercial de contacto */
  email?: string
  /** Dirección física del establecimiento o casa matriz */
  address?: string
  /** Ciudad o localidad */
  city?: string
  /** Número de Identificación Tributaria o Registro Fiscal (NIT / RUT) */
  taxId?: string
  /** Sitio web o catálogo digital */
  website?: string

  // --- Configuración Documental (Recibos, Tickets, Comprobantes) ---
  /** Encabezado personalizado de comprobante (ej. "¡Bienvenidos a nuestro salón!") */
  receiptHeader?: string
  /** Mensaje de pie de recibo (ej. "Gracias por su preferencia · Vuelva pronto") */
  receiptFooter?: string
  /** Mostrar logotipo en el recibo (si está disponible) */
  showLogo: boolean
  /** Mostrar dirección en el encabezado del comprobante */
  showAddress: boolean
  /** Mostrar teléfonos / WhatsApp en el comprobante */
  showPhone: boolean
  /** Mostrar NIT / Identificación fiscal en el comprobante */
  showTaxId: boolean
  /** Mostrar discretamente la leyenda "Gestionado con PACHAX" */
  showManagedBy: boolean
}

export interface BusinessDocumentContext {
  companyName: string
  legalName?: string
  logoUrl?: string
  primaryColor: string
  accentColor: string
  taxId?: string
  address?: string
  city?: string
  phone?: string
  whatsapp?: string
  email?: string
  website?: string
  receiptHeader?: string
  receiptFooter?: string
  showLogo: boolean
  showAddress: boolean
  showPhone: boolean
  showTaxId: boolean
  showManagedBy: boolean
  formattedHeaderLines: string[]
  formattedContactLine?: string
  branchName?: string
}

export const DEFAULT_BUSINESS_IDENTITY: BusinessIdentity = Object.freeze({
  tradeName: 'Mi Empresa',
  legalName: '',
  logoUrl: '',
  primaryColor: '#20383a',
  accentColor: '#b58a55',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  taxId: '',
  website: '',
  receiptHeader: '',
  receiptFooter: '¡Gracias por su preferencia!',
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showTaxId: true,
  showManagedBy: true,
})

/**
 * Normaliza cualquier entidad de Tenant, branding o mock a la estructura canónica BusinessIdentity.
 * Garantiza retrocompatibilidad con tenant.branding y tenant.name existentes.
 */
export function normalizeBusinessIdentity(source?: any): BusinessIdentity {
  if (!source || typeof source !== 'object') {
    return { ...DEFAULT_BUSINESS_IDENTITY }
  }

  const existingIdentity: Partial<BusinessIdentity> = source.businessIdentity || (source.tradeName !== undefined ? source : {})
  const branding = source.branding || {}

  const tradeName = (
    existingIdentity.tradeName ||
    source.tradeName ||
    source.name ||
    source.companyName ||
    DEFAULT_BUSINESS_IDENTITY.tradeName
  ).trim()

  const primaryColor = (
    existingIdentity.primaryColor ||
    branding.primary ||
    source.primaryColor ||
    DEFAULT_BUSINESS_IDENTITY.primaryColor
  ).toLowerCase()

  const accentColor = (
    existingIdentity.accentColor ||
    branding.accent ||
    source.accentColor ||
    DEFAULT_BUSINESS_IDENTITY.accentColor
  ).toLowerCase()

  const logoUrl = (
    existingIdentity.logoUrl !== undefined
      ? existingIdentity.logoUrl
      : branding.logoUrl || source.logoUrl || ''
  ).trim()

  const showLogo = existingIdentity.showLogo !== undefined
    ? Boolean(existingIdentity.showLogo)
    : source.showLogo !== undefined
    ? Boolean(source.showLogo)
    : true

  const showAddress = existingIdentity.showAddress !== undefined
    ? Boolean(existingIdentity.showAddress)
    : source.showAddress !== undefined
    ? Boolean(source.showAddress)
    : true

  const showPhone = existingIdentity.showPhone !== undefined
    ? Boolean(existingIdentity.showPhone)
    : source.showPhone !== undefined
    ? Boolean(source.showPhone)
    : true

  const showTaxId = existingIdentity.showTaxId !== undefined
    ? Boolean(existingIdentity.showTaxId)
    : source.showTaxId !== undefined
    ? Boolean(source.showTaxId)
    : true

  const showManagedBy = existingIdentity.showManagedBy !== undefined
    ? Boolean(existingIdentity.showManagedBy)
    : source.showManagedBy !== undefined
    ? Boolean(source.showManagedBy)
    : true

  return {
    tradeName,
    legalName: (existingIdentity.legalName || source.legalName || '').trim(),
    logoUrl: logoUrl || undefined,
    primaryColor: /^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : DEFAULT_BUSINESS_IDENTITY.primaryColor,
    accentColor: /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : DEFAULT_BUSINESS_IDENTITY.accentColor,
    phone: (existingIdentity.phone || source.phone || '').trim(),
    whatsapp: (existingIdentity.whatsapp || source.whatsapp || '').trim(),
    email: (existingIdentity.email || source.email || source.ownerEmail || '').trim(),
    address: (existingIdentity.address || source.address || '').trim(),
    city: (existingIdentity.city || source.city || '').trim(),
    taxId: (existingIdentity.taxId || source.taxId || '').trim(),
    website: (existingIdentity.website || source.website || '').trim(),
    receiptHeader: (existingIdentity.receiptHeader || source.receiptHeader || '').trim(),
    receiptFooter: (
      existingIdentity.receiptFooter !== undefined
        ? existingIdentity.receiptFooter
        : source.receiptFooter !== undefined
        ? source.receiptFooter
        : DEFAULT_BUSINESS_IDENTITY.receiptFooter
    ).trim(),
    showLogo,
    showAddress,
    showPhone,
    showTaxId,
    showManagedBy,
  }
}

/**
 * Transforma un BusinessIdentity o Tenant en el contexto documental estándar para
 * tickets térmicos, recibos digitales, cierre de caja y reportes.
 */
export function buildBusinessDocumentContext(
  source?: any,
  overrides?: { branchName?: string; companyName?: string; logoUrl?: string }
): BusinessDocumentContext {
  const id = normalizeBusinessIdentity(source)
  if (overrides?.companyName) id.tradeName = overrides.companyName
  if (overrides?.logoUrl) id.logoUrl = overrides.logoUrl

  const headerLines: string[] = []

  if (id.receiptHeader) {
    headerLines.push(id.receiptHeader)
  }

  if (id.showTaxId && id.taxId) {
    headerLines.push(`NIT: ${id.taxId}`)
  }

  if (id.showAddress && id.address) {
    const loc = id.city ? `${id.address}, ${id.city}` : id.address
    headerLines.push(loc)
  }

  const contacts: string[] = []
  if (id.showPhone) {
    if (id.phone) contacts.push(`Tel: ${id.phone}`)
    if (id.whatsapp && id.whatsapp !== id.phone) contacts.push(`WhatsApp: ${id.whatsapp}`)
  }
  const formattedContactLine = contacts.length > 0 ? contacts.join(' · ') : undefined
  if (formattedContactLine) {
    headerLines.push(formattedContactLine)
  }

  return {
    companyName: id.tradeName,
    legalName: id.legalName || undefined,
    logoUrl: id.showLogo && id.logoUrl ? id.logoUrl : undefined,
    branchName: overrides?.branchName,
    primaryColor: id.primaryColor,
    accentColor: id.accentColor,
    taxId: id.showTaxId && id.taxId ? id.taxId : undefined,
    address: id.showAddress && id.address ? id.address : undefined,
    city: id.city || undefined,
    phone: id.showPhone && id.phone ? id.phone : undefined,
    whatsapp: id.showPhone && id.whatsapp ? id.whatsapp : undefined,
    email: id.email || undefined,
    website: id.website || undefined,
    receiptHeader: id.receiptHeader || undefined,
    receiptFooter: id.receiptFooter || undefined,
    showLogo: id.showLogo,
    showAddress: id.showAddress,
    showPhone: id.showPhone,
    showTaxId: id.showTaxId,
    showManagedBy: id.showManagedBy,
    formattedHeaderLines: headerLines,
    formattedContactLine,
  }
}

/**
 * Validador estricto para frontend y backend de BusinessIdentity.
 */
export function validateBusinessIdentity(input: unknown): {
  valid: boolean
  errors: string[]
  sanitized: BusinessIdentity
} {
  const errors: string[] = []
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Estructura de identidad comercial inválida.'], sanitized: { ...DEFAULT_BUSINESS_IDENTITY } }
  }

  const raw = input as Record<string, unknown>
  const tradeName = typeof raw.tradeName === 'string' ? raw.tradeName.trim().replace(/\s+/g, ' ') : ''
  if (!tradeName || tradeName.length < 2 || tradeName.length > 100) {
    errors.push('El nombre comercial debe tener entre 2 y 100 caracteres.')
  }

  const legalName = typeof raw.legalName === 'string' ? raw.legalName.trim().slice(0, 120) : ''
  const logoUrl = typeof raw.logoUrl === 'string' ? raw.logoUrl.trim() : ''
  if (logoUrl.startsWith('data:image') && logoUrl.length > 1000) {
    errors.push('No se permite guardar imágenes en base64 en la base de datos. Utiliza el cargador de logos.')
  }

  let primaryColor = '#20383a'
  if (raw.primaryColor !== undefined) {
    if (typeof raw.primaryColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.primaryColor)) {
      errors.push('El color principal debe ser un código hexadecimal válido (#RRGGBB).')
    } else {
      primaryColor = raw.primaryColor.toLowerCase()
    }
  }

  let accentColor = '#b58a55'
  if (raw.accentColor !== undefined) {
    if (typeof raw.accentColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.accentColor)) {
      errors.push('El color de acento debe ser un código hexadecimal válido (#RRGGBB).')
    } else {
      accentColor = raw.accentColor.toLowerCase()
    }
  }

  // WCAG AA contrast check on primary color with white text
  const channels = primaryColor.slice(1).match(/../g)?.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) || [0, 0, 0]
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  if (1.05 / (luminance + 0.05) < 4.5) {
    errors.push('El color principal requiere mayor contraste con texto blanco (WCAG AA).')
  }

  const phone = typeof raw.phone === 'string' ? raw.phone.trim().slice(0, 30) : ''
  const whatsapp = typeof raw.whatsapp === 'string' ? raw.whatsapp.trim().slice(0, 30) : ''
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase().slice(0, 100) : ''
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('El formato de correo comercial es inválido.')
  }

  const address = typeof raw.address === 'string' ? raw.address.trim().slice(0, 200) : ''
  const city = typeof raw.city === 'string' ? raw.city.trim().slice(0, 80) : ''
  const taxId = typeof raw.taxId === 'string' ? raw.taxId.trim().slice(0, 40) : ''
  const website = typeof raw.website === 'string' ? raw.website.trim().slice(0, 150) : ''
  const receiptHeader = typeof raw.receiptHeader === 'string' ? raw.receiptHeader.trim().slice(0, 120) : ''
  const receiptFooter = typeof raw.receiptFooter === 'string' ? raw.receiptFooter.trim().slice(0, 120) : '¡Gracias por su preferencia!'

  const showLogo = raw.showLogo !== undefined ? Boolean(raw.showLogo) : true
  const showAddress = raw.showAddress !== undefined ? Boolean(raw.showAddress) : true
  const showPhone = raw.showPhone !== undefined ? Boolean(raw.showPhone) : true
  const showTaxId = raw.showTaxId !== undefined ? Boolean(raw.showTaxId) : true
  const showManagedBy = raw.showManagedBy !== undefined ? Boolean(raw.showManagedBy) : true

  const sanitized: BusinessIdentity = {
    tradeName: tradeName || 'Mi Empresa',
    legalName: legalName || undefined,
    logoUrl: logoUrl || undefined,
    primaryColor,
    accentColor,
    phone: phone || undefined,
    whatsapp: whatsapp || undefined,
    email: email || undefined,
    address: address || undefined,
    city: city || undefined,
    taxId: taxId || undefined,
    website: website || undefined,
    receiptHeader: receiptHeader || undefined,
    receiptFooter: receiptFooter || undefined,
    showLogo,
    showAddress,
    showPhone,
    showTaxId,
    showManagedBy,
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  }
}
