import { PUBLIC_TEMPLATES, type PublicTemplateId } from '../core/publicTemplates.ts'
import type { DemoTemplateId } from './demoTypes.ts'

export interface ResolvedDemoRoute {
  isGallery: boolean
  templateId: DemoTemplateId
  isStudioEmbed: boolean
  initialRole?: string
  initialDatasetMode: 'empty' | 'full'
}

export function resolveDemoRoute(path: string, search = ''): ResolvedDemoRoute {
  const params = new URLSearchParams(search)
  const queryTemplate = params.get('template') as PublicTemplateId | null
  const isStudioEmbed = params.get('embed') === 'studio' || params.get('embed') === '1'
  const initialRole = params.get('role') || undefined
  const initialDatasetMode = params.get('data') === 'empty' ? 'empty' : 'full'
  const template = PUBLIC_TEMPLATES.find(item => path === item.demoPath || path.startsWith(`${item.demoPath}/`) || queryTemplate === item.id)
  if (template) return { isGallery: false, templateId: template.id, isStudioEmbed, initialRole, initialDatasetMode }
  return { isGallery: !isStudioEmbed, templateId: 'distribution', isStudioEmbed, initialRole, initialDatasetMode }
}
