import { COMMERCIAL_TEMPLATES } from '../../public/config/commercialShowcase.ts'
import type { CommercialTemplateItem } from '../types.ts'

/** Official templates remain available while Firestore overrides selected fields. */
export function mergeOfficialTemplates(remote: CommercialTemplateItem[]): CommercialTemplateItem[] {
  const official = structuredClone(COMMERCIAL_TEMPLATES) as CommercialTemplateItem[]
  const overrides = new Map(remote.map(item => [item.id, item]))
  return [
    ...official.map(item => ({ ...item, ...overrides.get(item.id) })),
    ...remote.filter(item => !official.some(base => base.id === item.id)),
  ]
}
