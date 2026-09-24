import type { Order, Product } from '../../types'
import type { RestaurantTable } from '../mocks/restaurantMock'
import type { RestaurantShift } from '../../modules/restaurant/views/RestaurantExperience'
import type { DistributionData } from '../../modules/distribution/state/useDistributionStore'
import type { RetailProduct, CompletedRetailSale } from '../mocks/retailMock'

export type DemoDatasetMode = 'empty' | 'full'

export interface RestaurantDataset {
  tables: RestaurantTable[]
  products: Product[]
  orders: Order[]
  shift: RestaurantShift | null
  categories: { id: string; name: string }[]
  quickExtras: { id: string; name: string; price: number }[]
}

export interface DistributionDataset {
  data: DistributionData
}

export interface RetailDataset {
  products: RetailProduct[]
  sales: CompletedRetailSale[]
}
