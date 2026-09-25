import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { StudioBranding } from './brandingTypes'
import { DEFAULT_RESTAURANT_BRANDING, DEFAULT_DISTRIBUTION_BRANDING, DEFAULT_RETAIL_BRANDING, DEFAULT_NIGHTCLUB_BRANDING } from './brandingTypes'
import type { DemoTemplateId } from '../../demo/demoTypes'

interface BrandingContextValue {
  branding: StudioBranding
  setBranding: (branding: StudioBranding) => void
  resetBranding: () => void
  isDrawerOpen: boolean
  setIsDrawerOpen: (open: boolean) => void
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

export function getInitialBranding(template: DemoTemplateId): StudioBranding {
  const defaults = {
    restaurant: DEFAULT_RESTAURANT_BRANDING,
    distribution: DEFAULT_DISTRIBUTION_BRANDING,
    retail: DEFAULT_RETAIL_BRANDING,
    nightclub: DEFAULT_NIGHTCLUB_BRANDING,
  }[template]

  try {
    const saved = localStorage.getItem(`pachax_studio_branding_${template}`)
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) }
    }
  } catch {
    // Silently fall back to defaults
  }
  return defaults
}

export function BrandingProvider({
  template,
  children,
}: {
  template: DemoTemplateId
  children: ReactNode
}) {
  const [branding, setBrandingState] = useState<StudioBranding>(() => getInitialBranding(template))
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    setBrandingState(getInitialBranding(template))
  }, [template])

  const setBranding = (newBranding: StudioBranding) => {
    setBrandingState(newBranding)
    try {
      localStorage.setItem(`pachax_studio_branding_${template}`, JSON.stringify(newBranding))
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  const resetBranding = () => {
    const defaults = {
      restaurant: DEFAULT_RESTAURANT_BRANDING,
      distribution: DEFAULT_DISTRIBUTION_BRANDING,
      retail: DEFAULT_RETAIL_BRANDING,
      nightclub: DEFAULT_NIGHTCLUB_BRANDING,
    }[template]
    setBranding(defaults)
  }

  return (
    <BrandingContext.Provider
      value={{
        branding,
        setBranding,
        resetBranding,
        isDrawerOpen,
        setIsDrawerOpen,
      }}
    >
      {children}
    </BrandingContext.Provider>
  )
}

export function useStudioBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext)
  if (!ctx) {
    throw new Error('useStudioBranding must be used within BrandingProvider')
  }
  return ctx
}
