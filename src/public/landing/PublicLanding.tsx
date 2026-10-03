import { useState, useEffect } from 'react'
import { LandingHeader } from './LandingHeader'
import { HeroSection } from './HeroSection'
import { ValueStrip } from './ValueStrip'
import { ProductTrioSection } from './ProductTrioSection'
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

  // Validación de accesibilidad y ausencia de overflow horizontal
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
      {/* 1. Header Oficial de Producto */}
      <LandingHeader />

      {/* Contenido Principal */}
      <main className="flex-1 w-full flex flex-col overflow-x-hidden">
        {/* 2. Hero Principal con Coverflow 3D y Detalle Activo Sincronizado */}
        <HeroSection
          activeIndex={activeIndex}
          onChangeActiveIndex={setActiveIndex}
        />

        {/* 3. Franja de Beneficios / Valores (Desktop 3 bloques, Mobile 3 badges) */}
        <ValueStrip />

        {/* 4. Trío de Producto: Onboarding, Tutoriales Guiados y Planes Comerciales */}
        <ProductTrioSection />
      </main>

      {/* 5. Franja de Confianza y Pie Institucional */}
      <TrustFooter />
    </div>
  )
}
