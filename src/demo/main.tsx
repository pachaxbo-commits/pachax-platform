import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DemoGallery } from './DemoGallery'
import { DemoRuntime } from './DemoRuntime'
import { resolveDemoRoute } from './resolveDemoRoute'

function DemoRoot() {
  const route = resolveDemoRoute(window.location.pathname, window.location.search)

  if (route.isGallery) {
    return <DemoGallery />
  }

  return (
    <DemoRuntime
      templateId={route.templateId}
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
