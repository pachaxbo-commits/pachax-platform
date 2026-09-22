import React from 'react'
import { Utensils, Truck, Store } from 'lucide-react'
import { TemplatePreviewRestaurant } from './previews/TemplatePreviewRestaurant'
import { TemplatePreviewDistribution } from './previews/TemplatePreviewDistribution'
import { TemplatePreviewRetail } from './previews/TemplatePreviewRetail'
import type { BusinessType } from '../../core/platform'
import type { DemoTemplateId } from '../../demo/demoTypes'

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
    id: 'restaurant_pos',
    templateId: 'restaurant',
    demoPath: '/demo/restaurant',
    title: 'Restaurante & Gastronomía',
    industryBadge: 'Gastronomía & Salón',
    tagline: 'Manejo de mesas, comandas KDS a cocina en tiempo real y arqueo de turnos.',
    description:
      'Diseñado para la intensidad de salón y cocina: comandas inmediatas por lotes, control de mesas activas, división de cuentas y cierre ciego de caja.',
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
    id: 'route_distribution',
    templateId: 'distribution',
    demoPath: '/demo/distribution',
    title: 'Producción y distribución',
    industryBadge: 'Logística en Ruta',
    tagline: 'Carga física en camión, liquidación por kilos, cartera y variance.',
    description:
      'Control riguroso de producto despachado versus devuelto. Emisión de notas sin conexión en calle, cobranza de créditos y arqueo de chofer.',
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
    id: 'gelateria_weight_cafe',
    templateId: 'retail',
    demoPath: '/demo/retail',
    title: 'Comercio / Venta rápida',
    industryBadge: 'Mostrador & Balanza',
    tagline: 'Lectura directa de balanza en gramos, carrito ágil y ticket al instante.',
    description:
      'Velocidad en caja para atención de mostrador: integración con balanzas digitales por peso fraccionado, cobro combinado en segundos y control de inventario.',
    accentColor: '#0D9488',
    accentBorderClass: 'border-teal-500/30',
    accentBadgeClass: 'bg-teal-500/10 text-teal-700 border-teal-500/30',
    accentTextClass: 'text-teal-600',
    accentHoverRing: 'group-hover:ring-teal-500/30',
    icon: Store,
    keyModules: ['Balanza Digital (g)', 'Ticket Express', 'Cobro Efectivo / QR', 'Inventario Directo'],
    preview: TemplatePreviewRetail,
  },
]
