import type { CommercialTemplateItem as AdminTemplate } from '../../admin/types'
import {
  SELF_SERVICE_SHOWCASE_TEMPLATES,
  SPECIALIZED_SHOWCASE_TEMPLATES,
  type CommercialTemplateItem as ShowcaseTemplate,
} from '../config/commercialShowcase.ts'

const VISUAL_TEMPLATES = [
  ...SPECIALIZED_SHOWCASE_TEMPLATES,
  ...SELF_SERVICE_SHOWCASE_TEMPLATES,
]
const VISUAL_BY_ID = new Map(VISUAL_TEMPLATES.map((item) => [item.id, item]))

/**
 * Uses the approved public Admin projection for editorial content and order,
 * while keeping routes, technical identity and CSS tokens from the local
 * canonical presentation. A valid empty catalog stays empty.
 */
export function buildPublishedShowcaseGroup(
  publishedTemplates: readonly AdminTemplate[],
  group: 'specialized' | 'self_service',
): ShowcaseTemplate[] {
  return publishedTemplates
    .filter((item) => item.status === 'published' && item.commercialMode === group && item.id !== 'custom')
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .flatMap((item) => {
      const visual = VISUAL_BY_ID.get(item.id as ShowcaseTemplate['id'])
      if (!visual) return []
      return [{
        ...visual,
        ...item,
        // These values are technical or styling tokens, never Admin input.
        id: visual.id,
        templateId: visual.templateId,
        canonicalTemplateId: visual.canonicalTemplateId,
        demoRoute: visual.demoRoute,
        demoPath: visual.demoPath,
        detailAnchor: visual.detailAnchor,
        primaryActionLabel: visual.primaryActionLabel,
        iconType: visual.iconType,
        visualSlot: visual.visualSlot,
        accent: visual.accent,
      } as ShowcaseTemplate]
    })
}
