import { previewData } from '../../preview-data'
import type { DistributionData } from '../../modules/distribution/state/useDistributionStore'

export const DISTRIBUTION_PREVIEW_DATA: DistributionData = previewData

export const DISTRIBUTION_STAFF = [
  { id: 'du-1', name: 'Administración PACHAX', email: 'admin@distribuidorademo.test', role: 'admin', roleName: 'Administración', active: true },
  { id: 'du-2', name: 'Almacén Central', email: 'almacen@distribuidorademo.test', role: 'warehouse', roleName: 'Almacén', active: true },
  { id: 'du-3', name: 'Distribuidor A (Hugo)', email: 'hugo@distribuidorademo.test', role: 'distributor', roleName: 'Distribuidor', active: true },
]
