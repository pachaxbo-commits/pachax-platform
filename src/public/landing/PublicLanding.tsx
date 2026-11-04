import { useEffect, useState } from 'react'
import { LandingHeader } from './LandingHeader'
import { HeroSection } from './HeroSection'
import { ValueStrip } from './ValueStrip'
import { FeaturedTemplatesCatalog } from './FeaturedTemplatesCatalog'
import { TemplatePricingSection } from './TemplatePricingSection'
import { RealOnboardingSection } from './RealOnboardingSection'
import { GuidedTutorialsSection } from './GuidedTutorialsSection'
import { PlatformExtrasSection } from './PlatformExtrasSection'
import { TrustFooter } from './TrustFooter'
import { PachaxBrandBackground } from './PachaxBrandBackground'
import '../publicExperience.css'
import './pachaxLanding.css'

export function PublicLanding() {
  const [requestedPricingTemplate, setRequestedPricingTemplate] = useState<{
    templateId: 'hamburger' | 'retail'
    request: number
  } | null>(null)
  const handleViewPlans = (templateId: 'hamburger' | 'retail') => {
    setRequestedPricingTemplate((previous) => ({
      templateId,
      request: (previous?.request ?? 0) + 1,
    }))
    document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // Validación de accesibilidad y verificación de ausencia de scroll horizontal
  useEffect(() => {
    const updateMetrics = () => {
      const sw = document.documentElement.scrollWidth
      const iw = window.innerWidth
      document.body.setAttribute('data-scroll-width', String(sw))
      document.body.setAttribute('data-inner-width', String(iw))
      document.body.setAttribute('data-no-overflow', String(sw <= iw))
    }
    updateMetrics()
    window.addEventListener('resize', updateMetrics)
    return () => window.removeEventListener('resize', updateMetrics)
  }, [])

  return (
    <div className="pachax-public-landing w-full min-h-screen font-sans flex flex-col selection:bg-[#0066FF] selection:text-white overflow-x-clip relative">
      {/* Fondo Arquitectónico Geométrico Inspirado en el Isotipo PACHAX */}
      <PachaxBrandBackground />

      {/* Header Oficial de Producto con branding, navegación anclada y accesibilidad */}
      <LandingHeader />

      {/* Contenido Principal en Orden Canónico Riguroso */}
      <main className="flex-1 w-full flex flex-col overflow-x-hidden relative z-10">
        {/* SECCIÓN 1: presentación, catálogo horizontal y acceso al catálogo completo */}
        <HeroSection onViewPlans={handleViewPlans} />

        {/* Franja de Valor y Métricas Operacionales */}
        <ValueStrip />

        {/* SECCIÓN 2: Plantillas en Detalle (Audiencia, Problema Resuelto, Demos Canónicas) */}
        <FeaturedTemplatesCatalog onViewPlans={handleViewPlans} />

        {/* SECCIÓN 3: Planes por Plantilla (3 niveles por rubro + Desarrollo a Medida) */}
        <TemplatePricingSection
          key={requestedPricingTemplate?.request ?? 0}
          initialQuickServiceId={requestedPricingTemplate?.templateId ?? 'hamburger'}
        />

        {/* SECCIÓN 4: Configura tu empresa en 5 minutos (Progresión editorial de 5 pasos) */}
        <RealOnboardingSection />

        {/* SECCIÓN 5: Tutoriales Guiados Interactivos (Simulador de asistencia en pantalla) */}
        <GuidedTutorialsSection />

        {/* SECCIÓN 6: Extras y Desarrollo a Medida (Última sección comercial con WhatsApp CTA) */}
        <PlatformExtrasSection />
      </main>

      {/* Footer Institucional y Canales Verificados */}
      <TrustFooter />
    </div>
  )
}
