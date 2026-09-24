import { createFullRetailDataset } from '../../../demo/datasets/retail/retailDatasets'

const dataset = createFullRetailDataset()
const sale = dataset.sales[0]
const weightLine = sale.lines.find((line) => line.soldBy === 'weight')!
const money = (minor: number) => `Bs ${(minor / 100).toFixed(2)}`

export function TemplatePreviewRetail() {
  return <div className="preview-shell preview-retail">
    <div className="preview-appbar"><strong>Amapola Demo</strong><span>Inicio</span><span className="preview-active">Nueva venta / POS</span><span>Ventas</span><span>Caja</span><span>Inventario</span></div>
    <div className="preview-content"><div className="preview-title"><div><small>MOSTRADOR & CAJA</small><h4>Nueva venta</h4></div><span className="preview-status">Balanza conectada</span></div>
      <div className="preview-two-column"><div className="preview-panel"><div className="preview-panel-head">Venta por peso <span>{weightLine.enteredQuantity} g</span></div><div className="preview-weight"><small>PRODUCTO EN BALANZA</small><strong>{weightLine.productNameSnapshot}</strong><span>{money(weightLine.unitPriceMinor)} / kg</span><div>{weightLine.enteredQuantity} g <b>{money(weightLine.subtotalMinor)}</b></div></div></div>
      <div className="preview-panel"><div className="preview-panel-head">Ticket {sale.receiptNumber} <span>{sale.customerName}</span></div><div className="preview-list">{sale.lines.map((line) => <div key={line.productId}><span>{line.enteredQuantity}{line.enteredUnit === 'g' ? ' g' : '×'} {line.productNameSnapshot}</span><strong>{money(line.subtotalMinor)}</strong></div>)}</div><div className="preview-total"><span>Total a cobrar</span><strong>{money(sale.totalMinor)}</strong></div><div className="preview-kitchen">Pago en efectivo · Caja 1</div></div></div>
    </div>
  </div>
}
