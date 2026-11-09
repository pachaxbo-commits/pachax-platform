import type { NightclubTable, NightclubZone } from '../domain/nightclubAccounts'
import type { NightclubFloorLayout, NightclubFloorPosition } from '../domain/nightclubFloorLayout'

const labels = { available: 'Libre', occupied: 'Ocupada', reserved: 'Reservada', bill_requested: 'Cuenta solicitada' } as const
const colors = {
  available: { fill: '#103328', stroke: '#4bc79b', text: '#bbf7df', seat: '#395e52' },
  occupied: { fill: '#172c42', stroke: '#64a9ee', text: '#d7ebff', seat: '#4a6176' },
  reserved: { fill: '#322a42', stroke: '#b79be8', text: '#efe4ff', seat: '#635775' },
  bill_requested: { fill: '#3b3020', stroke: '#e6ad58', text: '#fff0cf', seat: '#756143' },
} as const

interface Props {
  zones: readonly NightclubZone[]
  tables: readonly NightclubTable[]
  layout: NightclubFloorLayout
  accounts: readonly { id: string; tableId?: string; serviceTarget?: { type: string; tableId?: string }; status: string }[]
  selectedId: string | null
  zoom: number
  isLight: boolean
  editing: boolean
  onSelect: (tableId: string) => void
  onMove: (tableId: string, position: NightclubFloorPosition) => void
}

