import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DemoGallery } from './DemoGallery'
import { DemoRuntime } from './DemoRuntime'
import { resolveDemoRoute } from './resolveDemoRoute'

export function DemoRoot() {
  const route = resolveDemoRoute(window.location.pathname, window.location.search)

  if (route.isGallery) {
    return <DemoGallery />
  }

  return (
    <DemoRuntime
      templateId={route.templateId}
      mode={route.isStudioEmbed && route.templateId === 'restaurant' && new URLSearchParams(window.location.search).get('mode') === 'simulated_role' ? 'simulated_role' : 'team'}
      isPublicDemo={!route.isStudioEmbed}
      isStudioEmbed={route.isStudioEmbed}
      initialRole={route.initialRole}
      initialDatasetMode={route.initialDatasetMode}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoRoot />
  </React.StrictMode>
)
