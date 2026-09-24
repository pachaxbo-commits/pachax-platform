import { createFullDistributionDataset } from '../../../demo/datasets/distribution/distributionDatasets'

const data = createFullDistributionDataset().data
const dispatch = data.openDispatches[0]
const sale = data.sales[0]
const vienna = dispatch.lines[0]
const addition = dispatch.additions?.[0]?.quantityByProduct.find((line) => line.productId === vienna.productId)?.quantity || 0
const sold = sale.lines.find((line) => line.productId === vienna.productId)?.quantity || 0
const cash = (sale.cashAmount || 0) + data.collections.reduce((sum, collection) => sum + (collection.method === 'cash' ? collection.amount : 0), 0) - data.expenses.reduce((sum, expense) => sum + expense.amount, 0)

export function TemplatePreviewDistribution() {
  return <div className="preview-shell preview-distribution">
    <div className="preview-appbar"><strong>Distribuidora Demo</strong><span>Inicio</span><span>Vender</span><span>Inventario</span><span className="preview-active">Despachos</span><span>Cierre</span></div>
    <div className="preview-content"><div className="preview-title"><div><small>OPERACIÓN EN RUTA</small><h4>{dispatch.routeName}</h4></div><span className="preview-status">En ruta</span></div>
      <div className="preview-two-column"><div className="preview-panel"><div className="preview-panel-head">Carga y despacho <span>{dispatch.distributorName}</span></div><div className="preview-route"><strong>{vienna.productName}</strong><span>{vienna.quantity + addition} kg cargados</span></div><div className="preview-metrics"><div><small>Vendido</small><strong>{sold} kg</strong></div><div><small>Retorno previsto</small><strong>{vienna.quantity + addition - sold} kg</strong></div></div><div className="preview-route"><strong>{dispatch.lines[1].productName}</strong><span>{dispatch.lines[1].quantity} kg cargados</span></div></div>
      <div className="preview-panel"><div className="preview-panel-head">Liquidación <span>{sale.customerName}</span></div><div className="preview-list"><div><span>Ventas de ruta</span><strong>Bs {sale.total.toFixed(2)}</strong></div><div><span>Cobranza de cartera</span><strong>Bs {data.collections[0].amount.toFixed(2)}</strong></div><div><span>Gasto de ruta</span><strong>−Bs {data.expenses[0].amount.toFixed(2)}</strong></div></div><div className="preview-total"><span>Efectivo a rendir</span><strong>Bs {cash.toFixed(2)}</strong></div></div></div>
    </div>
  </div>
}
