import { COMMERCIAL_TEMPLATES } from '../../public/config/commercialShowcase.ts'
import type { CommercialTemplateItem } from '../types.ts'
import { isTechnicalDemoAvailable } from '../../core/publicTemplates.ts'

/** Official templates remain available while Firestore overrides selected fields. */
export function mergeOfficialTemplates(remote: CommercialTemplateItem[]): CommercialTemplateItem[] {
  const official = structuredClone(COMMERCIAL_TEMPLATES) as CommercialTemplateItem[]
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
