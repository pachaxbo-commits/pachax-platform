import { useState } from 'react'
import { Palette, Check, MapPin, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_RESTAURANT_THEME, RESTAURANT_THEME_PRESETS, restaurantThemeStyle, validRestaurantColor, type RestaurantThemeColors } from '../../modules/restaurant/views/restaurantTheme'
import type { RestaurantSector, RestaurantTable } from '../mocks/restaurantMock'
import type { FloorAction } from '../../modules/restaurant/domain/restaurantFloor'
import type { BusinessIdentity } from '../../core/businessIdentity'
import { BusinessIdentitySettings } from '../../components/settings/BusinessIdentitySettings'

export function RestaurantSettings({
  onResetDemo,
  themeColors = DEFAULT_RESTAURANT_THEME,
  onSaveTheme,
  tables = [],
  sectors = [],
  onFloorAction,
  isCounterService = false,
  businessIdentity,
  onSaveBusinessIdentity,
  onUploadLogo,
  canManage = true,
}: {
  onResetDemo?: () => void
  themeColors?: RestaurantThemeColors
  onSaveTheme?: (colors: RestaurantThemeColors) => Promise<void> | void
  tables?: RestaurantTable[]
  sectors?: RestaurantSector[]
  onFloorAction?: (action: FloorAction) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>
  isCounterService?: boolean
  businessIdentity?: BusinessIdentity
  onSaveBusinessIdentity?: (identity: BusinessIdentity) => Promise<void> | void
  onUploadLogo?: (file: File) => Promise<string>
  canManage?: boolean
}) {
  const [draft, setDraft] = useState<RestaurantThemeColors>(themeColors)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [newTableName, setNewTableName] = useState('')
  const [tableNotice, setTableNotice] = useState('')
  const activeTables = tables.filter((t) => !t.archivedAt && t.active !== false)
  const valid = validRestaurantColor(draft.primary) && validRestaurantColor(draft.accent)
  const saveTheme = async () => {
    if (!valid || !onSaveTheme || saving) return
    setSaving(true)
    setNotice('')
    try { await onSaveTheme(draft); setNotice('Apariencia guardada para esta empresa.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar la apariencia.') }
    finally { setSaving(false) }
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración del Restaurante</h1>
        <p className="text-sm text-slate-600">Apariencia y parámetros del establecimiento.</p>
      </div>

      {onResetDemo && <button type="button" onClick={onResetDemo} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Restablecer datos de la demo Restaurante</button>}

      <section className="restaurant-settings-panel" aria-labelledby="restaurant-theme-title">
        <div className="restaurant-settings-title"><Palette size={21} /><div><h2 id="restaurant-theme-title">Apariencia / Tema</h2><p>Los colores se aplican a todas las secciones de este restaurante.</p></div></div>
        <div className="restaurant-theme-presets">
          {RESTAURANT_THEME_PRESETS.map(preset => <button key={preset.id} type="button" className={draft.primary.toLowerCase() === preset.primary && draft.accent.toLowerCase() === preset.accent ? 'is-selected' : ''} onClick={() => { setDraft({ primary: preset.primary, accent: preset.accent }); setNotice('') }}><span className="restaurant-theme-chips"><i style={{ background: preset.primary }} /><i style={{ background: preset.accent }} /></span><span>{preset.name}</span></button>)}
        </div>
        <div className="restaurant-theme-editor">
          <div className="restaurant-theme-controls">
            <label>Color principal<div><input type="color" value={validRestaurantColor(draft.primary) ? draft.primary : DEFAULT_RESTAURANT_THEME.primary} onChange={event => setDraft(value => ({ ...value, primary: event.target.value }))} aria-label="Elegir color principal" /><input type="text" value={draft.primary} onChange={event => setDraft(value => ({ ...value, primary: event.target.value }))} aria-label="Código de color principal" maxLength={7} /></div></label>
            <label>Color de acento<div><input type="color" value={validRestaurantColor(draft.accent) ? draft.accent : DEFAULT_RESTAURANT_THEME.accent} onChange={event => setDraft(value => ({ ...value, accent: event.target.value }))} aria-label="Elegir color de acento" /><input type="text" value={draft.accent} onChange={event => setDraft(value => ({ ...value, accent: event.target.value }))} aria-label="Código de color de acento" maxLength={7} /></div></label>
            {!valid && <p role="alert" className="text-sm text-rose-700">Usa códigos hexadecimales de seis dígitos, por ejemplo #1769d2.</p>}
            <div className="restaurant-theme-actions"><button type="button" onClick={() => setDraft(DEFAULT_RESTAURANT_THEME)}>Restaurar PACHAX Light</button><button type="button" disabled={!valid || saving || !onSaveTheme} onClick={() => void saveTheme()}>{saving ? 'Guardando...' : 'Guardar apariencia'}</button></div>
            {notice && <p role="status" className="text-sm font-semibold">{notice}</p>}
          </div>
          <div className="restaurant-theme-preview" style={restaurantThemeStyle(draft)} aria-label="Vista previa del tema"><span>Vista previa</span><div><strong>PACHAX Restaurant</strong><span>Turno activo</span></div><div className="restaurant-theme-preview-card"><p>Producto destacado</p><strong>Bs 42,00</strong><span className="restaurant-theme-preview-button"><Check size={15} /> Agregar</span></div></div>
        </div>
      </section>

      {/* Empresa y Documentos */}
      <BusinessIdentitySettings
        initialIdentity={businessIdentity}
        canManage={canManage}
        onSaveIdentity={onSaveBusinessIdentity || (() => {})}
        onUploadLogo={onUploadLogo}
      />

      {isCounterService && onFloorAction && (
        <div className="restaurant-settings-panel space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-slate-700" />
              Mesas / Puntos de Entrega
            </h2>
            <span className="text-xs font-bold text-slate-500">
              {activeTables.length} punto(s) configurado(s)
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Puntos de entrega o números de mesa referenciales para llevar los pedidos a los clientes en mostrador o mesas del local.
          </p>

          <div className="flex flex-wrap gap-2">
            {activeTables.map((table) => (
              <div
                key={table.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-xs"
              >
                <span className="text-xs font-bold text-slate-800">{table.name}</span>
                <button
                  type="button"
                  title="Eliminar punto de entrega"
                  className="text-slate-400 hover:text-red-600 transition"
                  onClick={async () => {
                    const res = await onFloorAction({ type: 'table.archive', id: table.id })
                    if (!res.ok) setTableNotice(res.error || 'Error al eliminar punto.')
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {!activeTables.length && (
              <span className="text-xs text-slate-400 italic">No hay mesas o puntos configurados aún.</span>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 max-w-md">
            <input
              type="text"
              placeholder="Ej. Mesa 1, Mesa 2, Mostrador..."
              value={newTableName}
              onChange={(e) => {
                setNewTableName(e.target.value)
                setTableNotice('')
              }}
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-slate-400"
            />
            <button
              type="button"
              disabled={!newTableName.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-40"
              onClick={async () => {
                const name = newTableName.trim()
                if (!name) return
                const fallbackSectorId = sectors?.[0]?.id || 'sector-principal'
                const res = await onFloorAction({
                  type: 'table.create',
                  id: `table_${Date.now()}`,
                  name,
                  sectorId: fallbackSectorId,
                  capacity: 4,
                  shape: 'square',
                  active: true,
                })
                if (res.ok) {
                  setNewTableName('')
                  setTableNotice('')
                } else {
                  setTableNotice(res.error || 'Error al agregar punto.')
                }
              }}
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>
          {tableNotice && <p role="alert" className="text-xs font-bold text-rose-600">{tableNotice}</p>}
        </div>
      )}
    </div>
  )
}