export function NightclubFloorCanvas({ zones, tables, layout, accounts, selectedId, zoom, isLight, editing, onSelect, onMove }: Props) {
  return <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 2xl:grid-cols-2" data-tour="section-floor-map" data-tutorial-target="section-floor-map">
    {!zones.length && <p className="col-span-full rounded-xl border border-dashed border-slate-500/40 p-6 text-center text-sm text-slate-500">Todavía no hay zonas configuradas.</p>}
    {zones.map(zone => {
      const zoneTables = tables.filter(table => table.zoneId === zone.id)
      const columns = Math.max(1, Math.ceil(Math.sqrt(zoneTables.length)))
      const rows = Math.max(1, Math.ceil(zoneTables.length / columns))
      const stageHeight = Math.max(430, rows * 112)
      return <section key={zone.id} className={`min-w-0 max-w-full overflow-hidden rounded-2xl border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700/70 bg-[#09141f]'}`}>
        <header className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
          <div className="min-w-0"><h2 className={`truncate text-sm font-bold uppercase tracking-[.16em] ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{zone.name}</h2><p className={`mt-0.5 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{zoneTables.length} {zoneTables.length === 1 ? 'mesa' : 'mesas'} · distribución del sector</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'}`}>ZONA</span>
        </header>
        {zoneTables.length ? <div className="nightclub-floor-scroll w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain" data-tour="floor-zone-map">
          <svg viewBox={`${(1100 - 1100 / zoom) / 2} ${(stageHeight - stageHeight / zoom) / 2} ${1100 / zoom} ${stageHeight / zoom}`} width="1100" height={stageHeight} style={{ height: `${stageHeight}px` }} className={`block w-full ${editing ? 'min-w-[720px] touch-none' : 'min-w-[720px] touch-pan-x touch-pan-y'}`} role="group" aria-label={`Plano de ${zone.name}`}>
            <defs><pattern id={`floor-grid-${zone.id.replace(/[^a-z0-9_-]/gi, '')}`} width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill={isLight ? '#cbd5e1' : '#283745'} /></pattern></defs>
            <rect x="0" y="0" width="1100" height={stageHeight} rx="12" fill={isLight ? '#f8fafc' : '#0c1823'} />
            <rect x="0" y="0" width="1100" height={stageHeight} rx="12" fill={`url(#floor-grid-${zone.id.replace(/[^a-z0-9_-]/gi, '')})`} />
            {zoneTables.map((table, index) => {
              const point = layout[table.id] || { x: 50, y: 50 }
              const x = 80 + point.x * 10.2
              const y = 50 + point.y * ((stageHeight - 100) / 100)
              const activeAccount = accounts.some(account => (account.tableId === table.id || (account.serviceTarget?.type === 'table' && account.serviceTarget.tableId === table.id)) && account.status !== 'closed')
              const vip = /vip|lounge|reservad/i.test(`${zone.name} ${table.name}`)
              const shape = vip ? 'lounge' : table.capacity >= 6 ? 'rect' : table.capacity <= 2 ? 'round' : 'square'
              const width = shape === 'rect' || shape === 'lounge' ? 82 : 66
              const height = shape === 'round' ? 66 : shape === 'lounge' ? 48 : 60
              const chairCount = Math.max(2, Math.min(8, table.capacity))
              const statusColor = colors[table.status]
              const selected = table.id === selectedId
              const seats = Array.from({ length: chairCount }, (_, seat) => {
                const angle = (-Math.PI / 2) + (2 * Math.PI * seat / chairCount)
                const rx = width / 2 + 10
                const ry = height / 2 + 10
                return <rect key={seat} x={x + Math.cos(angle) * rx - 5} y={y + Math.sin(angle) * ry - 5} width="10" height="10" rx="3" fill={selected ? '#d9a949' : statusColor.seat} stroke={isLight ? '#f8fafc' : '#0c1823'} strokeWidth="2" />
              })
              return <g key={table.id} role="button" tabIndex={0} aria-label={`${table.name}, ${zone.name}, ${labels[table.status]}, ${table.capacity} plazas${activeAccount ? ', con cuenta activa' : ''}${vip ? ', lounge' : ''}`} aria-pressed={selected} data-tour={index === 0 ? 'floor-table' : undefined} data-floor-table={table.id}
                data-tutorial-target={table.status === 'available' ? 'floor-available-table' : 'floor-table'}
                onClick={() => onSelect(table.id)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(table.id) } }}
                onPointerDown={event => {
                  if (!editing || event.button !== 0) return
                  event.preventDefault(); event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={event => {
                  if (!editing || !event.currentTarget.hasPointerCapture(event.pointerId)) return
                  const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                  if (!bounds?.width || !bounds.height) return
                  onMove(table.id, { x: Math.max(8, Math.min(92, Math.round((((1100 - 1100 / zoom) / 2 + (event.clientX - bounds.left) / bounds.width * (1100 / zoom)) - 80) / 10.2))), y: Math.max(8, Math.min(92, Math.round((((stageHeight - stageHeight / zoom) / 2 + (event.clientY - bounds.top) / bounds.height * (stageHeight / zoom)) - 50) / ((stageHeight - 100) / 100)))) })
                }}
                onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
                style={{ cursor: editing ? 'grab' : 'pointer', outline: 'none' }}>
                {seats}
                {selected && <ellipse cx={x} cy={y} rx={width / 2 + 14} ry={height / 2 + 14} fill="none" stroke="#f3c76d" strokeWidth="2" strokeDasharray="5 4" />}
                <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={shape === 'round' ? height / 2 : shape === 'lounge' ? 18 : 10} fill={statusColor.fill} stroke={selected ? '#f3c76d' : statusColor.stroke} strokeWidth={selected ? 3 : 2} />
                {shape === 'lounge' && <path d={`M ${x - width / 2 + 9} ${y - height / 2 + 12} H ${x + width / 2 - 9}`} stroke={statusColor.stroke} strokeWidth="2" strokeLinecap="round" />}
                <text x={x} y={y - 3} textAnchor="middle" fill={statusColor.text} fontSize="12" fontWeight="700">{table.name.length > 14 ? `${table.name.slice(0, 12)}…` : table.name}</text>
                <text x={x} y={y + 13} textAnchor="middle" fill={statusColor.text} opacity=".82" fontSize="10">{table.capacity} plazas</text>
                {activeAccount && <g><circle cx={x + width / 2 - 2} cy={y - height / 2 + 2} r="9" fill={isLight ? '#fff' : '#0c1823'} stroke={statusColor.stroke} /><path d={`M ${x + width / 2 - 6} ${y - height / 2 + 2} h 8`} stroke={statusColor.stroke} strokeWidth="2" strokeLinecap="round" /></g>}
              </g>
            })}
          </svg>
        </div> : <div className={`grid min-h-40 place-items-center p-6 text-sm ${isLight ? 'text-slate-500' : 'text-slate-500'}`}><p>Esta zona todavía no tiene mesas.</p></div>}
      </section>
    })}
  </div>
}
