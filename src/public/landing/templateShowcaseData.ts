import React from 'react'
import { Utensils, Truck, Store, Music2 } from 'lucide-react'
import { TemplatePreviewRestaurant } from './previews/TemplatePreviewRestaurant'
import { TemplatePreviewDistribution } from './previews/TemplatePreviewDistribution'
import { TemplatePreviewRetail } from './previews/TemplatePreviewRetail'
import { TemplatePreviewNightclub } from './previews/TemplatePreviewNightclub'
import type { BusinessType } from '../../core/platform'
import type { DemoTemplateId } from '../../demo/demoTypes'
import { PUBLIC_TEMPLATES } from '../../core/publicTemplates'

const canonical = (id: DemoTemplateId) => {
  const template = PUBLIC_TEMPLATES.find(item => item.id === id)
  if (!template) throw new Error(`Plantilla pública no registrada: ${id}`)
  return { id: template.businessType, templateId: template.studioTemplateId, demoPath: template.demoPath, title: template.title, description: template.shortDescription }
}

export interface TemplateShowcaseItem {
  id: BusinessType
  templateId: DemoTemplateId
  demoPath: string
  title: string
  industryBadge: string
  tagline: string
  description: string
  accentColor: string
  accentBorderClass: string
  accentBadgeClass: string
  accentTextClass: string
  accentHoverRing: string
  icon: React.ComponentType<{ className?: string }>
  keyModules: string[]
  preview: React.ComponentType
}

export const TEMPLATE_SHOWCASE_DATA: TemplateShowcaseItem[] = [
  {
    ...canonical('restaurant'),
    industryBadge: 'Gastronomía & Salón',
    tagline: 'Manejo de mesas, comandas KDS a cocina en tiempo real y arqueo de turnos.',
    accentColor: '#E0A24A',
    accentBorderClass: 'border-amber-500/30',
    accentBadgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    accentTextClass: 'text-amber-600',
    accentHoverRing: 'group-hover:ring-amber-500/30',
    icon: Utensils,
    keyModules: ['Salón & Mesas', 'Comandas KDS', 'Turnos & Caja', 'Cobro QR / Dividido'],
    preview: TemplatePreviewRestaurant,
  },
  {
    ...canonical('distribution'),
    industryBadge: 'Logística en Ruta',
    tagline: 'Carga física en camión, liquidación por kilos, cartera y variance.',
    accentColor: '#2F7DD7',
    accentBorderClass: 'border-blue-500/30',
    accentBadgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
    accentTextClass: 'text-blue-600',
    accentHoverRing: 'group-hover:ring-blue-500/30',
    icon: Truck,
    keyModules: ['Carga & Despacho', 'Ventas en Calle', 'Cobro de Cartera', 'Cierre & Variance'],
    preview: TemplatePreviewDistribution,
  },
  {
    ...canonical('retail'),
    industryBadge: 'Mostrador & Balanza',
    tagline: 'Lectura directa de balanza en gramos, carrito ágil y ticket al instante.',
    accentColor: '#0D9488',
    accentBorderClass: 'border-teal-500/30',
    accentBadgeClass: 'bg-teal-500/10 text-teal-700 border-teal-500/30',
    accentTextClass: 'text-teal-600',
    accentHoverRing: 'group-hover:ring-teal-500/30',
    icon: Store,
    keyModules: ['Balanza Digital (g)', 'Ticket Express', 'Cobro Efectivo / QR', 'Inventario Directo'],
    preview: TemplatePreviewRetail,
  },
  {
    ...canonical('nightclub'),
    industryBadge: 'Nocturno & Barra',
    tagline: 'Mesas, rondas, barra y cuentas abiertas durante toda la noche.',
    accentColor: '#A855F7',
    accentBorderClass: 'border-purple-500/30',
    accentBadgeClass: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
    accentTextClass: 'text-purple-600',
    accentHoverRing: 'group-hover:ring-purple-500/30',
    icon: Music2,
    keyModules: ['Salón & VIP', 'Rondas abiertas', 'Barra / Preparación', 'Caja nocturna'],
    preview: TemplatePreviewNightclub,
  },
]

for (const item of TEMPLATE_SHOWCASE_DATA) {
  const canonical = PUBLIC_TEMPLATES.find(template => template.businessType === item.id)
  if (!canonical || canonical.id !== item.templateId || canonical.demoPath !== item.demoPath) {
    throw new Error(`Registro público divergente para ${item.id}`)
  }
}
