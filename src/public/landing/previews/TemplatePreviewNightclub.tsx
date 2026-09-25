const tables = [
  ['Mesa 4', 'VIP · Ocupada', 'Bs 680'],
  ['Mesa 8', 'Lounge · Ocupada', 'Bs 245'],
  ['VIP 2', 'Reservada', '22:30'],
  ['Barra 3', 'Ocupada', 'Bs 96'],
  ['Mesa 12', 'General · Libre', 'Disponible'],
  ['Terraza 1', 'Cuenta solicitada', 'Bs 310'],
]

export function TemplatePreviewNightclub() {
  return <div className="preview-shell preview-nightclub">
    <div className="preview-appbar"><strong>NOCTURNA DEMO</strong><span className="preview-active">Salón</span><span>POS</span><span>Barra</span><span>Caja</span></div>
    <div className="preview-content">
      <div className="preview-title"><div><small>OPERACIÓN EN VIVO</small><h4>Salón y cuentas abiertas</h4></div><span className="preview-status">Turno activo</span></div>
      <div className="preview-two-column">
        <section className="preview-panel"><div className="preview-panel-head">Mesas y VIP <span>5 zonas</span></div><div className="preview-tables">{tables.map(([name, state, total]) => <div key={name} className={`preview-table ${state.includes('Ocupada') ? 'preview-table-occupied' : state.includes('solicitada') ? 'preview-table-bill_requested' : state.includes('Reservada') ? 'preview-table-reserved' : ''}`}><strong>{name}</strong><span>{state}</span><b>{total}</b></div>)}</div></section>
        <section className="preview-panel"><div className="preview-panel-head">Barra / preparación <span>Ronda #3</span></div><div className="preview-list"><div><span>1× Botella premium</span><strong>En barra</strong></div><div><span>4× Cóctel de la casa</span><strong>Preparando</strong></div><div><span>6× Mixer</span><strong>Listo</strong></div></div><div className="preview-total"><span>Cuenta Mesa 4</span><strong>Bs 680</strong></div><div className="preview-kitchen">Cuenta única · 3 rondas acumuladas</div></section>
      </div>
    </div>
  </div>
}
