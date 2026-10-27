import type { CommercialTemplateItem } from '../types.ts'
import { mergeOfficialTemplates } from './templateDefaults.ts'

export type PublicTemplateCatalogResult =
  | { kind: 'available'; templates: readonly CommercialTemplateItem[] }
  | { kind: 'unavailable' }

/**
 * Resolve public template cards without treating an unavailable gateway as an
 * authoritative empty publication. The fallback is the static editorial
 * catalog only; plans, extras, drafts, and private Admin fields are not read.
 */
export function resolvePublicTemplateCatalog(result: PublicTemplateCatalogResult): CommercialTemplateItem[] {
  const source = result.kind === 'available'
    ? result.templates
    : mergeOfficialTemplates([])

  return source
    .filter((template) => template.status === 'published')
    .map((template) => ({
      ...template,
      bullets: [...template.bullets],
      features: [...template.features],
      visualSlot: { ...template.visualSlot },
    }))
}
