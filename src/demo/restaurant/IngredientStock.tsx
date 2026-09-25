import type { Product } from '../../types'

export function IngredientStock({ product }: { product: Product }) {
  if (product.stockBase === undefined) return <span className="text-xs text-slate-400">Sin control de stock</span>
  const unit = product.stockUnitLabel || (product.baseUnit === 'g' ? 'g' : product.baseUnit === 'ml' ? 'ml' : 'unid.')
  const amount = product.stockBase.toLocaleString('es-BO', { maximumFractionDigits: 3 })
  const low = product.stockBase <= (product.minimumStockBase || 0)
  return <span aria-live="polite" className="inline-flex flex-col items-end gap-0.5">
    <strong className="whitespace-nowrap text-sm text-slate-900">{amount} {unit}</strong>
    {low && <span className={`text-[10px] font-semibold ${product.stockBase <= 0 ? 'text-rose-700' : 'text-amber-700'}`}>{product.stockBase <= 0 ? 'Sin stock' : 'Stock bajo'}</span>}
  </span>
}
