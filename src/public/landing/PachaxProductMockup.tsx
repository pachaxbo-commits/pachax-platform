import { Boxes, ChartNoAxesColumnIncreasing, ClipboardList, LayoutDashboard, Package, Settings2 } from 'lucide-react'

const bars = [34, 52, 42, 71, 58, 88, 63, 78, 96]

export function PachaxProductMockup() {
  return (
    <div className="pachax-device-scene" aria-label="Vista ilustrativa de la plataforma en laptop y móvil">
      <div className="pachax-device-glow" aria-hidden="true" />
      <div className="pachax-laptop">
        <div className="pachax-laptop-screen">
          <div className="pachax-dashboard">
            <aside className="pachax-dashboard-sidebar">
              <strong><img className="pachax-dashboard-mark" src="/brand/pachax-isotipo-color.png" alt="" aria-hidden="true" />PACHAX</strong>
              <span className="is-active"><LayoutDashboard />Operaciones</span>
              <span><ClipboardList />Ventas</span>
              <span><Boxes />Inventario</span>
              <span><ChartNoAxesColumnIncreasing />Reportes</span>
              <span><Settings2 />Configuración</span>
            </aside>
            <div className="pachax-dashboard-main">
              <div className="pachax-dashboard-topline"><span>Vista de demostración · datos de ejemplo</span><span className="pachax-dashboard-dots" aria-hidden="true">•••</span></div>
              <h2>Operaciones</h2>
              <div className="pachax-dashboard-panels">
                <div className="pachax-dashboard-chart" aria-label="Gráfico ilustrativo">
                  <div className="pachax-dashboard-chart-title">Actividad operativa</div>
                  <div className="pachax-dashboard-bars" aria-hidden="true">
                    {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
                  </div>
                  <div className="pachax-dashboard-axis" aria-hidden="true"><span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span></div>
                </div>
                <div className="pachax-dashboard-ring-card">
                  <span>Control</span><div className="pachax-dashboard-ring"><i /></div><small>Seguimiento</small>
                </div>
              </div>
              <div className="pachax-dashboard-summary">
                <div><Package /><span><small>Catálogo</small><b>Productos</b></span></div>
                <div><ClipboardList /><span><small>Operación</small><b>Pedidos</b></span></div>
                <div><ChartNoAxesColumnIncreasing /><span><small>Control</small><b>Reportes</b></span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="pachax-laptop-lip"><span /></div>
      </div>
      <div className="pachax-phone">
        <div className="pachax-phone-island" aria-hidden="true" />
        <img src="/brand/pachax-isotipo-color.png" alt="" aria-hidden="true" />
        <span className="pachax-phone-caption">PACHAX</span>
      </div>
    </div>
  )
}
