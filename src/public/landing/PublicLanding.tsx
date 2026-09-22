import { LandingHeader } from './LandingHeader'
import { LandingHero } from './LandingHero'
import { TemplateShowcaseSection } from './TemplateShowcaseSection'
import { BrandingPreviewSection } from './BrandingPreviewSection'
import { OperationsFeatures } from './OperationsFeatures'
import { LandingFooter } from './LandingFooter'
import '../publicExperience.css'

export function PublicLanding() {
  return (
    <div className="w-full min-h-screen bg-[#FAF9F6] text-slate-900 font-sans flex flex-col selection:bg-slate-900 selection:text-white">
      {/* Barra de Navegación Institucional */}
      <LandingHeader />

      {/* Contenido Principal */}
      <main className="flex-1 w-full">
        {/* 1. Hero Principal con vitrina viva de producto */}
        <LandingHero />

        {/* 2. Sección Protagonista de Selección de Plantillas Canónicas */}
        <TemplateShowcaseSection />

        {/* 3. Sección "Tu identidad visual, no la nuestra" (Branding interactivo) */}
        <BrandingPreviewSection />

        {/* 4. Confiabilidad técnica (Offline, Impresión, Auditoría ciega) */}
        <OperationsFeatures />
      </main>

      {/* Pie de Página Institucional */}
      <LandingFooter />
    </div>
  )
}
