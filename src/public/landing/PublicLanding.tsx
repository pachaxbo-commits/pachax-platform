import { useState, useEffect } from 'react'
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
    <div className="w-full min-h-screen bg-[#FAF9F6] text-slate-900 font-sans flex flex-col selection:bg-[#0066FF] selection:text-white overflow-x-hidden relative">
      {/* Fondo Arquitectónico Geométrico Inspirado en el Isotipo PACHAX */}
      <PachaxBrandBackground activeIndex={activeIndex} />

      {/* Header Oficial de Producto con branding, navegación anclada y accesibilidad */}
      <LandingHeader />

      {/* Contenido Principal en Orden Canónico Riguroso */}
      <main className="flex-1 w-full flex flex-col overflow-x-hidden relative z-10">
        {/* SECCIÓN 1: Hero Principal con Coverflow 3D, Detalle Activo y WhatsApp CTA */}
        <HeroSection
          activeIndex={activeIndex}
          onChangeActiveIndex={setActiveIndex}
        />

        {/* Franja de Valor y Métricas Operacionales */}
        <ValueStrip />

        {/* SECCIÓN 2: Plantillas en Detalle (Audiencia, Problema Resuelto, Demos Canónicas) */}
        <FeaturedTemplatesCatalog />

        {/* SECCIÓN 3: Planes por Plantilla (3 niveles por rubro + Desarrollo a Medida) */}
        <TemplatePricingSection />

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
