import { createFullRestaurantDataset } from '../../../demo/datasets/restaurant/restaurantDatasets'

const dataset = createFullRestaurantDataset()
const labels = { available: 'Libre', occupied: 'Ocupada', bill_requested: 'Por cerrarse', reserved: 'Reserva' }
const order = dataset.orders.find((item) => item.tableId === 't1')!

export function TemplatePreviewRestaurant() {
  return <div className="preview-shell preview-restaurant">
    <div className="preview-appbar"><strong>Bistró Demo</strong><span>Inicio</span><span>POS / Caja</span><span className="preview-active">Mesas</span><span>Cocina</span><span>Caja</span></div>
    <div className="preview-content">
      <div className="preview-title"><div><small>SALÓN PRINCIPAL</small><h4>Mesas y cuentas</h4></div><span className="preview-status">Turno abierto</span></div>
      <div className="preview-two-column">
        <div className="preview-panel"><div className="preview-panel-head">Plano del salón <span>{dataset.tables.length} mesas</span></div><div className="preview-tables">{dataset.tables.slice(0, 6).map((table) => <div className={`preview-table preview-table-${table.status}`} key={table.id}><strong>{table.name}</strong><span>{labels[table.status]}</span></div>)}</div></div>
        <div className="preview-panel"><div className="preview-panel-head">Cuenta activa <span>{order.tableInfo}</span></div><div className="preview-list">{order.items.map((item) => <div key={item.id}><span>{item.quantity}× {item.name}</span><strong>Bs {item.lineTotal.toFixed(2)}</strong></div>)}</div><div className="preview-total"><span>Total</span><strong>Bs {order.total.toFixed(2)}</strong></div><div className="preview-kitchen">Cocina · Lote {order.submittedBatches?.[0]?.sequence} · En preparación</div></div>
      </div>
    </div>
  </div>
}
