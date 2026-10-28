import { COMMERCIAL_TEMPLATES, HAMBURGER_SHOWCASE_ITEM } from '../../public/config/commercialShowcase.ts'
import type { CommercialTemplateItem } from '../types.ts'
import { isTechnicalDemoAvailable } from '../../core/publicTemplates.ts'

/** Official templates remain available while Firestore overrides selected fields. */
export function mergeOfficialTemplates(remote: CommercialTemplateItem[]): CommercialTemplateItem[] {
  const official = structuredClone([
    ...COMMERCIAL_TEMPLATES.slice(0, 3),
    { ...HAMBURGER_SHOWCASE_ITEM, order: 4 },
    { ...COMMERCIAL_TEMPLATES[3], order: 5 },
    { ...COMMERCIAL_TEMPLATES[4], order: 6 },
  ]) as CommercialTemplateItem[]
  const overrides = new Map(remote.map(item => [item.id, item]))
  return [
    ...official.map(item => {
      const remoteItem = overrides.get(item.id)
      const merged = { ...item, ...remoteItem }
      if (merged.demoEnabledConfigured !== true) {
        merged.demoEnabled = isTechnicalDemoAvailable(merged.canonicalTemplateId || merged.templateId || merged.id)
        merged.demoEnabledConfigured = false
      }
      return merged
    }),
    ...remote.filter(item => !official.some(base => base.id === item.id)),
  ]
}
