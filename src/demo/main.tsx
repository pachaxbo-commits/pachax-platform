import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DemoGallery } from './DemoGallery'
import { DemoRuntime } from './DemoRuntime'
import type { DemoTemplateId } from './demoTypes'

function resolveDemoRoute(): {
  isGallery: boolean
  templateId: DemoTemplateId
  isStudioEmbed: boolean
  initialRole?: string
} {
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const queryTemplate = params.get('template') as DemoTemplateId | null
  const isStudioEmbed = params.get('embed') === 'studio' || params.get('embed') === '1'
  const initialRole = params.get('role') || undefined

  if (path.includes('/restaurant') || queryTemplate === 'restaurant') {
    return { isGallery: false, templateId: 'restaurant', isStudioEmbed, initialRole }
  }
  if (path.includes('/distribution') || queryTemplate === 'distribution') {
    return { isGallery: false, templateId: 'distribution', isStudioEmbed, initialRole }
  }
  if (path.includes('/retail') || queryTemplate === 'retail') {
    return { isGallery: false, templateId: 'retail', isStudioEmbed, initialRole }
  }

  return { isGallery: !isStudioEmbed, templateId: 'distribution', isStudioEmbed, initialRole }
}

function DemoRoot() {
  const route = resolveDemoRoute()

  if (route.isGallery) {
    return <DemoGallery />
  }

  return (
    <DemoRuntime
      templateId={route.templateId}
      isPublicDemo={!route.isStudioEmbed}
      isStudioEmbed={route.isStudioEmbed}
      initialRole={route.initialRole}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoRoot />
  </React.StrictMode>
)
