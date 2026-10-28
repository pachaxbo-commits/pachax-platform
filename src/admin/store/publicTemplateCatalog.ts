import type { CommercialTemplateItem } from '../types.ts'
import { mergeOfficialTemplates } from './templateDefaults.ts'

export type PublicTemplateCatalogResult =
  | { kind: 'available'; templates: readonly CommercialTemplateItem[] }
  | { kind: 'unavailable' }

export type PublicCatalogRequestStatus = 'loading' | 'ready' | 'error'

export interface PublicTemplatePresentation {
  templates: CommercialTemplateItem[]
  source: 'editorial-reference' | 'server-confirmed'
  confirmedEmpty: boolean
}

/**
 * Resolve public template cards without treating an unavailable gateway as an
 * authoritative empty publication. The fallback is the static editorial
 * catalog only; plans, extras, drafts, and private Admin fields are not read.
 */
export function resolvePublicTemplateCatalog(result: PublicTemplateCatalogResult): CommercialTemplateItem[] {
  const source = result.kind === 'available'
    ? result.templates
    : mergeOfficialTemplates([]).map((template) => ({
        ...template,
        commercialMode: ['restaurant', 'distribution', 'nightclub'].includes(template.id) ? 'specialized' as const : 'self_service' as const,
        commercialAvailability: 'coming_soon' as const,
        implementationBasePriceUSD: null,
      }))

  return source
    .filter((template) => template.status === 'published')
    .map((template) => ({
      ...template,
      bullets: [...template.bullets],
      features: [...template.features],
      visualSlot: { ...template.visualSlot },
    }))
}

/**
 * Keep the approved editorial cards visible until the first authoritative
 * response arrives. Once the server answers, even a valid empty list is final
 * and must never be replaced by local templates.
 */
export function resolvePublicTemplatePresentation(
  status: PublicCatalogRequestStatus,
  hasReceivedCatalog: boolean,
  serverTemplates: readonly CommercialTemplateItem[],
): PublicTemplatePresentation {
  const useEditorialReference = !hasReceivedCatalog && status !== 'ready'
  if (useEditorialReference) {
    return {
      templates: resolvePublicTemplateCatalog({ kind: 'unavailable' }),
      source: 'editorial-reference',
      confirmedEmpty: false,
    }
  }

  return {
    templates: [...serverTemplates],
    source: 'server-confirmed',
    confirmedEmpty: status === 'ready' && serverTemplates.length === 0,
  }
}
