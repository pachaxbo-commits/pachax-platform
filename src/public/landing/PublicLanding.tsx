import { useState, useEffect } from 'react'
import { LandingHeader } from './LandingHeader'
import { HeroSection } from './HeroSection'
import { ValueStrip } from './ValueStrip'
import { FeaturedTemplatesCatalog } from './FeaturedTemplatesCatalog'
import { TemplatePricingSection } from './TemplatePricingSection'
import { PlatformExtrasSection } from './PlatformExtrasSection'
import { RealOnboardingSection } from './RealOnboardingSection'
import { GuidedTutorialsSection } from './GuidedTutorialsSection'
import { TrustFooter } from './TrustFooter'
import '../publicExperience.css'

export function PublicLanding() {
  // Inicialización adaptativa: en desktop Nightclub (índice 2) es protagonista en la maqueta,
  // en mobile Restaurante (índice 0) es protagonista en la maqueta.
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      return 2 // Nightclub
    }
    return 0 // Restaurante
  })

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
    <div className="w-full min-h-screen bg-[#FAF9F6] text-slate-900 font-sans flex flex-col selection:bg-[#0066FF] selection:text-white overflow-x-hidden">
      {/* 1. Header Oficial de Producto con logo PACHAX recortado y elementos accesibles */}
      <LandingHeader />

      {/* Contenido Principal */}
      <main className="flex-1 w-full flex flex-col overflow-x-hidden">
        {/* 2. Hero Principal con Coverflow 3D y Detalle Activo Sincronizado */}
        <HeroSection
          activeIndex={activeIndex}
          onChangeActiveIndex={setActiveIndex}
        />

        {/* 3. Franja de Beneficios / Valores Clave */}
        <ValueStrip />

        {/* 4. Sección 1: Catálogo de Plantillas Destacadas (5 rubros, bullets concretos y demos) */}
        <FeaturedTemplatesCatalog />

        {/* 5. Sección 2: Planes Comerciales por Plantilla (Básico, Pro, Empresarial y A Medida) */}
        <TemplatePricingSection />

        {/* 6. Sección 3: Extras y Servicios Adicionales (Publicidad, Branding, Soporte, Automatizaciones) */}
        <PlatformExtrasSection />

        {/* 7. Sección 4: Onboarding Real de 5 Pasos */}
        <RealOnboardingSection />

        {/* 8. Sección 5: Tutoriales Guiados Interactivos en Pantalla */}
        <GuidedTutorialsSection />
      </main>

      {/* 9. Franja de Confianza y Pie Institucional */}
      <TrustFooter />
    </div>
  )
}
