import { useState, useEffect } from 'react'
import type { DemoTemplateId } from '../demo/demoTypes'
import { StudioHome } from './StudioHome'
import { StudioShell } from './StudioShell'
import { DemoRuntime } from '../demo/DemoRuntime'
import { BrandingProvider } from './branding/BrandingContext'

export function StudioApp() {
  const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplateId | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return (params.get('template') as DemoTemplateId) || null
  })

  const [simulatedRole, setSimulatedRole] = useState<string>('admin')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (selectedTemplate) {
      params.set('template', selectedTemplate)
    } else {
      params.delete('template')
    }
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`
    window.history.replaceState(null, '', newUrl)
  }, [selectedTemplate])

  if (!selectedTemplate) {
    return <StudioHome onSelectTemplate={(t) => setSelectedTemplate(t)} />
  }

  return (
    <BrandingProvider template={selectedTemplate}>
      <StudioShell
        templateId={selectedTemplate}
        onBackToHome={() => setSelectedTemplate(null)}
        currentRole={simulatedRole}
        onSelectRole={(r) => setSimulatedRole(r)}
      >
        <DemoRuntime
          templateId={selectedTemplate}
          mode="team"
          simulatedRole={simulatedRole}
          isPublicDemo={false}
          onSelectRole={(r) => setSimulatedRole(r)}
        />
      </StudioShell>
    </BrandingProvider>
  )
}
