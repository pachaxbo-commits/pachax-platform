import type { DemoDatasetMode } from '../../demo/datasets/types.ts'
import type { PublicTemplateDefinition, PublicTemplateId } from '../../core/publicTemplates.ts'
import { getPublicTemplate, isPublicDemoEnabled } from '../../core/publicTemplates.ts'

export function buildDemoUrl(template: PublicTemplateId | PublicTemplateDefinition, mode: DemoDatasetMode): string {
  const definition = typeof template === 'string' ? getPublicTemplate(template) : template
  return `${definition.demoPath}?data=${mode}`
}

/** Crosses from index.html to demo.html. This must perform a document navigation. */
export function navigateToDemo(template: PublicTemplateId | PublicTemplateDefinition, mode: DemoDatasetMode): void {
  if (typeof window === 'undefined') return
  const definition = typeof template === 'string' ? getPublicTemplate(template) : template
  if (!isPublicDemoEnabled(definition.id)) return
  window.location.assign(buildDemoUrl(definition, mode))
}
