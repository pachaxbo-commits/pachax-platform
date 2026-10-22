import { useMemo, useState } from 'react'
import { ImagePlus, Pencil, Plus, Search, Sparkles, Trash2, Tags } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Field, NumberInput, Segmented, SelectInput, TextInput } from '../../../components/ui/Form'
import { EmptyBlock, Screen } from '../../../components/ui/Screen'
import { round2 } from '../domain/engine'
import { deleteProduct, saveProduct, saveRoute, saveCatalogSettings } from '../data/distributionRepository'
import { prepareProductPhoto } from '../data/productPhoto'
import { PACHAX_ROUTES } from '../seed/pachaxSeed'
import { PrimaryButton, SecondaryButton, formatBs } from './shared'
import type { DistributionViewProps } from './DistributionApp'
import type { DistProduct, UnitType } from '../types'
import { CONTENT_UNIT_OPTIONS, DISTRIBUTION_PROFILES, SALE_UNIT_OPTIONS, demoProductsForProfile, mergeProfileCategories, validateCatalogProduct } from '../domain/catalog'

/**
 * Catalogo de SKU. Cada producto declara su unidad real (kg, unidad o paquete)
 * y su precio de referencia, que es solo el valor por defecto de la venta.
 */
export function ProductsView({ data }: DistributionViewProps) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<DistProduct | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Al vacio')
  const [presentation, setPresentation] = useState('')
  const [unitType, setUnitType] = useState<UnitType>('package')
  const [price, setPrice] = useState('0')
  const [weight, setWeight] = useState('')
  const [cost, setCost] = useState('0')
  const [minimum, setMinimum] = useState('0')
  const [sku, setSku] = useState('')
  const [saleUnitLabel, setSaleUnitLabel] = useState('')
  const [contentAmount, setContentAmount] = useState('')
  const [contentUnit, setContentUnit] = useState<'unit' | 'g' | 'kg' | 'ml' | 'l'>('unit')
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState('')
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false)
  const [active, setActive] = useState(true)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DistProduct | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term
      ? data.products.filter(
          (product) => product.name.toLowerCase().includes(term) || product.category.toLowerCase().includes(term),
        )
      : data.products
  }, [data.products, search])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setCategory(data.catalogSettings.categories.find(item => item.active)?.name || 'General')
    setPresentation('')
    setUnitType('package')
    setPrice('0')
    setWeight('')
    setCost('0'); setMinimum('0')
    setPhotoDataUrl('')
    setSku(''); setSaleUnitLabel(''); setContentAmount(''); setContentUnit('unit')
    setActive(true)
    setError(null)
    setSaveNotice('')
    setIsOpen(true)
  }

  const openEdit = (product: DistProduct) => {
    setEditing(product)
    setName(product.name)
    setCategory(product.category)
    setPresentation(product.presentation ?? '')
    setUnitType(product.unitType)
    setPrice(String(product.referencePrice))
    setCost(String(product.productionCost || 0)); setMinimum(String(product.minimumStock || 0))
    setPhotoDataUrl(product.photoDataUrl || '')
    setWeight(product.approximateWeightKg != null ? String(product.approximateWeightKg) : '')
    setSku(product.sku || ''); setSaleUnitLabel(product.saleUnitLabel || '')
    setContentAmount(product.presentationContent ? String(product.presentationContent.amount) : '')
    setContentUnit(product.presentationContent?.unit || 'unit')
    setActive(product.active !== false)
    setError(null)
    setSaveNotice('')
    setIsOpen(true)
  }

  const submit = async () => {
    if (!name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }

    const id =
      editing?.id ||
      `sku-${name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40)}-${Date.now().toString(36)}`

    if ([price, cost, minimum].some(v => !Number.isFinite(Number(v)) || Number(v) < 0)) { setError('Precio, costo y mínimo deben ser números positivos o cero.'); return }
    const content = contentAmount ? { amount: Number(contentAmount), unit: contentUnit } : undefined
    const catalogError = validateCatalogProduct({ name, category, unitType, saleUnitLabel, presentationContent: content })
    if (catalogError) { setError(catalogError); return }
    setIsSaving(true)
    setError(null)
    try {
      const result = await saveProduct({
        id,
        name: name.trim(),
        photoDataUrl,
        category,
        presentation: presentation.trim(),
        sku: sku.trim() || undefined,
        saleUnitLabel: saleUnitLabel.trim() || undefined,
        presentationContent: content,
        unitType,
        referencePrice: round2(Number(price)),
        productionCost: round2(Number(cost)), minimumStock: round2(Number(minimum)),
        approximateWeightKg: weight ? round2(Number(weight)) : undefined,
        active,
        sortOrder: editing?.sortOrder ?? data.products.length,
        createdAt: editing?.createdAt,
      })
      setIsOpen(false)
      setSaveNotice(result === 'queued' ? 'Producto guardado en este dispositivo; queda pendiente de sincronización.' : '')
    } catch (err) { setError((err as Error).message || 'No se pudo guardar el producto.') }
    finally { setIsSaving(false) }
  }

  const updateCategories = async (next: typeof data.catalogSettings.categories) => {
    setCategoryBusy(true)
    try { await saveCatalogSettings({ industryProfile: data.catalogSettings.industryProfile, categories: next }) }
    catch (err) { setError((err as Error).message) }
    finally { setCategoryBusy(false) }
  }

  const changeProfile = async (profile: typeof data.catalogSettings.industryProfile) => {
    const merged = mergeProfileCategories(data.catalogSettings.categories, profile)
    setCategoryBusy(true)
    try { await saveCatalogSettings({ industryProfile: profile, categories: merged }) }
    catch (err) { setError((err as Error).message) }
    finally { setCategoryBusy(false) }
  }

  /** Siembra el catalogo inicial sin pisar lo que ya exista (ids estables). */
  const seedCatalog = async () => {
    setIsSeeding(true)
    try {
      const existingRoutes = new Set(data.routes.map((route) => route.id))

      let index = data.products.length
      for (const sample of demoProductsForProfile(data.catalogSettings.industryProfile)) {
        if (data.products.some(product => product.id === sample.id)) continue
        await saveProduct({ ...sample, productionCost: 0, minimumStock: 0, active: true, sortOrder: index++ })
      }
      for (const route of PACHAX_ROUTES) {
        if (existingRoutes.has(route.id)) continue
        await saveRoute({ ...route, active: true })
      }
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <Screen
      title="Productos"
      subtitle={`${data.products.length} SKU en catalogo`}
      actions={
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setCategoriesOpen(true)}><Tags size={16} /> Categorías</SecondaryButton>
          <button type="button" aria-label={deleteMode ? 'Salir de eliminar productos' : 'Eliminar productos'} onClick={() => setDeleteMode(value => !value)} className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${deleteMode ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600'}`}><Pencil size={17} /></button>
          <PrimaryButton onClick={openCreate}><Plus size={16} /> Nuevo</PrimaryButton>
        </div>
      }
    >
      {saveNotice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{saveNotice}</p>}
      <div className="grid w-full min-w-0 gap-3">
        <section className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Rubro de la distribuidora" hint="Solo organiza sugerencias. Puedes vender cualquier producto.">
            <SelectInput value={data.catalogSettings.industryProfile} disabled={categoryBusy} onChange={event => void changeProfile(event.target.value as typeof data.catalogSettings.industryProfile)}>
              {DISTRIBUTION_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
            </SelectInput>
          </Field>
          <span className="text-[11px] font-semibold text-slate-500">El cambio conserva productos y existencias.</span>
        </section>
        {data.products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
            <p className="text-xs font-bold text-slate-700">El catalogo esta vacio.</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              Puedes crear tus productos o cargar ejemplos ficticios para explorar el sistema.
            </p>
            <div className="mt-3">
              <SecondaryButton disabled={isSeeding} onClick={() => void seedCatalog()}>
                <Sparkles size={16} /> {isSeeding ? 'Cargando...' : 'Cargar productos y rutas de ejemplo'}
              </SecondaryButton>
            </div>
          </div>
        )}

        <div className="relative w-full">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 && data.products.length > 0 && <EmptyBlock title="Sin coincidencias" />}

        {deleteMode && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Toca un producto para eliminarlo. Solo se permite si no tiene existencias ni despachos abiertos.</p>}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => {
            const stock = data.balances.find(balance => balance.locationKind === 'central' && (balance.warehouseId || 'central') === 'central' && balance.productId === product.id)?.availableQuantity ?? 0
            return (
            <button
              key={product.id}
              type="button"
              onClick={() => deleteMode ? setDeleteTarget(product) : openEdit(product)}
              className={`relative flex min-h-[112px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition active:scale-[0.99] ${deleteMode ? 'border-rose-300' : 'border-slate-200'}`}
            >
              {deleteMode && <span className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white shadow"><Trash2 size={15} /></span>}
              {product.photoDataUrl && <img src={product.photoDataUrl} alt={`Foto de ${product.name}`} onError={(event) => { event.currentTarget.style.display = 'none' }} className="aspect-[16/9] w-full object-cover" />}
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                <div><p className="text-xs font-extrabold leading-snug text-slate-900">{product.name}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{product.presentation || (product.saleUnitLabel ? `Por ${product.saleUnitLabel}` : '')}{product.sku ? ` · SKU ${product.sku}` : ''}</p></div>
                <div className="flex flex-wrap items-end justify-between gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-500">{Number(stock.toFixed(product.unitType === 'kg' ? 3 : 0))} {product.saleUnitLabel || (product.unitType === 'kg' ? 'kg' : product.unitType === 'package' ? 'paquetes' : 'unidades')} disponibles</span>
                  <span className="text-sm font-black tabular-nums" style={{ color: 'var(--primary)' }}>{formatBs(product.referencePrice)}</span>
                </div>
              </div>
            </button>
            )
          })}
        </div>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => { if (!isSaving) setIsOpen(false) }}
        title={editing ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <PrimaryButton full disabled={isSaving} onClick={() => void submit()}>
            {isSaving ? 'Guardando...' : 'Guardar producto'}
          </PrimaryButton>
        }
      >
        <div className="grid gap-3">
          <Field label="Fotografía del producto" hint="Opcional. Se recorta de forma proporcional en el catálogo.">
            <div className="grid gap-2">
              {photoDataUrl && <img src={photoDataUrl} alt="Vista previa del producto" onError={(event) => { event.currentTarget.style.display = 'none' }} className="aspect-[16/9] w-full rounded-2xl border border-slate-200 object-cover" />}
              <div className="grid grid-cols-2 gap-2">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
                  <ImagePlus size={16} /> {isPreparingPhoto ? 'Procesando...' : photoDataUrl ? 'Cambiar foto' : 'Agregar foto'}
                  <input type="file" accept="image/*" className="sr-only" disabled={isPreparingPhoto} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; setIsPreparingPhoto(true); setError(null); try { setPhotoDataUrl(await prepareProductPhoto(file)) } catch (photoError) { setError((photoError as Error).message) } finally { setIsPreparingPhoto(false); event.target.value = '' } }} />
                </label>
                <button type="button" disabled={!photoDataUrl} onClick={() => setPhotoDataUrl('')} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 text-xs font-extrabold text-slate-600 disabled:opacity-40"><Trash2 size={15} /> Quitar</button>
              </div>
            </div>
          </Field>
          <Field label="Costo de producción por unidad de venta (Bs)"><NumberInput min={0} step={0.01} value={cost} onChange={event => setCost(event.target.value)} /></Field>
          <Field label="Existencia mínima" hint="Se expresa en la unidad de venta del producto."><NumberInput min={0} value={minimum} onChange={event => setMinimum(event.target.value)} /></Field>
          <Field label="Nombre" required>
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Categoría" required hint="Administra las opciones desde Categorías.">
            <SelectInput value={category} onChange={event => setCategory(event.target.value)}>
              {!data.catalogSettings.categories.some(item => item.active && item.name === category) && <option value={category}>{category} · categoría histórica</option>}
              {data.catalogSettings.categories.filter(item => item.active).map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Detalle de presentacion" hint="Ej: sachet 200 g, 10 unidades 12 cm">
            <TextInput value={presentation} onChange={(event) => setPresentation(event.target.value)} />
          </Field>
          <Field label="Unidad de venta" hint="Los reportes no convierten paquetes a kilos.">
            {editing ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold text-slate-700">{SALE_UNIT_OPTIONS.find(option => option.value === unitType)?.label}</div> : <Segmented value={unitType} onChange={setUnitType} options={SALE_UNIT_OPTIONS} />}
          </Field>
          <Field label="Nombre de una unidad" hint="Ej.: bolsa, botella, caja, pieza. Se controla como SKU independiente."><TextInput value={saleUnitLabel} maxLength={24} onChange={event => setSaleUnitLabel(event.target.value)} placeholder="unidad" /></Field>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <Field label="Contenido por presentación" hint="Informativo; no convierte inventario"><NumberInput min={0} step="any" value={contentAmount} onChange={event => setContentAmount(event.target.value)} placeholder="Opcional" /></Field>
            <Field label="Unidad de contenido"><SelectInput value={contentUnit} onChange={event => setContentUnit(event.target.value as typeof contentUnit)}>{CONTENT_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectInput></Field>
          </div>
          <Field label="SKU / código opcional"><TextInput value={sku} maxLength={48} onChange={event => setSku(event.target.value)} /></Field>
          <Field label="Precio de referencia (Bs)" hint="Solo Administración puede modificar el precio de venta.">
            <NumberInput value={price} min={0} step={0.5} onChange={(event) => setPrice(event.target.value)} />
          </Field>
          {unitType !== 'kg' && (
            <Field label="Peso aproximado (kg)" hint="Informativo. No se usa para convertir reportes.">
              <NumberInput value={weight} min={0} step={0.05} onChange={(event) => setWeight(event.target.value)} />
            </Field>
          )}
          <label className="flex min-h-[44px] items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-5 w-5" />
            Producto activo
          </label>
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>
      </Modal>
      <Modal isOpen={categoriesOpen} onClose={() => setCategoriesOpen(false)} title="Categorías del catálogo" subtitle="Desactivar conserva las referencias históricas.">
        <div className="grid gap-3">
          <div className="flex gap-2"><TextInput value={newCategory} maxLength={60} onChange={event => setNewCategory(event.target.value)} placeholder="Nueva categoría" /><PrimaryButton disabled={categoryBusy || !newCategory.trim()} onClick={() => { const name = newCategory.trim(); const id = `cat-${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`; if (data.catalogSettings.categories.some(item => item.name.toLowerCase() === name.toLowerCase())) return; setNewCategory(''); void updateCategories([...data.catalogSettings.categories, { id, name, active: true }]) }}><Plus size={15} /> Agregar</PrimaryButton></div>
          {data.catalogSettings.categories.map(item => <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">{editingCategoryId === item.id ? <TextInput value={editingCategoryName} maxLength={60} onChange={event => setEditingCategoryName(event.target.value)} /> : <span className={`text-sm font-bold ${item.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{item.name}</span>}{editingCategoryId === item.id ? <button type="button" disabled={categoryBusy || !editingCategoryName.trim()} onClick={() => { const name = editingCategoryName.trim(); setEditingCategoryId(''); void updateCategories(data.catalogSettings.categories.map(row => row.id === item.id ? { ...row, name } : row)) }} className="min-h-10 rounded-lg px-2 text-xs font-bold text-emerald-700">Guardar</button> : <button type="button" disabled={categoryBusy} onClick={() => { setEditingCategoryId(item.id); setEditingCategoryName(item.name) }} className="min-h-10 rounded-lg px-2 text-xs font-bold text-slate-600">Editar</button>}<button type="button" disabled={categoryBusy} onClick={() => void updateCategories(data.catalogSettings.categories.map(categoryRow => categoryRow.id === item.id ? { ...categoryRow, active: !categoryRow.active } : categoryRow))} className="min-h-10 rounded-lg px-2 text-xs font-bold text-slate-600">{item.active ? 'Desactivar' : 'Reactivar'}</button></div>)}
        </div>
      </Modal>
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar producto" subtitle={deleteTarget?.name} footer={<div className="grid grid-cols-2 gap-2"><SecondaryButton full disabled={isDeleting} onClick={() => setDeleteTarget(null)}>Cancelar</SecondaryButton><button type="button" disabled={isDeleting} onClick={async () => { if (!deleteTarget) return; setIsDeleting(true); setError(null); try { await deleteProduct(deleteTarget.id); setDeleteTarget(null) } catch (e) { setError((e as Error).message) } finally { setIsDeleting(false) } }} className="min-h-[44px] rounded-2xl bg-rose-600 px-3 text-sm font-extrabold text-white disabled:opacity-50">{isDeleting ? 'Eliminando...' : 'Sí, eliminar'}</button></div>}><p className="text-sm text-slate-700">El producto dejará de aparecer en ventas, inventario y selectores. Sus ventas anteriores conservarán el detalle histórico.</p>{error && <p className="mt-3 text-xs font-bold text-rose-600">{error}</p>}</Modal>
    </Screen>
  )
}
