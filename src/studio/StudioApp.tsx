import { useState, useEffect } from 'react'
import type { DemoTemplateId } from '../demo/demoTypes'
import { StudioHome } from './StudioHome'
import { StudioShell } from './StudioShell'
import { BrandingProvider } from './branding/BrandingContext'
import { PUBLIC_TEMPLATES } from '../core/publicTemplates'
import { getTemplate } from '../core/templates'

export function StudioApp() {
  const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplateId | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const candidate = params.get('template')
    return PUBLIC_TEMPLATES.find(item => item.id === candidate)?.id ?? null
  })

  const [simulatedRole, setSimulatedRole] = useState<string>(() => {
    const selected = PUBLIC_TEMPLATES.find(item => item.id === new URLSearchParams(window.location.search).get('template'))
    const candidate = new URLSearchParams(window.location.search).get('role')
    return selected?.businessType && getTemplate(selected.businessType).roles.some(role => role.id === candidate) ? candidate! : 'admin'
  })

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
      />
    </BrandingProvider>
  )
}
