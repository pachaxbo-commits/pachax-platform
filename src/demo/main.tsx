import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DemoGallery } from './DemoGallery'
import { DemoRuntime } from './DemoRuntime'
import type { DemoTemplateId } from './demoTypes'

function resolveDemoRoute(): { isGallery: boolean; templateId: DemoTemplateId } {
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const queryTemplate = params.get('template') as DemoTemplateId | null

  if (path.includes('/restaurant') || queryTemplate === 'restaurant') {
    return { isGallery: false, templateId: 'restaurant' }
  }
  if (path.includes('/distribution') || queryTemplate === 'distribution') {
    return { isGallery: false, templateId: 'distribution' }
  }
  if (path.includes('/retail') || queryTemplate === 'retail') {
    return { isGallery: false, templateId: 'retail' }
  }

  return { isGallery: true, templateId: 'restaurant' }
}

function DemoRoot() {
  const route = resolveDemoRoute()

  if (route.isGallery) {
    return <DemoGallery />
  }

  return <DemoRuntime templateId={route.templateId} isPublicDemo={true} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoRoot />
  </React.StrictMode>
)
