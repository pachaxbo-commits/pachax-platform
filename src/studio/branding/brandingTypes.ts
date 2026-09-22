export interface StudioBranding {
  companyName: string
  logoUrl?: string
  primaryColor: string
  sidebarColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  styleTheme: 'warm' | 'slate' | 'clean'
}

export const DEFAULT_RESTAURANT_BRANDING: StudioBranding = {
  companyName: 'Bistró Demo',
  primaryColor: '#1E3A8A', // Azul marino sobrio
  sidebarColor: '#F8FAFC',
  accentColor: '#0D9488', // Teal
  backgroundColor: '#F8FAFC',
  surfaceColor: '#FFFFFF',
  styleTheme: 'clean',
}

export const DEFAULT_DISTRIBUTION_BRANDING: StudioBranding = {
  companyName: 'Distribuidora Demo',
  primaryColor: '#C1121F', // Rojo PACHAX sobrio
  sidebarColor: '#FDF8F6',
  accentColor: '#D97706', // Ámbar
  backgroundColor: '#FAF7F2',
  surfaceColor: '#FFFFFF',
  styleTheme: 'warm',
}

export const DEFAULT_RETAIL_BRANDING: StudioBranding = {
  companyName: 'Amapola Demo',
  primaryColor: '#0F766E', // Verde petróleo sobrio
  sidebarColor: '#F0FDFA',
  accentColor: '#EA580C', // Naranja suave
  backgroundColor: '#FAFAF9',
  surfaceColor: '#FFFFFF',
  styleTheme: 'warm',
}
