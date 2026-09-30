import { useState } from 'react'
import { Store, Receipt, Palette, Check } from 'lucide-react'
import { DEFAULT_RESTAURANT_THEME, RESTAURANT_THEME_PRESETS, restaurantThemeStyle, validRestaurantColor, type RestaurantThemeColors } from '../../modules/restaurant/views/restaurantTheme'

export function RestaurantSettings({ onResetDemo, themeColors = DEFAULT_RESTAURANT_THEME, onSaveTheme }: { onResetDemo?: () => void; themeColors?: RestaurantThemeColors; onSaveTheme?: (colors: RestaurantThemeColors) => Promise<void> | void }) {
  const [draft, setDraft] = useState<RestaurantThemeColors>(themeColors)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
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

      <div className="restaurant-settings-panel space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Store className="w-5 h-5 text-slate-700" />
          Datos Generales del Negocio
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Nombre del Establecimiento</label>
            <input
              type="text"
              defaultValue="Bistró Demo"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">NIT / Razón Social</label>
            <input
              type="text"
              defaultValue="4829102018"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Dirección del Salón</label>
            <input
              type="text"
              defaultValue="Av. Principal #450, Zona Central"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Teléfono de Contacto</label>
            <input
              type="text"
              defaultValue="71234567"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="restaurant-settings-panel space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-slate-700" />
          Encabezado & Pie de Comanda Térmica
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Encabezado de Ticket</label>
            <input
              type="text"
              defaultValue="BISTRO DEMO — GASTRONOMÍA"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Pie de Comanda / Mensaje</label>
            <input
              type="text"
              defaultValue="¡Gracias por su visita! Vuelva pronto."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
